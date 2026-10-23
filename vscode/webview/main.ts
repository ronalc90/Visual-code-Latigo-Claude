// El panel del latigo en la barra lateral: estadisticas y controles. Pinta el
// estado que manda la extension, anima en la vista previa los latigazos que
// llegan (de VS Code, de la terminal o del latigo en pantalla) y le avisa a la
// extension de los clics. No toca disco ni red.

import './style.css'

import { MAX_LEVEL, lookFor, progressFor, seededRandom } from '../../hooks/levels'
import type { Target } from '../../hooks/model'
import { effectiveEffort, isForcing } from '../../hooks/model'
import { formatCount, formatDay, plural } from '../src/format'
import type { HostMessage, LashAnimation, ViewState, WebviewMessage } from '../src/protocol'
import { SoundPlayer } from './sound'
import { CRACK_AT, CRACK_DURATION, WhipPreview } from './whipPreview'

type VsCodeApi = { postMessage(message: WebviewMessage): void }

declare function acquireVsCodeApi(): VsCodeApi

declare global {
  interface Window {
    __latigoDemo?: {
      receive(message: HostMessage): void
      advance(ms: number): void
    }
  }
}

const params = new URLSearchParams(location.search)
const demo = params.has('demo')
const vscode = acquireVsCodeApi()

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`Falta #${id} en el panel`)
  return element as T
}

const ui = {
  app: byId<HTMLDivElement>('app'),
  offCard: byId<HTMLElement>('off-card'),
  onView: byId<HTMLElement>('on-view'),
  enabledSwitch: byId<HTMLInputElement>('enabled-switch'),
  enabledLabel: byId<HTMLSpanElement>('enabled-label'),
  soundSwitch: byId<HTMLInputElement>('sound-switch'),
  toggleKey: byId<HTMLElement>('toggle-key'),
  whipCard: byId<HTMLElement>('whip-card'),
  whipPill: byId<HTMLElement>('whip-pill'),
  whipReady: byId<HTMLElement>('whip-ready'),
  whipToggle: byId<HTMLButtonElement>('whip-toggle'),
  whipToggleLabel: byId<HTMLElement>('whip-toggle-label'),
  whipClosed: byId<HTMLElement>('whip-closed'),
  whipMissing: byId<HTMLElement>('whip-missing'),
  whipUnsupported: byId<HTMLElement>('whip-unsupported'),
  whipExplain: byId<HTMLElement>('whip-explain'),
  openApp: byId<HTMLButtonElement>('open-app'),
  openAppRetry: byId<HTMLButtonElement>('open-app-retry'),
  installGuide: byId<HTMLButtonElement>('install-guide'),
  sessionPill: byId<HTMLElement>('session-pill'),
  modelName: byId<HTMLElement>('model-name'),
  effortValue: byId<HTMLElement>('effort-value'),
  sessionHint: byId<HTMLElement>('session-hint'),
  installPlugin: byId<HTMLButtonElement>('install-plugin'),
  lashEffort: byId<HTMLButtonElement>('lash-effort'),
  lashModel: byId<HTMLButtonElement>('lash-model'),
  sessionNote: byId<HTMLElement>('session-note'),
  preview: byId<HTMLElement>('preview'),
  canvas: byId<HTMLCanvasElement>('whip-canvas'),
  combo: byId<HTMLElement>('combo'),
  banner: byId<HTMLElement>('banner'),
  sourceChip: byId<HTMLElement>('source-chip'),
  levelBadge: byId<HTMLElement>('level-badge'),
  levelNumber: byId<HTMLElement>('level-number'),
  tierName: byId<HTMLElement>('tier-name'),
  levelProgress: byId<HTMLElement>('level-progress'),
  progressFill: byId<HTMLElement>('progress-fill'),
  levelRemaining: byId<HTMLElement>('level-remaining'),
  statTotal: byId<HTMLElement>('stat-total'),
  statToday: byId<HTMLElement>('stat-today'),
  statEffort: byId<HTMLElement>('stat-effort'),
  statModel: byId<HTMLElement>('stat-model'),
  statCombo: byId<HTMLElement>('stat-combo'),
  topDays: byId<HTMLOListElement>('top-days'),
}

