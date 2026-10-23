// El panel del latigo: pinta el estado que manda la extension, anima los
// latigazos y le avisa a la extension de los clics. No toca disco ni red.

import './style.css'

import { MAX_LEVEL, lookFor, progressFor } from '../../hooks/levels'
import { seededRandom } from '../../hooks/levels'
import type { Target } from '../../hooks/model'
import { effectiveEffort, isForcing } from '../../hooks/model'
import { formatCount, formatDay, plural } from '../src/format'
import type { HostMessage, LashAnimation, ViewState, WebviewMessage } from '../src/protocol'
import { SoundPlayer } from './sound'
import { CRACK_AT, STRIKE_DURATION, WhipScene } from './whip'

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
  stage: byId<HTMLElement>('stage'),
  canvas: byId<HTMLCanvasElement>('whip-canvas'),
  targetModel: byId<HTMLButtonElement>('target-model'),
  targetEffort: byId<HTMLButtonElement>('target-effort'),
  modelName: byId<HTMLSpanElement>('model-name'),
  effortValue: byId<HTMLSpanElement>('effort-value'),
  effortNote: byId<HTMLSpanElement>('effort-note'),
  sessionHint: byId<HTMLElement>('session-hint'),
  stageCaption: byId<HTMLElement>('stage-caption'),
  installPlugin: byId<HTMLButtonElement>('install-plugin'),
  combo: byId<HTMLElement>('combo'),
  banner: byId<HTMLElement>('banner'),
  toast: byId<HTMLElement>('toast'),
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
const scene = new WhipScene(random)
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
  const targetPoint = (button: HTMLElement) => {
    const box = button.getBoundingClientRect()
    return { x: box.left - rect.left - 6, y: box.top - rect.top + box.height / 2 }
  }
  scene.setTargets({ model: targetPoint(ui.targetModel), effort: targetPoint(ui.targetEffort) })
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
  return platform.includes('mac') ? 'Ctrl+Cmd+L' : 'Shift+Alt+L'
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
  ui.modelName.textContent = session.alive && session.model !== null ? shortModel(session.model) : 'Claude'
  if (session.alive) {
    const effective = effectiveEffort(session.effort, session.boost)
    ui.effortValue.textContent = effective === null ? '—' : `${effective}${isForcing(session.effort, session.boost) ? ' ⚡' : ''}`
    ui.effortNote.textContent = effective === 'max' ? 'ya está en max' : 'un latigazo lo sube'
    ui.targetEffort.classList.remove('is-offline')
    ui.sessionHint.hidden = true
    ui.stageCaption.hidden = false
  } else {
    ui.effortValue.textContent = 'sin sesión'
    ui.effortNote.textContent = 'cuenta, pero no sube'
    ui.targetEffort.classList.add('is-offline')
    ui.sessionHint.hidden = false
    ui.stageCaption.hidden = true
  }
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

function showToast(text: string, kind: 'info' | 'warn' = 'info', ms = 3200): void {
  ui.toast.textContent = text
  ui.toast.className = `toast is-visible toast-${kind}`
  const shown = text
  later(ms, () => {
    if (ui.toast.textContent === shown) ui.toast.className = 'toast'
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
  title.textContent = `¡Nivel ${tier.level} · ${tier.name}!`
  ui.banner.append(kicker, title)
  ui.banner.className = 'banner is-visible'
  later(2800, () => {
    ui.banner.className = 'banner'
  })
}

function hitTarget(target: Target): void {
  const button = target === 'effort' ? ui.targetEffort : ui.targetModel
  button.classList.remove('is-hit')
  // Forzar reflow para reiniciar la animacion CSS.
  void button.offsetWidth
  button.classList.add('is-hit')
  later(420, () => button.classList.remove('is-hit'))
}

function playLash(lash: LashAnimation): void {
  if (state !== null && !state.enabled) return
  shownTotal = Math.max(shownTotal, lash.total)
  if (lash.sound && state?.sound !== false) sounds.play('crack', state?.volume ?? 0.7)
  scene.reduced = isReduced()
  scene.lash(lash.target, { combo: lash.combo, levelUp: lash.levelUp })
  const crackMs = STRIKE_DURATION * CRACK_AT * 1000
  later(crackMs, () => {
    hitTarget(lash.target)
    applyLook(shownTotal)
    if (state !== null) renderStats(state)
    showCombo(lash)
    if (lash.levelUp) {
      showBanner(lash.total)
      if (lash.sound) sounds.play('level', state?.volume ?? 0.7)
    }
  })
  if (lash.source === 'terminal') showToast('Latigazo desde Claude Code')
  else if (lash.target === 'effort' && !lash.reachedSession) {
    showToast('Latigazo contado, pero no llegó a ninguna sesión: abre Claude Code para que el effort suba.', 'warn', 4200)
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

ui.targetModel.addEventListener('click', () => lashFromPanel('model'))
ui.targetEffort.addEventListener('click', () => lashFromPanel('effort'))
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
}).observe(ui.stage)

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
