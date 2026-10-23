// Activacion: arma las piezas y las conecta. Sin logica propia.

import * as vscode from 'vscode'

import { bridgePaths } from '../../hooks/bridge'
import { bridgeHome } from './bridgeHome'
import type { BridgeSnapshot } from './bridgeState'
import { BridgeState } from './bridgeState'
import { BridgeStore } from './bridgeStore'
import { BridgeWatcher } from './bridgeWatcher'
import { ClaudeFocusWatcher } from './claudeFocusWatcher'
import { systemClock } from './clock'
import { VIEW_ID } from './commandIds'
import { registerCommands } from './commands'
import { LatigoController } from './controller'
import { isDesktopAppSupported, launchDesktopApp } from './desktopApp'
import { LashService } from './lashService'
import { LatigoViewProvider } from './panel/LatigoViewProvider'
import type { LashAnimation, ViewState } from './protocol'
import { readSettings } from './settings'
import { pickSoundStyle } from './soundPicker'
import { LatigoStatusBar } from './statusBar'

/**
 * Cada cuanto se revisa si la sesion de Claude Code y la app de escritorio
 * siguen vivas (su presencia caduca sola; la de la app, a los 6 s).
 */
const LIVENESS_CHECK_MS = 2000

/** Lo que devuelve `activate`; lo usan las pruebas de integracion. */
export type LatigoApi = {
  bridgeDir: string
  statusBarText(): string
  snapshot(): BridgeSnapshot
  /** True cuando el webview del panel cargo y hablo con la extension. */
  panelReady(): boolean
  /** True cuando el panel del latigo esta a la vista. */
  panelVisible(): boolean
  /** Lo que el panel esta pintando (o pintaria si estuviera abierto). */
  viewState(): ViewState
  /** El ultimo latigazo que se le mando a animar al panel. */
  lastPanelLash(): LashAnimation | null
  /** Atiende un mensaje como si llegara del webview del panel (se valida igual). */
  panelMessage(raw: unknown): void
}

export function activate(context: vscode.ExtensionContext): LatigoApi {
  const clock = systemClock
  const store = new BridgeStore(bridgePaths(bridgeHome()))
  try {
    store.ensureDir()
  } catch {
    // Sin carpeta no hay puente, pero el panel igual abre.
  }

  const state = new BridgeState(store, clock)
  // Lo ultimo conocido de los conteos protege contra un stats.json a medio escribir.
  const lashes = new LashService(store, clock, undefined, () => state.snapshot.stats)
  const statusBar = new LatigoStatusBar()
  const claudeFocus = new ClaudeFocusWatcher()
  const controller = new LatigoController({
    isClaudeActive: () => claudeFocus.isClaudeActive,
    store,
    state,
    lashes,
    statusBar,
    clock,
    readSettings: () => readSettings(vscode.workspace.getConfiguration('latigo')),
    desktopApp: { supported: isDesktopAppSupported(), launch: () => launchDesktopApp() },
    pickSoundStyle,
  })
  const panel = new LatigoViewProvider(context.extensionUri, controller)
  controller.attachPanel(panel)

  const watcher = new BridgeWatcher(store.paths, file => state.refresh(file))
  watcher.start()
  context.subscriptions.push(claudeFocus, claudeFocus.onDidEnterClaude(() => controller.onClaudeFocused()))
  claudeFocus.start()
  const livenessTimer = setInterval(() => state.refresh('presence'), LIVENESS_CHECK_MS)

  context.subscriptions.push(
    state,
    lashes,
    statusBar,
    controller,
    panel,
    watcher,
    { dispose: () => clearInterval(livenessTimer) },
    vscode.window.registerWebviewViewProvider(VIEW_ID, panel),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('latigo')) controller.onSettingsChanged()
    }),
    ...registerCommands(controller),
  )

  controller.render()

  return {
    bridgeDir: store.paths.dir,
    statusBarText: () => statusBar.text,
    snapshot: () => state.snapshot,
    panelReady: () => panel.isReady,
    panelVisible: () => panel.isVisible,
    viewState: () => controller.currentState(),
    lastPanelLash: () => panel.lastLash,
    panelMessage: raw => panel.receive(raw),
  }
}

export function deactivate(): void {
  // Todo se suelta por context.subscriptions.
}
