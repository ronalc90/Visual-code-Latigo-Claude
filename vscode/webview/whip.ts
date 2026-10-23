// La escena del canvas: el latigo como una curva de Bezier con mango, el
// latigazo (amague, golpe, rebote), el destello y la onda en la punta, las
// chispas y la sacudida de los combos grandes. Todo avanza con `step(dt)`, asi
// el modo demo puede congelar un cuadro exacto.

import type { Look } from '../../hooks/levels'
import { lookFor, mixHex, progressFor } from '../../hooks/levels'
import type { Target } from '../../hooks/model'
import { drawParticles, ParticleSystem } from './particles'

type Point = { x: number; y: number }

type Pose = { c1: Point; c2: Point; tip: Point }

type Strike = {
  target: Target
  age: number
  combo: number
  levelUp: boolean
  cracked: boolean
}

type Flash = { x: number; y: number; age: number; life: number; radius: number }
type Ring = { x: number; y: number; age: number; life: number; radius: number; width: number; color: string }
type FloatingText = { text: string; x: number; y: number; age: number; life: number; size: number; color: string }

export type StrikeOptions = { combo: number; levelUp: boolean }

/** Duracion total del latigazo, en segundos. */
export const STRIKE_DURATION = 0.7
/** Momento del chasquido dentro del latigazo. */
export const CRACK_AT = 0.3

const WIND_END = 0.19

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

export class WhipScene {
  private width = 600
  private height = 260
  private time = 0
  private total = 0
  private look: Look = lookFor(0)
  private level = 1
  private strike: Strike | null = null
  private shake = 0
  private readonly flashes: Flash[] = []
  private readonly rings: Ring[] = []
  private readonly texts: FloatingText[] = []
  private readonly particles: ParticleSystem
  private targets: Record<Target, Point> = { model: { x: 480, y: 80 }, effort: { x: 480, y: 170 } }
  private twinkleBudget = 0
  reduced = false
  additive = true
  fontFamily = 'sans-serif'

  constructor(private readonly random: () => number) {
    this.particles = new ParticleSystem(random)
  }

  resize(width: number, height: number): void {
    this.width = Math.max(200, width)
    this.height = Math.max(150, height)
  }

  setTargets(targets: Record<Target, Point>): void {
    this.targets = targets
  }

  setTotal(total: number): void {
    this.total = total
    this.look = lookFor(total)
    this.level = progressFor(total).tier.level
  }

  get isAnimating(): boolean {
    return this.strike !== null || this.particles.particles.length > 0 || this.flashes.length > 0 || this.rings.length > 0 || this.texts.length > 0
  }

  /** Arranca un latigazo hacia `target`. */
  lash(target: Target, options: StrikeOptions): void {
    this.strike = { target, age: 0, combo: options.combo, levelUp: options.levelUp, cracked: false }
  }

  // --- Geometria -----------------------------------------------------------

  private get butt(): Point {
    return { x: 30, y: this.height * 0.8 }
  }

  /** Donde termina el mango y empieza el cuero. */
  private get anchor(): Point {
    const butt = this.butt
    return { x: butt.x + 46, y: butt.y - 40 }
  }

  private restPose(): Pose {
    const a = this.anchor
    const floor = this.height - 24
    const reach = Math.min(this.width * 0.5, Math.max(120, this.targets.effort.x - a.x - 90))
    const sway = this.reduced ? 0 : Math.sin(this.time * 1.25) * 7
    const lift = this.reduced ? 0 : Math.sin(this.time * 0.8 + 1) * 3
    return {
      c1: { x: a.x + reach * 0.32, y: a.y - this.height * 0.06 },
      c2: { x: a.x + reach * 0.55 + sway * 0.6, y: floor + lift },
      tip: { x: a.x + reach + sway, y: floor + lift * 0.4 },
    }
  }

  private windPose(): Pose {
    const a = this.anchor
    return {
      c1: { x: a.x + 30, y: a.y - this.height * 0.42 },
      c2: { x: a.x + 120, y: Math.max(8, a.y - this.height * 0.78) },
      tip: { x: a.x + 10, y: Math.max(14, a.y - this.height * 0.62) },
    }
  }

  private strikePose(target: Target): Pose {
    const a = this.anchor
    const s = this.targets[target]
    const dx = s.x - a.x
    return {
      c1: { x: a.x + dx * 0.28, y: a.y - this.height * 0.3 },
      c2: { x: s.x - dx * 0.32, y: s.y - this.height * 0.2 },
      tip: { x: s.x, y: s.y },
    }
  }

  private overshootPose(target: Target): Pose {
    const pose = this.strikePose(target)
    return {
      c1: { x: pose.c1.x + 10, y: pose.c1.y + this.height * 0.18 },
      c2: { x: pose.c2.x + 12, y: pose.c2.y + this.height * 0.16 },
      tip: { x: pose.tip.x + 10, y: pose.tip.y + 14 },
    }
  }

