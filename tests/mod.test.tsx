// El mod de punta a punta: arranque, banda, effort, interruptor, puente con
// VS Code, subida de nivel y comando /latigo. Disco, reloj, store, sonido y
// toasts son de mentira (en memoria) para poder mirarlos.

import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { describe, expect, mock, test } from 'claude-code/testing'

const HOME = '/home/ana'
const DIR = `${HOME}/.claude-latigo`
const SURFACES = ['terminal', 'vscode', 'desktop'] as const

const BAND = {
  plugin: 'latigo',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

type World = {
  files: Map<string, string>
  sounds: string[]
  toasts: string[]
  commands: string[]
  /** Lo que el plugin pidio con /effort. */
  efforts: string[]
  clock: ReturnType<typeof mock.clock>
}

/** Arma el mundo de mentira bajo el mod. */
function world(on: On, files: Record<string, string> = {}, store: Record<string, unknown> = {}, reduceMotion = false, env: Record<string, string> = { HOME }): World {
  const state: World = { files: new Map(Object.entries(files)), sounds: [], toasts: [], commands: [], efforts: [], clock: mock.clock(on, { now: Date.UTC(2026, 9, 22, 15, 0) }) }
  mock.store(on, store)
  mock.env(on, env)
  on('fs.read', ($, e) => {
    const text = state.files.get(e.path)
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('fs.write', ($, e) => {
    state.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.exists', ($, e) => ({ value: state.files.has(e.path) }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.register', ($, e) => {
    state.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('audio.play', ($, e) => {
    state.sounds.push(String(e.clip.asset))
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    state.toasts.push(e.text)
    return { value: undefined }
  })
  on('config.list', () => ({ value: reduceMotion ? [{ key: 'reduceMotion', label: 'Reduce motion', kind: 'boolean', value: true, provider: { plugin: 'engine', tier: 'core' }, isLocked: false }] : [] }))
  on('command.run', { command: 'effort' }, ($, e) => {
    state.efforts.push(e.args)
    return { text: `Set effort level to ${e.args}` }
  })
  on('session.start', () => ({ cwd: '/proyecto' }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  return state
}

function json(state: World, name: string): Record<string, unknown> {
  const text = state.files.get(`${DIR}/${name}`)
  if (text === undefined) throw new Error(`no existe ${name}`)
  return JSON.parse(text) as Record<string, unknown>
}

async function start($: Engine): Promise<void> {
  await $.session.start({ cwd: '/proyecto', surface: 'terminal', isInteractive: true })
}

describe('arranque', () => {
  test('crea la configuracion compartida y avisa que hay sesion', async ($, on) => {
    const w = world(on)
    await start($)
    expect(json(w, 'config.json')).toEqual({ version: 1, enabled: true, sound: true })
    expect(json(w, 'presence.json')).toMatchObject({ model: 'claude-opus-5-5', effort: null, boost: null })
  })

  test('respeta un latigo que se dejo apagado', async ($, on) => {
    world(on, { [`${DIR}/config.json`]: '{"version":1,"enabled":false,"sound":true}' })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ key: 'toggle' })).toMatchObject({ props: { label: 'encender' } })
    expect(await ui.find({ key: 'effort' })).toBeUndefined()
    await ui.unmount()
  })

  test('junta los conteos del store con los del disco', async ($, on) => {
    world(
      on,
      { [`${DIR}/stats.json`]: '{"version":1,"stats":{"total":30,"onModel":10,"onEffort":20,"bestCombo":4,"byDay":{}}}' },
      { stats: { total: 12, onModel: 12, onEffort: 0, bestCombo: 6, byDay: {} } },
    )
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ text: /30 latigazos/ })).toBeDefined()
    expect(await ui.find({ text: /Nv 2 Cuero curtido/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('la banda', () => {
  for (const surface of SURFACES) {
    test(`en ${surface}: latigazo al effort lo sube, suena y queda en disco`, async ($, on) => {
      const w = world(on)
      await start($)
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort' } })

      await ui.press({ key: 'effort' })
      await w.clock.advance(1000)

      expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: high ⚡' } })
      expect(w.sounds).toEqual(['assets/latigo.wav'])
      expect(json(w, 'stats.json')).toMatchObject({ stats: { total: 1, onEffort: 1 } })
      expect(json(w, 'lash.json')).toMatchObject({ target: 'effort', source: 'terminal', total: 1, combo: 1 })
      expect(json(w, 'presence.json')).toMatchObject({ boost: 'high' })
      await ui.unmount()
    })

    test(`en ${surface}: dos seguidos hacen combo y el golpe se ve`, async ($, on) => {
      const w = world(on)
      await start($)
      const ui = await $.ui.mount({ ...BAND, surface })
      await ui.press({ key: 'effort' })
      await w.clock.advance(200)
      await ui.press({ key: 'effort' })
      await w.clock.advance(6 * 70)
      expect(await ui.find({ text: /x2 ¡DOBLE!/ })).toBeDefined()
      expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: '✸ effort: xhigh ⚡ ✸' } })
      expect(await ui.find({ text: /¡CHAS!/ })).toBeDefined()
      await w.clock.advance(2000)
      expect(await ui.find({ text: /¡CHAS!/ })).toBeUndefined()
      expect(await ui.find({ text: /x2/ })).toBeUndefined()
      await ui.unmount()
    })

    test(`en ${surface}: latigazo al modelo es solo visual`, async ($, on) => {
      const w = world(on)
      await start($)
      const ui = await $.ui.mount({ ...BAND, surface })
      await ui.press({ key: 'model' })
      await w.clock.advance(2000)
      expect(await ui.find({ key: 'model' })).toMatchObject({ props: { label: 'opus-5-5' } })
      expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort' } })
      expect(json(w, 'stats.json')).toMatchObject({ stats: { total: 1, onModel: 1, onEffort: 0 } })
      await ui.unmount()
    })

    test(`en ${surface}: el boton apaga y prende el latigo`, async ($, on) => {
      const w = world(on)
      await start($)
      const ui = await $.ui.mount({ ...BAND, surface })
      await ui.press({ key: 'toggle' })
      expect(json(w, 'config.json')).toMatchObject({ enabled: false })
      expect(await ui.find({ text: /látigo apagado/ })).toBeDefined()
      expect(await ui.find({ key: 'effort' })).toBeUndefined()
      await ui.press({ key: 'toggle' })
      expect(json(w, 'config.json')).toMatchObject({ enabled: true })
      expect(await ui.find({ key: 'effort' })).toBeDefined()
      await ui.unmount()
    })
  }

  test('el effort no sube de max y lo avisa', async ($, on) => {
    const w = world(on)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    for (let i = 0; i < 4; i++) {
      await ui.press({ key: 'effort' })
      await w.clock.advance(2000)
    }
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: max ⚡' } })
    expect(w.toasts).toContain('El effort ya está en max: más duro no se puede.')
    await ui.unmount()
  })

  test('cerca del nivel siguiente sube con sonido especial y aviso', async ($, on) => {
    const w = world(on, { [`${DIR}/stats.json`]: '{"version":1,"stats":{"total":24,"onModel":24,"onEffort":0,"bestCombo":1,"byDay":{}}}' })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'model' })
    expect(w.sounds).toEqual(['assets/nivel.wav'])
    expect(w.toasts).toContain('¡Nivel 2! Tu látigo ahora es Cuero curtido.')
    await w.clock.advance(2000)
    expect(await ui.find({ text: /Nv 2 Cuero curtido/ })).toBeDefined()
    await ui.unmount()
  })

  test('en niveles altos aparecen chispas y en los primeros no', async ($, on) => {
    const w = world(on, { [`${DIR}/stats.json`]: '{"version":1,"stats":{"total":7000,"onModel":7000,"onEffort":0,"bestCombo":1,"byDay":{}}}' })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await w.clock.advance(5000)
    expect(await ui.find({ text: /[✦✶✷❋✺]/ })).toBeDefined()
    expect(await ui.find({ text: /Nv 14 Divino/ })).toBeDefined()
    await ui.unmount()
  })

  test('con movimiento reducido va directo al golpe y no titila en reposo', async ($, on) => {
    const w = world(on, { [`${DIR}/stats.json`]: '{"version":1,"stats":{"total":7000,"onModel":7000,"onEffort":0,"bestCombo":1,"byDay":{}}}' }, {}, true)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const idle = (await ui.find({ text: /^[ ✦✶✷❋✺]+$/ }))?.text
    await w.clock.advance(5000)
    expect((await ui.find({ text: /^[ ✦✶✷❋✺]+$/ }))?.text).toBe(idle)
    await ui.press({ key: 'model' })
    expect(await ui.find({ text: /CHAAAAS/ })).toBeDefined()
    await ui.unmount()
  })

  test('sin sonido no suena', async ($, on) => {
    const w = world(on, { [`${DIR}/config.json`]: '{"version":1,"enabled":true,"sound":false}' })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'model' })
    expect(w.sounds).toEqual([])
    await ui.unmount()
  })

  test('con una encuesta encima la banda cede', async ($, on) => {
    world(on)
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>encuesta</Text>
    })
    await start($)
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'terminal' })
    expect(await ui.find({ key: 'effort' })).toBeUndefined()
    expect(await ui.find({ text: 'encuesta' })).toBeDefined()
    await ui.unmount()
  })
})

