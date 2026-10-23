// Sistema de particulas del latigazo: chispas con gravedad, roce y desvanecido.
// La riqueza (formas y glifos) crece con el nivel; la cantidad sale de
// `look.sparkDensity`, la misma densidad que usa la banda de la terminal.

import type { Look } from '../../hooks/levels'
import { mixHex } from '../../hooks/levels'

export type ParticleKind = 'dust' | 'dot' | 'star' | 'glyph' | 'twinkle' | 'ember'

export type Particle = {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  /** Segundos vividos. */
  age: number
  life: number
  size: number
  color: string
  glyph: string
  rotation: number
  spin: number
  gravity: number
}

export type BurstOptions = {
  x: number
  y: number
  look: Look
  level: number
  /** Multiplica la cantidad (combos y subidas de nivel). */
  boost: number
  reduced: boolean
  /** Angulo central de salida (radianes) y apertura. */
  direction?: number
  spread?: number
  speed?: number
}

const MAX_PARTICLES = 900

export class ParticleSystem {
  readonly particles: Particle[] = []

  constructor(private readonly random: () => number) {}

  private between(min: number, max: number): number {
    return min + (max - min) * this.random()
  }

  private add(particle: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
    this.particles.push(particle)
  }

  /** Cuantas chispas echa un latigazo con este look. */
  static burstCount(look: Look, boost: number, reduced: boolean): number {
    const base = reduced ? 3 : 8
    const scale = reduced ? 40 : 170
    return Math.round(base + look.sparkDensity * scale * boost)
  }

  private kindFor(level: number, look: Look): ParticleKind {
    if (look.sparkDensity <= 0) return 'dust'
    const roll = this.random()
    if (level >= 8 && look.sparks.length > 0 && roll < 0.22) return 'glyph'
    if (level >= 6 && roll < 0.5) return 'star'
    if (level >= 4 && roll < 0.62) return 'ember'
    return 'dot'
  }

  burst(options: BurstOptions): void {
    const { look, level, reduced } = options
    const count = ParticleSystem.burstCount(look, options.boost, reduced)
    const direction = options.direction ?? -Math.PI / 2
    const spread = options.spread ?? Math.PI * 1.6
    const speed = options.speed ?? 1
    for (let i = 0; i < count; i++) {
      const kind = this.kindFor(level, look)
      const angle = direction + (this.random() - 0.5) * spread
      const velocity = (kind === 'dust' ? this.between(30, 110) : this.between(120, 420)) * speed
      const hot = this.random()
      const color =
        kind === 'dust'
          ? mixHex(look.handle, look.lash, this.random())
          : hot < 0.14 && level >= 9
            ? '#ffffff'
            : level >= 11
              ? // Arriba el cuero ya es casi blanco: las chispas se quedan doradas.
                mixHex(mixHex(look.lash, look.glow, this.random()), '#ffc21a', 0.25 + this.random() * 0.35)
              : mixHex(look.lash, look.glow, 0.35 + this.random() * 0.65)
      const glyphIndex = Math.min(look.sparks.length - 1, Math.floor(this.random() ** 1.6 * look.sparks.length))
      this.add({
        kind,
        x: options.x + this.between(-4, 4),
        y: options.y + this.between(-4, 4),
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        age: 0,
        life: kind === 'dust' ? this.between(0.35, 0.7) : this.between(0.45, 1.25),
        size: kind === 'glyph' ? this.between(10, 15 + level * 0.5) : kind === 'star' ? this.between(2.5, 4.5 + level * 0.15) : kind === 'dust' ? this.between(1.5, 3.2) : this.between(1.4, 2.8 + level * 0.08),
        color,
        glyph: look.sparks[Math.max(0, glyphIndex)] ?? '✦',
        rotation: this.random() * Math.PI,
        spin: this.between(-6, 6),
        gravity: kind === 'dust' ? 120 : kind === 'glyph' ? 260 : 520,
      })
    }
  }

  /** Un destello suave en reposo (niveles altos). */
  twinkle(x: number, y: number, look: Look): void {
    this.add({
      kind: 'twinkle',
      x,
      y,
      vx: this.between(-8, 8),
      vy: this.between(-26, -8),
      age: 0,
      life: this.between(0.9, 1.8),
      size: this.between(1.6, 3.4),
      color: mixHex(look.glow, '#ffffff', this.random() * 0.6),
      glyph: '',
      rotation: this.random() * Math.PI,
      spin: this.between(-1.5, 1.5),
      gravity: -6,
    })
  }

  step(dt: number): void {
    const drag = Math.exp(-2.2 * dt)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!
      p.age += dt
      if (p.age >= p.life) {
        this.particles.splice(i, 1)
        continue
      }
      p.vx *= drag
      p.vy = p.vy * drag + p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rotation += p.spin * dt
    }
  }

  clear(): void {
    this.particles.length = 0
  }
}

function drawStar(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const radius = i % 2 === 0 ? size * 2.2 : size * 0.55
    const angle = (i * Math.PI) / 4
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
  }
  ctx.closePath()
  ctx.fill()
}

/** `additive` suma luz (temas oscuros); en temas claros se pinta normal para que se vea. */
export function drawParticles(ctx: CanvasRenderingContext2D, particles: readonly Particle[], fontFamily: string, additive: boolean): void {
  const blend: GlobalCompositeOperation = additive ? 'lighter' : 'source-over'
  ctx.save()
  ctx.globalCompositeOperation = blend
  for (const p of particles) {
    const t = p.age / p.life
    const alpha = p.kind === 'twinkle' ? Math.sin(Math.PI * t) : (1 - t) ** 1.4
    if (alpha <= 0.01) continue
    ctx.globalAlpha = alpha
    ctx.fillStyle = p.color
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)
    switch (p.kind) {
      case 'glyph':
        ctx.font = `${Math.round(p.size)}px ${fontFamily}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.glyph, 0, 0)
        break
      case 'star':
      case 'twinkle':
        drawStar(ctx, p.size * (p.kind === 'twinkle' ? 0.8 : 1))
        break
      case 'ember': {
        // Una estela corta en la direccion del movimiento.
        ctx.rotate(-p.rotation + Math.atan2(p.vy, p.vx))
        const length = Math.min(14, Math.hypot(p.vx, p.vy) * 0.03 + 2)
        ctx.fillRect(-length, -p.size / 2, length, p.size)
        break
      }
      case 'dust':
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = alpha * 0.55
        ctx.beginPath()
        ctx.arc(0, 0, p.size * (1 + t), 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = blend
        break
      default:
        ctx.beginPath()
        ctx.arc(0, 0, p.size, 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.restore()
  }
  ctx.restore()
}
