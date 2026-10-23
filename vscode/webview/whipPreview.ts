// La vista previa del latigo en la tarjeta de nivel: un canvas bajito con el
// latigo del nivel actual (curva de Bezier con mango y trenzado) que se mece en
// reposo y suelta chispas segun el nivel. Cuando llega un latigazo (de VS Code,
// de la terminal o del latigo en pantalla) da un chasquido corto: amague,
// golpe, destello, onda y chispas. Todo avanza con `step(dt)`, asi el modo
// demo puede congelar un cuadro exacto.

import type { Look } from '../../hooks/levels'
import { lookFor, mixHex, progressFor } from '../../hooks/levels'
import { drawParticles, ParticleSystem } from './particles'

type Point = { x: number; y: number }

type Pose = { c1: Point; c2: Point; tip: Point }

type Strike = { age: number; combo: number; levelUp: boolean; cracked: boolean }

type Flash = { x: number; y: number; age: number; life: number; radius: number }
type Ring = { x: number; y: number; age: number; life: number; radius: number; width: number; color: string }
type FloatingText = { text: string; x: number; y: number; age: number; life: number; size: number; color: string }

export type CrackOptions = { combo: number; levelUp: boolean }

/** Duracion total del chasquido, en segundos. */
export const CRACK_DURATION = 0.62
/** Momento del golpe dentro del chasquido (0 a 1). */
export const CRACK_AT = 0.32
/** Cuando pega el golpe, en ms desde que arranca el chasquido (ahi tiene que sonar). */
export const IMPACT_MS = CRACK_DURATION * CRACK_AT * 1000

