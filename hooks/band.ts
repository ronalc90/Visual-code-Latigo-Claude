// Lo que dibuja la banda del terminal: los cuadros del latigo, sus colores por
// tramo y la tabla de /latigo. Modulo puro; el dibujo con elementos lo hace
// register.tsx.

import type { Look, Progress } from './levels'
import { progressBar, progressFor } from './levels'
import type { Effort, Stats } from './model'
import { topDays } from './model'

/** Un tramo de texto con su papel: el color lo pone quien dibuja. */
export type WhipPart = { text: string; role: 'handle' | 'lash' | 'tip' }

type Shape = { body: number; wave: number; tip: boolean; crack: boolean }

/** Cuadros del latigazo: se estira, revienta y se recoge. */
const SHAPES: readonly Shape[] = [
  { body: 1, wave: 0, tip: false, crack: false },
  { body: 2, wave: 1, tip: false, crack: false },
  { body: 3, wave: 2, tip: false, crack: false },
  { body: 4, wave: 3, tip: false, crack: false },
  { body: 5, wave: 4, tip: false, crack: false },
  { body: 6, wave: 5, tip: true, crack: false },
  { body: 6, wave: 5, tip: true, crack: true },
  { body: 6, wave: 5, tip: true, crack: true },
  { body: 6, wave: 5, tip: true, crack: true },
  { body: 5, wave: 4, tip: true, crack: false },
  { body: 3, wave: 2, tip: false, crack: false },
]

export const FRAME_COUNT = SHAPES.length

/** Desde este cuadro el golpe ya pego: el blanco brilla. */
export const IMPACT_FROM = 5

/** Ancho fijo de la zona del latigo, para que los botones no bailen. */
export const WHIP_WIDTH = 15

/** Ancho de la fila de arriba: chispas y el grito del golpe. */
export const SKY_WIDTH = 30

const IDLE: Shape = { body: 1, wave: 1, tip: false, crack: false }

function shapeOf(frame: number | null): Shape {
  return frame === null ? IDLE : (SHAPES[frame] ?? IDLE)
}

export function whipParts(look: Look, frame: number | null): WhipPart[] {
  const shape = shapeOf(frame)
  const parts: WhipPart[] = [
    { text: '╾', role: 'handle' },
    { text: '━'.repeat(shape.body) + '~'.repeat(shape.wave), role: 'lash' },
  ]
  if (shape.tip) parts.push({ text: look.tip, role: 'tip' })
  return parts
}

export function partsWidth(parts: readonly WhipPart[]): number {
  return parts.reduce((n, part) => n + [...part.text].length, 0)
}

/**
 * La fila de arriba: chispas, y en el golpe el grito saliendo de la punta.
 * Siempre mide `SKY_WIDTH`, asi la banda no cambia de alto ni de ancho.
 */
export function skyRow(look: Look, frame: number | null, sparks: string): { before: string; crack: string; after: string } {
  const cells = [...sparks.padEnd(SKY_WIDTH, ' ')].slice(0, SKY_WIDTH)
  if (frame === null || !shapeOf(frame).crack) return { before: cells.join(''), crack: '', after: '' }
  const at = Math.min(partsWidth(whipParts(look, frame)) - 1, SKY_WIDTH - 1)
  const crack = [...look.crack].slice(0, SKY_WIDTH - at)
  return {
    before: cells.slice(0, at).join(''),
    crack: crack.join(''),
    after: cells.slice(at + crack.length).join(''),
  }
}

export type BandLayout = {
  barWidth: number
  badge: string
  showTotal: boolean
  comboText: string
}

/**
 * Decide que cabe en `columns` celdas. Se va soltando en este orden: la barra
 * de progreso, el conteo de latigazos, el nombre del nivel y el grito del
 * combo. El latigo, los dos blancos y el boton de apagar siempre quedan.
 */
