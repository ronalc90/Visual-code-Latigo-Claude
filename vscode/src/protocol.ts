// Mensajes entre la extension y el webview del panel. Lo comparten los dos
// lados; el host valida todo lo que llega porque el webview es otro proceso.

import type { Effort, Stats, Target } from '../../hooks/model'

export type ReducedMotion = 'auto' | 'on' | 'off'

export type ViewState = {
  enabled: boolean
  sound: boolean
  /** 0 a 1. */
  volume: number
  reducedMotion: ReducedMotion
  stats: Stats
  /** Latigazos de hoy (dia local). */
  today: number
  topDays: Array<[string, number]>
  session: {
    alive: boolean
    model: string | null
    effort: Effort | null
    boost: Effort | null
  }
}

/** Un latigazo para animar en el panel. */
export type LashAnimation = {
  id: string
  target: Target
  combo: number
  comboTitle: string
  total: number
  levelUp: boolean
  /** Solo para latigazos al effort dados en VS Code. */
  reachedSession: boolean
  sound: boolean
  source: 'vscode' | 'terminal'
}

export type HostMessage = { type: 'state'; state: ViewState } | { type: 'lash'; lash: LashAnimation }

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'lash'; target: Target }
  | { type: 'setEnabled'; enabled: boolean }
  | { type: 'setSound'; sound: boolean }
  | { type: 'installPlugin' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Devuelve el mensaje si es uno de los conocidos y bien formado; si no, null. */
export function parseWebviewMessage(value: unknown): WebviewMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  const keys = Object.keys(value)
  const only = (...allowed: string[]) => keys.every(key => key === 'type' || allowed.includes(key))
  switch (value.type) {
    case 'ready':
      return only() ? { type: 'ready' } : null
    case 'installPlugin':
      return only() ? { type: 'installPlugin' } : null
    case 'lash':
      return only('target') && (value.target === 'model' || value.target === 'effort') ? { type: 'lash', target: value.target } : null
    case 'setEnabled':
      return only('enabled') && typeof value.enabled === 'boolean' ? { type: 'setEnabled', enabled: value.enabled } : null
    case 'setSound':
      return only('sound') && typeof value.sound === 'boolean' ? { type: 'setSound', sound: value.sound } : null
    default:
      return null
  }
}
