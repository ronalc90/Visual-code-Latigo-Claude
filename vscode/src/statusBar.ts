import * as vscode from 'vscode'

import type { DesktopInfo } from './bridgeState'
import { COMMANDS } from './commandIds'
import type { StatusBarContent } from './statusBarFormat'
import { formatStatusBar } from './statusBarFormat'

/** El item de la derecha de la barra de estado: interruptor, nivel y un clic para abrir el panel. */
export class LatigoStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem
  private content: StatusBarContent = { text: '', tooltip: '' }

  constructor() {
    this.item = vscode.window.createStatusBarItem('latigo.status', vscode.StatusBarAlignment.Right, 100)
    this.item.name = 'Látigo'
    this.item.command = COMMANDS.open
  }

  update(enabled: boolean, total: number, desktop: DesktopInfo, visible: boolean): void {
    this.content = formatStatusBar(enabled, total, desktop)
    this.item.text = this.content.text
    this.item.tooltip = this.content.tooltip
    if (visible) this.item.show()
    else this.item.hide()
  }

  get text(): string {
    return this.content.text
  }

  dispose(): void {
    this.item.dispose()
  }
}
