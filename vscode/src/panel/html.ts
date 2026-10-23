// El HTML del panel. Funcion pura: la usan el proveedor del webview y el
// arnes de capturas de pantalla, asi las capturas muestran el panel real.

import { DEFAULT_SOUND_STYLE, SOUND_STYLES, soundStyle } from '../../../hooks/sounds'
import { TOGGLE_KEY_LABEL } from '../shortcuts'

export type PanelHtmlOptions = {
  /** `webview.cspSource`. */
  cspSource: string
  nonce: string
  scriptUri: string
  styleUri: string
  /** Cada sonido de media/ con su URI del webview, por su ruta (`sonidos/real-1.wav`, `nivel.wav`). */
  soundUris: Readonly<Record<string, string>>
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Los estilos de sonido del desplegable; la descripcion va de tooltip y debajo, a la vista. */
function soundOptions(): string {
  return SOUND_STYLES.map(
    style =>
      `<option value="${escapeAttribute(style.id)}" title="${escapeAttribute(style.description)}"${style.id === DEFAULT_SOUND_STYLE ? ' selected' : ''}>${escapeAttribute(style.label)}</option>`,
  ).join('')
}

/** Un nonce nuevo por cada render (32 caracteres alfanumericos). */
export function createNonce(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let nonce = ''
  for (let i = 0; i < 32; i++) nonce += alphabet[Math.floor(random() * alphabet.length)]
  return nonce
}

export function contentSecurityPolicy(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${cspSource} data:`,
    `style-src ${cspSource}`,
    `font-src ${cspSource}`,
    `media-src ${cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ')
}

const SKELETON_ROWS = [
  { rank: 1, name: 'w-60', score: 'w-40' },
  { rank: 2, name: 'w-75', score: 'w-35' },
  { rank: 3, name: 'w-50', score: 'w-30' },
  { rank: 4, name: 'w-65', score: 'w-25' },
  { rank: 5, name: 'w-45', score: 'w-20' },
]

function skeletonRows(): string {
  return SKELETON_ROWS.map(
    row => `<li class="skeleton-row"><span class="skeleton-rank">${row.rank}</span><span class="skeleton-bar ${row.name}"></span><span class="skeleton-bar skeleton-score ${row.score}"></span></li>`,
  ).join('')
}

export function renderPanelHtml(options: PanelHtmlOptions): string {
  const a = (value: string) => escapeAttribute(value)
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${a(contentSecurityPolicy(options.cspSource, options.nonce))}">
<link rel="stylesheet" href="${a(options.styleUri)}">
<title>Látigo</title>
</head>
<body data-sounds="${a(JSON.stringify(options.soundUris))}">
<div class="app is-loading" id="app">
  <div class="top">
    <section class="card power-card" id="power-card" aria-label="Interruptor del látigo">
      <div class="power-row">
        <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 20.8 7.4 16.6" stroke-width="2.6"/><path d="M7.4 16.6c2.6-2.6 2.4-6.8 6-8.6 3.2-1.6 6.6.2 7.4 2.8.6 2-1 3.6-2.8 3.2" stroke-width="1.6"/><path d="M18 14l1.6 1.4M18.4 13l2.2.2" stroke-width="1.2"/></svg></span>
        <label class="switch power-switch" for="enabled-switch">
          <span class="power-text">
            <span class="power-title" id="enabled-label">Látigo prendido</span>
            <span class="power-key">Atajo <kbd id="toggle-key">${a(TOGGLE_KEY_LABEL.other)}</kbd></span>
          </span>
          <input type="checkbox" id="enabled-switch" role="switch" checked aria-describedby="power-hint">
          <span class="track" aria-hidden="true"><span class="thumb"></span></span>
        </label>
      </div>
      <p class="power-hint" id="power-hint" aria-live="polite">Prendido: cada latigazo al effort lo sube un nivel en Claude Code.</p>
      <div class="sound-block" id="sound-block">
        <div class="sound-row">
          <label class="switch switch-small sound-switch" for="sound-switch">
            <input type="checkbox" id="sound-switch" role="switch" checked>
            <span class="track" aria-hidden="true"><span class="thumb"></span></span>
            <span class="switch-label">Sonido</span>
          </label>
          <select class="sound-style" id="sound-style" aria-label="Sonido del latigazo" aria-describedby="sound-about">${soundOptions()}</select>
          <button type="button" class="button sound-test" id="sound-test" title="Suena un latigazo con este sonido, aunque el sonido esté apagado">Probar</button>
        </div>
        <p class="sound-about" id="sound-about">${a(soundStyle(DEFAULT_SOUND_STYLE).description)}</p>
      </div>
    </section>

    <section class="card desktop-card" id="desktop-card" aria-labelledby="desktop-title" hidden>
      <h2 class="card-title" id="desktop-title">App de escritorio</h2>
      <p class="desktop-status" role="status"><span class="dot" id="desktop-dot" aria-hidden="true"></span><span id="desktop-status">Cerrada</span></p>
      <p class="desktop-hint" id="desktop-hint"></p>
      <p class="desktop-warning" id="desktop-warning" hidden></p>
      <div class="button-row desktop-actions" id="desktop-open" hidden>
        <button type="button" class="button button-primary" id="open-app">Abrir la app</button>
      </div>
      <div class="button-row desktop-actions" id="desktop-install" hidden>
        <button type="button" class="button button-primary" id="install-guide">Cómo instalarla</button>
        <button type="button" class="button" id="open-app-retry">Reintentar</button>
      </div>
    </section>
  </div>

  <section class="off-card card" id="off-card" hidden>
    <div class="off-coil" aria-hidden="true"><svg viewBox="0 0 110 112" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M53.5 63.9 L53.5 64.2 L53.5 64.6 L53.4 64.9 L53.4 65.3 L53.2 65.6 L53.1 66.0 L52.9 66.3 L52.7 66.6 L52.4 67.0 L52.2 67.3 L51.9 67.6 L51.5 67.8 L51.1 68.1 L50.8 68.3 L50.3 68.5 L49.9 68.7 L49.4 68.9 L48.9 69.0 L48.4 69.1 L47.9 69.1 L47.3 69.1 L46.8 69.0 L46.2 69.0 L45.7 68.8 L45.1 68.7 L44.6 68.4 L44.0 68.2 L43.5 67.9 L43.0 67.5 L42.5 67.1 L42.0 66.7 L41.6 66.2 L41.1 65.7 L40.7 65.1 L40.4 64.6 L40.1 63.9 L39.8 63.3 L39.5 62.6 L39.4 61.9 L39.2 61.1 L39.1 60.4 L39.1 59.6 L39.1 58.8 L39.2 58.0 L39.4 57.2 L39.6 56.4 L39.8 55.7 L40.1 54.9 L40.5 54.1 L40.9 53.4 L41.4 52.6 L42.0 52.0 L42.6 51.3 L43.3 50.7 L44.0 50.1 L44.7 49.5 L45.5 49.1 L46.4 48.6 L47.3 48.2 L48.2 47.9 L49.1 47.6 L50.1 47.4 L51.1 47.3 L52.1 47.3 L53.2 47.3 L54.2 47.4 L55.3 47.5 L56.3 47.8 L57.3 48.1 L58.3 48.5 L59.3 48.9 L60.3 49.4 L61.3 50.1 L62.2 50.7 L63.1 51.5 L63.9 52.3 L64.7 53.2 L65.4 54.1 L66.0 55.1 L66.6 56.2 L67.1 57.3 L67.6 58.4 L68.0 59.6 L68.3 60.8 L68.5 62.0 L68.6 63.3 L68.6 64.6 L68.6 65.9 L68.4 67.2 L68.2 68.5 L67.9 69.8 L67.4 71.1 L66.9 72.3 L66.3 73.5 L65.6 74.7 L64.9 75.9 L64.0 77.0 L63.1 78.0 L62.0 79.0 L60.9 79.9 L59.8 80.8 L58.5 81.6 L57.2 82.3 L55.9 82.9 L54.5 83.4 L53.0 83.8 L51.6 84.2 L50.1 84.4 L48.5 84.5 L47.0 84.5 L45.4 84.4 L43.9 84.2 L42.3 83.9 L40.8 83.5 L39.2 83.0 L37.8 82.3 L36.3 81.6 L34.9 80.8 L33.5 79.8 L32.2 78.8 L31.0 77.6 L29.9 76.4 L28.8 75.1 L27.8 73.7 L26.9 72.2 L26.1 70.7 L25.4 69.1 L24.8 67.4 L24.3 65.7 L24.0 64.0 L23.7 62.2 L23.6 60.4 L23.6 58.6 L23.7 56.8 L24.0 55.0 L24.3 53.1 L24.8 51.4 L25.5 49.6 L26.2 47.9 L27.1 46.2 L28.1 44.6 L29.2 43.0 L30.4 41.5 L31.8 40.1 L33.2 38.8 L34.7 37.5 L36.4 36.4 L38.1 35.4 L39.8 34.5 L41.7 33.7 L43.6 33.0 L45.6 32.5 L47.6 32.1 L49.6 31.8 L51.7 31.7 L53.7 31.7 L55.8 31.8 L57.9 32.1 L60.0 32.6 L62.0 33.2 L64.0 33.9 L66.0 34.8 L67.9 35.8 L69.8 36.9 L71.5 38.2 L73.2 39.6 L74.8 41.1 L76.3 42.8 L77.7 44.5 L79.0 46.4 L80.1 48.3 L81.2 50.3 L82.0 52.4 L82.8 54.6 L83.4 56.8 L83.8 59.1 L84.1 61.4 L84.2 63.7 L84.2 66.0 L84.0 68.4 L83.7 70.7 L83.2 73.1 L82.5 75.4 L81.7 77.6 L80.7 79.8 L79.5 82.0 L78.2 84.0 L76.8 86.0 L75.2 87.9 L73.5 89.7 L71.7 91.4 L69.7 92.9 L67.7 94.3 L65.5 95.6 L63.2 96.7 L60.9 97.7 L58.5 98.6 L56.0 99.2 L53.5 99.7 L50.9 100.0 L48.3 100.2 L45.7 100.1 L43.1 99.9 L40.5 99.5 L37.9 99.0 L35.3 98.2 L32.8 97.3 L30.4 96.2 L28.0 94.9 L25.7 93.5 L23.5 91.9 L21.4 90.1 L19.5 88.2 L17.6 86.2 L15.9 84.0 L14.3 81.7 L12.9 79.3 L11.7 76.8 L10.6 74.2 L9.7 71.6 L9.0 68.8 L8.4 66.0 L8.1 63.2 L7.9 60.3 L8.0 57.5 L8.2 54.6 L8.6 51.7 L9.3 48.9 L10.1 46.1 L11.1 43.3 L12.3 40.6 L13.7 38.0 L15.3 35.5 L17.1 33.1 L19.0 30.8 L21.1 28.6 L23.3 26.6 L25.7 24.7 L28.2 23.0 L30.8 21.5" stroke-width="3"/><path d="M34.2 19.4 L53.2 8.3" stroke-width="8"/></svg></div>
    <div class="off-text">
      <h2>El látigo está guardado</h2>
      <p>Tus latigazos y tu nivel siguen guardados. Préndelo con el interruptor de arriba.</p>
    </div>
  </section>

  <main class="layout" id="on-view">
    <section class="card session-card" aria-labelledby="session-title">
      <div class="card-head">
        <h2 class="card-title" id="session-title">Sesión de Claude Code</h2>
        <span class="pill" id="session-pill">Sin sesión</span>
      </div>
      <dl class="session-facts">
        <div><dt>Modelo</dt><dd id="model-name">—</dd></div>
        <div><dt>Effort</dt><dd class="effort-value" id="effort-value">sin sesión</dd></div>
      </dl>
      <div class="session-hint" id="session-hint" hidden>
        <span>Abre Claude Code para que el effort suba.</span>
        <button type="button" class="link-button" id="install-plugin">¿No tienes el plugin?</button>
      </div>
      <div class="button-row session-actions">
        <button type="button" class="button" id="lash-effort" title="Latigazo al effort: lo sube un nivel en la sesión abierta">Latigazo al effort</button>
        <button type="button" class="button" id="lash-model" title="Latigazo al modelo: solo para desahogarse, no cambia nada">Al modelo</button>
      </div>
      <p class="session-note" id="session-note" role="status"></p>
    </section>

    <section class="card level-card" aria-labelledby="tier-name">
      <div class="preview" id="preview">
        <canvas id="whip-canvas" aria-hidden="true"></canvas>
        <div class="combo" id="combo" aria-live="polite"></div>
        <div class="banner" id="banner" aria-live="polite"></div>
        <span class="source-chip" id="source-chip"></span>
      </div>
      <div class="level-head">
        <span class="level-badge" id="level-badge">1</span>
        <div class="level-text">
          <p class="eyebrow" id="level-number">Nivel 1 de 14</p>
          <h2 class="tier-name" id="tier-name">Cuero crudo</h2>
        </div>
      </div>
      <div class="progress" role="progressbar" aria-label="Progreso al siguiente nivel" aria-valuemin="0" aria-valuemax="100" id="level-progress">
        <span class="progress-fill" id="progress-fill"></span>
      </div>
      <p class="level-remaining" id="level-remaining">faltan 25 latigazos para Cuero curtido</p>
    </section>

    <section class="card stats-card" aria-label="Estadísticas">
      <h2 class="card-title">Tus latigazos</h2>
      <dl class="stats-grid">
        <div class="stat-total"><dt>Total</dt><dd id="stat-total">0</dd></div>
        <div><dt>Hoy</dt><dd id="stat-today">0</dd></div>
        <div><dt>Mejor combo</dt><dd id="stat-combo">—</dd></div>
        <div><dt>Al effort</dt><dd id="stat-effort">0</dd></div>
        <div><dt>Al modelo</dt><dd id="stat-model">0</dd></div>
      </dl>
      <h3 class="subtitle-small">Tus mejores días</h3>
      <ol class="top-days" id="top-days"></ol>
    </section>

    <section class="card global-card is-disabled" aria-disabled="true" aria-label="Top global (próximamente)">
      <div class="card-head">
        <h2 class="card-title">Top global</h2>
        <span class="soon-badge">Próximamente</span>
      </div>
      <p class="global-text">Ranking con apodo entre todos los que usan el látigo. Llega en una próxima versión.</p>
      <ol class="skeleton" aria-hidden="true">${skeletonRows()}</ol>
    </section>
  </main>
</div>
<script nonce="${a(options.nonce)}" src="${a(options.scriptUri)}"></script>
</body>
</html>
`
}
