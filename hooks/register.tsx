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
import type { SoundStyle } from './sounds'
import { DEFAULT_SOUND_STYLE, SOUND_STYLES, crackDelayMs, isSoundStyle, pickSoundFile, soundStyle } from './sounds'
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
/** El effort que el latigo puso con /effort por ultima vez (sobrevive a /clear). */
let appliedEffort: Effort | null = null
/** Un /effort que no se pudo correr en el momento; lo corre el sondeo. */
let pendingEffort: Effort | null = null
/** El sonido elegido (config.json); cada latigazo toma un archivo al azar de ese estilo. */
let soundChoice: SoundStyle = DEFAULT_SOUND_STYLE
/** Si /latigo y /latigazo ya quedaron registrados en esta sesion. */
let commandsRegistered = false

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

/**
 * El effort con el que arranca la sesion: el guardado en ~/.claude/settings.json
 * para el modelo (o el general). Solo para mostrarlo antes del primer pedido;
 * turn.step trae despues el de verdad.
 */
async function readSavedEffort($: EngineInterface, modelName: string | null): Promise<Effort | null> {
  const configDir = (await $.env.get('CLAUDE_CONFIG_DIR'))?.trim()
  const home = (await $.env.get('HOME'))?.trim() || (await $.env.get('USERPROFILE'))?.trim()
  const dir = configDir ? configDir : home ? `${home}/.claude` : null
  if (dir === null) return null
  try {
    const settings = JSON.parse((await $.fs.read(`${dir}/settings.json`)) as string) as {
      effortLevel?: unknown
      modelSettings?: Record<string, { effortLevel?: unknown }>
    }
    const perModel = modelName === null ? undefined : settings.modelSettings?.[modelName]?.effortLevel
    if (isEffort(perModel)) return perModel
    return isEffort(settings.effortLevel) ? settings.effortLevel : null
  } catch {
    return null
  }
}

function play($: EngineInterface, asset: string): void {
  $.audio.play({ asset }).catch(() => undefined)
}

/** Un chasquido del sonido elegido, a tiempo para que el golpe caiga cuando la banda revienta. */
function playCrack($: EngineInterface): void {
  const file = pickSoundFile(soundChoice, Math.random())
  const delay = reduceMotion ? 0 : crackDelayMs(file, IMPACT_FROM * FRAME_MS)
  if (delay === 0) play($, `assets/${file.path}`)
  else $.clock.after(delay, () => play($, `assets/${file.path}`))
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
    soundChoice = merged.soundStyle
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
    await calm($)
    await writePresence($)
  }
}

/**
 * Cambia el effort de verdad con /effort: es el mismo que muestra el selector
 * de modelo de Claude Code (en la terminal y en el chat de VS Code). Si no se
 * puede, turn.step igual sube cada pedido.
 */
async function applyRealEffort($: EngineInterface, level: Effort): Promise<void> {
  appliedEffort = level
  try {
    await $.command.run({ command: 'effort', args: level })
  } catch {
    // Desde adentro de otro comando (/latigazo, /latigo calma) Claude Code no
    // deja correr /effort: lo corre el sondeo, que no depende de ese comando.
    // Mientras tanto turn.step igual sube cada pedido.
    pendingEffort = level
  }
}

async function raiseBoost($: EngineInterface, steps: number): Promise<Effort | null> {
  // Se sube desde lo que de verdad sale, nunca desde un forzado que quedo por debajo.
  const current = effectiveEffort(await read($, effort), await read($, boost)) ?? DEFAULT_EFFORT
  const raised = steps === 1 ? raiseEffort(current) : raiseEffortBy(current, steps)
  if (raised === null || raised === current) return null
  await update($, boost, () => raised)
  await applyRealEffort($, raised)
  return raised
}

