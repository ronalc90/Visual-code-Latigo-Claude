// Mira las pestañas de VS Code y avisa cuando la persona entra a una
// conversacion de Claude Code. La logica de cuando avisar vive en claudeTabs.

import * as vscode from 'vscode'

import type { ActiveTab } from './claudeTabs'
import { ClaudeFocusTracker, isClaudeConversationViewType } from './claudeTabs'
import { Emitter } from './events'

function describe(tab: vscode.Tab | undefined): ActiveTab {
  if (tab === undefined) return null
  const input = tab.input
  if (input instanceof vscode.TabInputWebview) {
    return { isClaude: isClaudeConversationViewType(input.viewType), key: `${tab.group.viewColumn}:${tab.label}` }
  }
  return { isClaude: false, key: tab.label }
}

export class ClaudeFocusWatcher implements vscode.Disposable {
  private readonly tracker = new ClaudeFocusTracker()
  private readonly entered = new Emitter<void>()
  private readonly disposables: vscode.Disposable[] = []

  /** Se dispara al entrar a una conversacion de Claude Code. */
  readonly onDidEnterClaude = this.entered.event

  start(): void {
    this.disposables.push(
      vscode.window.tabGroups.onDidChangeTabs(() => this.check()),
      vscode.window.tabGroups.onDidChangeTabGroups(() => this.check()),
      vscode.window.onDidChangeWindowState(state => {
        // Al volver a la ventana cuenta como entrar de nuevo.
        if (state.focused) {
          this.tracker.reset()
          this.check()
        }
      }),
    )
    this.check()
  }

  get isClaudeActive(): boolean {
    return this.tracker.isClaudeActive
  }

  private check(): void {
    if (this.tracker.update(describe(vscode.window.tabGroups.activeTabGroup.activeTab))) this.entered.fire()
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) disposable.dispose()
    this.entered.dispose()
  }
}
