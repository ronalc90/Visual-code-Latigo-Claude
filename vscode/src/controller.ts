// Coordina las piezas: el puente, el servicio de latigazos, la barra de estado
// y el panel. Aqui viven las acciones que disparan los comandos y el webview;
// las reglas estan en lashService y en hooks/.

import * as vscode from 'vscode'

import type { LatigoConfig } from '../../hooks/bridge'
import type { Target } from '../../hooks/model'
import type { SoundStyle } from '../../hooks/sounds'
import { isSoundStyle, soundStyle } from '../../hooks/sounds'
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
  /** Pregunta que sonido usar, partiendo del actual; undefined si la persona no eligio. */
  pickSoundStyle: (current: SoundStyle) => Promise<SoundStyle | undefined>
}

export type DesktopAppLauncher = {
  supported: boolean
  /** Abre la app; se rechaza si no se pudo (casi siempre porque no esta instalada). */
  launch(): Promise<void>
}

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
      case 'setSoundStyle':
        this.selectSoundStyle(message.style)
        return
      case 'installPlugin':
        this.installClaudePlugin()
        return
      case 'openDesktopApp':
        void this.openDesktopApp()
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

  /** El unico interruptor: lo usan el atajo, la paleta y los botones del titulo del panel. */
  toggle(): boolean {
    return this.setEnabled(!this.deps.store.readConfig().enabled, { announce: true })
  }

  setEnabled(enabled: boolean, options: { announce: boolean }): boolean {
    const config = this.saveConfig({ enabled })
    if (config === null) return this.deps.store.readConfig().enabled
    // El atajo se usa seguido: basta un aviso corto en la barra de estado.
    if (options.announce) void vscode.window.setStatusBarMessage(config.enabled ? '$(flame) Látigo prendido' : '$(circle-slash) Látigo apagado', 2500)
    // Prenderlo estando en una conversacion de Claude lo muestra de una vez.
    if (config.enabled && this.deps.isClaudeActive()) this.onClaudeFocused()
    return config.enabled
  }

  setSound(sound: boolean): boolean {
    const config = this.saveConfig({ sound })
    return config === null ? this.deps.store.readConfig().sound : config.sound
  }

  toggleSound(): boolean {
    const sound = this.setSound(!this.deps.store.readConfig().sound)
    void vscode.window.setStatusBarMessage(sound ? 'Látigo: sonido prendido' : 'Látigo: sonido apagado', 2500)
    return sound
  }

  /** Desde el panel: guarda el estilo y prende el sonido, como `/latigo sonido <estilo>` en Claude Code. */
  selectSoundStyle(style: SoundStyle): SoundStyle {
    const config = this.saveConfig({ soundStyle: style, sound: true })
    return config === null ? this.deps.store.readConfig().soundStyle : config.soundStyle
  }

  /**
   * «Látigo: Elegir sonido». Con un estilo valido como argumento lo guarda de
   * una; si no, muestra la lista. Solo guarda el estilo: el interruptor del
   * sonido queda como estaba. Devuelve el estilo guardado, o null si no se eligio.
   */
  async chooseSoundStyle(requested?: unknown): Promise<SoundStyle | null> {
    const current = this.deps.store.readConfig().soundStyle
    const style = isSoundStyle(requested) ? requested : await this.deps.pickSoundStyle(current)
    if (style === undefined) return null
    const config = this.saveConfig({ soundStyle: style })
    if (config === null) return null
    const muted = config.sound ? '' : ' (el sonido está apagado)'
    void vscode.window.setStatusBarMessage(`Látigo: sonido «${soundStyle(style).label}»${muted}`, 3000)
    return config.soundStyle
  }

  /** Guarda en config.json solo lo pedido; si el disco no deja, avisa y devuelve null. */
  private saveConfig(patch: Partial<LatigoConfig>): LatigoConfig | null {
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
      void vscode.window.showInformationMessage('El látigo está apagado. Préndelo con el interruptor del panel o con «Látigo: Prender/Apagar».')
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
   * Abre la app de escritorio (boton del panel). Si no se pudo, casi seguro no
   * esta instalada: el panel lo dice y ofrece la guia. Devuelve si la abrio.
   */
  async openDesktopApp(): Promise<boolean> {
    if (!this.deps.desktopApp.supported) return false
    try {
      await this.deps.desktopApp.launch()
      this.desktopAppMissing = false
      this.render()
      return true
    } catch {
      this.desktopAppMissing = true
      this.render()
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
