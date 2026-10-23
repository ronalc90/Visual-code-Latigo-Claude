// Coordina las piezas: el puente, el servicio de latigazos, la barra de estado
// y el panel. Aqui viven las acciones que disparan los comandos y el webview;
// las reglas estan en lashService y en hooks/.

import * as vscode from 'vscode'

import type { WhipModeRequest } from '../../hooks/bridge'
import type { Target } from '../../hooks/model'
import type { BridgeState } from './bridgeState'
import type { BridgeStore } from './bridgeStore'
import type { Clock } from './clock'
import { CLAUDE_PLUGIN_INSTALL, CONTEXT_ENABLED, CONTEXT_SOUND, VIEW_ID } from './commandIds'
import { DESKTOP_APP_INSTALL_URL } from './desktopApp'
import { formatCount } from './format'
import { animationForExternal, animationForResult } from './lashAnimation'
import type { LashResult, LashService } from './lashService'
import type { LatigoViewProvider, PanelHost } from './panel/LatigoViewProvider'
import type { ViewState, WebviewMessage } from './protocol'
import type { ExtensionSettings } from './settings'
import type { LatigoStatusBar } from './statusBar'
import { buildViewState } from './viewState'

export type ControllerDeps = {
  /** True si la pestaña activa es una conversacion de Claude Code. */
  isClaudeActive: () => boolean
  store: BridgeStore
  state: BridgeState
  lashes: LashService
  statusBar: LatigoStatusBar
  clock: Clock
  readSettings: () => ExtensionSettings
  /** La app de escritorio: si existe para este sistema y como abrirla. */
  desktopApp: DesktopAppLauncher
}

export type DesktopAppLauncher = {
  supported: boolean
  /** Abre la app; se rechaza si no se pudo (casi siempre porque no esta instalada). */
  launch(): Promise<void>
}

const OPEN_APP = 'Abrir la app'
const INSTALL_GUIDE = 'Cómo instalarla'

export class LatigoController implements PanelHost, vscode.Disposable {
  private panel: LatigoViewProvider | undefined
  private settings: ExtensionSettings
  /** El ultimo intento de abrir la app de escritorio fallo. */
  private desktopAppMissing = false
  private readonly disposables: vscode.Disposable[] = []

  constructor(private readonly deps: ControllerDeps) {
    this.settings = deps.readSettings()
    this.disposables.push(
      deps.state.onDidChange(() => this.render()),
      deps.state.onExternalLash(event => this.panel?.postLash(animationForExternal(event))),
      deps.lashes.onDidLash(result => this.panel?.postLash(animationForResult(result))),
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
    const { config, stats, desktop } = this.deps.state.snapshot
    if (desktop.alive) this.desktopAppMissing = false
    this.deps.statusBar.update(config.enabled, stats.total, desktop, this.settings.showStatusBar)
    void vscode.commands.executeCommand('setContext', CONTEXT_ENABLED, config.enabled)
    void vscode.commands.executeCommand('setContext', CONTEXT_SOUND, config.sound)
    this.panel?.postState(this.currentState())
  }

  currentState(): ViewState {
    const now = this.deps.clock.now()
    return buildViewState(this.deps.state.snapshot, this.settings, now, this.deps.clock.timezoneOffsetMinutes(now), {
      supported: this.deps.desktopApp.supported,
      appMissing: this.desktopAppMissing,
    })
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
      case 'toggleWhipMode':
        this.toggleWhipMode({ fromPanel: true })
        return
      case 'openDesktopApp':
        void this.openDesktopApp({ fromPanel: true })
        return
      case 'openInstallGuide':
        void this.openInstallGuide()
        return
      case 'ready':
        return
    }
  }

  /** La persona entro a una conversacion de Claude Code: si el latigo esta prendido, se muestra. */
  onClaudeFocused(): void {
    if (!this.settings.showWithClaude) return
    if (!this.deps.store.readConfig().enabled) return
    void this.panel?.reveal()
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
    // Prenderlo estando en una conversacion de Claude lo muestra de una vez.
    if (config.enabled && this.deps.isClaudeActive()) this.onClaudeFocused()
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

  /**
   * Le pide a la app de escritorio prender o apagar el modo latigo (el puntero
   * hecho latigo). Devuelve el pedido escrito, o null si no se pudo pedir.
   */
  toggleWhipMode(options: { fromPanel: boolean } = { fromPanel: false }): WhipModeRequest | null {
    // Se relee para no decidir con una foto de hace un par de segundos.
    this.deps.state.refresh('desktop')
    const { config, desktop } = this.deps.state.snapshot
    if (!config.enabled) {
      void vscode.window.showInformationMessage('El látigo está apagado. Préndelo con «Látigo: Encender/Apagar».')
      return null
    }
    if (!this.deps.desktopApp.supported) {
      void vscode.window.showInformationMessage('El modo látigo en pantalla está disponible por ahora solo en Mac.')
      return null
    }
    if (!desktop.alive) {
      // Desde el panel ya se ve el boton para abrir la app.
      if (!options.fromPanel) void this.offerToOpenDesktopApp()
      return null
    }
    try {
      const request = this.deps.store.requestWhipMode(!desktop.whipMode)
      if (!options.fromPanel) {
        void vscode.window.setStatusBarMessage(request.active ? '$(zap) Prendiendo el modo látigo…' : 'Apagando el modo látigo…', 2500)
      }
      return request
    } catch (error) {
      this.reportDiskError(error)
      return null
    }
  }

  private async offerToOpenDesktopApp(): Promise<void> {
    const choice = await vscode.window.showInformationMessage('La app de escritorio del látigo no está abierta.', OPEN_APP)
    if (choice === OPEN_APP) await this.openDesktopApp()
  }

  /** Abre la app de escritorio. Si no esta instalada, el panel lo dice y apunta a la guia. */
  async openDesktopApp(options: { fromPanel: boolean } = { fromPanel: false }): Promise<boolean> {
    if (!this.deps.desktopApp.supported) {
      void vscode.window.showInformationMessage('La app de escritorio del látigo está disponible por ahora solo en Mac.')
      return false
    }
    try {
      await this.deps.desktopApp.launch()
      this.desktopAppMissing = false
      this.render()
      return true
    } catch {
      this.desktopAppMissing = true
      this.render()
      if (!options.fromPanel) {
        const choice = await vscode.window.showWarningMessage('No se encontró la app «Látigo» en este Mac.', INSTALL_GUIDE)
        if (choice === INSTALL_GUIDE) await this.openInstallGuide()
      }
      return false
    }
  }

  async openInstallGuide(): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(DESKTOP_APP_INSTALL_URL))
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