/** Quita el effort forzado y, si nadie lo cambio a mano, devuelve el de antes. */
async function calm($: EngineInterface): Promise<void> {
  const base = await read($, effort)
  const forced = await read($, boost)
  await update($, boost, () => null)
  const shouldRestore = forced !== null && base !== null && appliedEffort === forced
  appliedEffort = null
  if (shouldRestore && base !== null) await applyRealEffort($, base)
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

type CrackResult = { from: Effort | null; raisedTo: Effort | null; combo: number; total: number; leveledUp: boolean }

async function crack($: EngineInterface, target: Target): Promise<CrackResult | null> {
  if (!(await read($, enabled))) return null
  const from = effectiveEffort(await read($, effort), await read($, boost))
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

  if (await read($, sound)) {
    if (leveledUp) play($, LEVEL_SOUND)
    else playCrack($)
  }
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
  return { from, raisedTo, combo: hitCombo, total: after.total, leveledUp }
}

/** La lista de /latigo sonidos, con el elegido marcado. */
function soundList(current: SoundStyle, isOn: boolean): string {
  const lines = ['## Sonidos del látigo', '', '| | Sonido | Cómo suena | Para elegirlo |', '|---|---|---|---|']
  for (const style of SOUND_STYLES) {
    lines.push(`| ${style.id === current ? '▶' : ''} | ${style.label} | ${style.description} | \`/latigo sonido ${style.id}\` |`)
  }
  lines.push('', isOn ? 'El sonido está prendido (`/latigo sonido off` lo apaga).' : 'El sonido está apagado (`/latigo sonido on` lo prende).')
  return lines.join('\n')
}

/** Lo que /latigazo deja escrito en el chat: el latigo y como quedo el effort. */
function lashReport(result: CrackResult): string {
  const look = lookFor(result.total)
  const { tier } = progressFor(result.total)
  const whip = `╾━━━━━━~~~~~${look.tip} ${look.crack}`
  const effortLine =
    result.raisedTo === null
      ? 'El effort ya está en max: más duro no se puede.'
      : `effort ${result.from ?? DEFAULT_EFFORT} → ${result.raisedTo} ⚡`
  const combo = result.combo >= 2 ? ` · x${result.combo} ${comboTitle(result.combo)}` : ''
  const level = result.leveledUp ? ` · ¡subiste a Nv ${tier.level} ${tier.name}!` : ` · Nv ${tier.level} ${tier.name}`
  const count = result.total === 1 ? '1 latigazo' : `${result.total} latigazos`
  return [whip, `${effortLine}${combo}${level} · ${count}`].join('\n')
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
    soundChoice = config.soundStyle
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
  if ((await read($, effort)) === null) {
    const saved = await readSavedEffort($, name || null)
    if (saved !== null) await update($, effort, () => saved)
  }
  reduceMotion = await readReduceMotion($)
  // Registrar otra vez reemplaza al anterior: asi /latigo sigue tras un /clear.
  commandsRegistered = await registerCommands($)
  await update($, ready, () => true)
}

/**
 * Registra /latigo y /latigazo. Si Claude Code lo rechaza (pasa si el plugin se
 * carga a mitad de una sesion), el latigo sigue andando y el sondeo reintenta.
 */
async function registerCommands($: EngineInterface): Promise<boolean> {
  try {
    await $.command.register({
      name: 'latigo',
      description: 'Tabla del látigo. on | off | calma | sonido | sonidos | ayuda',
      argumentHint: '[on|off|calma|sonido|sonidos|ayuda]',
    })
    await $.command.register({
      name: 'latigazo',
      description: 'Latigazo al effort: lo sube un nivel',
    })
    return true
  } catch {
    return false
  }
}

/** Lee el puente: interruptor, latigazos al effort y latigazos dados en VS Code. */
async function poll($: EngineInterface): Promise<void> {
  // Red de seguridad: si la sesion quedo en blanco (un /clear), se vuelve a cargar.
  if (!(await read($, ready))) await hydrate($, false).catch(() => undefined)
  if (pendingEffort !== null) {
    const level = pendingEffort
    pendingEffort = null
    if (appliedEffort === level) await $.command.run({ command: 'effort', args: level }).catch(() => undefined)
  }
  polls += 1
  if (!commandsRegistered && polls % 10 === 0) commandsRegistered = await registerCommands($)
  if (paths === null) return

  // Solo cuenta un config.json que cambio por fuera. Si este proceso escribio
  // mientras se leia, lo leido ya es viejo y se ignora.
  const knownConfig = lastConfigText
  const configText = isSavingConfig ? null : await readText($, paths.config)
  if (configText !== null && configText !== knownConfig && lastConfigText === knownConfig && !isSavingConfig) {
    lastConfigText = configText
    const config = parseConfig(configText)
    soundChoice = config.soundStyle
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
    if (event.source !== 'terminal' && isOn) {
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
    try {
      await hydrate($, true)
    } catch {
      // Lo que no se pudo cargar lo vuelve a intentar el sondeo (ready sigue en false).
    }

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
      $.clock.after(1, () => void hydrate($, false).catch(() => undefined))
    }
    return result
  })

  on('command.run', { command: 'latigazo' }, async $ => {
    const result = await crack($, 'effort')
    if (result === null) return { text: 'El látigo está apagado. Préndelo con `/latigo on`.' }
    return { text: lashReport(result) }
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
      await calm($)
      await writePresence($)
      return { text: 'Calma: el effort vuelve a ser el de la sesión.' }
    }
    if (arg === 'sonidos') return { text: soundList(soundChoice, await read($, sound)) }
    if (arg === 'sonido' || arg === 'sonido on' || arg === 'sonido off') {
      const isOn = arg === 'sonido' ? !(await read($, sound)) : arg === 'sonido on'
      await update($, sound, () => isOn)
      await saveConfig($, { sound: isOn })
      return { text: isOn ? 'Sonido encendido.' : 'Sonido apagado.' }
    }
    if (arg.startsWith('sonido ')) {
      const choice = arg.slice('sonido '.length).trim()
      if (!isSoundStyle(choice)) return { text: `No conozco el sonido «${choice}».\n\n${soundList(soundChoice, await read($, sound))}` }
      soundChoice = choice
      await update($, sound, () => true)
      await saveConfig($, { sound: true, soundStyle: choice })
      if (await read($, enabled)) play($, `assets/${pickSoundFile(choice, Math.random()).path}`)
      return { text: `Sonido: ${soundStyle(choice).label}.` }
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
    const forcedNow = await read($, boost)
    if (forcedNow === null) {
      if ((await read($, effort)) !== seen) await update($, effort, () => seen)
    } else if (effortRank(seen) > effortRank(forcedNow)) {
      // La persona lo subio a mano por encima del latigo: manda lo suyo.
      await update($, effort, () => seen)
      await update($, boost, () => null)
      appliedEffort = null
    }
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
