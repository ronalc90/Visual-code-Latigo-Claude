// Ajustes `latigo.*` de VS Code. El interruptor no vive aqui sino en
// config.json, porque lo comparte con Claude Code.

import type { ReducedMotion } from './protocol'

export type ExtensionSettings = {
  /** Mostrar el panel del latigo al entrar a una conversacion de Claude Code. */
  showWithClaude: boolean
  showStatusBar: boolean
  reducedMotion: ReducedMotion
  volume: number
}

export const DEFAULT_SETTINGS: ExtensionSettings = { showWithClaude: true, showStatusBar: true, reducedMotion: 'auto', volume: 0.7 }

/** Lo minimo de `vscode.WorkspaceConfiguration` que se necesita. */
export interface SettingsSource {
  get<T>(key: string): T | undefined
}

export function readSettings(source: SettingsSource): ExtensionSettings {
  const showWithClaude = source.get<unknown>('showWithClaude')
  const showStatusBar = source.get<unknown>('showStatusBar')
  const reducedMotion = source.get<unknown>('reducedMotion')
  const volume = source.get<unknown>('volume')
  return {
    showWithClaude: typeof showWithClaude === 'boolean' ? showWithClaude : DEFAULT_SETTINGS.showWithClaude,
    showStatusBar: typeof showStatusBar === 'boolean' ? showStatusBar : DEFAULT_SETTINGS.showStatusBar,
    reducedMotion: reducedMotion === 'on' || reducedMotion === 'off' || reducedMotion === 'auto' ? reducedMotion : DEFAULT_SETTINGS.reducedMotion,
    volume: typeof volume === 'number' && Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_SETTINGS.volume,
  }
}
