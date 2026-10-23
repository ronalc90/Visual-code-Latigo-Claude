import * as vscode from 'vscode'

import { VIEW_ID } from '../commandIds'
import type { HostMessage, LashAnimation, ViewState, WebviewMessage } from '../protocol'
import { parseWebviewMessage } from '../protocol'
import { createNonce, renderPanelHtml } from './html'

/** Lo que el panel le pide a la extension; lo implementa el cableado de extension.ts. */
export interface PanelHost {
  currentState(): ViewState
  handleMessage(message: WebviewMessage): void
}

/** El panel "Látigo" de la barra lateral. Solo pinta y reenvia mensajes validados. */
export class LatigoViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined
  private ready = false
  private readonly disposables: vscode.Disposable[] = []

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly host: PanelHost,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    this.ready = false
    const media = vscode.Uri.joinPath(this.extensionUri, 'media')
    const dist = vscode.Uri.joinPath(this.extensionUri, 'dist')
    view.webview.options = { enableScripts: true, localResourceRoots: [media, dist] }
    view.webview.html = renderPanelHtml({
      cspSource: view.webview.cspSource,
      nonce: createNonce(),
      scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js')).toString(),
      styleUri: view.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.css')).toString(),
      crackSoundUri: view.webview.asWebviewUri(vscode.Uri.joinPath(media, 'latigo.wav')).toString(),
      levelSoundUri: view.webview.asWebviewUri(vscode.Uri.joinPath(media, 'nivel.wav')).toString(),
    })
    this.disposables.push(
      view.webview.onDidReceiveMessage((raw: unknown) => {
        const message = parseWebviewMessage(raw)
        if (message === null) return
        if (message.type === 'ready') {
          this.ready = true
          this.postState(this.host.currentState())
          return
        }
        this.host.handleMessage(message)
      }),
      view.onDidDispose(() => {
        this.view = undefined
        this.ready = false
      }),
    )
  }

  /**
   * Muestra el panel sin quitarle el foco a lo que la persona tiene activo (la
   * conversacion de Claude Code), asi puede seguir escribiendo.
   */
  async reveal(): Promise<void> {
    if (this.view !== undefined) {
      if (!this.view.visible) this.view.show(true)
      return
    }
    // Nunca se abrio: abrirlo lo enfoca, y luego se le devuelve el foco al editor.
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`)
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup')
  }

  /** El panel esta a la vista. */
  get isVisible(): boolean {
    return this.view !== undefined && this.view.visible
  }

  /** El webview cargo su script y pidio el estado. */
  get isReady(): boolean {
    return this.view !== undefined && this.ready
  }

  postState(state: ViewState): void {
    this.post({ type: 'state', state })
  }

  postLash(lash: LashAnimation): void {
    this.post({ type: 'lash', lash })
  }

  private post(message: HostMessage): void {
    if (this.view === undefined || !this.ready) return
    void this.view.webview.postMessage(message)
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) disposable.dispose()
    this.view = undefined
  }
}
