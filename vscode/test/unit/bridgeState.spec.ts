import * as assert from 'node:assert/strict'

import type { LashEvent } from '../../../hooks/bridge'
import { DESKTOP_TTL_MS, PRESENCE_TTL_MS } from '../../../hooks/bridge'
import { EMPTY_STATS } from '../../../hooks/model'
import type { BridgeSnapshot } from '../../src/bridgeState'
import { BridgeState } from '../../src/bridgeState'
import type { TempBridge } from './helpers'
import { FakeClock, tempBridge, writeRaw } from './helpers'

describe('BridgeState', () => {
  let bridge: TempBridge
  let clock: FakeClock

  beforeEach(() => {
    bridge = tempBridge()
    clock = new FakeClock()
  })

  afterEach(() => bridge.cleanup())

  it('arranca con lo que hay en disco', () => {
    bridge.store.writeConfig({ enabled: false, sound: false })
    const state = new BridgeState(bridge.store, clock)
    assert.deepEqual(state.snapshot.config, { enabled: false, sound: false })
    assert.deepEqual(state.snapshot.stats, EMPTY_STATS)
    assert.equal(state.snapshot.session.alive, false)
  })

  it('avisa solo cuando algo cambia de verdad', () => {
    const state = new BridgeState(bridge.store, clock)
    const seen: BridgeSnapshot[] = []
    state.onDidChange(snapshot => seen.push(snapshot))
    state.refresh('config')
    assert.equal(seen.length, 0)
    bridge.store.updateConfig({ sound: false })
    state.refresh('config')
    state.refresh('config')
    assert.equal(seen.length, 1)
    assert.equal(seen[0]!.config.sound, false)
  })

  it('lee la sesion viva y la da por muerta cuando caduca la presencia', () => {
    writeRaw(bridge.store.paths.presence, JSON.stringify({ at: clock.now(), model: 'claude-opus-5-5', effort: 'high', boost: 'xhigh' }))
    const state = new BridgeState(bridge.store, clock)
    assert.deepEqual(state.snapshot.session, { alive: true, model: 'claude-opus-5-5', effort: 'high', boost: 'xhigh' })
    clock.advance(PRESENCE_TTL_MS + 1)
    state.refresh('presence')
    assert.deepEqual(state.snapshot.session, { alive: false, model: null, effort: null, boost: null })
  })

  it('los conteos nunca bajan aunque el archivo se rompa', () => {
    bridge.store.writeStats({ ...EMPTY_STATS, total: 12 })
    const state = new BridgeState(bridge.store, clock)
    writeRaw(bridge.store.paths.stats, 'basura')
    state.refresh('stats')
    assert.equal(state.snapshot.stats.total, 12)
  })

  it('anima los latigazos nuevos de la terminal y de la pantalla, no los de VS Code ni el que ya estaba', () => {
    bridge.store.writeLash({ id: 'viejo', at: 1, target: 'model', combo: 1, total: 1, source: 'terminal' })
    const state = new BridgeState(bridge.store, clock)
    const seen: LashEvent[] = []
    state.onExternalLash(event => seen.push(event))
    state.refresh('lash')
    bridge.store.writeLash({ id: 'mio', at: 2, target: 'effort', combo: 1, total: 2, source: 'vscode' })
    state.refresh('lash')
    bridge.store.writeLash({ id: 't1', at: 3, target: 'effort', combo: 2, total: 3, source: 'terminal' })
    state.refresh('lash')
    state.refresh('lash')
    state.refresh()
    bridge.store.writeLash({ id: 'd1', at: 4, target: 'effort', combo: 3, total: 4, source: 'desktop' })
    state.refresh('lash')
    assert.deepEqual(seen.map(event => [event.id, event.source]), [
      ['t1', 'terminal'],
      ['d1', 'desktop'],
    ])
  })

  it('lee la app de escritorio: abierta, con el modo latigo, y cerrada cuando caduca', () => {
    const state = new BridgeState(bridge.store, clock)
    assert.deepEqual(state.snapshot.desktop, { alive: false, whipMode: false })
    const seen: BridgeSnapshot[] = []
    state.onDidChange(snapshot => seen.push(snapshot))
    writeRaw(bridge.store.paths.desktop, JSON.stringify({ at: clock.now(), whipMode: true }))
    state.refresh('desktop')
    assert.deepEqual(state.snapshot.desktop, { alive: true, whipMode: true })
    assert.equal(seen.length, 1)
    clock.advance(DESKTOP_TTL_MS + 1)
    state.refresh('presence')
    // Cerrada, el modo latigo no cuenta aunque el archivo diga que si.
    assert.deepEqual(state.snapshot.desktop, { alive: false, whipMode: false })
  })

  it('un desktop.json roto deja la app por cerrada', () => {
    writeRaw(bridge.store.paths.desktop, '{roto')
    const state = new BridgeState(bridge.store, clock)
    assert.deepEqual(state.snapshot.desktop, { alive: false, whipMode: false })
  })

  it('un lash.json roto se ignora', () => {
    const state = new BridgeState(bridge.store, clock)
    const seen: LashEvent[] = []
    state.onExternalLash(event => seen.push(event))
    writeRaw(bridge.store.paths.lash, JSON.stringify({ id: 9, target: 'otro', source: 'terminal' }))
    state.refresh('lash')
    assert.equal(seen.length, 0)
  })

  it('un oyente que lanza no impide avisar a los demas', () => {
    const state = new BridgeState(bridge.store, clock)
    let reached = false
    state.onDidChange(() => {
      throw new Error('roto')
    })
    state.onDidChange(() => {
      reached = true
    })
    bridge.store.updateConfig({ enabled: false })
    state.refresh('config')
    assert.equal(reached, true)
  })
})