const random = demo ? seededRandom(Number(params.get('seed') ?? 7)) : seededRandom(Date.now() >>> 0)
const scene = new WhipPreview(random)
const sounds = demo
  ? new SoundPlayer({ crack: undefined, level: undefined })
  : new SoundPlayer({ crack: document.body.dataset.crackSound, level: document.body.dataset.levelSound })
const context = ui.canvas.getContext('2d')

let state: ViewState | null = null
/** Total que se esta mostrando (sube con cada latigazo antes de que llegue el estado). */
let shownTotal = 0

// --- Linea de tiempo de efectos de la interfaz (sirve igual en modo demo) ---

type Scheduled = { remaining: number; run: () => void }
const timeline: Scheduled[] = []

function later(ms: number, run: () => void): void {
  timeline.push({ remaining: ms, run })
}

function tickTimeline(ms: number): void {
  for (const item of [...timeline]) {
    item.remaining -= ms
    if (item.remaining <= 0) {
      timeline.splice(timeline.indexOf(item), 1)
      item.run()
    }
  }
}

// --- Movimiento reducido ---

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

function isReduced(): boolean {
  if (state?.reducedMotion === 'on') return true
  if (state?.reducedMotion === 'off') return false
  return motionQuery.matches
}

// --- Geometria del canvas ---

function layoutCanvas(): void {
  const rect = ui.canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  ui.canvas.width = Math.max(1, Math.round(rect.width * ratio))
  ui.canvas.height = Math.max(1, Math.round(rect.height * ratio))
  scene.resize(rect.width, rect.height)
}

function draw(): void {
  if (context === null) return
  const ratio = ui.canvas.width / Math.max(1, ui.canvas.getBoundingClientRect().width)
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  scene.render(context)
}

// --- Pintar el estado ---

function shortModel(name: string): string {
  return name.replace(/^claude-/, '').replace(/\[.*\]$/, '')
}

function toggleKeyLabel(): string {
  const platform = navigator.platform.toLowerCase()
  return platform.includes('mac') ? 'Shift+Option+L' : 'Shift+Alt+L'
}

type PillTone = 'live' | 'hot' | 'idle' | 'warn'

function setPill(pill: HTMLElement, text: string, tone: PillTone): void {
  pill.textContent = text
  pill.className = `pill pill-${tone}`
}

function applyLook(total: number): void {
  const look = lookFor(total)
  const { tier, next, progress, remaining } = progressFor(total)
  const style = ui.app.style
  style.setProperty('--whip-lash', look.lash)
  style.setProperty('--whip-glow', look.glow)
  style.setProperty('--whip-handle', look.handle)
  style.setProperty('--whip-glow-strength', String(0.15 + tier.level / MAX_LEVEL))
  ui.app.dataset.level = String(tier.level)
  ui.levelBadge.textContent = String(tier.level)
  ui.levelNumber.textContent = `Nivel ${tier.level} de ${MAX_LEVEL}`
  ui.tierName.textContent = tier.name
  const percent = Math.round(progress * 100)
  ui.progressFill.style.width = `${Math.max(2, percent)}%`
  ui.levelProgress.setAttribute('aria-valuenow', String(percent))
  ui.levelRemaining.textContent =
    next === null ? 'Nivel máximo: más dorado no se puede' : `faltan ${plural(remaining, 'latigazo', 'latigazos')} para ${next.name}`
  scene.setTotal(total)
}

function renderStats(view: ViewState): void {
  ui.statTotal.textContent = formatCount(Math.max(view.stats.total, shownTotal))
  ui.statToday.textContent = formatCount(view.today)
  ui.statEffort.textContent = formatCount(view.stats.onEffort)
  ui.statModel.textContent = formatCount(view.stats.onModel)
  ui.statCombo.textContent = view.stats.bestCombo >= 2 ? `x${view.stats.bestCombo}` : '—'
  ui.topDays.replaceChildren()
  if (view.topDays.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'top-empty'
    empty.textContent = 'Todavía no hay días. ¡Dale el primero!'
    ui.topDays.append(empty)
    return
  }
  const best = view.topDays[0]?.[1] ?? 1
  view.topDays.forEach(([day, count], index) => {
    const item = document.createElement('li')
    const rank = document.createElement('span')
    rank.className = 'top-rank'
    rank.textContent = String(index + 1)
    const label = document.createElement('span')
    label.className = 'top-day'
    label.textContent = formatDay(day)
    const bar = document.createElement('span')
    bar.className = 'top-bar'
    const fill = document.createElement('span')
    fill.className = 'top-bar-fill'
    fill.style.width = `${Math.max(6, Math.round((count / best) * 100))}%`
    bar.append(fill)
    const value = document.createElement('span')
    value.className = 'top-count'
    value.textContent = formatCount(count)
    item.append(rank, label, bar, value)
    ui.topDays.append(item)
  })
}

