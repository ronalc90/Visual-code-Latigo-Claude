import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { bridgePaths, DEFAULT_CONFIG } from '../../../hooks/bridge'
import { EMPTY_STATS, recordLash } from '../../../hooks/model'
import type { FileSystem } from '../../src/bridgeStore'
import { BridgeStore, renameWithRetry } from '../../src/bridgeStore'
import type { TempBridge } from './helpers'
import { readJson, tempBridge, writeRaw } from './helpers'

describe('BridgeStore', () => {
  let bridge: TempBridge

  beforeEach(() => {
    bridge = tempBridge()
  })

  afterEach(() => bridge.cleanup())

  describe('lecturas por defecto', () => {
    it('crea la carpeta ~/.claude-latigo', () => {
      assert.ok(fs.statSync(path.join(bridge.home, '.claude-latigo')).isDirectory())
    })

    it('sin archivos devuelve config, stats, effort, lash y presencia por defecto', () => {
      assert.deepEqual(bridge.store.readConfig(), DEFAULT_CONFIG)
      assert.deepEqual(bridge.store.readStats(), EMPTY_STATS)
      assert.deepEqual(bridge.store.readEffortRequests(), { seq: 0, at: 0 })
      assert.equal(bridge.store.readLash(), null)
      assert.equal(bridge.store.readPresence(), null)
    })

    it('ensureDir no falla si la carpeta ya existe', () => {
      bridge.store.ensureDir()
      bridge.store.ensureDir()
    })
  })

  describe('archivos rotos', () => {
    const garbage = ['{', 'null', '[]', '"hola"', '42', '', '   ', '{"enabled": "si"}', '\u0000\u0001']

    for (const text of garbage) {
      it(`no lanza y usa valores seguros con ${JSON.stringify(text)}`, () => {
        const paths = bridge.store.paths
        for (const file of [paths.config, paths.stats, paths.effort, paths.lash, paths.presence]) writeRaw(file, text)
        assert.deepEqual(bridge.store.readConfig(), DEFAULT_CONFIG)
        assert.deepEqual(bridge.store.readStats(), EMPTY_STATS)
        assert.deepEqual(bridge.store.readEffortRequests(), { seq: 0, at: 0 })
        assert.equal(bridge.store.readLash(), null)
      })
    }

    it('campos con tipos equivocados caen al valor por defecto campo por campo', () => {
      writeRaw(bridge.store.paths.config, JSON.stringify({ enabled: false, sound: 'no' }))
      assert.deepEqual(bridge.store.readConfig(), { enabled: false, sound: true })
      writeRaw(bridge.store.paths.stats, JSON.stringify({ stats: { total: -4, onModel: 'x', onEffort: 3.9, bestCombo: null, byDay: { 'no-es-fecha': 3, '2026-10-22': 2 } } }))
      assert.deepEqual(bridge.store.readStats(), { total: 0, onModel: 0, onEffort: 3, bestCombo: 0, byDay: { '2026-10-22': 2 } })
      writeRaw(bridge.store.paths.effort, JSON.stringify({ seq: -3, at: 'ayer' }))
      assert.deepEqual(bridge.store.readEffortRequests(), { seq: 0, at: 0 })
    })

    it('una presencia con effort invalido lo deja en null', () => {
      writeRaw(bridge.store.paths.presence, JSON.stringify({ at: 5, model: 'claude-opus-5-5', effort: 'turbo', boost: 'max' }))
      assert.deepEqual(bridge.store.readPresence(), { at: 5, model: 'claude-opus-5-5', effort: null, boost: 'max' })
    })
  })

  describe('escrituras', () => {
    it('updateConfig cambia solo lo pedido y conserva lo demas', () => {
      bridge.store.writeConfig({ enabled: true, sound: false })
      assert.deepEqual(bridge.store.updateConfig({ enabled: false }), { enabled: false, sound: false })
      assert.deepEqual(readJson(bridge.store.paths.config), { version: 1, enabled: false, sound: false })
    })

    it('las estadisticas hacen ida y vuelta', () => {
      const stats = recordLash(recordLash(EMPTY_STATS, 'effort', 1, '2026-10-21'), 'model', 2, '2026-10-22')
      bridge.store.writeStats(stats)
      assert.deepEqual(bridge.store.readStats(), stats)
    })

    it('incrementEffortSeq suma de a uno y guarda la hora', () => {
      assert.deepEqual(bridge.store.incrementEffortSeq(100), { seq: 1, at: 100 })
      assert.deepEqual(bridge.store.incrementEffortSeq(200), { seq: 2, at: 200 })
      assert.deepEqual(readJson(bridge.store.paths.effort), { version: 1, seq: 2, at: 200 })
    })

    it('incrementEffortSeq parte del valor que haya en disco', () => {
      writeRaw(bridge.store.paths.effort, JSON.stringify({ version: 1, seq: 41, at: 1 }))
      assert.equal(bridge.store.incrementEffortSeq(2).seq, 42)
    })

    it('writeLash guarda el latigazo con source vscode', () => {
      bridge.store.writeLash({ id: 'x1', at: 10, target: 'effort', combo: 3, total: 7, source: 'vscode' })
      assert.deepEqual(bridge.store.readLash(), { id: 'x1', at: 10, target: 'effort', combo: 3, total: 7, source: 'vscode' })
    })

    it('la escritura es atomica: no deja temporales y crea la carpeta si la borraron', () => {
      fs.rmSync(bridge.store.paths.dir, { recursive: true, force: true })
      for (let i = 0; i < 20; i++) bridge.store.writeConfig({ enabled: i % 2 === 0, sound: true })
      const left = fs.readdirSync(bridge.store.paths.dir)
      assert.deepEqual(left, ['config.json'])
    })

    it('si falla el rename no deja el temporal tirado', () => {
      // Un directorio con el nombre del archivo hace fallar el rename.
      fs.mkdirSync(bridge.store.paths.config)
      assert.throws(() => bridge.store.writeConfig({ enabled: true, sound: true }))
      const temps = fs.readdirSync(bridge.store.paths.dir).filter(name => name.endsWith('.tmp'))
      assert.deepEqual(temps, [])
    })

    it('un lector nunca ve un archivo a medio escribir', () => {
      const big = { ...EMPTY_STATS, total: 5, byDay: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`2020-01-${String((i % 28) + 1).padStart(2, '0')}`, i])) }
      for (let i = 0; i < 30; i++) {
        bridge.store.writeStats({ ...big, total: i })
        const text = fs.readFileSync(bridge.store.paths.stats, 'utf8')
        assert.doesNotThrow(() => JSON.parse(text))
      }
    })
  })

  describe('con un FileSystem inyectado', () => {
    it('usa las rutas del puente y el sistema de archivos que le pasen', () => {
      const written = new Map<string, string>()
      const files: FileSystem = {
        readText: file => written.get(file),
        writeTextAtomic: (file, text) => void written.set(file, text),
        ensureDir: () => undefined,
      }
      const store = new BridgeStore(bridgePaths('/casa/ronald/'), files)
      store.updateConfig({ sound: false })
      assert.deepEqual([...written.keys()], ['/casa/ronald/.claude-latigo/config.json'])
      assert.deepEqual(store.readConfig(), { enabled: true, sound: false })
    })
  })

  describe('renombrar con reintento', () => {
    const busy = (code: string) => Object.assign(new Error(code), { code })

    it('reintenta cuando el archivo esta ocupado (EPERM, EBUSY, EACCES) y termina', () => {
      for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
        let calls = 0
        const waits: number[] = []
        renameWithRetry(() => {
          calls += 1
          if (calls < 3) throw busy(code)
        }, 'a', 'b', 5, ms => waits.push(ms))
        assert.equal(calls, 3)
        assert.deepEqual(waits, [15, 30])
      }
    })

    it('se rinde despues de los intentos y lanza el ultimo error', () => {
      let calls = 0
      assert.throws(() => renameWithRetry(() => {
        calls += 1
        throw busy('EBUSY')
      }, 'a', 'b', 4, () => undefined), /EBUSY/)
      assert.equal(calls, 4)
    })

    it('otros errores no se reintentan', () => {
      let calls = 0
      assert.throws(() => renameWithRetry(() => {
        calls += 1
        throw busy('ENOSPC')
      }, 'a', 'b', 5, () => undefined), /ENOSPC/)
      assert.equal(calls, 1)
    })
  })
})