export function layoutBand(input: {
  columns: number
  modelLabel: string
  effortLabel: string
  combo: number
  comboTitle: string
  progress: Progress
  totalText: string
  toggleLabel: string
}): BandLayout {
  const width = (text: string) => [...text].length
  const fixed = WHIP_WIDTH + width(input.modelLabel) + 4 + 1 + width(input.effortLabel) + 4 + 1 + width(input.toggleLabel) + 4
  const comboFull = input.combo >= 2 ? `x${input.combo} ${input.comboTitle} ` : ''
  const comboShort = input.combo >= 2 ? `x${input.combo} ` : ''
  const level = input.progress.tier.level
  const options: BandLayout[] = [
    { barWidth: 10, badge: levelBadge(input.progress, 10), showTotal: true, comboText: comboFull },
    { barWidth: 0, badge: levelBadge(input.progress, 0), showTotal: true, comboText: comboFull },
    { barWidth: 0, badge: levelBadge(input.progress, 0), showTotal: false, comboText: comboFull },
    { barWidth: 0, badge: `Nv ${level}`, showTotal: false, comboText: comboFull },
    { barWidth: 0, badge: `Nv ${level}`, showTotal: false, comboText: comboShort },
  ]
  const need = (layout: BandLayout) => fixed + width(layout.comboText) + width(layout.badge) + 1 + (layout.showTotal ? width(input.totalText) : 0)
  return options.find(layout => need(layout) <= input.columns) ?? options[options.length - 1]!
}

export function comboColor(combo: number): string {
  if (combo >= 10) return 'magentaBright'
  if (combo >= 5) return 'redBright'
  if (combo >= 3) return 'yellowBright'
  return 'yellow'
}

/** `Nv 5 Bronce ▕███░░░▏` en el ancho que haya. */
export function levelBadge(progress: Progress, barWidth: number): string {
  const head = `Nv ${progress.tier.level} ${progress.tier.name}`
  return barWidth > 0 ? `${head} ${progressBar(progress.progress, barWidth)}` : head
}

/** La tabla que muestra /latigo. */
export function statsTable(stats: Stats, today: string, boost: Effort | null, enabled: boolean): string {
  const progress = progressFor(stats.total)
  const nextLine = progress.next === null
    ? 'Nivel máximo. No hay nada más arriba.'
    : `Faltan ${progress.remaining} para ${progress.next.name} (Nv ${progress.next.level})`
  const lines = [
    `## Tabla del látigo · ${enabled ? 'encendido' : 'apagado'}`,
    '',
    `**Nv ${progress.tier.level} · ${progress.tier.name}** \`${progressBar(progress.progress, 20)}\` ${nextLine}`,
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
  const days = topDays(stats, 5)
  if (days.length > 0) {
    lines.push('', '### Días con más latigazos', '', '| # | Dia | Latigazos |', '|---:|---|---:|')
    days.forEach(([day, n], i) => lines.push(`| ${i + 1} | ${day} | ${n} |`))
  }
  lines.push(
    '',
    '### Top global · próximamente',
    '',
    '_El ranking con apodo entre todos los que usan el látigo llega en una próxima versión._',
    '',
    '`/latigo on` · `/latigo off` · `/latigo calma` · `/latigo sonidos` · `/latigo ayuda`',
  )
  return lines.join('\n')
}

export const HELP_TEXT = [
  '## Látigo · ayuda',
  '',
  '| Comando | Hace |',
  '|---|---|',
  '| `/latigo` | Tu tabla: nivel, latigazos, combos y días |',
  '| `/latigo on` · `/latigo off` | Prende o apaga el látigo (también en VS Code) |',
  '| `/latigo calma` | Quita el effort que forzó el látigo |',
  '| `/latigazo` | Latigazo al effort: lo sube un nivel |',
  '| `/latigo sonido` | Prende o apaga el sonido |',
  '| `/latigo sonidos` | Los sonidos para elegir (grabaciones reales y sintéticos) |',
  '| `/latigo sonido real-4` | Elige un sonido |',
  '',
  'En la banda: clic en el modelo (solo visual) o en el effort (lo sube un nivel). Con la banda enfocada (`ctrl+x tab`): `e` effort, `m` modelo, `o` prende/apaga.',
].join('\n')