describe('el effort de verdad', () => {
  async function step($: Engine, effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max', agentId?: string) {
    const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort, messageCount: 3, ...(agentId === undefined ? {} : { agentId }) })
    for await (const _chunk of stream) {
      // nada: solo se consume
    }
    return stream.result
  }

  test('el pedido al modelo sale con el effort forzado', async ($, on) => {
    const w = world(on)
    const sent: Array<string | number | undefined> = []
    on('turn.step', async function* ($, e) {
      sent.push(e.effort)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    await start($)
    await step($, 'medium')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: medium' } })
    await ui.press({ key: 'effort' })
    await w.clock.advance(2000)
    await step($, 'medium')
    expect(sent).toEqual(['medium', 'high'])
    await ui.unmount()
  })

  test('nunca baja un effort que ya va mas alto', async ($, on) => {
    world(on)
    const sent: Array<string | number | undefined> = []
    on('turn.step', async function* ($, e) {
      sent.push(e.effort)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'effort' })
    await step($, 'max')
    expect(sent).toEqual(['max'])
    await ui.unmount()
  })

  test('los subagentes no se tocan', async ($, on) => {
    world(on)
    const sent: Array<string | number | undefined> = []
    on('turn.step', async function* ($, e) {
      sent.push(e.effort)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'effort' })
    await step($, 'low', 'agente-1')
    expect(sent).toEqual(['low'])
    await ui.unmount()
  })

  test('apagado, el effort vuelve a ser el de la sesion', async ($, on) => {
    world(on)
    const sent: Array<string | number | undefined> = []
    on('turn.step', async function* ($, e) {
      sent.push(e.effort)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'effort' })
    await ui.press({ key: 'toggle' })
    await step($, 'low')
    expect(sent).toEqual(['low'])
    await ui.unmount()
  })
})

