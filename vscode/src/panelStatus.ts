// Lo que el panel dice del interruptor y de la app de escritorio, segun el
// estado. Modulo puro: lo usa el webview para pintar y las pruebas revisan
// cada caso sin abrir VS Code.

import type { ViewState } from './protocol'
import { DESKTOP_APP_KEY_LABEL } from './shortcuts'

type Desktop = ViewState['desktop']

/** En que anda la app de escritorio, visto desde el panel. */
export type DesktopCardKind =
  /** No es Mac: la tarjeta no se muestra. */
  | 'hidden'
  /** Abierta y el puntero es un latigo. */
  | 'whip'
  /** Abierta con el latigo apagado. */
  | 'idle'
  /** Abierta, y la app todavia no sigue el ultimo cambio del interruptor. */
  | 'switching'
  | 'closed'
  /** Se intento abrir y no se pudo: no esta instalada. */
  | 'missing'

export type DesktopCard = {
  kind: DesktopCardKind
  /** El color del punto: verde, gris o amarillo. */
  tone: 'live' | 'idle' | 'warn'
  status: string
  /** Una linea de ayuda debajo; vacia si no hace falta. */
  hint: string
  /** El boton que ofrece la tarjeta. */
  action: 'none' | 'open' | 'install'
  /** Aviso cuando otra app tiene el atajo global de la app; null si no aplica. */
  warning: string | null
}

const KEY = DESKTOP_APP_KEY_LABEL

const HIDDEN: DesktopCard = { kind: 'hidden', tone: 'idle', status: '', hint: '', action: 'none', warning: null }

/** La tarjeta «App de escritorio»: solo en Mac, y su estado sale de desktop.json. */
export function desktopCard(enabled: boolean, desktop: Desktop): DesktopCard {
  if (!desktop.supported) return HIDDEN
  if (!desktop.alive) {
    if (desktop.appMissing) {
      return {
        kind: 'missing',
        tone: 'warn',
        status: 'No está instalada',
        hint: 'Instálala y luego dale a Reintentar.',
        action: 'install',
        warning: null,
      }
    }
    return {
      kind: 'closed',
      tone: 'idle',
      status: 'Cerrada',
      hint: 'Ábrela y, con el látigo prendido, tu puntero será un látigo en toda la pantalla.',
      action: 'open',
      warning: null,
    }
  }
  // Abierta: el atajo global puede estar tomado por otra app.
  const hotkeyWorks = desktop.hotkey === 'ok'
  const warning = hotkeyWorks ? null : `Otra app usa ${KEY}: prende y apaga desde aquí o desde el menú de la app.`
  if (desktop.whipMode && enabled) {
    return {
      kind: 'whip',
      tone: 'live',
      status: 'Abierta · tu puntero es un látigo',
      hint: hotkeyWorks ? `Esc o ${KEY} apagan el látigo.` : 'Esc apaga el látigo.',
      action: 'none',
      warning,
    }
  }
  if (!desktop.whipMode && !enabled) {
    return {
      kind: 'idle',
      tone: 'idle',
      status: 'Abierta · el látigo está apagado',
      hint: hotkeyWorks ? `${KEY} o el interruptor de arriba lo prenden.` : 'El interruptor de arriba lo prende.',
      action: 'none',
      warning,
    }
  }
  // La app escribe su estado cada 2 s: un cambio recien hecho tarda un momento en verse.
  return {
    kind: 'switching',
    tone: desktop.whipMode ? 'live' : 'idle',
    status: enabled ? 'Abierta · prendiendo el látigo…' : 'Abierta · apagando el látigo…',
    hint: '',
    action: 'none',
    warning,
  }
}

/** La linea debajo del interruptor: que hace el latigo en este momento. */
export function switchHint(enabled: boolean, desktop: Desktop): string {
  if (!enabled) return 'Apagado: no suena, no anima y el effort vuelve a ser el de la sesión.'
  if (desktop.supported && desktop.alive && desktop.whipMode) {
    return 'Tu puntero es un látigo: cada clic sobre una conversación de Claude le sube el effort.'
  }
  const base = 'Prendido: cada latigazo al effort lo sube un nivel en Claude Code.'
  return desktop.supported && !desktop.alive ? `${base} Abre la app de escritorio y tu puntero será un látigo.` : base
}
