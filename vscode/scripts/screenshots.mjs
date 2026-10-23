// Capturas reales del panel para el README del Marketplace.
//
// Arma un HTML con el mismo markup del panel (src/panel/html.ts) y el mismo
// bundle del webview (dist/webview.js), simula `acquireVsCodeApi` y los
// colores del tema oscuro de VS Code, congela la animacion en un cuadro exacto
// (modo ?demo= con semilla fija) y le saca la foto con Chrome sin ventana.
//
// Uso: npm run screenshots   (CHROME_PATH cambia el ejecutable de Chrome)

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildSync } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const work = join(root, 'out', 'screenshots')
const target = join(root, 'images', 'screenshots')
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

if (!existsSync(join(root, 'dist', 'webview.js'))) {
  console.error('Falta dist/webview.js: corre primero npm run build')
  process.exit(1)
}

rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })
mkdirSync(target, { recursive: true })

// El HTML real del panel, compilado al vuelo.
const htmlModule = join(work, 'html.cjs')
buildSync({ entryPoints: [join(root, 'src/panel/html.ts')], outfile: htmlModule, bundle: true, platform: 'node', format: 'cjs', logLevel: 'warning' })
const { renderPanelHtml } = createRequire(import.meta.url)(htmlModule)

// Colores del tema "Dark Modern" de VS Code para las variables que usa el panel.
writeFileSync(
  join(work, 'theme-dark.css'),
  `:root {
  --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --vscode-font-size: 13px;
  --vscode-editor-font-family: Menlo, Monaco, "Courier New", monospace;
  --vscode-foreground: #cccccc;
  --vscode-descriptionForeground: #9d9d9d;
  --vscode-panel-background: #181818;
  --vscode-editor-background: #1f1f1f;
  --vscode-editorWidget-background: #202020;
  --vscode-widget-border: #313131;
  --vscode-panel-border: #2b2b2b;
  --vscode-focusBorder: #0078d4;
  --vscode-textLink-foreground: #4daafc;
  --vscode-editorWarning-foreground: #cca700;
  --vscode-notifications-background: #1f1f1f;
  --vscode-notifications-foreground: #cccccc;
  --vscode-dropdown-background: #313131;
  --vscode-dropdown-border: #3c3c3c;
  --vscode-dropdown-foreground: #cccccc;
  --vscode-dropdown-listBackground: #1f1f1f;
}
`,
)

const NONCE = 'capturasDelLatigo0123456789abcde'

function day(offset) {
  const date = new Date(Date.UTC(2026, 9, 22 - offset))
  return date.toISOString().slice(0, 10)
}

/**
 * Conteos que cuadran: al effort + al modelo = total, hoy esta en byDay y la
 * suma de los dias no pasa del total.
 */
function stats(total, onEffort, bestCombo, today, pastDays) {
  const byDay = { [day(0)]: today }
  pastDays.forEach((count, index) => {
    byDay[day(index * 2 + 1)] = count
  })
  const counted = Object.values(byDay).reduce((sum, n) => sum + n, 0)
  if (counted > total) throw new Error(`los dias suman ${counted} y el total es ${total}`)
  return { total, onModel: total - onEffort, onEffort, bestCombo, byDay }
}

function topOf(s) {
  return Object.entries(s.byDay)
    .filter(([, n]) => n > 0)
    .sort(([a, x], [b, y]) => y - x || b.localeCompare(a))
    .slice(0, 5)
}

/** La app de escritorio en Mac, como la ve el panel. */
const desktopApp = (alive, whipMode, { appMissing = false, hotkey = 'ok' } = {}) => ({ supported: true, alive, whipMode, hotkey, appMissing })

function viewState({ enabled = true, sound = true, soundStyle = 'real', total, onEffort, bestCombo, days, today, session, desktop = desktopApp(true, true) }) {
  const s = stats(total, onEffort, bestCombo, today, days)
  return {
    enabled,
    sound,
    soundStyle,
    volume: 0.7,
    reducedMotion: 'off',
    stats: s,
    today,
    topDays: topOf(s),
    session,
    desktop,
  }
}

const opus = { alive: true, model: 'claude-opus-5-5', effort: 'high', boost: null }

const lash = (id, source, target, combo, comboTitle, total, levelUp = false) => ({
  type: 'lash',
  lash: { id, target, combo, comboTitle, total, levelUp, reachedSession: true, sound: false, source },
})

/**
 * Lo que la extension manda tras un latigazo: la animacion y el estado ya
 * contado (total, al effort o al modelo, hoy y mejor combo), como el host real.
 */
function lashed(base, id, source, target, combo, comboTitle, levelUp = false) {
  base.total += 1
  if (target === 'effort') base.onEffort += 1
  base.today += 1
  base.bestCombo = Math.max(base.bestCombo, combo)
  return [lash(id, source, target, combo, comboTitle, base.total, levelUp), { type: 'state', state: viewState({ ...base }) }]
}

const nivel5 = { total: 247, onEffort: 171, bestCombo: 6, days: [41, 37, 30, 22], today: 40, session: { ...opus, effort: 'medium', boost: 'high' } }
const nivel9 = { total: 1412, onEffort: 1003, bestCombo: 14, days: [133, 120, 96, 88], today: 93, session: { ...opus, effort: 'high', boost: 'xhigh' } }
const nivel9Abierta = { ...nivel9, days: [...nivel9.days] }
const nivel9Cerrada = { ...nivel9, days: [...nivel9.days], desktop: desktopApp(false, false) }
const nivel9Sonidos = { ...nivel9, days: [...nivel9.days], soundStyle: 'real-4' }
const nivel14 = { total: 6999, onEffort: 5120, bestCombo: 23, days: [402, 377, 351, 340], today: 350, session: { ...opus, effort: 'xhigh', boost: 'max' }, desktop: desktopApp(true, true) }

