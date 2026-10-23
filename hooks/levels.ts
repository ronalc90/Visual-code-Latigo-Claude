// Niveles del latigo. Modulo puro (sin $ ni Node): lo usan el mod de Claude Code
// y la extension de VS Code, asi los dos ven el mismo nivel y el mismo color.
//
// La idea es que el latigo mejore muy poco a poco: cada latigazo corre el color
// un poquito hacia el del nivel siguiente, y las particulas aparecen tarde y
// se van volviendo densas con los niveles altos.

export type Tier = {
  /** 1 a 14. */
  level: number
  name: string
  /** Latigazos totales para llegar a este nivel. */
  minLashes: number
  /** Mango del latigo. */
  handle: string
  /** Cuerpo del latigo (el que se va dorando). */
  lash: string
  /** Brillo de la punta y de las particulas. */
  glow: string
  /** Punta del latigo en el momento del golpe. */
  tip: string
  /** Lo que grita el latigazo. */
  crack: string
  /** Glifos de las particulas, del mas comun al mas raro. */
  sparks: readonly string[]
  /** 0 = sin particulas, 1 = lluvia de chispas. */
  sparkDensity: number
}

export const TIERS: readonly Tier[] = [
  { level: 1, name: 'Cuero crudo', minLashes: 0, handle: '#7a5232', lash: '#9a6a40', glow: '#b48a62', tip: '✸', crack: '¡CHAS!', sparks: [], sparkDensity: 0 },
  { level: 2, name: 'Cuero curtido', minLashes: 25, handle: '#7c5030', lash: '#a87040', glow: '#c09060', tip: '✸', crack: '¡CHAS!', sparks: [], sparkDensity: 0 },
  { level: 3, name: 'Trenzado', minLashes: 60, handle: '#7e4c2a', lash: '#b4773e', glow: '#cc965e', tip: '✸', crack: '¡CHAS!', sparks: ['·'], sparkDensity: 0.04 },
  { level: 4, name: 'Cobre', minLashes: 120, handle: '#7a4424', lash: '#b06a35', glow: '#d08850', tip: '✸', crack: '¡CHAS!', sparks: ['·', '˙'], sparkDensity: 0.07 },
  { level: 5, name: 'Bronce', minLashes: 220, handle: '#74462a', lash: '#cd7f32', glow: '#e5a060', tip: '✷', crack: '¡CHAS!!', sparks: ['·', '˙', '⋅'], sparkDensity: 0.1 },
  { level: 6, name: 'Plata vieja', minLashes: 380, handle: '#6a6a6e', lash: '#9a9a9e', glow: '#c8c8cc', tip: '✷', crack: '¡CHAS!!', sparks: ['·', '˙', '⋆'], sparkDensity: 0.13 },
  { level: 7, name: 'Plata', minLashes: 600, handle: '#76767e', lash: '#c0c0c8', glow: '#e8e8f0', tip: '✷', crack: '¡¡CHAS!!', sparks: ['·', '⋆', '✧'], sparkDensity: 0.17 },
  { level: 8, name: 'Oro pálido', minLashes: 900, handle: '#7a6638', lash: '#d8c070', glow: '#f0dc90', tip: '✦', crack: '¡¡CHAS!!', sparks: ['·', '⋆', '✧'], sparkDensity: 0.21 },
  { level: 9, name: 'Oro', minLashes: 1300, handle: '#8a6a24', lash: '#e6b800', glow: '#ffd84a', tip: '✦', crack: '¡¡CRACK!!', sparks: ['⋆', '✧', '✦'], sparkDensity: 0.26 },
  { level: 10, name: 'Oro brillante', minLashes: 1850, handle: '#7a5a14', lash: '#ffcc1a', glow: '#ffe066', tip: '✦', crack: '¡¡CRACK!!', sparks: ['⋆', '✧', '✦'], sparkDensity: 0.31 },
  { level: 11, name: 'Oro real', minLashes: 2600, handle: '#8a6410', lash: '#ffd700', glow: '#fff08a', tip: '✺', crack: '¡¡CHAAAS!!', sparks: ['✧', '✦', '✶'], sparkDensity: 0.37 },
  { level: 12, name: 'Dorado épico', minLashes: 3600, handle: '#9a7010', lash: '#ffe14d', glow: '#fff5b0', tip: '✺', crack: '✦¡¡CHAAAS!!✦', sparks: ['✧', '✦', '✶', '✷'], sparkDensity: 0.44 },
  { level: 13, name: 'Legendario', minLashes: 5000, handle: '#b08418', lash: '#ffeb80', glow: '#fffbe0', tip: '❂', crack: '✦¡¡CHAAAAS!!✦', sparks: ['✦', '✶', '✷', '❋'], sparkDensity: 0.52 },
  { level: 14, name: 'Divino', minLashes: 7000, handle: '#c8a030', lash: '#fff4b8', glow: '#ffffff', tip: '❂', crack: '❂¡¡CHAAAAS!!❂', sparks: ['✦', '✶', '✷', '❋', '✺'], sparkDensity: 0.62 },
]

