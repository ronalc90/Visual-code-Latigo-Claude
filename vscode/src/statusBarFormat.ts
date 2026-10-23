import { progressFor } from '../../hooks/levels'
import type { DesktopInfo } from './bridgeState'
import { plural } from './format'

export type StatusBarContent = {
  text: string
  tooltip: string
}

const DESKTOP_CLOSED: DesktopInfo = { alive: false, whipMode: false }

/** Texto y tooltip del item de la barra de estado. */
export function formatStatusBar(enabled: boolean, total: number, desktop: DesktopInfo = DESKTOP_CLOSED): StatusBarContent {
  const { tier, next, remaining, progress } = progressFor(total)
  const whipMode = enabled && desktop.alive && desktop.whipMode
  const head = !enabled ? '$(circle-slash) Látigo · apagado' : whipMode ? `$(zap) Modo látigo · Nv ${tier.level}` : `$(flame) Látigo · Nv ${tier.level}`
  const lines = [
    enabled ? 'Látigo encendido' : 'Látigo apagado',
    // Solo se menciona la app de escritorio cuando esta abierta.
    ...(enabled && desktop.alive ? [whipMode ? 'Modo látigo en pantalla: activo (Esc para salir)' : 'Modo látigo en pantalla: apagado'] : []),
    `Nivel ${tier.level} · ${tier.name}`,
    next === null
      ? 'Nivel máximo: ya no hay más arriba'
      : `${Math.floor(progress * 100)} % · faltan ${plural(remaining, 'latigazo', 'latigazos')} para ${next.name}`,
    `Total: ${plural(total, 'latigazo', 'latigazos')}`,
    'Clic para abrir el panel',
  ]
  return { text: head, tooltip: lines.join('\n') }
}