function renderSession(view: ViewState): void {
  const session = view.session
  ui.modelName.textContent = session.alive && session.model !== null ? shortModel(session.model) : '—'
  if (session.alive) {
    const effective = effectiveEffort(session.effort, session.boost)
    const forcing = isForcing(session.effort, session.boost)
    ui.effortValue.textContent = effective === null ? '—' : `${effective}${forcing ? ' ⚡' : ''}`
    ui.effortValue.title = forcing ? 'El látigo está subiendo el effort de la sesión' : ''
    ui.effortValue.classList.remove('is-offline')
    setPill(ui.sessionPill, 'En vivo', 'live')
    ui.sessionHint.hidden = true
  } else {
    ui.effortValue.textContent = 'sin sesión'
    ui.effortValue.title = ''
    ui.effortValue.classList.add('is-offline')
    setPill(ui.sessionPill, 'Sin sesión', 'idle')
    ui.sessionHint.hidden = false
  }
}

// --- Modo latigo en pantalla ---

/** Lo pedido con un boton que la app todavia no confirma: mientras tanto el boton espera. */
let pendingWhip: { active: boolean; timer: number } | null = null
let pendingOpen: { timer: number } | null = null

function clearPendingWhip(): void {
  if (pendingWhip !== null) window.clearTimeout(pendingWhip.timer)
  pendingWhip = null
}

function clearPendingOpen(): void {
  if (pendingOpen !== null) window.clearTimeout(pendingOpen.timer)
  pendingOpen = null
}

function whipButtonLabel(whipMode: boolean): string {
  if (pendingWhip !== null) return pendingWhip.active ? 'Activando…' : 'Apagando…'
  return whipMode ? 'Apagar modo látigo' : 'Activar modo látigo'
}

function whipExplanation(ready: boolean, whipMode: boolean): string {
  if (ready && whipMode) return 'Tu puntero es un látigo: cada clic sobre una conversación de Claude le sube el effort.'
  if (ready) return 'Convierte tu puntero en un látigo sobre toda la pantalla.'
  return 'La app de escritorio convierte tu puntero en un látigo: cada clic sobre una conversación de Claude le sube el effort.'
}

function renderWhipMode(view: ViewState): void {
  const desktop = view.desktop
  if (pendingWhip !== null && (!desktop.alive || desktop.whipMode === pendingWhip.active)) clearPendingWhip()
  if (pendingOpen !== null && (desktop.alive || desktop.appMissing)) clearPendingOpen()

  const ready = desktop.supported && desktop.alive
  const missing = desktop.supported && !desktop.alive && desktop.appMissing
  const closed = desktop.supported && !desktop.alive && !desktop.appMissing
  ui.whipReady.hidden = !ready
  ui.whipClosed.hidden = !closed
  ui.whipMissing.hidden = !missing
  ui.whipUnsupported.hidden = desktop.supported
  ui.whipCard.classList.toggle('is-active', ready && desktop.whipMode)

  if (!desktop.supported) setPill(ui.whipPill, 'Solo Mac', 'idle')
  else if (missing) setPill(ui.whipPill, 'No instalada', 'warn')
  else if (closed) setPill(ui.whipPill, 'App cerrada', 'idle')
  else if (desktop.whipMode) setPill(ui.whipPill, 'Activo', 'hot')
  else setPill(ui.whipPill, 'Listo', 'live')

  ui.whipToggle.disabled = pendingWhip !== null
  ui.whipToggle.classList.toggle('is-on', desktop.whipMode)
  ui.whipToggle.setAttribute('aria-pressed', String(desktop.whipMode))
  ui.whipToggleLabel.textContent = whipButtonLabel(desktop.whipMode)
  ui.openApp.disabled = pendingOpen !== null
  ui.openApp.textContent = pendingOpen !== null ? 'Abriendo…' : 'Abrir la app'
  ui.openAppRetry.disabled = pendingOpen !== null
  ui.whipExplain.textContent = whipExplanation(ready, desktop.whipMode)
}

