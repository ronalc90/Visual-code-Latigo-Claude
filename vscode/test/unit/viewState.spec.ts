import * as assert from 'node:assert/strict'

import { buildViewState } from '../../src/viewState'
import { DEFAULT_SETTINGS } from '../../src/settings'
import type { BridgeSnapshot } from '../../src/bridgeState'

describe('buildViewState', () => {
  const snapshot: BridgeSnapshot = {
    config: { enabled: true, sound: false, soundStyle: 'real-4' },
    stats: {
      total: 60,
      onModel: 20,
      onEffort: 40,
      bestCombo: 5,
      byDay: { '2026-10-15': 3, '2026-10-16': 9, '2026-10-17': 9, '2026-10-18': 1, '2026-10-19': 20, '2026-10-20': 8, '2026-10-22': 10 },
    },
    session: { alive: true, model: 'claude-opus-5-5', effort: 'high', boost: 'max' },
    desktop: { alive: true, whipMode: true, hotkey: 'ocupado' },
  }

  it('arma el estado del panel con hoy en dia local y el top 5', () => {
    // 2026-10-23 03:00 UTC sigue siendo 22 en Bogota.
    const view = buildViewState(snapshot, { ...DEFAULT_SETTINGS, volume: 0.3 }, Date.UTC(2026, 9, 23, 3), 300)
    assert.equal(view.today, 10)
    assert.deepEqual(view.topDays, [
      ['2026-10-19', 20],
      ['2026-10-22', 10],
      ['2026-10-17', 9],
      ['2026-10-16', 9],
      ['2026-10-20', 8],
    ])
    assert.equal(view.enabled, true)
    assert.equal(view.sound, false)
    assert.equal(view.soundStyle, 'real-4')
    assert.equal(view.volume, 0.3)
    assert.equal(view.reducedMotion, 'auto')
    assert.deepEqual(view.session, snapshot.session)
  })

  it('trae la app de escritorio; sin decir nada, se asume que no existe para el sistema', () => {
    const view = buildViewState(snapshot, DEFAULT_SETTINGS, Date.UTC(2026, 9, 22, 12), 300)
    assert.deepEqual(view.desktop, { supported: false, alive: true, whipMode: true, hotkey: 'ocupado', appMissing: false })
    const mac = buildViewState(snapshot, DEFAULT_SETTINGS, Date.UTC(2026, 9, 22, 12), 300, { supported: true, appMissing: false })
    assert.equal(mac.desktop.supported, true)
  })

  it('«no instalada» solo se muestra mientras la app siga cerrada', () => {
    const missing = { supported: true, appMissing: true }
    assert.equal(buildViewState(snapshot, DEFAULT_SETTINGS, 0, 0, missing).desktop.appMissing, false)
    const closed: BridgeSnapshot = { ...snapshot, desktop: { alive: false, whipMode: false, hotkey: 'ok' } }
    assert.equal(buildViewState(closed, DEFAULT_SETTINGS, 0, 0, missing).desktop.appMissing, true)
  })

  it('un dia sin latigazos da cero', () => {
    const view = buildViewState(snapshot, DEFAULT_SETTINGS, Date.UTC(2026, 11, 1, 12), 300)
    assert.equal(view.today, 0)
  })
})
