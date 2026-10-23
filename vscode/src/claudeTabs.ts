// Reconoce las conversaciones de Claude Code en VS Code. El panel de Claude
// Code no dibuja interfaz de plugins, asi que el latigo se muestra en su propio
// panel cuando la persona entra a una conversacion. Modulo puro: sin vscode.

/** El viewType con que Claude Code abre sus conversaciones en pestañas del editor. */
export const CLAUDE_CONVERSATION_VIEW_TYPE = 'claudeVSCodePanel'

/** La API de pestañas de VS Code le antepone `mainThreadWebview-` al viewType. */
export function isClaudeConversationViewType(viewType: string): boolean {
  return viewType === CLAUDE_CONVERSATION_VIEW_TYPE || viewType.endsWith(`-${CLAUDE_CONVERSATION_VIEW_TYPE}`)
}

/** Lo que importa de la pestaña activa: si es de Claude y cual es. */
export type ActiveTab = { isClaude: boolean; key: string } | null

/**
 * Sigue la pestaña activa y avisa una sola vez por cada entrada a una
 * conversacion de Claude (o al pasar de una conversacion a otra). Los eventos
 * repetidos de la misma pestaña no vuelven a avisar.
 */
export class ClaudeFocusTracker {
  private current: ActiveTab = null

  /** Devuelve true si con esta pestaña activa hay que mostrar el latigo. */
  update(tab: ActiveTab): boolean {
    const previous = this.current
    this.current = tab
    if (tab === null || !tab.isClaude) return false
    return previous === null || !previous.isClaude || previous.key !== tab.key
  }

  /** Vuelve a avisar en la proxima actualizacion (la ventana recupero el foco). */
  reset(): void {
    this.current = null
  }

  get isClaudeActive(): boolean {
    return this.current !== null && this.current.isClaude
  }
}