describe('/clear', () => {
  test('tras un /clear la banda recupera los conteos enseguida', async ($, on) => {
    const w = world(on, { [`${DIR}/stats.json`]: '{"version":1,"stats":{"total":30,"onModel":30,"onEffort":0,"bestCombo":1,"byDay":{}}}' })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ text: /30 latigazos/ })).toBeDefined()
    // Mientras tanto VS Code sumo latigazos sin avisar con lash.json.
    w.files.set(`${DIR}/stats.json`, '{"version":1,"stats":{"total":500,"onModel":500,"onEffort":0,"bestCombo":1,"byDay":{}}}')
    await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
    // Antes del primer sondeo (600 ms): lo carga el session.end, no la red de seguridad.
    await w.clock.advance(10)
    expect(await ui.find({ text: /500 latigazos/ })).toBeDefined()
    expect(await ui.find({ text: /Nv 6 Plata vieja/ })).toBeDefined()
    await ui.unmount()
  })

  test('tras un /clear se respeta un latigo apagado', async ($, on) => {
    const w = world(on)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    w.files.set(`${DIR}/config.json`, '{"version":1,"enabled":false,"sound":true}')
    await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
    await w.clock.advance(10)
    expect(await ui.find({ text: /látigo apagado/ })).toBeDefined()
    await ui.unmount()
  })

  test('otros finales de sesion no recargan nada', async ($, on) => {
    const w = world(on)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    w.files.set(`${DIR}/stats.json`, '{"version":1,"stats":{"total":77,"onModel":77,"onEffort":0,"bestCombo":1,"byDay":{}}}')
    await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: { id: 's1' } })
    await w.clock.advance(10)
    expect(await ui.find({ text: /0 latigazos/ })).toBeDefined()
    await ui.unmount()
  })

  test('sin cargar todavia, la banda no dibuja conteos en cero', async ($, on) => {
    world(on)
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>banda del motor</Text>
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ text: 'banda del motor' })).toBeDefined()
    expect(await ui.find({ key: 'effort' })).toBeUndefined()
    expect(await ui.find({ text: /latigazos/ })).toBeUndefined()
    await ui.unmount()
  })
})

