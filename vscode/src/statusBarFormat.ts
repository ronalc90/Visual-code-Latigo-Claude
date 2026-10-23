import { progressFor } from '../../hooks/levels'
import { plural } from './format'

export type StatusBarContent = {
  text: string
  tooltip: string
}

/** Texto y tooltip del item de la barra de estado. */
export function formatStatusBar(enabled: boolean, total: number): StatusBarContent {
  const { tier, next, remaining, progress } = progressFor(total)
  const head = enabled ? `$(flame) Látigo · Nv ${tier.level}` : '$(circle-slash) Látigo · apagado'
  const lines = [
    enabled ? 'Látigo encendido' : 'Látigo apagado',
    `Nivel ${tier.level} · ${tier.name}`,
    next === null
      ? 'Nivel máximo: ya no hay más arriba'
      : `${Math.floor(progress * 100)} % · faltan ${plural(remaining, 'latigazo', 'latigazos')} para ${next.name}`,
    `Total: ${plural(total, 'latigazo', 'latigazos')}`,
    'Clic para abrir el panel',
  ]
  return { text: head, tooltip: lines.join('\n') }
}
