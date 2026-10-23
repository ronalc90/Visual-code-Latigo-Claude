import type { Effort, Stats, Target } from '../types'

export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

/** Dos latigazos dentro de esta ventana suman combo. */
export const COMBO_WINDOW_MS = 1500

/** Cuadros del latigo: se estira, revienta y se queda vibrando. */
export const WHIP_FRAMES: readonly string[] = [
  '╾━',
  '╾━━~',
  '╾━━━~~',
  '╾━━━━~~~',
  '╾━━━━━~~~~',
  '╾━━━━━━~~~~~✸',
  '╾━━━━━━~~~~~✸ ¡CHAS!',
  '╾━━━━━━~~~~~✸ ¡CHAS!',
  '╾━━━━━~~~~ ✸',
  '╾━━━~~',
]

export const IMPACT_FROM = 5

export const EMPTY_STATS: Stats = { total: 0, onModel: 0, onEffort: 0, bestCombo: 0, byDay: {} }

export function isEffort(value: unknown): value is Effort {
  return typeof value === 'string' && (EFFORTS as readonly string[]).includes(value)
}

export function effortRank(effort: Effort): number {
  return EFFORTS.indexOf(effort)
}

/** El siguiente nivel de effort, o null si ya esta en max. */
export function raiseEffort(current: Effort): Effort | null {
  return EFFORTS[effortRank(current) + 1] ?? null
}

/** El combo sigue si el latigazo anterior cayo dentro de la ventana. */
export function nextCombo(previousAt: number | null, previousCombo: number, now: number): number {
  return previousAt !== null && now - previousAt <= COMBO_WINDOW_MS ? previousCombo + 1 : 1
}

export function comboTitle(combo: number): string {
  if (combo >= 20) return '¡¡DIOS DEL LATIGO!!'
  if (combo >= 10) return '¡LEYENDA!'
  if (combo >= 7) return '¡IMPARABLE!'
  if (combo >= 5) return '¡FURIA!'
  if (combo >= 3) return '¡TRIPLE!'
  if (combo === 2) return '¡DOBLE!'
  return ''
}

export function comboColor(combo: number): string {
  if (combo >= 10) return 'magentaBright'
  if (combo >= 5) return 'redBright'
  if (combo >= 3) return 'yellowBright'
  return 'yellow'
}

/** Fecha local (YYYY-MM-DD) del instante en milisegundos. */
export function dayOf(now: number, offsetMinutes: number): string {
  return new Date(now - offsetMinutes * 60_000).toISOString().slice(0, 10)
}

export function recordLash(stats: Stats, target: Target, combo: number, day: string): Stats {
  return {
    total: stats.total + 1,
    onModel: stats.onModel + (target === 'model' ? 1 : 0),
    onEffort: stats.onEffort + (target === 'effort' ? 1 : 0),
    bestCombo: Math.max(stats.bestCombo, combo),
    byDay: { ...stats.byDay, [day]: (stats.byDay[day] ?? 0) + 1 },
  }
}

/** Acepta lo que venga del store y lo deja con forma de Stats. */
export function normalizeStats(value: unknown): Stats {
  if (typeof value !== 'object' || value === null) return EMPTY_STATS
  const raw = value as Partial<Stats>
  const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0)
  const byDay: Record<string, number> = {}
  if (typeof raw.byDay === 'object' && raw.byDay !== null) {
    for (const [day, n] of Object.entries(raw.byDay)) byDay[day] = count(n)
  }
  return {
    total: count(raw.total),
    onModel: count(raw.onModel),
    onEffort: count(raw.onEffort),
    bestCombo: count(raw.bestCombo),
    byDay,
  }
}

/** La tabla que muestra /latigo: totales y los dias con mas latigazos. */
export function statsTable(stats: Stats, today: string, boost: Effort | null): string {
  const topDays = Object.entries(stats.byDay)
    .sort(([dayA, a], [dayB, b]) => b - a || dayB.localeCompare(dayA))
    .slice(0, 5)
  const lines = [
    '## Tabla del latigo',
    '',
    '| | |',
    '|---|---:|',
    `| Latigazos en total | ${stats.total} |`,
    `| Hoy | ${stats.byDay[today] ?? 0} |`,
    `| Al effort | ${stats.onEffort} |`,
    `| Al modelo | ${stats.onModel} |`,
    `| Mejor combo | x${stats.bestCombo} |`,
    `| Effort forzado ahora | ${boost ?? 'ninguno'} |`,
  ]
  if (topDays.length > 0) {
    lines.push('', '### Dias con mas latigazos', '', '| # | Dia | Latigazos |', '|---:|---|---:|')
    topDays.forEach(([day, n], i) => lines.push(`| ${i + 1} | ${day} | ${n} |`))
  }
  lines.push('', '`/latigo calma` deja el effort como estaba.')
  return lines.join('\n')
}
