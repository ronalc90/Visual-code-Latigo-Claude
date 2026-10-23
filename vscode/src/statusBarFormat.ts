import { progressFor } from '../../hooks/levels'
import type { DesktopInfo } from './bridgeState'
import { plural } from './format'

export type StatusBarContent = {
  text: string
  tooltip: string
}

const DESKTOP_CLOSED: DesktopInfo = { alive: false, whipMode: false, hotkey: 'ok' }

/** Texto y tooltip del item de la barra de estado: el interruptor, el nivel y, si aplica, el puntero de latigo. */
export function formatStatusBar(enabled: boolean, total: number, desktop: DesktopInfo = DESKTOP_CLOSED): StatusBarContent {
  const { tier, next, remaining, progress } = progressFor(total)
  const head = enabled ? `$(flame) Látigo · Nv ${tier.level}` : '$(circle-slash) Látigo · apagado'
  const lines = [
    enabled ? 'Látigo prendido' : 'Látigo apagado',
    // La app de escritorio solo se menciona cuando de verdad tiene el puntero hecho latigo.
    ...(enabled && desktop.alive && desktop.whipMode ? ['Tu puntero es un látigo (app de escritorio)'] : []),
    `Nivel ${tier.level} · ${tier.name}`,
    next === null
      ? 'Nivel máximo: ya no hay más arriba'
      : `${Math.floor(progress * 100)} % · faltan ${plural(remaining, 'latigazo', 'latigazos')} para ${next.name}`,
    `Total: ${plural(total, 'latigazo', 'latigazos')}`,
    'Clic para abrir el panel',
  ]
  return { text: head, tooltip: lines.join('\n') }
}
