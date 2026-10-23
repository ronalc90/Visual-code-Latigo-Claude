import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Lash } from '../types'
import { FRAME_COUNT, HELP_TEXT, IMPACT_FROM, SKY_WIDTH, WHIP_WIDTH, comboColor, layoutBand, partsWidth, skyRow, statsTable, whipParts } from './band'
import type { BridgePaths, LashEvent, LatigoConfig } from './bridge'
import {
  DEFAULT_CONFIG,
  bridgePaths,
  parseConfig,
  parseEffortRequestsStrict,
  parseLashEvent,
  parseStatsFile,
  serializeConfig,
  serializeLashEvent,
  serializePresence,
  serializeStats,
} from './bridge'
import { isLevelUp, lookFor, progressFor, sparkRow } from './levels'
import type { Effort, Stats, Target } from './model'
import {
  DEFAULT_EFFORT,
  EMPTY_STATS,
  comboTitle,
  dayOf,
  effectiveEffort,
  effortRank,
  isEffort,
  isForcing,
  mergeStats,
  nextCombo,
  normalizeStats,
  raiseEffort,
  raiseEffortBy,
  recordLash,
} from './model'

const FRAME_MS = 70
const POLL_MS = 600
const PRESENCE_EVERY_POLLS = 5
const TWINKLE_MS = 450
const CRACK_SOUND = 'assets/latigo.wav'
const LEVEL_SOUND = 'assets/nivel.wav'
const STORE_KEY = 'stats'

const lash = atom({ plugin: 'latigo', key: 'lash' } as const, null as Lash | null)
const model = atom({ plugin: 'latigo', key: 'model' } as const, null as string | null)
const effort = atom({ plugin: 'latigo', key: 'effort' } as const, null as Effort | null)
const boost = atom({ plugin: 'latigo', key: 'boost' } as const, null as Effort | null)
const stats = atom({ plugin: 'latigo', key: 'stats' } as const, EMPTY_STATS as Stats)
const enabled = atom({ plugin: 'latigo', key: 'enabled' } as const, DEFAULT_CONFIG.enabled as boolean)
const sound = atom({ plugin: 'latigo', key: 'sound' } as const, DEFAULT_CONFIG.sound as boolean)
const twinkle = atom({ plugin: 'latigo', key: 'twinkle' } as const, 0 as number)
const ready = atom({ plugin: 'latigo', key: 'ready' } as const, false as boolean)

// Estado del modulo: se reinicia con cada recarga, y session.start lo vuelve a armar.
let paths: BridgePaths | null = null
let lastLashAt: number | null = null
let combo = 0
let animation: { cancel: () => void } | null = null
let poller: { cancel: () => void } | null = null
let twinkler: { cancel: () => void } | null = null
let seenEffortSeq = 0
let seenLashId: string | null = null
/** El texto de config.json que este proceso leyo o escribio por ultima vez. */
let lastConfigText: string | null = null
/** Mientras se guarda config.json, el sondeo no lo lee (veria lo de antes). */
let isSavingConfig = false
let polls = 0
/** La preferencia `reduceMotion` de Claude Code: sin vaiven ni chispas en reposo. */
let reduceMotion = false

function today(now: number): string {
  return dayOf(now, new Date(now).getTimezoneOffset())
}

function shortModel(name: string): string {
  return name.replace(/^claude-/, '').replace(/\[.*\]$/, '')
}

async function readText($: EngineInterface, path: string): Promise<string | null> {
  try {
    return (await $.fs.read(path)) as string
  } catch {
    return null
  }
}

async function writeText($: EngineInterface, path: string, text: string): Promise<void> {
  try {
    await $.fs.write(path, text)
  } catch {
    // Sin permiso de escritura el latigo sigue funcionando en esta sesion.
  }
}

async function readReduceMotion($: EngineInterface): Promise<boolean> {
  try {
    return (await $.config.list()).some(row => row.key === 'reduceMotion' && row.value === true)
  } catch {
    return false
  }
}

