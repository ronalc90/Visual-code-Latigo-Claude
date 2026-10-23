// Reglas del juego, compartidas por el mod de Claude Code y la extension de
// VS Code. Modulo puro: sin $, sin Node, sin DOM.

import type { Effort, Stats, Target } from '../types'

// Los tipos viven en types/index.d.ts (el contrato del mod); se reexportan
// para que la extension de VS Code los tome de aqui.
export type { Effort, Stats, Target }

export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

/** Lo que se asume cuando todavia no se sabe el effort de la sesion. */
export const DEFAULT_EFFORT: Effort = 'medium'

/** Dos latigazos dentro de esta ventana suman combo. */
export const COMBO_WINDOW_MS = 1500

/** Conteos en cero. Congelado: quien necesite uno para modificar, que use `normalizeStats`. */
export const EMPTY_STATS: Stats = Object.freeze({ total: 0, onModel: 0, onEffort: 0, bestCombo: 0, byDay: Object.freeze({}) as Record<string, number> })

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

/** Sube `steps` niveles sin pasar de max. */
export function raiseEffortBy(current: Effort, steps: number): Effort {
  const rank = Math.min(EFFORTS.length - 1, effortRank(current) + Math.max(0, Math.floor(steps)))
  return EFFORTS[rank]!
}

/** El effort que de verdad sale: el mayor entre el de la sesion y el que fuerza el latigo. */
export function effectiveEffort(session: Effort | null, forced: Effort | null): Effort | null {
  if (forced === null) return session
  if (session === null) return forced
  return effortRank(forced) > effortRank(session) ? forced : session
}

/** True si el latigo esta subiendo el effort por encima del de la sesion (el ⚡). */
export function isForcing(session: Effort | null, forced: Effort | null): boolean {
  return forced !== null && (session === null || effortRank(forced) > effortRank(session))
}

/** El combo sigue si el latigazo anterior cayo dentro de la ventana. */
export function nextCombo(previousAt: number | null, previousCombo: number, now: number): number {
  return previousAt !== null && now >= previousAt && now - previousAt <= COMBO_WINDOW_MS ? previousCombo + 1 : 1
}

export function comboTitle(combo: number): string {
  if (combo >= 20) return '¡¡DIOS DEL LÁTIGO!!'
  if (combo >= 10) return '¡LEYENDA!'
  if (combo >= 7) return '¡IMPARABLE!'
  if (combo >= 5) return '¡FURIA!'
  if (combo >= 3) return '¡TRIPLE!'
  if (combo === 2) return '¡DOBLE!'
  return ''
}

/** Fecha local (YYYY-MM-DD) del instante `now` en ms, con el desfase de `Date#getTimezoneOffset`. */
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

function count(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

/** Acepta lo que venga de disco o del store y lo deja con forma de Stats. */
export function normalizeStats(value: unknown): Stats {
  if (typeof value !== 'object' || value === null) return { ...EMPTY_STATS, byDay: {} }
  const raw = value as Partial<Record<keyof Stats, unknown>>
  const byDay: Record<string, number> = {}
  if (typeof raw.byDay === 'object' && raw.byDay !== null) {
    for (const [day, n] of Object.entries(raw.byDay)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) byDay[day] = count(n)
    }
  }
  return {
    total: count(raw.total),
    onModel: count(raw.onModel),
    onEffort: count(raw.onEffort),
    bestCombo: count(raw.bestCombo),
    byDay,
  }
}

/**
 * Junta dos copias de las estadisticas quedandose con el mayor de cada campo.
 * Los conteos solo crecen, asi que el mayor es el mas reciente; sirve para
 * reconciliar la copia del store con la del archivo compartido.
 */
export function mergeStats(a: Stats, b: Stats): Stats {
  const byDay: Record<string, number> = { ...a.byDay }
  for (const [day, n] of Object.entries(b.byDay)) byDay[day] = Math.max(byDay[day] ?? 0, n)
  return {
    total: Math.max(a.total, b.total),
    onModel: Math.max(a.onModel, b.onModel),
    onEffort: Math.max(a.onEffort, b.onEffort),
    bestCombo: Math.max(a.bestCombo, b.bestCombo),
    byDay,
  }
}

/** Los `limit` dias con mas latigazos, del mayor al menor (empate: el mas reciente primero). */
export function topDays(stats: Stats, limit: number): Array<[string, number]> {
  return Object.entries(stats.byDay)
    .filter(([, n]) => n > 0)
    .sort(([dayA, a], [dayB, b]) => b - a || dayB.localeCompare(dayA))
    .slice(0, limit)
}
