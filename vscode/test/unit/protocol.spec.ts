import * as assert from 'node:assert/strict'

import { parseWebviewMessage } from '../../src/protocol'

describe('parseWebviewMessage', () => {
  it('acepta los mensajes conocidos y bien formados', () => {
    assert.deepEqual(parseWebviewMessage({ type: 'ready' }), { type: 'ready' })
    assert.deepEqual(parseWebviewMessage({ type: 'lash', target: 'effort' }), { type: 'lash', target: 'effort' })
    assert.deepEqual(parseWebviewMessage({ type: 'lash', target: 'model' }), { type: 'lash', target: 'model' })
    assert.deepEqual(parseWebviewMessage({ type: 'setEnabled', enabled: false }), { type: 'setEnabled', enabled: false })
    assert.deepEqual(parseWebviewMessage({ type: 'setSound', sound: true }), { type: 'setSound', sound: true })
    assert.deepEqual(parseWebviewMessage({ type: 'installPlugin' }), { type: 'installPlugin' })
    assert.deepEqual(parseWebviewMessage({ type: 'toggleWhipMode' }), { type: 'toggleWhipMode' })
    assert.deepEqual(parseWebviewMessage({ type: 'openDesktopApp' }), { type: 'openDesktopApp' })
    assert.deepEqual(parseWebviewMessage({ type: 'openInstallGuide' }), { type: 'openInstallGuide' })
  })

  const rejected: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['un texto', 'lash'],
    ['un numero', 7],
    ['un arreglo', [{ type: 'ready' }]],
    ['sin type', { target: 'effort' }],
    ['type no texto', { type: 3 }],
    ['tipo desconocido', { type: 'deleteEverything' }],
    ['tipo con mayusculas', { type: 'Lash', target: 'effort' }],
    ['lash sin target', { type: 'lash' }],
    ['lash a otro objetivo', { type: 'lash', target: 'handle' }],
    ['lash con campos de mas', { type: 'lash', target: 'effort', total: 9999 }],
    ['setEnabled con texto', { type: 'setEnabled', enabled: 'true' }],
    ['setEnabled sin valor', { type: 'setEnabled' }],
    ['setSound con numero', { type: 'setSound', sound: 1 }],
    ['ready con carga', { type: 'ready', path: '/etc/passwd' }],
    ['installPlugin con comando', { type: 'installPlugin', command: 'rm -rf /' }],
    ['toggleWhipMode con estado', { type: 'toggleWhipMode', active: true }],
    ['openDesktopApp con otra app', { type: 'openDesktopApp', app: 'Terminal' }],
    ['openInstallGuide con url', { type: 'openInstallGuide', url: 'https://example.com' }],
    ['toggleWhipMode con mayusculas', { type: 'ToggleWhipMode' }],
    ['prototipo envenenado', JSON.parse('{"type":"ready","__proto__":{"x":1}}') as unknown],
  ]

  for (const [name, value] of rejected) {
    it(`rechaza ${name}`, () => {
      assert.equal(parseWebviewMessage(value), null)
    })
  }

  it('devuelve un objeto nuevo, sin los campos originales', () => {
    const raw = { type: 'lash', target: 'effort' }
    const parsed = parseWebviewMessage(raw)
    assert.notEqual(parsed, raw)
  })
})