function play($: EngineInterface, asset: string): void {
  $.audio.play({ asset }).catch(() => undefined)
}

/**
 * Guarda en config.json solo lo que cambio (`patch`) sobre lo que hay en disco,
 * asi no pisa un cambio que VS Code hizo y este proceso aun no habia leido.
 */
async function saveConfig($: EngineInterface, patch: Partial<LatigoConfig>): Promise<void> {
  if (paths === null) return
  isSavingConfig = true
  try {
    const merged = { ...parseConfig(await readText($, paths.config)), ...patch }
    const text = serializeConfig(merged)
    lastConfigText = text
    await writeText($, paths.config, text)
    if ((await read($, enabled)) !== merged.enabled) await update($, enabled, () => merged.enabled)
    if ((await read($, sound)) !== merged.sound) await update($, sound, () => merged.sound)
  } finally {
    isSavingConfig = false
  }
}

/**
 * Prende o apaga. `persist` va en false cuando el cambio vino de config.json
 * (VS Code o otra sesion): ya esta en disco y no se escribe el eco.
 */
async function setEnabled($: EngineInterface, isOn: boolean, persist = true): Promise<void> {
  await update($, enabled, () => isOn)
  // Primero a disco, antes de cualquier otra espera, para que un sondeo no lo deshaga.
  if (persist) await saveConfig($, { enabled: isOn })
  if (!isOn) {
    // Apagar es tambien calmarse: al volver a prender, el effort arranca como el de la sesion.
    animation?.cancel()
    animation = null
    await update($, lash, () => null)
    await update($, boost, () => null)
    await writePresence($)
  }
}

async function raiseBoost($: EngineInterface, steps: number): Promise<Effort | null> {
  // Se sube desde lo que de verdad sale, nunca desde un forzado que quedo por debajo.
  const current = effectiveEffort(await read($, effort), await read($, boost)) ?? DEFAULT_EFFORT
  const raised = steps === 1 ? raiseEffort(current) : raiseEffortBy(current, steps)
  if (raised === null || raised === current) return null
  await update($, boost, () => raised)
  return raised
}

async function writePresence($: EngineInterface): Promise<void> {
  if (paths === null) return
  const presence = {
    at: await $.clock.now(),
    model: await read($, model),
    effort: await read($, effort),
    boost: await read($, boost),
  }
  await writeText($, paths.presence, serializePresence(presence))
}

/** Anima un latigazo en la banda; no cuenta nada (eso lo hace quien lo dio). */
async function animate($: EngineInterface, shown: Lash): Promise<void> {
  animation?.cancel()
  // Con movimiento reducido se salta el estirarse: va directo al golpe.
  let frame = reduceMotion ? IMPACT_FROM + 1 : 0
  await update($, lash, () => ({ ...shown, frame }))
  animation = $.clock.every(FRAME_MS, () => {
    frame += 1
    if (frame >= FRAME_COUNT) {
      animation?.cancel()
      animation = null
      void update($, lash, () => null)
      return
    }
    void update($, lash, current => (current === null ? null : { ...current, frame }))
  })
}

