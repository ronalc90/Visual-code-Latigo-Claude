import * as assert from 'node:assert/strict'

import { contentSecurityPolicy, createNonce, renderPanelHtml } from '../../src/panel/html'

describe('HTML del panel', () => {
  const html = renderPanelHtml({
    cspSource: 'vscode-resource:',
    nonce: 'abc123',
    scriptUri: 'vscode-resource:/dist/webview.js',
    styleUri: 'vscode-resource:/dist/webview.css',
    crackSoundUri: 'vscode-resource:/media/latigo.wav',
    levelSoundUri: 'vscode-resource:/media/nivel.wav',
  })

  it('tiene una CSP estricta: nada remoto, scripts solo con nonce', () => {
    const csp = contentSecurityPolicy('vscode-resource:', 'abc123')
    assert.match(csp, /default-src 'none'/)
    assert.match(csp, /script-src 'nonce-abc123'/)
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:/)
    assert.ok(html.includes(`content="${csp}"`))
  })

  it('todos los scripts llevan el nonce y no hay scripts en linea', () => {
    const scripts = html.match(/<script[^>]*>/g) ?? []
    assert.equal(scripts.length, 1)
    assert.ok(scripts.every(tag => tag.includes('nonce="abc123"') && tag.includes('src=')))
    assert.doesNotMatch(html, /\sstyle="/)
    assert.doesNotMatch(html, /\son[a-z]+="/)
  })

  it('no carga nada de internet', () => {
    assert.doesNotMatch(html, /(src|href)="https?:/)
  })

  it('trae los textos clave en espanol con tildes', () => {
    for (const text of ['Látigo encendido', 'Sonido', 'Top global', 'Próximamente', 'Ranking con apodo entre todos los que usan el látigo. Llega en una próxima versión.', 'Abre Claude Code para que el effort suba', 'Tus mejores días', 'El látigo está guardado']) {
      assert.ok(html.includes(text), `falta «${text}»`)
    }
  })

  it('el top global esta deshabilitado y con filas de relleno', () => {
    assert.match(html, /class="card global-card is-disabled" aria-disabled="true"/)
    assert.equal((html.match(/class="skeleton-row"/g) ?? []).length, 5)
  })

  it('escapa las URIs en los atributos', () => {
    const tricky = renderPanelHtml({ cspSource: 'x', nonce: 'n', scriptUri: '"><img>', styleUri: 's', crackSoundUri: 'c', levelSoundUri: 'l' })
    assert.ok(tricky.includes('src="&quot;&gt;&lt;img&gt;"'))
  })

  it('el nonce cambia y es alfanumerico de 32', () => {
    const a = createNonce()
    const b = createNonce()
    assert.match(a, /^[A-Za-z0-9]{32}$/)
    assert.notEqual(a, b)
  })
})
