import * as assert from 'node:assert/strict'

import { SOUND_STYLES } from '../../../hooks/sounds'
import { contentSecurityPolicy, createNonce, renderPanelHtml } from '../../src/panel/html'
import { soundAssetPaths } from '../../src/soundAssets'

const SOUND_URIS = Object.fromEntries(soundAssetPaths().map(path => [path, `vscode-resource:/media/${path}`]))

function render(soundUris: Record<string, string> = SOUND_URIS): string {
  return renderPanelHtml({
    cspSource: 'vscode-resource:',
    nonce: 'abc123',
    scriptUri: 'vscode-resource:/dist/webview.js',
    styleUri: 'vscode-resource:/dist/webview.css',
    soundUris,
  })
}

/** Lo que el webview lee de `data-sounds`, como lo devuelve el navegador (sin las entidades). */
function dataSounds(html: string): Record<string, string> {
  const raw = /<body data-sounds="([^"]*)">/.exec(html)?.[1]
  assert.ok(raw !== undefined, 'falta data-sounds en el body')
  const text = raw.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  return JSON.parse(text) as Record<string, string>
}

describe('HTML del panel', () => {
  const html = render()

  it('tiene una CSP estricta: nada remoto, scripts solo con nonce', () => {
    const csp = contentSecurityPolicy('vscode-resource:', 'abc123')
    assert.match(csp, /default-src 'none'/)
    assert.match(csp, /script-src 'nonce-abc123'/)
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:/)
    assert.ok(html.includes(`content="${csp}"`))
  })

  it('la CSP deja sonar los archivos de media/ (media-src del webview) y nada mas', () => {
    const csp = contentSecurityPolicy('vscode-resource:', 'abc123')
    assert.match(csp, /(^|; )media-src vscode-resource:(;|$)/)
    for (const uri of Object.values(dataSounds(html))) assert.ok(uri.startsWith('vscode-resource:'), uri)
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

  it('le pasa al webview la URI de cada sonido: los 12 latigazos y el de subir de nivel', () => {
    const sounds = dataSounds(html)
    assert.deepEqual(Object.keys(sounds).sort(), soundAssetPaths().sort())
    assert.equal(Object.keys(sounds).length, 13)
    assert.equal(sounds['sonidos/real-5.wav'], 'vscode-resource:/media/sonidos/real-5.wav')
    assert.equal(sounds['nivel.wav'], 'vscode-resource:/media/nivel.wav')
    assert.doesNotMatch(html, /latigo\.wav/)
  })

  it('un solo interruptor, primero, con su atajo y la linea que explica que hace', () => {
    const switches = html.match(/role="switch"/g) ?? []
    // El del latigo y el del sonido; ningun boton de "modo latigo" aparte.
    assert.equal(switches.length, 2)
    assert.ok(html.indexOf('id="enabled-switch"') < html.indexOf('id="sound-switch"'))
    assert.ok(html.indexOf('id="enabled-switch"') < html.indexOf('id="desktop-card"'))
    assert.ok(html.indexOf('id="enabled-switch"') < html.indexOf('id="on-view"'))
    assert.match(html, /<kbd id="toggle-key">Shift\+Alt\+L<\/kbd>/)
    assert.match(html, /aria-describedby="power-hint"/)
    assert.match(html, /<p class="power-hint" id="power-hint"/)
    assert.doesNotMatch(html, /whip-toggle|whip-card|Modo látigo|modo látigo|Activar modo/)
  })

  it('la fila del sonido: interruptor, desplegable con los 9 estilos y su descripcion, y Probar', () => {
    const options = [...html.matchAll(/<option value="([^"]+)" title="([^"]+)"( selected)?>([^<]+)<\/option>/g)]
    assert.deepEqual(
      options.map(match => [match[1], match[2], match[4]]),
      SOUND_STYLES.map(style => [style.id, style.description, style.label]),
    )
    assert.deepEqual(options.filter(match => match[3] !== undefined).map(match => match[1]), ['real'])
    assert.match(html, /<select class="sound-style" id="sound-style" aria-label="Sonido del latigazo" aria-describedby="sound-about">/)
    assert.match(html, /<button type="button" class="button sound-test" id="sound-test"[^>]*>Probar<\/button>/)
    assert.match(html, /<p class="sound-about" id="sound-about">Cada latigazo usa una de las 6 grabaciones reales\.<\/p>/)
  })

  it('la tarjeta de la app de escritorio arranca oculta, con sus botones', () => {
    assert.match(html, /<section class="card desktop-card" id="desktop-card" aria-labelledby="desktop-title" hidden>/)
    for (const id of ['desktop-dot', 'desktop-status', 'desktop-hint', 'desktop-warning', 'open-app', 'install-guide', 'open-app-retry']) {
      assert.ok(html.includes(`id="${id}"`), `falta #${id}`)
    }
  })

  it('trae los textos clave en espanol con tildes', () => {
    for (const text of [
      'Látigo prendido',
      'Atajo',
      'Sonido',
      'Probar',
      'App de escritorio',
      'Abrir la app',
      'Cómo instalarla',
      'Reintentar',
      'Sesión de Claude Code',
      'Latigazo al effort',
      'Al modelo',
      'Top global',
      'Próximamente',
      'Ranking con apodo entre todos los que usan el látigo. Llega en una próxima versión.',
      'Abre Claude Code para que el effort suba',
      'Tus mejores días',
      'El látigo está guardado',
      'Tus latigazos y tu nivel siguen guardados. Préndelo con el interruptor de arriba.',
    ]) {
      assert.ok(html.includes(text), `falta «${text}»`)
    }
  })

  it('ya no trae el escenario grande ni los blancos, sino la vista previa compacta', () => {
    assert.doesNotMatch(html, /id="stage"|class="target/)
    assert.match(html, /<div class="preview" id="preview">\s*<canvas id="whip-canvas"/)
  })

  it('el top global esta deshabilitado y con filas de relleno', () => {
    assert.match(html, /class="card global-card is-disabled" aria-disabled="true"/)
    assert.equal((html.match(/class="skeleton-row"/g) ?? []).length, 5)
  })

  it('escapa las URIs en los atributos, tambien las de los sonidos', () => {
    const tricky = renderPanelHtml({ cspSource: 'x', nonce: 'n', scriptUri: '"><img>', styleUri: 's', soundUris: { 'nivel.wav': '"><script>' } })
    assert.ok(tricky.includes('src="&quot;&gt;&lt;img&gt;"'))
    assert.doesNotMatch(tricky, /<script>/)
    assert.deepEqual(dataSounds(tricky), { 'nivel.wav': '"><script>' })
  })

  it('sin sonidos (las capturas) el panel igual se arma', () => {
    assert.deepEqual(dataSounds(render({})), {})
  })

  it('el nonce cambia y es alfanumerico de 32', () => {
    const a = createNonce()
    const b = createNonce()
    assert.match(a, /^[A-Za-z0-9]{32}$/)
    assert.notEqual(a, b)
  })
})