async function crack($: EngineInterface, target: Target): Promise<void> {
  if (!(await read($, enabled))) return
  const now = await $.clock.now()
  combo = nextCombo(lastLashAt, combo, now)
  lastLashAt = now
  const hitCombo = combo

  let raisedTo: Effort | null = null
  if (target === 'effort') {
    raisedTo = await raiseBoost($, 1)
    if (raisedTo === null) $.ui.toast('El effort ya está en max: más duro no se puede.')
  }

  // Lo de disco puede traer latigazos de VS Code: se junta antes de sumar.
  const onDisk = paths === null ? EMPTY_STATS : parseStatsFile(await readText($, paths.stats))
  const before = mergeStats(await read($, stats), onDisk)
  const after = recordLash(before, target, hitCombo, today(now))
  const leveledUp = isLevelUp(before.total, after.total)
  await update($, stats, () => after)
  await $.store.set(STORE_KEY, after)

  if (await read($, sound)) play($, leveledUp ? LEVEL_SOUND : CRACK_SOUND)
  if (leveledUp) {
    const { tier } = progressFor(after.total)
    $.ui.toast(`¡Nivel ${tier.level}! Tu látigo ahora es ${tier.name}.`)
  }

  if (paths !== null) {
    const event: LashEvent = { id: `t-${now}-${after.total}`, at: now, target, combo: hitCombo, total: after.total, source: 'terminal' }
    seenLashId = event.id
    await writeText($, paths.stats, serializeStats(after))
    await writeText($, paths.lash, serializeLashEvent(event))
    if (raisedTo !== null) await writePresence($)
  }

  await animate($, { frame: 0, target, combo: hitCombo, raisedTo, isLevelUp: leveledUp })
}

/**
 * Carga lo que la banda necesita en la sesion actual: conteos (almacen del plugin
 * y disco), interruptor, modelo y preferencias. Corre al arrancar y otra vez tras
 * un /clear, que empieza una sesion nueva con el estado en blanco y sin
 * session.start.
 */
async function hydrate($: EngineInterface, isProcessStart: boolean): Promise<void> {
  // LATIGO_HOME cambia la carpeta base del puente, igual que en la extension (las pruebas la usan).
  // En Windows, si HOME no esta, la carpeta de la persona es USERPROFILE (la que usa VS Code).
  const candidates = [await $.env.get('LATIGO_HOME'), await $.env.get('HOME'), await $.env.get('USERPROFILE')]
  const home = candidates.map(value => value?.trim()).find(value => value !== undefined && value !== '')
  paths = home === undefined ? null : bridgePaths(home)

  const stored = normalizeStats(await $.store.get(STORE_KEY))
  const onDisk = paths === null ? EMPTY_STATS : parseStatsFile(await readText($, paths.stats))
  await update($, stats, () => mergeStats(stored, onDisk))

  if (paths !== null) {
    const configText = await readText($, paths.config)
    const config = parseConfig(configText)
    lastConfigText = configText
    await update($, enabled, () => config.enabled)
    await update($, sound, () => config.sound)
    if (configText === null) await saveConfig($, {})
    if (isProcessStart) {
      // Lo que ya estaba en el puente es de antes: no se aplica al arrancar.
      seenEffortSeq = parseEffortRequestsStrict(await readText($, paths.effort))?.seq ?? 0
      seenLashId = parseLashEvent(await readText($, paths.lash))?.id ?? null
    }
  }

  // Un latigazo a medias de antes de una recarga no deja la banda congelada.
  await update($, lash, () => null)
  const name = await $.session.model().catch(() => null)
  await update($, model, () => name || null)
  reduceMotion = await readReduceMotion($)
  // Registrar otra vez reemplaza al anterior: asi /latigo sigue tras un /clear.
  await $.command.register({
    name: 'latigo',
    description: 'Tabla del látigo. on | off | calma | sonido | ayuda',
    argumentHint: '[on|off|calma|sonido|ayuda]',
  })
  await update($, ready, () => true)
}

