import * as assert from 'node:assert/strict'

import type { SettingsSource } from '../../src/settings'
import { DEFAULT_SETTINGS, readSettings } from '../../src/settings'

function source(values: Record<string, unknown>): SettingsSource {
  return { get: <T>(key: string) => values[key] as T | undefined }
}

describe('readSettings', () => {
  it('sin nada configurado usa los valores por defecto', () => {
    assert.deepEqual(readSettings(source({})), DEFAULT_SETTINGS)
  })

  it('lee los valores validos', () => {
    assert.deepEqual(readSettings(source({ showStatusBar: false, reducedMotion: 'on', volume: 0.25 })), {
      showStatusBar: false,
      reducedMotion: 'on',
      volume: 0.25,
    })
  })

  it('acota el volumen entre 0 y 1 y descarta valores raros', () => {
    assert.equal(readSettings(source({ volume: 4 })).volume, 1)
    assert.equal(readSettings(source({ volume: -1 })).volume, 0)
    assert.equal(readSettings(source({ volume: Number.NaN })).volume, DEFAULT_SETTINGS.volume)
    assert.equal(readSettings(source({ volume: '0.5' })).volume, DEFAULT_SETTINGS.volume)
  })

  it('un reducedMotion desconocido vuelve a auto', () => {
    assert.equal(readSettings(source({ reducedMotion: 'mucho' })).reducedMotion, 'auto')
    assert.equal(readSettings(source({ showStatusBar: 'si' })).showStatusBar, true)
  })
})