// Cada escena: estado, latigazos y cuanto avanzar el reloj despues de cada uno.
// Las angostas (340 px) son la barra lateral, donde vive el panel; el alto de
// cada una corta entre dos tarjetas, nunca a la mitad de una.
const scenes = [
  {
    file: 'barra-lateral.png',
    seed: 29,
    size: [340, 1327],
    state: viewState({ ...nivel9 }),
    steps: [
      { advance: 300 },
      { message: lashed(nivel9, 'b1', 'desktop', 'effort', 1, ''), advance: 300 },
      { message: lashed(nivel9, 'b2', 'desktop', 'effort', 2, '¡DOBLE!'), advance: 300 },
      { message: lashed(nivel9, 'b3', 'desktop', 'effort', 3, '¡TRIPLE!'), advance: 245 },
    ],
  },
  {
    file: 'app-abierta.png',
    seed: 13,
    size: [340, 721],
    state: viewState({ ...nivel9Abierta }),
    steps: [{ advance: 900 }],
  },
  {
    file: 'app-cerrada.png',
    seed: 17,
    size: [340, 798],
    state: viewState({ ...nivel9Cerrada }),
    steps: [{ advance: 700 }],
  },
  {
    file: 'sonidos.png',
    seed: 23,
    size: [340, 234],
    state: viewState({ ...nivel9Sonidos }),
    steps: [{ advance: 300 }],
  },
  {
    file: 'nivel-14-divino.png',
    seed: 41,
    size: [340, 721],
    state: viewState({ ...nivel14 }),
    steps: [{ advance: 1200 }, { message: lashed(nivel14, 'c1', 'desktop', 'effort', 1, '', true), advance: 330 }],
  },
  {
    file: 'apagado.png',
    seed: 1,
    size: [340, 430],
    state: viewState({ enabled: false, ...nivel9, days: [...nivel9.days], desktop: desktopApp(true, false) }),
    steps: [{ advance: 100 }],
  },
  {
    file: 'ancho-completo.png',
    seed: 11,
    size: [1280, 600],
    state: viewState({ ...nivel5 }),
    steps: [
      { advance: 400 },
      { message: lashed(nivel5, 'a1', 'terminal', 'effort', 1, ''), advance: 300 },
      { message: lashed(nivel5, 'a2', 'terminal', 'effort', 2, '¡DOBLE!'), advance: 245 },
    ],
  },
]

const MIN_WINDOW_WIDTH = 500

/** Recorta un PNG a `pixels` de ancho, centrado, que es donde va el marco (sips, de macOS). */
function cropWidth(file, pixels) {
  const height = Number(/pixelHeight: (\d+)/.exec(execFileSync('sips', ['-g', 'pixelHeight', file], { encoding: 'utf8' }))?.[1])
  execFileSync('sips', ['-c', String(height), String(pixels), file], { stdio: 'pipe' })
}

for (const scene of scenes) {
  const name = scene.file.replace(/\.png$/, '')
  const driver = [
    'window.__latigoDemo.receive(' + JSON.stringify({ type: 'state', state: scene.state }) + ');',
    ...scene.steps.map(step => {
      const messages = step.message === undefined ? [] : Array.isArray(step.message) ? step.message : [step.message]
      return messages.map(message => `window.__latigoDemo.receive(${JSON.stringify(message)});`).join('') + `window.__latigoDemo.advance(${step.advance});`
    }),
  ].join('\n')
  writeFileSync(join(work, `${name}.driver.js`), driver)
  writeFileSync(join(work, 'mock.js'), 'window.acquireVsCodeApi = () => ({ postMessage() {} });\n')

  let html = renderPanelHtml({
    cspSource: 'file:',
    nonce: NONCE,
    scriptUri: '../../dist/webview.js',
    styleUri: '../../dist/webview.css',
    // En las capturas no suena nada.
    soundUris: {},
  })
  html = html
    .replace('<link rel="stylesheet"', '<link rel="stylesheet" href="theme-dark.css">\n<link rel="stylesheet"')
    .replace('<body ', '<body class="vscode-dark" ')
    .replace(`<script nonce="${NONCE}" src=`, `<script nonce="${NONCE}" src="mock.js"></script>\n<script nonce="${NONCE}" src=`)
    .replace('</body>', `<script nonce="${NONCE}" src="${name}.driver.js"></script>\n</body>`)
  const page = join(work, `${name}.html`)
  writeFileSync(page, html)

  const out = join(target, scene.file)
  let url = `${pathToFileURL(page).href}?demo=1&seed=${scene.seed}`
  // Chrome sin interfaz no baja de 500 px de ancho: una escena mas angosta (la
  // barra lateral) se arma dentro de un marco de su ancho real y luego se recorta.
  const [width, height] = scene.size
  const narrow = width < MIN_WINDOW_WIDTH
  if (narrow) {
    const frame = join(work, `${name}.frame.html`)
    writeFileSync(
      frame,
      `<!doctype html><html><body style="margin:0;background:#181818;display:flex;justify-content:center"><iframe src="${pathToFileURL(page).href}?demo=1&seed=${scene.seed}" style="display:block;border:0;width:${width}px;height:${height}px"></iframe></body></html>`,
    )
    url = pathToFileURL(frame).href
  }
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      '--force-device-scale-factor=2',
      '--force-prefers-reduced-motion=0',
      `--window-size=${Math.max(width, MIN_WINDOW_WIDTH)},${height}`,
      `--screenshot=${out}`,
      '--virtual-time-budget=2000',
      url,
    ],
    { stdio: 'pipe' },
  )
  if (narrow) cropWidth(out, width * 2)
  console.log(`listo ${out}`)
}