function render(view: ViewState): void {
  const wasOff = !ui.app.classList.contains('is-on')
  ui.app.classList.remove('is-loading')
  ui.app.classList.toggle('is-on', view.enabled)
  ui.app.classList.toggle('is-off', !view.enabled)
  ui.offCard.hidden = view.enabled
  ui.onView.hidden = !view.enabled
  ui.enabledSwitch.checked = view.enabled
  ui.enabledLabel.textContent = view.enabled ? 'Látigo encendido' : 'Látigo apagado'
  ui.soundSwitch.checked = view.sound
  ui.soundSwitch.disabled = !view.enabled
  shownTotal = Math.max(shownTotal, view.stats.total)
  applyLook(shownTotal)
  renderStats(view)
  renderSession(view)
  renderWhipMode(view)
  scene.reduced = isReduced()
  ui.app.classList.toggle('is-reduced', scene.reduced)
  if (view.enabled && wasOff) layoutCanvas()
}

// --- Latigazos ---

const COMBO_CLASSES = [20, 10, 7, 5, 3, 2]

function showCombo(lash: LashAnimation): void {
  if (lash.combo < 2) return
  const tier = COMBO_CLASSES.find(min => lash.combo >= min) ?? 2
  ui.combo.className = `combo is-visible combo-${tier}`
  ui.combo.replaceChildren()
  const count = document.createElement('span')
  count.className = 'combo-count'
  count.textContent = `x${lash.combo}`
  const title = document.createElement('span')
  title.className = 'combo-title'
  title.textContent = lash.comboTitle
  ui.combo.append(count, ' ', title)
  const shown = lash.id
  ui.combo.dataset.lash = shown
  later(1500, () => {
    if (ui.combo.dataset.lash === shown) ui.combo.className = 'combo'
  })
}

const SOURCE_LABELS: Record<LashAnimation['source'], string> = {
  vscode: '',
  terminal: 'desde la terminal',
  desktop: 'desde la pantalla',
}

function showSource(lash: LashAnimation): void {
  const text = SOURCE_LABELS[lash.source]
  if (text === '') return
  ui.sourceChip.textContent = text
  ui.sourceChip.className = 'source-chip is-visible'
  const shown = lash.id
  ui.sourceChip.dataset.lash = shown
  later(1800, () => {
    if (ui.sourceChip.dataset.lash === shown) ui.sourceChip.className = 'source-chip'
  })
}

function showNote(text: string, ms = 4200): void {
  ui.sessionNote.textContent = text
  ui.sessionNote.className = 'session-note is-visible'
  later(ms, () => {
    if (ui.sessionNote.textContent === text) ui.sessionNote.className = 'session-note'
  })
}

function showBanner(total: number): void {
  const { tier } = progressFor(total)
  ui.banner.replaceChildren()
  const kicker = document.createElement('span')
  kicker.className = 'banner-kicker'
  kicker.textContent = '¡Subiste de nivel!'
  const title = document.createElement('span')
  title.className = 'banner-title'
  title.textContent = `Nivel ${tier.level} · ${tier.name}`
  ui.banner.append(kicker, title)
  ui.banner.className = 'banner is-visible'
  later(2600, () => {
    ui.banner.className = 'banner'
  })
}

function playLash(lash: LashAnimation): void {
  if (state !== null && !state.enabled) return
  shownTotal = Math.max(shownTotal, lash.total)
  if (lash.sound && state?.sound !== false) sounds.play('crack', state?.volume ?? 0.7)
  scene.reduced = isReduced()
  scene.crack({ combo: lash.combo, levelUp: lash.levelUp })
  showSource(lash)
  later(CRACK_DURATION * CRACK_AT * 1000, () => {
    applyLook(shownTotal)
    if (state !== null) renderStats(state)
    showCombo(lash)
    if (lash.levelUp) {
      showBanner(lash.total)
      if (lash.sound) sounds.play('level', state?.volume ?? 0.7)
    }
  })
  if (lash.source === 'vscode' && lash.target === 'effort' && !lash.reachedSession) {
    showNote('Latigazo contado, pero no llegó a ninguna sesión: abre Claude Code para que el effort suba.')
  }
  startLoop()
}

