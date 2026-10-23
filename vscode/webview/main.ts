// El panel del latigo en la barra lateral: el interruptor, el sonido, la app de
// escritorio, la sesion, el nivel y las estadisticas. Pinta el estado que manda
// la extension, anima en la vista previa los latigazos que llegan (de VS Code,
// de la terminal o del latigo en pantalla) y le avisa a la extension de los
// clics. No toca disco ni red.

import './style.css'

import { MAX_LEVEL, lookFor, progressFor, seededRandom } from '../../hooks/levels'
import type { Target } from '../../hooks/model'
import { effectiveEffort, isForcing } from '../../hooks/model'
import type { SoundStyle } from '../../hooks/sounds'
import { DEFAULT_SOUND_STYLE, isSoundStyle, soundStyle } from '../../hooks/sounds'
import { formatCount, formatDay, plural } from '../src/format'
import { desktopCard, switchHint } from '../src/panelStatus'
import type { HostMessage, LashAnimation, ViewState, WebviewMessage } from '../src/protocol'
import { toggleKeyLabel } from '../src/shortcuts'
import { LEVEL_SOUND } from '../src/soundAssets'
import { SoundPlayer, parseSoundUris } from './sound'
import { planLashSound, planTestSound } from './soundPlan'
import { IMPACT_MS, WhipPreview } from './whipPreview'

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
  powerCard: byId<HTMLElement>('power-card'),
  enabledSwitch: byId<HTMLInputElement>('enabled-switch'),
  enabledLabel: byId<HTMLElement>('enabled-label'),
  toggleKey: byId<HTMLElement>('toggle-key'),
  powerHint: byId<HTMLElement>('power-hint'),
  soundBlock: byId<HTMLElement>('sound-block'),
  soundSwitch: byId<HTMLInputElement>('sound-switch'),
  soundPicker: byId<HTMLSelectElement>('sound-style'),
  soundTest: byId<HTMLButtonElement>('sound-test'),
  soundAbout: byId<HTMLElement>('sound-about'),
  desktop: byId<HTMLElement>('desktop-card'),
  desktopDot: byId<HTMLElement>('desktop-dot'),
  desktopStatus: byId<HTMLElement>('desktop-status'),
  desktopHint: byId<HTMLElement>('desktop-hint'),
  desktopWarning: byId<HTMLElement>('desktop-warning'),
  desktopOpen: byId<HTMLElement>('desktop-open'),
  desktopInstall: byId<HTMLElement>('desktop-install'),
  openApp: byId<HTMLButtonElement>('open-app'),
  openAppRetry: byId<HTMLButtonElement>('open-app-retry'),
  installGuide: byId<HTMLButtonElement>('install-guide'),
  offCard: byId<HTMLElement>('off-card'),
  onView: byId<HTMLElement>('on-view'),
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
// En las capturas no suena nada.
const sounds = new SoundPlayer(demo ? new Map() : parseSoundUris(document.body.dataset.sounds))
sounds.prepare([LEVEL_SOUND])
const context = ui.canvas.getContext('2d')

/** El volumen por defecto del ajuste latigo.volume, mientras llega el estado. */
const DEFAULT_VOLUME = 0.7

let state: ViewState | null = null
/** Total que se esta mostrando (sube con cada latigazo antes de que llegue el estado). */
let shownTotal = 0

function volume(): number {
  return state?.volume ?? DEFAULT_VOLUME
}

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

type PillTone = 'live' | 'idle'

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

/** El interruptor unico: estado, y que hace el latigo en este momento. */
function renderSwitch(view: ViewState): void {
  ui.enabledSwitch.checked = view.enabled
  ui.enabledLabel.textContent = view.enabled ? 'Látigo prendido' : 'Látigo apagado'
  ui.powerCard.classList.toggle('is-on', view.enabled)
  ui.powerHint.textContent = switchHint(view.enabled, view.desktop)
}

function showSoundAbout(style: SoundStyle): void {
  const description = soundStyle(style).description
  ui.soundAbout.textContent = description
  ui.soundPicker.title = description
}

function renderSound(view: ViewState): void {
  // Apagado el latigo no suena nada: la fila del sonido no hace falta.
  ui.soundBlock.hidden = !view.enabled
  ui.soundSwitch.checked = view.sound
  ui.soundPicker.value = view.soundStyle
  showSoundAbout(view.soundStyle)
  sounds.prepare(soundStyle(view.soundStyle).files.map(file => file.path))
}

/** Mientras se abre la app de escritorio, el boton espera. */
let pendingOpen: { timer: number } | null = null

function clearPendingOpen(): void {
  if (pendingOpen !== null) window.clearTimeout(pendingOpen.timer)
  pendingOpen = null
}

