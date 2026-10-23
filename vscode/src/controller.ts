// Coordina las piezas: el puente, el servicio de latigazos, la barra de estado
// y el panel. Aqui viven las acciones que disparan los comandos y el webview;
// las reglas estan en lashService y en hooks/.

import * as vscode from 'vscode'

import type { Target } from '../../hooks/model'
import { comboTitle } from '../../hooks/model'
import type { BridgeState } from './bridgeState'
import type { BridgeStore } from './bridgeStore'
import type { Clock } from './clock'
import { CLAUDE_PLUGIN_INSTALL, CONTEXT_ENABLED, CONTEXT_SOUND, VIEW_ID } from './commandIds'
import { formatCount } from './format'
import type { LashResult, LashService } from './lashService'
import type { LatigoViewProvider, PanelHost } from './panel/LatigoViewProvider'
import type { LashAnimation, ViewState, WebviewMessage } from './protocol'
import type { ExtensionSettings } from './settings'
import type { LatigoStatusBar } from './statusBar'
import { buildViewState } from './viewState'

export type ControllerDeps = {
  store: BridgeStore
  state: BridgeState
  lashes: LashService
  statusBar: LatigoStatusBar
  clock: Clock
  readSettings: () => ExtensionSettings
}

function animationFor(result: LashResult): LashAnimation {
  return {
    id: result.id,
    target: result.target,
    combo: result.combo,
    comboTitle: result.comboTitle,
    total: result.total,
    levelUp: result.levelUp,
    reachedSession: result.reachedSession,
    sound: result.sound,
    source: 'vscode',
  }
}

export class LatigoController implements PanelHost, vscode.Disposable {
  private panel: LatigoViewProvider | undefined
  private settings: ExtensionSettings
  private readonly disposables: vscode.Disposable[] = []

  constructor(private readonly deps: ControllerDeps) {
    this.settings = deps.readSettings()
    this.disposables.push(
      deps.state.onDidChange(() => this.render()),
      deps.state.onTerminalLash(event =>
        this.panel?.postLash({
          id: event.id,
          target: event.target,
          combo: event.combo,
          comboTitle: comboTitle(event.combo),
          total: event.total,
          levelUp: false,
          reachedSession: true,
          // El sonido ya lo pone la terminal.
          sound: false,
          source: 'terminal',
        }),
      ),
      deps.lashes.onDidLash(result => this.panel?.postLash(animationFor(result))),
    )
  }

  attachPanel(panel: LatigoViewProvider): void {
    this.panel = panel
  }

  onSettingsChanged(): void {
    this.settings = this.deps.readSettings()
    this.render()
  }

  /** Repinta la barra de estado, el contexto de los botones y el panel. */
  render(): void {
    const { config, stats } = this.deps.state.snapshot
    this.deps.statusBar.update(config.enabled, stats.total, this.settings.showStatusBar)
    void vscode.commands.executeCommand('setContext', CONTEXT_ENABLED, config.enabled)
    void vscode.commands.executeCommand('setContext', CONTEXT_SOUND, config.sound)
    this.panel?.postState(this.currentState())
  }

  currentState(): ViewState {
    const now = this.deps.clock.now()
    return buildViewState(this.deps.state.snapshot, this.settings, now, this.deps.clock.timezoneOffsetMinutes(now))
  }

  handleMessage(message: WebviewMessage): void {
    switch (message.type) {
      case 'lash':
        this.lash(message.target, { fromPanel: true })
        return
      case 'setEnabled':
        this.setEnabled(message.enabled, { announce: false })
        return
      case 'setSound':
        this.setSound(message.sound)
        return
      case 'installPlugin':
        this.installClaudePlugin()
        return
      case 'ready':
        return
    }
  }

  async open(): Promise<void> {
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`)
  }

  toggle(): boolean {
    return this.setEnabled(!this.deps.store.readConfig().enabled, { announce: true })
  }

  setEnabled(enabled: boolean, options: { announce: boolean }): boolean {
    const config = this.saveConfig({ enabled })
    if (config === null) return this.deps.store.readConfig().enabled
    if (options.announce) void vscode.window.showInformationMessage(config.enabled ? 'Látigo encendido' : 'Látigo apagado')
    return config.enabled
  }

  setSound(sound: boolean): boolean {
    const config = this.saveConfig({ sound })
    return config === null ? this.deps.store.readConfig().sound : config.sound
  }

  /** Guarda en config.json; si el disco no deja, avisa y devuelve null. */
  private saveConfig(patch: { enabled?: boolean; sound?: boolean }): { enabled: boolean; sound: boolean } | null {
    try {
      const config = this.deps.store.updateConfig(patch)
      this.deps.state.refresh('config')
      return config
    } catch (error) {
      this.reportDiskError(error)
      return null
    }
  }

  private reportDiskError(error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error)
    void vscode.window.showErrorMessage(`Látigo: no se pudo escribir en ${this.deps.store.paths.dir} (${reason}).`)
  }

  toggleSound(): boolean {
    const sound = this.setSound(!this.deps.store.readConfig().sound)
    void vscode.window.setStatusBarMessage(sound ? 'Látigo: sonido prendido' : 'Látigo: sonido apagado', 2500)
    return sound
  }

  lash(target: Target, options: { fromPanel: boolean } = { fromPanel: false }): LashResult | null {
    let result: LashResult | null
    try {
      result = this.deps.lashes.lash(target)
    } catch (error) {
      this.reportDiskError(error)
      this.deps.state.refresh('stats')
      return null
    }
    if (result === null) {
      void vscode.window.showInformationMessage('El látigo está apagado. Préndelo con «Látigo: Encender/Apagar».')
      return null
    }
    this.deps.state.refresh('stats')
    // Desde el panel el aviso lo da el propio panel; desde un comando, VS Code.
    if (!options.fromPanel) {
      if (target === 'effort' && !result.reachedSession) {
        void vscode.window.showWarningMessage('Latigazo contado, pero no llegó a ninguna sesión: abre Claude Code para que el effort suba.')
      } else {
        const combo = result.combo >= 2 ? ` x${result.combo} ${result.comboTitle}` : ''
        void vscode.window.setStatusBarMessage(`$(flame) ¡CHAS!${combo}`, 2000)
      }
    }
    return result
  }

  async showStats(): Promise<void> {
    const { stats } = this.deps.state.snapshot
    const view = this.currentState()
    const summary = [
      `Total: ${formatCount(stats.total)}`,
      `Hoy: ${formatCount(view.today)}`,
      `Al effort: ${formatCount(stats.onEffort)}`,
      `Al modelo: ${formatCount(stats.onModel)}`,
      `Mejor combo: ${stats.bestCombo >= 2 ? `x${stats.bestCombo}` : '—'}`,
    ].join(' · ')
    const choice = await vscode.window.showInformationMessage(`Látigo — ${summary}`, 'Abrir panel')
    if (choice === 'Abrir panel') await this.open()
  }

  installClaudePlugin(): void {
    const terminal = vscode.window.createTerminal({ name: 'Látigo: plugin de Claude Code' })
    terminal.show()
    // Se escribe sin Enter: la persona revisa el comando y lo corre.
    terminal.sendText(CLAUDE_PLUGIN_INSTALL, false)
    void vscode.window.showInformationMessage('Revisa el comando en la terminal y presiona Enter para instalar el plugin del látigo en Claude Code.')
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) disposable.dispose()
  }
}