// --- Bucle de animacion ---

let frameRequest = 0
let lastFrame = 0

function frame(now: number): void {
  const dt = lastFrame === 0 ? 1 / 60 : (now - lastFrame) / 1000
  lastFrame = now
  tickTimeline(dt * 1000)
  scene.step(dt)
  draw()
  // En reposo el latigo se mece; con movimiento reducido el bucle para hasta el proximo latigazo.
  const keepGoing = state?.enabled !== false && !document.hidden && (!scene.reduced || scene.isAnimating || timeline.length > 0)
  frameRequest = keepGoing ? requestAnimationFrame(frame) : 0
  if (!keepGoing) lastFrame = 0
}

function startLoop(): void {
  if (demo || frameRequest !== 0) return
  lastFrame = 0
  frameRequest = requestAnimationFrame(frame)
}

// --- Mensajes ---

function receive(message: HostMessage): void {
  if (message.type === 'state') {
    state = message.state
    render(message.state)
    startLoop()
    if (demo) draw()
  } else if (message.type === 'lash') {
    playLash(message.lash)
  }
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const data = event.data
  if (typeof data === 'object' && data !== null && (data.type === 'state' || data.type === 'lash')) receive(data)
})

function lashFromPanel(target: Target): void {
  if (state?.enabled === false) return
  vscode.postMessage({ type: 'lash', target })
}

/** Si la app no confirma en este tiempo, el boton vuelve a quedar libre. */
const PENDING_WHIP_MS = 4000
const PENDING_OPEN_MS = 10000

function toggleWhipMode(): void {
  if (state === null || !state.desktop.alive || pendingWhip !== null) return
  const timer = window.setTimeout(() => {
    pendingWhip = null
    if (state !== null) renderWhipMode(state)
  }, PENDING_WHIP_MS)
  pendingWhip = { active: !state.desktop.whipMode, timer }
  renderWhipMode(state)
  vscode.postMessage({ type: 'toggleWhipMode' })
}

function openDesktopApp(): void {
  if (state === null || pendingOpen !== null) return
  const timer = window.setTimeout(() => {
    pendingOpen = null
    if (state !== null) renderWhipMode(state)
  }, PENDING_OPEN_MS)
  pendingOpen = { timer }
  renderWhipMode(state)
  vscode.postMessage({ type: 'openDesktopApp' })
}

ui.lashModel.addEventListener('click', () => lashFromPanel('model'))
ui.lashEffort.addEventListener('click', () => lashFromPanel('effort'))
ui.whipToggle.addEventListener('click', toggleWhipMode)
ui.openApp.addEventListener('click', openDesktopApp)
ui.openAppRetry.addEventListener('click', openDesktopApp)
ui.installGuide.addEventListener('click', () => vscode.postMessage({ type: 'openInstallGuide' }))
ui.enabledSwitch.addEventListener('change', () => vscode.postMessage({ type: 'setEnabled', enabled: ui.enabledSwitch.checked }))
ui.soundSwitch.addEventListener('change', () => vscode.postMessage({ type: 'setSound', sound: ui.soundSwitch.checked }))
ui.installPlugin.addEventListener('click', () => vscode.postMessage({ type: 'installPlugin' }))
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) startLoop()
})
motionQuery.addEventListener('change', () => {
  scene.reduced = isReduced()
  startLoop()
})
new ResizeObserver(() => {
  layoutCanvas()
  draw()
}).observe(ui.preview)

ui.toggleKey.textContent = toggleKeyLabel()
scene.fontFamily = getComputedStyle(document.body).fontFamily || 'sans-serif'
function syncTheme(): void {
  scene.additive = !document.body.classList.contains('vscode-light')
}
syncTheme()
new MutationObserver(() => {
  syncTheme()
  draw()
}).observe(document.body, { attributes: true, attributeFilter: ['class'] })
layoutCanvas()

if (demo) {
  window.__latigoDemo = {
    receive,
    advance(ms: number) {
      layoutCanvas()
      const step = 1000 / 60
      for (let elapsed = 0; elapsed < ms; elapsed += step) {
        tickTimeline(step)
        scene.step(step / 1000)
      }
      draw()
    },
  }
}

vscode.postMessage({ type: 'ready' })