describe('lo que encontro la revision', () => {
  test('en Windows sin HOME usa USERPROFILE, como VS Code', async ($, on) => {
    // En Windows seria C:\\Users\\ana; aqui basta una ruta absoluta de este sistema.
    const w = world(on, {}, {}, false, { USERPROFILE: '/perfiles/ana' })
    await start($)
    expect(w.files.has('/perfiles/ana/.claude-latigo/config.json')).toBe(true)
  })

  test('apagar en la banda no lo deshace el sondeo', async ($, on) => {
    const w = world(on)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'toggle' })
    await w.clock.advance(3000)
    expect(json(w, 'config.json')).toMatchObject({ enabled: false })
    expect(await ui.find({ text: /látigo apagado/ })).toBeDefined()
    await ui.unmount()
  })

  test('apagar no pisa un cambio de sonido que VS Code hizo y aun no se habia leido', async ($, on) => {
    const w = world(on)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    w.files.set(`${DIR}/config.json`, '{"version":1,"enabled":true,"sound":false}\n')
    await ui.press({ key: 'toggle' })
    expect(json(w, 'config.json')).toMatchObject({ enabled: false, sound: false })
    await ui.unmount()
  })

  test('un effort.json reiniciado (contador menor) vuelve a contar', async ($, on) => {
    const w = world(on, { [`${DIR}/effort.json`]: '{"version":1,"seq":37,"at":1}' })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    w.files.set(`${DIR}/effort.json`, '{"version":1,"seq":1,"at":2}')
    await w.clock.advance(700)
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: high ⚡' } })
    await ui.unmount()
  })

  test('una lectura fallida de effort.json no se confunde con un reinicio', async ($, on) => {
    const w = world(on, { [`${DIR}/effort.json`]: '{"version":1,"seq":37,"at":1}' })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    w.files.delete(`${DIR}/effort.json`)
    await w.clock.advance(700)
    w.files.set(`${DIR}/effort.json`, '{"version":1,"seq":38,"at":2}')
    await w.clock.advance(700)
    // Un solo latigazo nuevo: sube a high, no 38 niveles.
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: high ⚡' } })
    await ui.unmount()
  })

  test('al salir de Claude Code la presencia queda vencida enseguida', async ($, on) => {
    const w = world(on)
    await start($)
    await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: { id: 's1' } })
    expect(json(w, 'presence.json')).toMatchObject({ at: 0 })
  })

  test('el latigazo sube desde el effort real de la sesion, no desde abajo', async ($, on) => {
    const w = world(on)
    on('turn.step', async function* ($, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    await start($)
    const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'xhigh', messageCount: 1 })
    for await (const _chunk of stream) {
      // se consume
    }
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: xhigh' } })
    await ui.press({ key: 'effort' })
    await w.clock.advance(2000)
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: max ⚡' } })
    await ui.unmount()
  })

  test('una recarga en pleno latigazo no deja la banda congelada', async ($, on) => {
    const w = world(on)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'effort' })
    await w.clock.advance(6 * 70)
    expect(await ui.find({ text: /¡CHAS!/ })).toBeDefined()
    await start($)
    expect(await ui.find({ text: /¡CHAS!/ })).toBeUndefined()
    await ui.unmount()
  })

  test('/latigo se vuelve a registrar tras un /clear', async ($, on) => {
    const w = world(on)
    await start($)
    expect(w.commands).toEqual(['latigo', 'latigazo'])
    await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
    await w.clock.advance(10)
    expect(w.commands).toEqual(['latigo', 'latigazo', 'latigo', 'latigazo'])
  })
})

