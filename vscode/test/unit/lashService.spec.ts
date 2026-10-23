import * as assert from 'node:assert/strict'

import { PRESENCE_TTL_MS } from '../../../hooks/bridge'
import { TIERS } from '../../../hooks/levels'
import { COMBO_WINDOW_MS, EMPTY_STATS } from '../../../hooks/model'
import type { LashResult } from '../../src/lashService'
import { LashService } from '../../src/lashService'
import type { TempBridge } from './helpers'
import { FakeClock, readJson, tempBridge, writeRaw } from './helpers'

describe('LashService', () => {
  let bridge: TempBridge
  let clock: FakeClock
  let service: LashService
  let ids: number

  const alive = () =>
    writeRaw(bridge.store.paths.presence, JSON.stringify({ version: 1, at: clock.now(), model: 'claude-opus-5-5', effort: 'high', boost: null }))

  beforeEach(() => {
    bridge = tempBridge()
    clock = new FakeClock()
    ids = 0
    service = new LashService(bridge.store, clock, () => `id-${++ids}`)
  })

  afterEach(() => {
    service.dispose()
    bridge.cleanup()
  })

  describe('combos', () => {
    it('el primer latigazo es combo 1, sin titulo', () => {
      const result = service.lash('model')!
      assert.equal(result.combo, 1)
      assert.equal(result.comboTitle, '')
    })

    it('latigazos dentro de la ventana suben el combo con su titulo', () => {
      const titles: string[] = []
      for (let i = 0; i < 5; i++) {
        titles.push(service.lash('model')!.comboTitle)
        clock.advance(COMBO_WINDOW_MS - 1)
      }
      assert.deepEqual(titles, ['', '¡DOBLE!', '¡TRIPLE!', '¡TRIPLE!', '¡FURIA!'])
    })

    it('justo en el borde de la ventana todavia cuenta', () => {
      service.lash('model')
      clock.advance(COMBO_WINDOW_MS)
      assert.equal(service.lash('model')!.combo, 2)
    })

    it('fuera de la ventana el combo vuelve a 1', () => {
      service.lash('model')
      clock.advance(COMBO_WINDOW_MS)
      service.lash('model')
      clock.advance(COMBO_WINDOW_MS + 1)
      assert.equal(service.lash('effort')!.combo, 1)
    })

    it('si el reloj va para atras no inventa combo', () => {
      service.lash('model')
      clock.advance(-10)
      assert.equal(service.lash('model')!.combo, 1)
    })

    it('el mejor combo queda guardado en stats.json', () => {
      for (let i = 0; i < 4; i++) {
        service.lash('effort')
        clock.advance(200)
      }
      clock.advance(10_000)
      service.lash('effort')
      assert.equal(bridge.store.readStats().bestCombo, 4)
    })
  })

  describe('conteos', () => {
    it('cuenta total, al modelo y al effort', () => {
      service.lash('model')
      service.lash('effort')
      service.lash('effort')
      const stats = bridge.store.readStats()
      assert.equal(stats.total, 3)
      assert.equal(stats.onModel, 1)
      assert.equal(stats.onEffort, 2)
    })

    it('cuenta por dia local, no por dia UTC', () => {
      // 2026-10-23 02:00 UTC = 2026-10-22 21:00 en Bogota (UTC-5).
      clock.time = Date.UTC(2026, 9, 23, 2, 0, 0)
      service.lash('model')
      clock.offsetMinutes = 0
      clock.advance(60_000)
      service.lash('model')
      assert.deepEqual(bridge.store.readStats().byDay, { '2026-10-22': 1, '2026-10-23': 1 })
    })

    it('suma sobre lo que ya habia en disco (latigazos de la terminal)', () => {
      bridge.store.writeStats({ ...EMPTY_STATS, total: 10, onModel: 10, byDay: { '2026-10-22': 10 } })
      const result = service.lash('effort')!
      assert.equal(result.previousTotal, 10)
      assert.equal(result.total, 11)
      assert.equal(bridge.store.readStats().byDay['2026-10-22'], 11)
    })

    it('si alguien trunca stats.json no se pierde lo que ya se habia visto', () => {
      for (let i = 0; i < 5; i++) service.lash('model')
      writeRaw(bridge.store.paths.stats, '{')
      assert.equal(service.lash('model')!.total, 6)
    })

    it('mezcla escrituras concurrentes quedandose con el mayor de cada campo', () => {
      service.lash('model')
      // La terminal escribe por su lado un estado mas avanzado en otro campo.
      bridge.store.writeStats({ total: 30, onModel: 0, onEffort: 30, bestCombo: 9, byDay: { '2026-10-20': 30 } })
      service.lash('model')
      const stats = bridge.store.readStats()
      assert.equal(stats.total, 31)
      assert.equal(stats.onEffort, 30)
      assert.equal(stats.onModel, 2)
      assert.equal(stats.bestCombo, 9)
      assert.deepEqual(stats.byDay, { '2026-10-20': 30, '2026-10-22': 2 })
    })

    it('dos servicios sobre el mismo puente no se pisan los conteos', () => {
      const other = new LashService(bridge.store, clock)
      for (let i = 0; i < 10; i++) {
        service.lash('model')
        other.lash('effort')
      }
      assert.equal(bridge.store.readStats().total, 20)
      other.dispose()
    })
  })

  describe('effort', () => {
    it('con una sesion viva, el latigazo al effort sube seq en effort.json', () => {
      alive()
      const first = service.lash('effort')!
      const second = service.lash('effort')!
      assert.equal(first.effortSeq, 1)
      assert.equal(second.effortSeq, 2)
      assert.equal(first.reachedSession, true)
      assert.deepEqual(readJson(bridge.store.paths.effort), { version: 1, seq: 2, at: clock.now() })
    })

    it('el latigazo al modelo nunca toca effort.json', () => {
      alive()
      const result = service.lash('model')!
      assert.equal(result.effortSeq, null)
      assert.equal(result.reachedSession, false)
      assert.equal(bridge.store.readEffortRequests().seq, 0)
    })

    it('sin sesion viva cuenta el latigazo pero no deja pedidos colgados', () => {
      const result = service.lash('effort')!
      assert.equal(result.reachedSession, false)
      assert.equal(result.effortSeq, null)
      assert.equal(bridge.store.readEffortRequests().seq, 0)
      assert.equal(bridge.store.readStats().onEffort, 1)
    })

    it('una presencia vieja (mas de PRESENCE_TTL_MS) no cuenta como sesion', () => {
      alive()
      clock.advance(PRESENCE_TTL_MS)
      assert.equal(service.lash('effort')!.reachedSession, false)
    })
  })

  describe('niveles', () => {
    it('detecta la subida de nivel justo en el latigazo que cruza el umbral', () => {
      const threshold = TIERS[1]!.minLashes
      bridge.store.writeStats({ ...EMPTY_STATS, total: threshold - 2 })
      const before = service.lash('model')!
      const up = service.lash('model')!
      const after = service.lash('model')!
      assert.deepEqual([before.levelUp, up.levelUp, after.levelUp], [false, true, false])
      assert.equal(up.level, 2)
    })

    it('en el nivel maximo no hay mas subidas', () => {
      bridge.store.writeStats({ ...EMPTY_STATS, total: TIERS[TIERS.length - 1]!.minLashes + 100 })
      const result = service.lash('model')!
      assert.equal(result.levelUp, false)
      assert.equal(result.level, TIERS.length)
    })
  })

  describe('interruptor y sonido', () => {
    it('apagado no hace nada: ni conteos, ni effort, ni lash.json, ni eventos', () => {
      alive()
      bridge.store.writeConfig({ enabled: false, sound: true })
      let fired = 0
      service.onDidLash(() => fired++)
      assert.equal(service.lash('effort'), null)
      assert.equal(service.lash('model'), null)
      assert.deepEqual(bridge.store.readStats(), EMPTY_STATS)
      assert.equal(bridge.store.readEffortRequests().seq, 0)
      assert.equal(bridge.store.readLash(), null)
      assert.equal(fired, 0)
    })

    it('apagado tampoco arma combo para cuando lo prendan', () => {
      bridge.store.writeConfig({ enabled: false, sound: true })
      service.lash('model')
      bridge.store.writeConfig({ enabled: true, sound: true })
      assert.equal(service.lash('model')!.combo, 1)
    })

    it('el resultado lleva el flag de sonido de config.json', () => {
      assert.equal(service.lash('model')!.sound, true)
      bridge.store.writeConfig({ enabled: true, sound: false })
      assert.equal(service.lash('model')!.sound, false)
    })
  })

  describe('aviso al otro lado', () => {
    it('escribe lash.json con source vscode, combo y total', () => {
      service.lash('effort')
      service.lash('model')
      assert.deepEqual(bridge.store.readLash(), { id: 'id-2', at: clock.now(), target: 'model', combo: 2, total: 2, source: 'vscode' })
    })

    it('dispara onDidLash con el resultado completo', () => {
      const seen: LashResult[] = []
      const subscription = service.onDidLash(result => seen.push(result))
      const result = service.lash('model')
      subscription.dispose()
      service.lash('model')
      assert.deepEqual(seen, [result])
    })
  })

  describe('conteos ya conocidos', () => {
    it('un stats.json ilegible no hace que el primer latigazo escriba un total menor', () => {
      const known = { total: 500, onModel: 200, onEffort: 300, bestCombo: 9, byDay: {} }
      const seeded = new LashService(bridge.store, clock, () => 'id-x', () => known)
      writeRaw(bridge.store.paths.stats, '{"version":1,"stats":')
      const result = seeded.lash('model')!
      assert.equal(result.total, 501)
      assert.equal((readJson(bridge.store.paths.stats) as { stats: { total: number } }).stats.total, 501)
      seeded.dispose()
    })
  })
})