  private currentPose(): { pose: Pose; wave: number } {
    const rest = this.restPose()
    const strike = this.strike
    if (strike === null) return { pose: rest, wave: 0 }
    const t = strike.age / STRIKE_DURATION
    if (t < WIND_END) return { pose: lerpPose(rest, this.windPose(), easeOutCubic(t / WIND_END)), wave: 0 }
    if (t < CRACK_AT) {
      const k = (t - WIND_END) / (CRACK_AT - WIND_END)
      return { pose: lerpPose(this.windPose(), this.strikePose(strike.target), easeInCubic(k)), wave: Math.sin(k * Math.PI) }
    }
    const strikePose = this.strikePose(strike.target)
    if (t < 0.42) {
      const k = (t - CRACK_AT) / (0.42 - CRACK_AT)
      return { pose: lerpPose(strikePose, this.overshootPose(strike.target), easeOutCubic(k)), wave: 0.5 * (1 - k) }
    }
    const k = clamp01((t - 0.42) / 0.58)
    return { pose: lerpPose(this.overshootPose(strike.target), rest, easeInOut(k)), wave: 0 }
  }

  /** Los puntos del cuero, con la onda que recorre el latigo en el golpe. */
  private lashPoints(pose: Pose, wave: number): Point[] {
    const a = this.anchor
    const count = 72
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
        const offset = Math.sin(s * 9 - phase) * 9 * wave * Math.sin(Math.PI * s)
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
      if (!strike.cracked && strike.age >= STRIKE_DURATION * CRACK_AT) {
        strike.cracked = true
        this.crack(strike)
      }
      if (strike.age >= STRIKE_DURATION) this.strike = null
    }
    this.shake = Math.max(0, this.shake - delta * 28)
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

  private idleTwinkles(dt: number): void {
    if (this.level < 8 || this.strike !== null) return
    const rate = this.look.sparkDensity * (this.reduced ? 3 : 14)
    this.twinkleBudget += rate * dt
    if (this.twinkleBudget < 1) return
    const { pose } = this.currentPose()
    const points = this.lashPoints(pose, 0)
    while (this.twinkleBudget >= 1) {
      this.twinkleBudget -= 1
      const at = points[Math.floor(this.random() * points.length)]!
      this.particles.twinkle(at.x + (this.random() - 0.5) * 14, at.y - this.random() * 12, this.look)
    }
  }

  private crack(strike: Strike): void {
    const tip = this.targets[strike.target]
    const comboBoost = 1 + Math.min(strike.combo - 1, 10) * 0.18
    const levelBoost = strike.levelUp ? 2.6 : 1
    this.flashes.push({ x: tip.x, y: tip.y, age: 0, life: 0.22, radius: 26 + this.level * 2.4 })
    this.rings.push({ x: tip.x, y: tip.y, age: 0, life: 0.42, radius: 54 + this.level * 3, width: 3, color: this.look.glow })
    if (!this.reduced) this.rings.push({ x: tip.x, y: tip.y, age: -0.06, life: 0.5, radius: 80 + this.level * 4, width: 1.5, color: '#ffffff' })
    // Un solo grito a la vez: en los combos el nuevo reemplaza al anterior.
    this.texts.length = 0
    // En la subida de nivel el protagonista es el letrero del panel.
    if (!strike.levelUp) this.texts.push({ text: this.look.crack, x: tip.x - 70, y: tip.y - 52, age: 0, life: 0.85, size: 18 + Math.min(this.level, 14) * 0.7, color: this.look.glow })
    this.particles.burst({ x: tip.x, y: tip.y, look: this.look, level: this.level, boost: comboBoost * levelBoost, reduced: this.reduced, direction: Math.PI * 1.15, spread: Math.PI * 1.5 })
    if (strike.levelUp) this.levelUpBurst()
    if (!this.reduced && strike.combo >= 3) this.shake = Math.min(14, 3 + strike.combo * 0.9)
  }