describe('effort de verdad con /effort', () => {
  const SETTINGS = `${HOME}/.claude/settings.json`
  const saved = (effort: string) => JSON.stringify({ modelSettings: { 'claude-opus-5-5': { effortLevel: effort } } })

  test('al arrancar muestra el effort guardado para el modelo', async ($, on) => {
    world(on, { [SETTINGS]: saved('medium') })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: medium' } })
    await ui.unmount()
  })

  test('el latigazo al effort lo cambia con /effort (lo que muestra el selector de modelo)', async ($, on) => {
    const w = world(on, { [SETTINGS]: saved('medium') })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'effort' })
    await w.clock.advance(200)
    await ui.press({ key: 'effort' })
    expect(w.efforts).toEqual(['high', 'xhigh'])
    await w.clock.advance(2000)
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: xhigh ⚡' } })
    await ui.unmount()
  })

  test('calma devuelve el effort que habia antes del latigo', async ($, on) => {
    const w = world(on, { [SETTINGS]: saved('medium') })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'effort' })
    await $.command.run({ command: 'latigo', args: 'calma', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
    await w.clock.advance(2000)
    expect(w.efforts).toEqual(['high', 'medium'])
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: medium' } })
    await ui.unmount()
  })

  test('apagar tambien devuelve el effort de antes', async ($, on) => {
    const w = world(on, { [SETTINGS]: saved('high') })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'effort' })
    await ui.press({ key: 'toggle' })
    expect(w.efforts).toEqual(['xhigh', 'high'])
    await ui.unmount()
  })

  test('si la persona sube el effort a mano por encima, manda lo suyo y no se le devuelve nada', async ($, on) => {
    const w = world(on, { [SETTINGS]: saved('medium') })
    on('turn.step', async function* ($, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'effort' })
    const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'max', messageCount: 1 })
    for await (const _chunk of stream) {
      // se consume
    }
    await $.command.run({ command: 'latigo', args: 'calma', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
    await w.clock.advance(700)
    expect(w.efforts).toEqual(['high'])
    await ui.unmount()
  })

  test('/latigazo en el chat sube el effort y deja el latigo escrito', async ($, on) => {
    const w = world(on, { [SETTINGS]: saved('medium') })
    await start($)
    const result = (await $.command.run({ command: 'latigazo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })) as { text: string }
    await w.clock.advance(700)
    expect(w.efforts).toEqual(['high'])
    expect(result.text).toContain('╾━━━━━━~~~~~')
    expect(result.text).toContain('effort medium → high ⚡')
    expect(result.text).toContain('Nv 1 Cuero crudo · 1 latigazo')
    expect(result.text).not.toContain('```')
    expect(json(w, 'stats.json')).toMatchObject({ stats: { total: 1, onEffort: 1 } })
  })

  test('/latigazo con el latigo apagado lo dice', async ($, on) => {
    world(on, { [`${DIR}/config.json`]: '{"version":1,"enabled":false,"sound":true}' })
    await start($)
    const result = (await $.command.run({ command: 'latigazo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })) as { text: string }
    expect(result.text).toContain('apagado')
  })
})

describe('apagar', () => {
  test('al volver a prender, el effort arranca como el de la sesion', async ($, on) => {
    const w = world(on)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'effort' })
    await w.clock.advance(2000)
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: high ⚡' } })
    await ui.press({ key: 'toggle' })
    expect(json(w, 'presence.json')).toMatchObject({ boost: null })
    await ui.press({ key: 'toggle' })
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort' } })
    await ui.unmount()
  })

  test('LATIGO_HOME cambia la carpeta del puente', async ($, on) => {
    const w = world(on, {}, {}, false, { HOME, LATIGO_HOME: '/tmp/otra' })
    await start($)
    expect(w.files.has('/tmp/otra/.claude-latigo/config.json')).toBe(true)
    expect(w.files.has(`${DIR}/config.json`)).toBe(false)
  })
})

describe('puente con VS Code', () => {
  test('la tecla de VS Code apaga y prende el latigo aqui', async ($, on) => {
    const w = world(on)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    w.files.set(`${DIR}/config.json`, '{"version":1,"enabled":false,"sound":true}')
    await w.clock.advance(700)
    expect(await ui.find({ text: /látigo apagado/ })).toBeDefined()
    w.files.set(`${DIR}/config.json`, '{"version":1,"enabled":true,"sound":true}')
    await w.clock.advance(700)
    expect(await ui.find({ key: 'effort' })).toBeDefined()
    await ui.unmount()
  })

  test('los latigazos al effort de VS Code suben el effort aqui', async ($, on) => {
    const w = world(on, { [`${DIR}/effort.json`]: '{"version":1,"seq":5,"at":1}' })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await w.clock.advance(700)
    // Los 5 de antes de arrancar no cuentan.
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort' } })
    w.files.set(`${DIR}/effort.json`, '{"version":1,"seq":7,"at":2}')
    await w.clock.advance(700)
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: xhigh ⚡' } })
    expect(w.toasts).toContain('Latigazo desde VS Code: effort xhigh.')
    expect(json(w, 'presence.json')).toMatchObject({ boost: 'xhigh' })
    await ui.unmount()
  })

  test('apagado, los latigazos de VS Code no suben nada', async ($, on) => {
    const w = world(on, { [`${DIR}/config.json`]: '{"version":1,"enabled":false,"sound":true}' })
    await start($)
    w.files.set(`${DIR}/effort.json`, '{"version":1,"seq":3,"at":2}')
    await w.clock.advance(700)
    expect(w.toasts).toEqual([])
    expect(json(w, 'presence.json')).toMatchObject({ boost: null })
  })

  test('un latigazo dado en VS Code se cuenta y se anima aqui', async ($, on) => {
    const w = world(on)
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    w.files.set(`${DIR}/stats.json`, '{"version":1,"stats":{"total":9,"onModel":0,"onEffort":9,"bestCombo":3,"byDay":{}}}')
    w.files.set(`${DIR}/lash.json`, '{"version":1,"id":"v-9","at":1,"target":"model","combo":3,"total":9,"source":"vscode"}')
    await w.clock.advance(600 + 6 * 70)
    expect(await ui.find({ text: /x3 ¡TRIPLE!/ })).toBeDefined()
    await w.clock.advance(2000)
    expect(await ui.find({ text: /9 latigazos/ })).toBeDefined()
    await ui.unmount()
  })

  test('archivos rotos en el puente no tumban nada', async ($, on) => {
    const w = world(on, {
      [`${DIR}/config.json`]: '{roto',
      [`${DIR}/stats.json`]: 'null',
      [`${DIR}/effort.json`]: '[]',
      [`${DIR}/lash.json`]: '"nada"',
    })
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await w.clock.advance(3000)
    expect(await ui.find({ key: 'effort' })).toBeDefined()
    expect(await ui.find({ text: /0 latigazos/ })).toBeDefined()
    await ui.unmount()
  })

  test('sin HOME el latigo funciona solo en la sesion', async ($, on) => {
    const state = mock.clock(on, { now: 0 })
    mock.store(on)
    mock.env(on, {})
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('audio.play', () => ({ value: undefined }))
    on('session.start', () => ({ cwd: '/proyecto' }))
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'effort' })
    await state.advance(2000)
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: high ⚡' } })
    await ui.unmount()
  })
})