const WIND_END = 0.2
/** Grosor del cuero junto al mango y en la punta. */
const THICK = 6
const THIN = 1.1

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return { c1: lerpPoint(a.c1, b.c1, t), c2: lerpPoint(a.c2, b.c2, t), tip: lerpPoint(a.tip, b.tip, t) }
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const easeInCubic = (t: number) => t ** 3
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamp01(alpha).toFixed(3)})`
}

function bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y }
}

function thickness(s: number): number {
  return lerp(THICK, THIN, s ** 0.85)
}

export class WhipPreview {
  private width = 300
  private height = 110
  private time = 0
  private total = 0
  private look: Look = lookFor(0)
  private level = 1
  private strike: Strike | null = null
  private shake = 0
  private twinkleBudget = 0
  private readonly flashes: Flash[] = []
  private readonly rings: Ring[] = []
  private readonly texts: FloatingText[] = []
  private readonly particles: ParticleSystem
  reduced = false
  additive = true
  fontFamily = 'sans-serif'

  constructor(private readonly random: () => number) {
    this.particles = new ParticleSystem(random)
  }

  resize(width: number, height: number): void {
    this.width = Math.max(120, width)
    this.height = Math.max(60, height)
  }

  setTotal(total: number): void {
    this.total = total
    this.look = lookFor(total)
    this.level = progressFor(total).tier.level
  }

  /** True mientras haya algo moviendose aparte del vaiven de reposo. */
  get isAnimating(): boolean {
    return this.strike !== null || this.particles.particles.length > 0 || this.flashes.length > 0 || this.rings.length > 0 || this.texts.length > 0
  }

  /** Arranca un chasquido. */
  crack(options: CrackOptions): void {
    this.strike = { age: 0, combo: options.combo, levelUp: options.levelUp, cracked: false }
  }

  // --- Geometria -----------------------------------------------------------

  private get butt(): Point {
    return { x: 16, y: this.height * 0.76 }
  }

  /** Donde termina el mango y empieza el cuero. */
  private get anchor(): Point {
    const butt = this.butt
    return { x: butt.x + 36, y: butt.y - 24 }
  }

  /** Donde revienta la punta: a la derecha, a media altura. */
  private get target(): Point {
    return { x: this.width - 24, y: this.height * 0.42 }
  }

  private restPose(): Pose {
    const a = this.anchor
    const floor = this.height - 16
    const reach = this.target.x - a.x - 8
    const sway = this.reduced ? 0 : Math.sin(this.time * 1.25) * 5
    const lift = this.reduced ? 0 : Math.sin(this.time * 0.8 + 1) * 2.5
    return {
      c1: { x: a.x + reach * 0.28, y: a.y - this.height * 0.1 },
      c2: { x: a.x + reach * 0.55 + sway * 0.6, y: floor + lift },
      tip: { x: a.x + reach * 0.94 + sway, y: floor - 3 + lift * 0.4 },
    }
  }

  private windPose(): Pose {
    const a = this.anchor
    return {
      c1: { x: a.x + 24, y: Math.max(4, a.y - this.height * 0.55) },
      c2: { x: a.x + 84, y: 4 },
      tip: { x: a.x + 18, y: Math.max(8, this.height * 0.14) },
    }
  }

  private strikePose(): Pose {
    const a = this.anchor
    const t = this.target
    const dx = t.x - a.x
    return {
      c1: { x: a.x + dx * 0.3, y: a.y - this.height * 0.42 },
      c2: { x: t.x - dx * 0.3, y: t.y - this.height * 0.3 },
      tip: { x: t.x, y: t.y },
    }
  }

  private overshootPose(): Pose {
    const pose = this.strikePose()
    return {
      c1: { x: pose.c1.x + 8, y: pose.c1.y + this.height * 0.22 },
      c2: { x: pose.c2.x + 10, y: pose.c2.y + this.height * 0.2 },
      tip: { x: pose.tip.x + 4, y: pose.tip.y + 10 },
    }
  }

  private currentPose(): { pose: Pose; wave: number } {
    const rest = this.restPose()
    const strike = this.strike
    if (strike === null) return { pose: rest, wave: 0 }
    const t = strike.age / CRACK_DURATION
    if (t < WIND_END) return { pose: lerpPose(rest, this.windPose(), easeOutCubic(t / WIND_END)), wave: 0 }
    if (t < CRACK_AT) {
      const k = (t - WIND_END) / (CRACK_AT - WIND_END)
      return { pose: lerpPose(this.windPose(), this.strikePose(), easeInCubic(k)), wave: Math.sin(k * Math.PI) }
    }
    if (t < 0.45) {
      const k = (t - CRACK_AT) / (0.45 - CRACK_AT)
      return { pose: lerpPose(this.strikePose(), this.overshootPose(), easeOutCubic(k)), wave: 0.5 * (1 - k) }
    }
    const k = clamp01((t - 0.45) / 0.55)
    return { pose: lerpPose(this.overshootPose(), rest, easeInOut(k)), wave: 0 }
  }

  /** Los puntos del cuero, con la onda que lo recorre en el golpe. */
  private lashPoints(pose: Pose, wave: number): Point[] {
    const a = this.anchor
    const count = 60
    const points: Point[] = []
    const phase = this.strike === null ? 0 : this.strike.age * 26
    for (let i = 0; i <= count; i++) {
      const s = i / count
      const p = bezier(a, pose.c1, pose.c2, pose.tip, s)
      if (wave > 0) {
        const ahead = bezier(a, pose.c1, pose.c2, pose.tip, Math.min(1, s + 0.01))
        const dx = ahead.x - p.x
        const dy = ahead.y - p.y
        const length = Math.hypot(dx, dy) || 1
        const offset = Math.sin(s * 9 - phase) * 6 * wave * Math.sin(Math.PI * s)
        p.x += (-dy / length) * offset
        p.y += (dx / length) * offset
      }
      points.push(p)
    }
    return points
  }

  // --- Simulacion ----------------------------------------------------------

  step(dt: number): void {
    const delta = Math.min(0.05, Math.max(0, dt))
    this.time += delta
    const strike = this.strike
    if (strike !== null) {
      strike.age += delta
      if (!strike.cracked && strike.age >= CRACK_DURATION * CRACK_AT) {
        strike.cracked = true
        this.burst(strike)
      }
      if (strike.age >= CRACK_DURATION) this.strike = null
    }
    this.shake = Math.max(0, this.shake - delta * 24)
    for (const list of [this.flashes, this.rings, this.texts] as Array<Array<{ age: number; life: number }>>) {
      for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i]!
        item.age += delta
        if (item.age >= item.life) list.splice(i, 1)
      }
    }
    this.idleTwinkles(delta)
    this.particles.step(delta)
  }

  /** Destellos en reposo, mas seguidos cuanto mas alto el nivel (los primeros niveles no tienen). */
  private idleTwinkles(dt: number): void {
    if (this.look.sparkDensity <= 0 || this.strike !== null) return
    this.twinkleBudget += this.look.sparkDensity * (this.reduced ? 2 : 11) * dt
    if (this.twinkleBudget < 1) return
    const points = this.lashPoints(this.restPose(), 0)
    while (this.twinkleBudget >= 1) {
      this.twinkleBudget -= 1
      const at = points[Math.floor(this.random() * points.length)]!
      this.particles.twinkle(at.x + (this.random() - 0.5) * 12, at.y - this.random() * 10, this.look)
    }
  }

  private burst(strike: Strike): void {
    const tip = this.target
    const comboBoost = 1 + Math.min(strike.combo - 1, 10) * 0.15
    const levelBoost = strike.levelUp ? 2 : 1
    this.flashes.push({ x: tip.x, y: tip.y, age: 0, life: 0.2, radius: 16 + this.level * 1.4 })
    this.rings.push({ x: tip.x, y: tip.y, age: 0, life: 0.4, radius: 30 + this.level * 1.8, width: 2.5, color: this.look.glow })
    if (!this.reduced) this.rings.push({ x: tip.x, y: tip.y, age: -0.05, life: 0.46, radius: 44 + this.level * 2.4, width: 1.2, color: '#ffffff' })
    // Un solo grito a la vez: en los combos el nuevo reemplaza al anterior.
    this.texts.length = 0
    const size = 13 + Math.min(this.level, 14) * 0.5
    // En la subida de nivel el protagonista es el letrero del panel.
    if (!strike.levelUp) this.texts.push({ text: this.look.crack, x: tip.x - 46, y: Math.max(size * 0.7 + 4, tip.y - 22), age: 0, life: 0.8, size, color: this.look.glow })
    this.particles.burst({ x: tip.x, y: tip.y, look: this.look, level: this.level, boost: comboBoost * levelBoost * 0.6, reduced: this.reduced, direction: -Math.PI * 0.62, spread: Math.PI * 1.3, speed: 0.6 })
    if (strike.levelUp) this.levelUpBurst()
    if (!this.reduced && strike.combo >= 3) this.shake = Math.min(6, 2 + strike.combo * 0.5)
  }

  /** La fiesta de la subida de nivel: un abanico de chispas desde el centro. */
  private levelUpBurst(): void {
    const center = { x: this.width * 0.5, y: this.height * 0.5 }
    const look = lookFor(this.total)
    this.particles.burst({ x: center.x, y: center.y, look: { ...look, sparkDensity: Math.max(0.3, look.sparkDensity) }, level: Math.max(this.level, 8), boost: 1.2, reduced: this.reduced, direction: -Math.PI / 2, spread: Math.PI * 2, speed: 0.7 })
    this.rings.push({ x: center.x, y: center.y, age: 0, life: 0.9, radius: this.width * 0.42, width: 3, color: mixHex(look.glow, '#ffc933', 0.6) })
  }

  /** Avanza la escena `ms` milisegundos en pasos fijos (modo demo y pruebas). */
  advance(ms: number): void {
    const steps = Math.round(ms / (1000 / 60))
    for (let i = 0; i < steps; i++) this.step(1 / 60)
  }

  // --- Dibujo --------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, this.width, this.height)
    ctx.save()
    if (this.shake > 0) ctx.translate((this.random() - 0.5) * this.shake, (this.random() - 0.5) * this.shake)
    const { pose, wave } = this.currentPose()
    const points = this.lashPoints(pose, wave)
    this.drawGroundShadow(ctx, points)
    this.drawLash(ctx, points)
    this.drawPopper(ctx, points)
    this.drawHandle(ctx)
    drawParticles(ctx, this.particles.particles, this.fontFamily, this.additive)
    this.drawEffects(ctx)
    ctx.restore()
  }

  private drawGroundShadow(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
    const floor = this.height - 9
    const first = points[0]!
    const last = points[points.length - 1]!
    const left = Math.min(this.butt.x, first.x, last.x)
    const right = Math.max(first.x, last.x)
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
    ctx.filter = 'blur(5px)'
    ctx.beginPath()
    ctx.ellipse((left + right) / 2, floor, Math.max(30, (right - left) / 2 + 8), 4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private glowStrength(): number {
    const crackBoost = this.flashes.length > 0 ? 8 : 0
    return 1 + (this.level - 1) * 1.2 + crackBoost
  }

  private drawLash(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
    const look = this.look
    const count = points.length - 1
    const dark = mixHex(look.lash, '#000000', 0.45)
    const light = mixHex(look.lash, '#ffffff', 0.4)
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = withAlpha(look.glow, 0.25 + this.level * 0.045)
    ctx.shadowBlur = this.glowStrength()
    for (let i = 0; i < count; i++) {
      const s = i / count
      const a = points[i]!
      const b = points[i + 1]!
      ctx.strokeStyle = mixHex(mixHex(look.lash, dark, 0.35 * (1 - s)), look.glow, 0.28 * s * s)
      ctx.lineWidth = thickness(s)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    ctx.shadowBlur = 0
    // Trenzado: rayitas oscuras cruzadas sobre el cuero.
    ctx.strokeStyle = withAlpha(dark, 0.55)
    ctx.lineWidth = 0.9
    for (let i = 2; i < count * 0.8; i += 3) {
      const s = i / count
      const a = points[i]!
      const b = points[i + 1]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const length = Math.hypot(dx, dy) || 1
      const half = thickness(s) * 0.5
      const nx = (-dy / length) * half
      const ny = (dx / length) * half
      ctx.beginPath()
      ctx.moveTo(a.x + nx - dx * 0.3, a.y + ny - dy * 0.3)
      ctx.lineTo(a.x - nx + dx * 0.3, a.y - ny + dy * 0.3)
      ctx.stroke()
    }
    // Brillo a lo largo del lomo.
    ctx.strokeStyle = withAlpha(light, 0.35 + this.level * 0.02)
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < count * 0.9; i++) {
      const s = i / count
      const a = points[i]!
      const b = points[i + 1]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const length = Math.hypot(dx, dy) || 1
      const off = thickness(s) * 0.22
      const x = a.x + (dy / length) * off
      const y = a.y - (dx / length) * off
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.restore()
  }

  /** El remate de hilos en la punta, el que hace el chasquido. */
  private drawPopper(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
    const tip = points[points.length - 1]!
    const before = points[points.length - 4]!
    const angle = Math.atan2(tip.y - before.y, tip.x - before.x)
    ctx.save()
    ctx.strokeStyle = mixHex(this.look.glow, '#ffffff', 0.2)
    ctx.lineWidth = 0.9
    ctx.lineCap = 'round'
    for (const spread of [-0.35, 0, 0.32]) {
      const length = 7 + Math.abs(spread) * 5
      ctx.beginPath()
      ctx.moveTo(tip.x, tip.y)
      ctx.lineTo(tip.x + Math.cos(angle + spread) * length, tip.y + Math.sin(angle + spread) * length)
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawHandle(ctx: CanvasRenderingContext2D): void {
    const look = this.look
    const butt = this.butt
    const top = this.anchor
    const angle = Math.atan2(top.y - butt.y, top.x - butt.x)
    const length = Math.hypot(top.x - butt.x, top.y - butt.y)
    ctx.save()
    ctx.translate(butt.x, butt.y)
    ctx.rotate(angle)
    const gradient = ctx.createLinearGradient(0, -5, 0, 5)
    gradient.addColorStop(0, mixHex(look.handle, '#ffffff', 0.25))
    gradient.addColorStop(0.5, look.handle)
    gradient.addColorStop(1, mixHex(look.handle, '#000000', 0.45))
    ctx.shadowColor = withAlpha(look.glow, 0.15 + this.level * 0.03)
    ctx.shadowBlur = this.glowStrength() * 0.6
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.roundRect(0, -4.5, length, 9, 4)
    ctx.fill()
    ctx.shadowBlur = 0
    // Amarres de cuero.
    ctx.strokeStyle = withAlpha(mixHex(look.handle, '#000000', 0.5), 0.75)
    ctx.lineWidth = 1.2
    for (let x = 8; x < length - 6; x += 5) {
      ctx.beginPath()
      ctx.moveTo(x, -4)
      ctx.lineTo(x + 2.5, 4)
      ctx.stroke()
    }
    // Pomo y virola: se van poniendo metalicos con el nivel.
    ctx.fillStyle = mixHex(look.handle, look.glow, Math.min(1, 0.2 + this.level * 0.06))
    ctx.beginPath()
    ctx.arc(-2, 0, 5.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(length - 3, -5.5, 5, 11)
    ctx.fillStyle = withAlpha('#ffffff', 0.35)
    ctx.beginPath()
    ctx.arc(-3.5, -2, 1.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private drawEffects(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    for (const flash of this.flashes) {
      const t = flash.age / flash.life
      const radius = flash.radius * (0.6 + t * 0.8)
      const gradient = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radius)
      gradient.addColorStop(0, withAlpha('#ffffff', 0.95 * (1 - t)))
      gradient.addColorStop(0.35, withAlpha(this.look.glow, 0.7 * (1 - t)))
      gradient.addColorStop(1, withAlpha(this.look.glow, 0))
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(flash.x, flash.y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
    for (const ring of this.rings) {
      if (ring.age < 0) continue
      const t = ring.age / ring.life
      ctx.strokeStyle = withAlpha(ring.color, 0.75 * (1 - t) ** 1.5)
      ctx.lineWidth = ring.width * (1 - t * 0.6)
      ctx.beginPath()
      ctx.arc(ring.x, ring.y, 4 + ring.radius * easeOutCubic(t), 0, Math.PI * 2)
      ctx.stroke()
    }
    for (const text of this.texts) {
      const t = text.age / text.life
      const scale = t < 0.15 ? 0.7 + (t / 0.15) * 0.4 : 1.1 - Math.min(0.1, (t - 0.15) * 0.25)
      ctx.save()
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
      ctx.translate(text.x, text.y - t * 10)
      ctx.rotate(-0.05)
      ctx.scale(scale, scale)
      ctx.font = `800 ${Math.round(text.size)}px ${this.fontFamily}`
      // Centrado sobre la punta, pero sin salirse del canvas.
      const half = (ctx.measureText(text.text).width * scale) / 2
      const margin = 8
      const shift = Math.min(0, this.width - margin - (text.x + half)) + Math.max(0, margin - (text.x - half))
      ctx.translate(shift / scale, 0)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 3.5
      ctx.strokeStyle = 'rgba(20, 12, 6, 0.85)'
      ctx.strokeText(text.text, 0, 0)
      ctx.fillStyle = text.color
      ctx.fillText(text.text, 0, 0)
      ctx.restore()
    }
    ctx.restore()
  }
}