export const MAX_LEVEL = TIERS.length

export type Progress = {
  tier: Tier
  /** El siguiente nivel, o null en el nivel maximo. */
  next: Tier | null
  /** 0 a 1: cuanto lleva del camino al siguiente nivel (1 en el maximo). */
  progress: number
  /** Latigazos que faltan para subir (0 en el maximo). */
  remaining: number
}

function safeTotal(total: number): number {
  return Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
}

export function progressFor(total: number): Progress {
  const lashes = safeTotal(total)
  let index = 0
  for (let i = 0; i < TIERS.length; i++) {
    if (lashes >= TIERS[i]!.minLashes) index = i
  }
  const tier = TIERS[index]!
  const next = TIERS[index + 1] ?? null
  if (next === null) return { tier, next, progress: 1, remaining: 0 }
  const span = next.minLashes - tier.minLashes
  return {
    tier,
    next,
    progress: (lashes - tier.minLashes) / span,
    remaining: next.minLashes - lashes,
  }
}

/** True si el latigazo numero `total` es el que sube de nivel. */
export function isLevelUp(previousTotal: number, total: number): boolean {
  return progressFor(total).tier.level > progressFor(previousTotal).tier.level
}

function parseHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('')
}

/** Mezcla dos colores #rrggbb; t = 0 da `from`, t = 1 da `to`. */
export function mixHex(from: string, to: string, t: number): string {
  const k = Math.min(1, Math.max(0, t))
  const a = parseHex(from)
  const b = parseHex(to)
  return toHex([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k])
}

export type Look = {
  handle: string
  lash: string
  glow: string
  tip: string
  crack: string
  sparks: readonly string[]
  sparkDensity: number
}

/**
 * Como se ve el latigo con `total` latigazos: los colores y la densidad de
 * particulas avanzan un poquito con cada latigazo hacia los del nivel siguiente.
 */
export function lookFor(total: number): Look {
  const { tier, next, progress } = progressFor(total)
  if (next === null) {
    return { handle: tier.handle, lash: tier.lash, glow: tier.glow, tip: tier.tip, crack: tier.crack, sparks: tier.sparks, sparkDensity: tier.sparkDensity }
  }
  return {
    handle: mixHex(tier.handle, next.handle, progress),
    lash: mixHex(tier.lash, next.lash, progress),
    glow: mixHex(tier.glow, next.glow, progress),
    tip: tier.tip,
    crack: tier.crack,
    sparks: tier.sparks,
    sparkDensity: tier.sparkDensity + (next.sparkDensity - tier.sparkDensity) * progress,
  }
}

/** Generador pseudoaleatorio con semilla (mulberry32): mismas chispas para el mismo cuadro. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Una fila de particulas de `width` celdas para el cuadro `frame`. `boost`
 * multiplica la densidad (el golpe y la subida de nivel echan mas chispas).
 * Sin particulas en el nivel, la fila es solo espacios.
 */
export function sparkRow(look: Look, width: number, frame: number, boost = 1): string {
  if (look.sparks.length === 0 || look.sparkDensity <= 0 || width <= 0) return ' '.repeat(Math.max(0, width))
  const random = seededRandom(frame * 7919 + width)
  const density = Math.min(0.9, look.sparkDensity * boost)
  let row = ''
  for (let i = 0; i < width; i++) {
    if (random() < density) {
      // Los glifos raros (al final de la lista) salen menos.
      const pick = Math.floor(random() ** 1.6 * look.sparks.length)
      row += look.sparks[Math.min(pick, look.sparks.length - 1)]
    } else {
      row += ' '
    }
  }
  return row
}

/** Barra de progreso al siguiente nivel, en `width` celdas. */
export function progressBar(progress: number, width: number): string {
  const filled = Math.round(Math.min(1, Math.max(0, progress)) * width)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}