function renderDesktop(view: ViewState): void {
  const card = desktopCard(view.enabled, view.desktop)
  ui.desktop.hidden = card.kind === 'hidden'
  ui.desktop.dataset.kind = card.kind
  ui.desktopDot.className = `dot dot-${card.tone}`
  ui.desktopStatus.textContent = card.status
  ui.desktopHint.textContent = card.hint
  ui.desktopHint.hidden = card.hint === ''
  ui.desktopWarning.textContent = card.warning ?? ''
  ui.desktopWarning.hidden = card.warning === null
  ui.desktopOpen.hidden = card.action !== 'open'
  ui.desktopInstall.hidden = card.action !== 'install'
  const opening = pendingOpen !== null
  ui.openApp.disabled = opening
  ui.openApp.textContent = opening ? 'Abriendo…' : 'Abrir la app'
  ui.openAppRetry.disabled = opening
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

function render(view: ViewState): void {
  const wasOff = !ui.app.classList.contains('is-on')
  ui.app.classList.remove('is-loading')
  ui.app.classList.toggle('is-on', view.enabled)
  ui.app.classList.toggle('is-off', !view.enabled)
  ui.offCard.hidden = view.enabled
  ui.onView.hidden = !view.enabled
  renderSwitch(view)
  renderSound(view)
  renderDesktop(view)
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
  const plan = planLashSound(state?.soundStyle ?? DEFAULT_SOUND_STYLE, Math.random, IMPACT_MS, {
    lashHasSound: lash.sound,
    soundOn: state?.sound !== false,
  })
  if (plan !== null) sounds.play(plan.file.path, volume(), plan.soundDelayMs)
  const strike = () => {
    scene.reduced = isReduced()
    scene.crack({ combo: lash.combo, levelUp: lash.levelUp })
    showSource(lash)
    later(IMPACT_MS, () => {
      applyLook(shownTotal)
      if (state !== null) renderStats(state)
      showCombo(lash)
      if (lash.levelUp) {
        showBanner(lash.total)
        if (plan !== null) sounds.play(LEVEL_SOUND, volume())
      }
    })
  }
  // Si el golpe del archivo llega despues del impacto, la animacion lo espera.
  if (plan === null || plan.animationDelayMs === 0) strike()
  else later(plan.animationDelayMs, strike)
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
    // La app ya respondio (abierta o no instalada): el boton deja de esperar.
    if (pendingOpen !== null && (state.desktop.alive || state.desktop.appMissing)) clearPendingOpen()
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

/** Si la app no responde en este tiempo, el boton vuelve a quedar libre. */
const PENDING_OPEN_MS = 10000

function openDesktopApp(): void {
  if (state === null || pendingOpen !== null) return
  const timer = window.setTimeout(() => {
    pendingOpen = null
    if (state !== null) renderDesktop(state)
  }, PENDING_OPEN_MS)
  pendingOpen = { timer }
  renderDesktop(state)
  vscode.postMessage({ type: 'openDesktopApp' })
}

/** El estilo del desplegable (el elegido, aunque la extension aun no lo confirme). */
function selectedStyle(): SoundStyle {
  const value = ui.soundPicker.value
  return isSoundStyle(value) ? value : (state?.soundStyle ?? DEFAULT_SOUND_STYLE)
}

/** Probar (y elegir): suena aunque el sonido este apagado, porque lo pidio la persona. */
function playTestSound(style: SoundStyle): void {
  sounds.play(planTestSound(style, Math.random).file.path, volume())
}

function chooseSoundStyle(): void {
  const style = selectedStyle()
  showSoundAbout(style)
  // Elegir un sonido tambien lo prende, como /latigo sonido <estilo> en Claude Code.
  ui.soundSwitch.checked = true
  vscode.postMessage({ type: 'setSoundStyle', style })
  playTestSound(style)
}

ui.lashModel.addEventListener('click', () => lashFromPanel('model'))
ui.lashEffort.addEventListener('click', () => lashFromPanel('effort'))
ui.openApp.addEventListener('click', openDesktopApp)
ui.openAppRetry.addEventListener('click', openDesktopApp)
ui.installGuide.addEventListener('click', () => vscode.postMessage({ type: 'openInstallGuide' }))
ui.enabledSwitch.addEventListener('change', () => vscode.postMessage({ type: 'setEnabled', enabled: ui.enabledSwitch.checked }))
ui.soundSwitch.addEventListener('change', () => vscode.postMessage({ type: 'setSound', sound: ui.soundSwitch.checked }))
ui.soundPicker.addEventListener('change', chooseSoundStyle)
ui.soundTest.addEventListener('click', () => playTestSound(selectedStyle()))
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

ui.toggleKey.textContent = toggleKeyLabel(navigator.platform)
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