/** Lee el puente: interruptor, latigazos al effort y latigazos dados en VS Code. */
async function poll($: EngineInterface): Promise<void> {
  // Red de seguridad: si la sesion quedo en blanco (un /clear), se vuelve a cargar.
  if (!(await read($, ready))) await hydrate($, false)
  if (paths === null) return
  polls += 1

  // Solo cuenta un config.json que cambio por fuera. Si este proceso escribio
  // mientras se leia, lo leido ya es viejo y se ignora.
  const knownConfig = lastConfigText
  const configText = isSavingConfig ? null : await readText($, paths.config)
  if (configText !== null && configText !== knownConfig && lastConfigText === knownConfig && !isSavingConfig) {
    lastConfigText = configText
    const config = parseConfig(configText)
    if ((await read($, enabled)) !== config.enabled) await setEnabled($, config.enabled, false)
    if ((await read($, sound)) !== config.sound) await update($, sound, () => config.sound)
  }
  const isOn = await read($, enabled)

  // Un archivo que falta o no se pudo leer no cambia nada; un contador menor,
  // leido bien, es un effort.json reiniciado y lo nuevo cuenta desde ahi.
  const requests = parseEffortRequestsStrict(await readText($, paths.effort))
  if (requests !== null && requests.seq !== seenEffortSeq) {
    const steps = requests.seq > seenEffortSeq ? requests.seq - seenEffortSeq : requests.seq
    seenEffortSeq = requests.seq
    if (isOn && steps > 0) {
      const raised = await raiseBoost($, steps)
      if (raised !== null) $.ui.toast(`Latigazo desde VS Code: effort ${raised}.`)
      await writePresence($)
    }
  }

  const event = parseLashEvent(await readText($, paths.lash))
  if (event !== null && event.id !== seenLashId) {
    seenLashId = event.id
    const onDisk = parseStatsFile(await readText($, paths.stats))
    await update($, stats, current => mergeStats(current, onDisk))
    if (event.source === 'vscode' && isOn) {
      await animate($, { frame: 0, target: event.target, combo: event.combo, raisedTo: null, isLevelUp: false })
    }
  }

  if ((await read($, model)) === null) {
    const name = await $.session.model().catch(() => null)
    if (name) await update($, model, () => name)
  }

  if (polls % PRESENCE_EVERY_POLLS === 0) await writePresence($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await hydrate($, true)

    poller?.cancel()
    poller = $.clock.every(POLL_MS, () => void poll($))
    twinkler?.cancel()
    twinkler = $.clock.every(TWINKLE_MS, () => {
      void (async () => {
        if (reduceMotion || !(await read($, enabled)) || (await read($, lash)) !== null) return
        if (lookFor((await read($, stats)).total).sparkDensity <= 0) return
        await update($, twinkle, n => (n + 1) % 1_000_000)
      })()
    })
    await writePresence($)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason !== 'clear' && paths !== null) {
      // La sesion se va: VS Code deja de mandarle latigazos al effort enseguida.
      await writeText($, paths.presence, serializePresence({ at: 0, model: null, effort: null, boost: null }))
    }
    const result = await next(e)
    if (e.reason === 'clear') {
      // El proceso sigue con una sesion nueva y su estado en blanco: se recarga enseguida.
      $.clock.after(1, () => void hydrate($, false))
    }
    return result
  })

  on('command.run', { command: 'latigo' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'encender') {
      await setEnabled($, true)
      return { text: 'Látigo encendido.' }
    }
    if (arg === 'off' || arg === 'apagar') {
      await setEnabled($, false)
      return { text: 'Látigo apagado. El effort vuelve a ser el de la sesión.' }
    }
    if (arg === 'calma') {
      await update($, boost, () => null)
      await writePresence($)
      return { text: 'Calma: el effort vuelve a ser el de la sesión.' }
    }
    if (arg === 'sonido') {
      const isOn = !(await read($, sound))
      await update($, sound, () => isOn)
      await saveConfig($, { sound: isOn })
      return { text: isOn ? 'Sonido encendido.' : 'Sonido apagado.' }
    }
    if (arg === 'ayuda' || arg === 'help') return { text: HELP_TEXT }
    const now = await $.clock.now()
    return { text: statsTable(await read($, stats), today(now), await read($, boost), await read($, enabled)) }
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || !isEffort(e.effort)) {
      return yield* next(e)
    }
    const seen = e.effort
    if ((await read($, effort)) !== seen) await update($, effort, () => seen)
    if ((await read($, model)) !== e.model) await update($, model, () => e.model)

    const forced = await read($, boost)
    if ((await read($, enabled)) && forced !== null && effortRank(forced) > effortRank(seen)) {
      return yield* next({ ...e, effort: forced })
    }
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Sin cargar (el instante tras un /clear) no se dibujan conteos en cero.
    if (e.props.hasSurvey || !(await read($, ready))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)

    if (!(await read($, enabled))) {
      return (
        <Box flexDirection="row">
          <Text dimColor>╾~ látigo apagado </Text>
          <Button key="toggle" hotkey="o" label="encender" onPress={() => setEnabled($, true)} />
        </Box>
      )
    }

    const current = await read($, lash)
    const total = (await read($, stats)).total
    const look = lookFor(total)
    const progress = progressFor(total)
    const forced = await read($, boost)
    const seen = await read($, effort)
    const modelName = shortModel((await read($, model)) ?? 'modelo')
    const effortShown = effectiveEffort(seen, forced)
    const effortLabel = effortShown === null ? 'effort' : `effort: ${effortShown}${isForcing(seen, forced) ? ' ⚡' : ''}`

    const frame = current === null ? null : current.frame
    const isImpact = current !== null && current.frame >= IMPACT_FROM
    const hit = (target: Target) => isImpact && current?.target === target
    const parts = whipParts(look, frame)
    const pad = ' '.repeat(Math.max(1, WHIP_WIDTH - partsWidth(parts)))
    const colorOf = { handle: look.handle, lash: look.lash, tip: look.glow }

    const sparkFrame = current === null ? await read($, twinkle) : 10_000 + current.frame
    const sparkBoost = current === null ? 0.6 : current.isLevelUp ? 3 : isImpact ? 1.8 : 1
    const sky = skyRow(look, frame, sparkRow(look, SKY_WIDTH, sparkFrame, sparkBoost))

    const combo = current === null ? 0 : current.combo
    const totalText = `· ${total === 1 ? '1 latigazo' : `${total} latigazos`} `
    // Se mide con los blancos encendidos (✸ … ✸) para que nada salte en el golpe.
    const layout = layoutBand({
      columns: e.props.bodyColumns,
      modelLabel: `✸ ${modelName} ✸`,
      effortLabel: `✸ ${effortLabel} ✸`,
      combo,
      comboTitle: comboTitle(combo),
      progress,
      totalText,
      toggleLabel: 'apagar',
    })

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text color={look.glow} wrap="truncate">{sky.before}</Text>
          {sky.crack === '' ? null : (
            <Text color={look.glow} bold wrap="truncate">{sky.crack}</Text>
          )}
          {sky.after === '' ? null : <Text color={look.glow} wrap="truncate">{sky.after}</Text>}
        </Box>
        <Box flexDirection="row">
          {parts.map(part => (
            <Text color={colorOf[part.role]} bold={part.role === 'tip'} wrap="truncate">
              {part.text}
            </Text>
          ))}
          <Text wrap="truncate">{pad}</Text>
          <Button key="model" hotkey="m" label={hit('model') ? `✸ ${modelName} ✸` : modelName} onPress={() => crack($, 'model')} />
          <Text> </Text>
          <Button
            key="effort"
            hotkey="e"
            variant="primary"
            label={hit('effort') ? `✸ ${effortLabel} ✸` : effortLabel}
            onPress={() => crack($, 'effort')}
          />
          <Text> </Text>
          {layout.comboText === '' ? null : (
            <Text color={comboColor(combo)} bold wrap="truncate">
              {layout.comboText}
            </Text>
          )}
          <Text color={look.lash} wrap="truncate">{layout.badge} </Text>
          {layout.showTotal ? <Text dimColor wrap="truncate">{totalText}</Text> : null}
          <Button key="toggle" hotkey="o" label="apagar" dimColor onPress={() => setEnabled($, false)} />
        </Box>
      </Box>
    )
  })
}
