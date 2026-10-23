/** 7000 → "7.000", como se escribe en Colombia; sin depender del ICU del entorno. */
export function formatCount(n: number): string {
  const value = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function plural(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "2026-10-22" → "22 oct 2026". */
export function formatDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (match === null) return day
  const month = MONTHS[Number(match[2]) - 1] ?? match[2]
  return `${Number(match[3])} ${month} ${match[1]}`
}