  /** La fiesta de la subida de nivel: un abanico de chispas desde el centro. */
  private levelUpBurst(): void {
    const center = { x: this.targets.effort.x * 0.5, y: this.height * 0.5 }
    const look = lookFor(this.total)
    this.particles.burst({ x: center.x, y: center.y, look: { ...look, sparkDensity: Math.max(0.3, look.sparkDensity) }, level: Math.max(this.level, 8), boost: 2.2, reduced: this.reduced, direction: -Math.PI / 2, spread: Math.PI * 2, speed: 1.4 })
    this.rings.push({ x: center.x, y: center.y, age: 0, life: 0.9, radius: Math.max(this.width, this.height) * 0.42, width: 4, color: mixHex(look.glow, '#ffc933', 0.6) })
    this.rings.push({ x: center.x, y: center.y, age: -0.15, life: 0.9, radius: Math.max(this.width, this.height) * 0.3, width: 2, color: '#ffe9a0' })
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
    const floor = this.height - 14
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
    ctx.filter = 'blur(6px)'
    ctx.beginPath()
    const first = points[0]!
    const last = points[points.length - 1]!
    const left = Math.min(this.butt.x, first.x, last.x)
    const right = Math.max(first.x, last.x)
    ctx.ellipse((left + right) / 2, floor, Math.max(40, (right - left) / 2 + 10), 6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private glowStrength(): number {
    const crackBoost = this.flashes.length > 0 ? 10 : 0
    return 1 + (this.level - 1) * 1.7 + crackBoost
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
      ctx.lineWidth = lerp(7.5, 1.2, s ** 0.85)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    ctx.shadowBlur = 0
    // Trenzado: rayitas oscuras cruzadas sobre el cuero.
    ctx.strokeStyle = withAlpha(dark, 0.55)
    for (let i = 2; i < count * 0.8; i += 3) {
      const s = i / count
      const a = points[i]!
      const b = points[i + 1]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const length = Math.hypot(dx, dy) || 1
      const half = lerp(7.5, 1.2, s ** 0.85) * 0.5
      const nx = (-dy / length) * half
      const ny = (dx / length) * half
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(a.x + nx - dx * 0.3, a.y + ny - dy * 0.3)
      ctx.lineTo(a.x - nx + dx * 0.3, a.y - ny + dy * 0.3)
      ctx.stroke()
    }
    // Brillo a lo largo del lomo.
    ctx.strokeStyle = withAlpha(light, 0.35 + this.level * 0.02)
    ctx.lineWidth = 1.1
    ctx.beginPath()
    for (let i = 0; i < count * 0.9; i++) {
      const s = i / count
      const a = points[i]!
      const b = points[i + 1]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const length = Math.hypot(dx, dy) || 1
      const off = lerp(7.5, 1.2, s ** 0.85) * 0.22
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
      const length = 9 + Math.abs(spread) * 6
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
    const gradient = ctx.createLinearGradient(0, -6, 0, 6)
    gradient.addColorStop(0, mixHex(look.handle, '#ffffff', 0.25))
    gradient.addColorStop(0.5, look.handle)
    gradient.addColorStop(1, mixHex(look.handle, '#000000', 0.45))
    ctx.shadowColor = withAlpha(look.glow, 0.15 + this.level * 0.03)
    ctx.shadowBlur = this.glowStrength() * 0.6
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.roundRect(0, -5.5, length, 11, 5)
    ctx.fill()
    ctx.shadowBlur = 0
    // Amarres de cuero.
    ctx.strokeStyle = withAlpha(mixHex(look.handle, '#000000', 0.5), 0.75)
    ctx.lineWidth = 1.4
    for (let x = 10; x < length - 8; x += 6) {
      ctx.beginPath()
      ctx.moveTo(x, -5)
      ctx.lineTo(x + 3, 5)
      ctx.stroke()
    }
    // Pomo y virola: se van poniendo metalicos con el nivel.
    const metal = mixHex(look.handle, look.glow, Math.min(1, 0.2 + this.level * 0.06))
    ctx.fillStyle = metal
    ctx.beginPath()
    ctx.arc(-2, 0, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(length - 4, -6.5, 6, 13)
    ctx.fillStyle = withAlpha('#ffffff', 0.35)
    ctx.beginPath()
    ctx.arc(-4, -2.5, 2.2, 0, Math.PI * 2)
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
      ctx.arc(ring.x, ring.y, 6 + ring.radius * easeOutCubic(t), 0, Math.PI * 2)
      ctx.stroke()
    }
    for (const text of this.texts) {
      const t = text.age / text.life
      const scale = t < 0.15 ? 0.7 + (t / 0.15) * 0.45 : 1.15 - Math.min(0.15, (t - 0.15) * 0.3)
      ctx.save()
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
      ctx.translate(text.x, text.y - t * 22)
      ctx.rotate(-0.06)
      ctx.scale(scale, scale)
      ctx.font = `800 ${Math.round(text.size)}px ${this.fontFamily}`
      // Centrado sobre la punta, pero sin salirse del escenario.
      const half = ctx.measureText(text.text).width / 2
      const margin = 12
      const shift = Math.min(0, this.width - margin - (text.x + half)) + Math.max(0, margin - (text.x - half))
      ctx.translate(shift, 0)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(20, 12, 6, 0.85)'
      ctx.strokeText(text.text, 0, 0)
      ctx.fillStyle = text.color
      ctx.fillText(text.text, 0, 0)
      ctx.restore()
    }
    ctx.restore()
  }
}