describe('/latigo', () => {
  const run = ($: Engine, args: string) =>
    $.command.run({ command: 'latigo', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

  test('sin argumentos muestra la tabla con el top en camino', async ($, on) => {
    world(on, { [`${DIR}/stats.json`]: '{"version":1,"stats":{"total":61,"onModel":1,"onEffort":60,"bestCombo":7,"byDay":{"2026-10-22":5}}}' })
    await start($)
    const result = (await run($, '')) as { text: string }
    expect(result.text).toContain('Nv 3 · Trenzado')
    expect(result.text).toContain('| Latigazos en total | 61 |')
    expect(result.text).toContain('| Hoy | 5 |')
    expect(result.text).toContain('| Mejor combo | x7 |')
    expect(result.text).toContain('Top global · próximamente')
  })

  test('off, on, sonido y calma hacen lo que dicen', async ($, on) => {
    const w = world(on)
    await start($)
    expect(((await run($, 'off')) as { text: string }).text).toContain('apagado')
    expect(json(w, 'config.json')).toMatchObject({ enabled: false })
    expect(((await run($, 'ON')) as { text: string }).text).toContain('encendido')
    expect(json(w, 'config.json')).toMatchObject({ enabled: true })
    expect(((await run($, 'sonido')) as { text: string }).text).toBe('Sonido apagado.')
    expect(json(w, 'config.json')).toMatchObject({ sound: false })

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'effort' })
    await w.clock.advance(2000)
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort: high ⚡' } })
    await run($, 'calma')
    expect(await ui.find({ key: 'effort' })).toMatchObject({ props: { label: 'effort' } })
    await ui.unmount()
  })

  test('ayuda lista los comandos', async ($, on) => {
    world(on)
    await start($)
    const result = (await run($, 'ayuda')) as { text: string }
    expect(result.text).toContain('/latigo on')
    expect(result.text).toContain('/latigo calma')
  })
})
