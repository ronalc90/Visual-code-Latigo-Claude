import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import * as vscode from 'vscode'

import { TIERS } from '../../../../hooks/levels'
import { COMMANDS } from '../../../src/commandIds'
import type { LatigoApi } from '../../../src/extension'

const EXTENSION_ID = 'ronalc90.latigo-claude'

function bridgeFile(api: LatigoApi, name: string): string {
  return path.join(api.bridgeDir, name)
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
}

type Counts = { total: number; onEffort: number; onModel: number }

/** Los conteos en disco (cero si no hay archivo). Solo crecen, asi que las pruebas miden diferencias. */
function readStats(api: LatigoApi): Counts {
  const file = bridgeFile(api, 'stats.json')
  if (!fs.existsSync(file)) return { total: 0, onEffort: 0, onModel: 0 }
  return readJson(file).stats as Counts
}

function delta(after: Counts, before: Counts): Counts {
  return { total: after.total - before.total, onEffort: after.onEffort - before.onEffort, onModel: after.onModel - before.onModel }
}

function effortSeq(api: LatigoApi): number {
  const file = bridgeFile(api, 'effort.json')
  return fs.existsSync(file) ? (readJson(file).seq as number) : 0
}

function writeBridge(api: LatigoApi, name: string, value: unknown): void {
  fs.writeFileSync(bridgeFile(api, name), JSON.stringify(value))
}

async function waitFor(check: () => boolean, timeoutMs = 6000): Promise<void> {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('timeout esperando la condicion')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

describe('Látigo en VS Code', () => {
  let api: LatigoApi

  before(async () => {
    const extension = vscode.extensions.getExtension<LatigoApi>(EXTENSION_ID)
    assert.ok(extension, 'la extension no esta cargada')
    api = await extension.activate()
  })

  beforeEach(async () => {
    // Cada prueba arranca encendida, con sonido, sin pedidos de effort ni sesion.
    for (const name of ['effort.json', 'lash.json', 'presence.json', 'desktop.json', 'whipmode.json']) fs.rmSync(bridgeFile(api, name), { force: true })
    await vscode.commands.executeCommand(COMMANDS.turnOn)
    await vscode.commands.executeCommand(COMMANDS.soundOn)
  })

  it('activa y usa la carpeta del puente de LATIGO_HOME', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)!
    assert.equal(extension.isActive, true)
    assert.equal(api.bridgeDir, path.join(process.env.LATIGO_TEST_HOME!, '.claude-latigo'))
    assert.ok(fs.statSync(api.bridgeDir).isDirectory())
  })

  it('registra todos los comandos', async () => {
    const registered = new Set(await vscode.commands.getCommands(true))
    for (const command of Object.values(COMMANDS)) assert.ok(registered.has(command), `falta ${command}`)
  })

  it('declara el atajo de encender/apagar', () => {
    const manifest = vscode.extensions.getExtension(EXTENSION_ID)!.packageJSON as {
      contributes: { keybindings: Array<{ command: string; key: string; mac?: string }> }
    }
    const binding = manifest.contributes.keybindings.find(item => item.command === COMMANDS.toggle)
    assert.deepEqual(binding, { command: COMMANDS.toggle, key: 'shift+alt+l' })
  })

  it('el atajo no choca con los atajos de fabrica de VS Code', async function () {
    await vscode.commands.executeCommand('workbench.action.openDefaultKeybindingsFile')
    await waitFor(() => vscode.window.activeTextEditor?.document.getText().includes('"key"') === true)
    const text = vscode.window.activeTextEditor!.document.getText()
    const key = 'shift+alt+l'
    const taken = text.split('\n').filter(line => line.includes(`"key": "${key}"`) && !line.includes('latigo.'))
    assert.deepEqual(taken, [], `${key} ya lo usa VS Code`)
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
  })

  it('latigo.toggle apaga y prende config.json y la barra de estado lo refleja', async () => {
    assert.equal(await vscode.commands.executeCommand(COMMANDS.toggle), false)
    assert.equal(readJson(bridgeFile(api, 'config.json')).enabled, false)
    assert.equal(api.snapshot().config.enabled, false)
    assert.equal(api.statusBarText(), '$(circle-slash) Látigo · apagado')
    assert.equal(await vscode.commands.executeCommand(COMMANDS.toggle), true)
    assert.equal(readJson(bridgeFile(api, 'config.json')).enabled, true)
    assert.match(api.statusBarText(), /^\$\(flame\) Látigo · Nv \d+$/)
  })

  it('latigo.toggleSound cambia el sonido sin tocar el interruptor', async () => {
    assert.equal(await vscode.commands.executeCommand(COMMANDS.toggleSound), false)
    assert.deepEqual(readJson(bridgeFile(api, 'config.json')), { version: 1, enabled: true, sound: false })
    assert.equal(await vscode.commands.executeCommand(COMMANDS.toggleSound), true)
  })

  it('latigo.lashEffort con sesion viva sube effort.json y cuenta el latigazo', async () => {
    writeBridge(api, 'presence.json', { version: 1, at: Date.now(), model: 'claude-opus-5-5', effort: 'high', boost: null })
    const before = readStats(api)
    await vscode.commands.executeCommand(COMMANDS.lashEffort)
    await vscode.commands.executeCommand(COMMANDS.lashEffort)
    assert.equal(effortSeq(api), 2)
    assert.deepEqual(delta(readStats(api), before), { total: 2, onEffort: 2, onModel: 0 })
    const lash = readJson(bridgeFile(api, 'lash.json'))
    assert.equal(lash.source, 'vscode')
    assert.equal(lash.target, 'effort')
    assert.equal(lash.combo, 2)
  })

  it('latigo.lashEffort sin sesion cuenta pero no pide effort', async () => {
    const before = readStats(api)
    await vscode.commands.executeCommand(COMMANDS.lashEffort)
    assert.equal(effortSeq(api), 0)
    assert.deepEqual(delta(readStats(api), before), { total: 1, onEffort: 1, onModel: 0 })
  })

  it('latigo.lashModel solo cuenta, nunca sube el effort', async () => {
    writeBridge(api, 'presence.json', { version: 1, at: Date.now(), model: 'claude-opus-5-5', effort: 'high', boost: null })
    const before = readStats(api)
    await vscode.commands.executeCommand(COMMANDS.lashModel)
    assert.equal(effortSeq(api), 0)
    assert.deepEqual(delta(readStats(api), before), { total: 1, onEffort: 0, onModel: 1 })
  })

  it('apagado, los latigazos no hacen nada', async () => {
    writeBridge(api, 'presence.json', { version: 1, at: Date.now(), model: 'claude-opus-5-5', effort: 'high', boost: null })
    await vscode.commands.executeCommand(COMMANDS.turnOff)
    const before = readStats(api)
    assert.equal(await vscode.commands.executeCommand(COMMANDS.lashEffort), null)
    assert.equal(await vscode.commands.executeCommand(COMMANDS.lashModel), null)
    assert.deepEqual(readStats(api), before)
    assert.equal(effortSeq(api), 0)
    assert.equal(fs.existsSync(bridgeFile(api, 'lash.json')), false)
  })

  it('la barra de estado sube de nivel con cada latigazo y con cambios de afuera', async () => {
    const threshold = TIERS[1]!.minLashes
    writeBridge(api, 'stats.json', { version: 1, stats: { total: threshold - 1, onModel: threshold - 1, onEffort: 0, bestCombo: 1, byDay: {} } })
    await waitFor(() => api.statusBarText() === '$(flame) Látigo · Nv 1' && api.snapshot().stats.total === threshold - 1)
    await vscode.commands.executeCommand(COMMANDS.lashModel)
    assert.equal(api.statusBarText(), '$(flame) Látigo · Nv 2')
    // Lo escribe "la terminal": el watcher lo trae.
    writeBridge(api, 'stats.json', { version: 1, stats: { total: TIERS[4]!.minLashes, onModel: 0, onEffort: TIERS[4]!.minLashes, bestCombo: 3, byDay: {} } })
    await waitFor(() => api.statusBarText() === '$(flame) Látigo · Nv 5')
  })

  it('el interruptor cambiado desde afuera (Claude Code) llega a VS Code', async () => {
    writeBridge(api, 'config.json', { version: 1, enabled: false, sound: true })
    await waitFor(() => api.snapshot().config.enabled === false)
    assert.equal(api.statusBarText(), '$(circle-slash) Látigo · apagado')
  })

  it('latigo.open abre el panel y el webview carga con su CSP', async () => {
    await vscode.commands.executeCommand(COMMANDS.open)
    await waitFor(() => api.panelReady(), 15000)
  })

  it('latigo.installClaudePlugin abre una terminal con el comando sin correrlo', async () => {
    const before = vscode.window.terminals.length
    await vscode.commands.executeCommand(COMMANDS.installClaudePlugin)
    await waitFor(() => vscode.window.terminals.length === before + 1)
    const terminal = vscode.window.terminals.find(item => item.name === 'Látigo: plugin de Claude Code')
    assert.ok(terminal)
    terminal.dispose()
  })

  it('el ajuste showStatusBar se puede cambiar sin errores', async () => {
    const config = vscode.workspace.getConfiguration('latigo')
    await config.update('showStatusBar', false, vscode.ConfigurationTarget.Global)
    await config.update('showStatusBar', undefined, vscode.ConfigurationTarget.Global)
    assert.match(api.statusBarText(), /Látigo/)
  })

  describe('modo latigo en pantalla (app de escritorio)', () => {
    const desktopAlive = async (whipMode: boolean) => {
      writeBridge(api, 'desktop.json', { version: 1, at: Date.now(), whipMode })
      await waitFor(() => api.snapshot().desktop.alive && api.snapshot().desktop.whipMode === whipMode)
    }

    it('sin la app abierta no escribe ningun pedido', async () => {
      await waitFor(() => !api.snapshot().desktop.alive)
      assert.equal(await vscode.commands.executeCommand(COMMANDS.toggleWhipMode), null)
      assert.equal(fs.existsSync(bridgeFile(api, 'whipmode.json')), false)
    })

    it('latigo.toggleWhipMode escribe whipmode.json con el contador subiendo', async function () {
      if (process.platform !== 'darwin') this.skip()
      await desktopAlive(false)
      assert.deepEqual(await vscode.commands.executeCommand(COMMANDS.toggleWhipMode), { seq: 1, active: true })
      assert.deepEqual(readJson(bridgeFile(api, 'whipmode.json')), { version: 1, seq: 1, active: true })
      // La app confirma que lo prendio: el siguiente pedido es apagarlo.
      await desktopAlive(true)
      assert.deepEqual(await vscode.commands.executeCommand(COMMANDS.toggleWhipMode), { seq: 2, active: false })
      assert.deepEqual(readJson(bridgeFile(api, 'whipmode.json')), { version: 1, seq: 2, active: false })
    })

    it('apagado el latigo, no pide nada', async () => {
      await desktopAlive(false)
      await vscode.commands.executeCommand(COMMANDS.turnOff)
      assert.equal(await vscode.commands.executeCommand(COMMANDS.toggleWhipMode), null)
      assert.equal(fs.existsSync(bridgeFile(api, 'whipmode.json')), false)
    })

    it('la presencia de la app llega al panel y a la barra de estado', async () => {
      await desktopAlive(true)
      assert.deepEqual(
        { alive: api.viewState().desktop.alive, whipMode: api.viewState().desktop.whipMode, supported: api.viewState().desktop.supported },
        { alive: true, whipMode: true, supported: process.platform === 'darwin' },
      )
      assert.match(api.statusBarText(), /^\$\(zap\) Modo látigo · Nv \d+$/)
      await desktopAlive(false)
      assert.match(api.statusBarText(), /^\$\(flame\) Látigo · Nv \d+$/)
      // Si la app deja de escribir, a los pocos segundos se da por cerrada.
      writeBridge(api, 'desktop.json', { version: 1, at: Date.now() - 60_000, whipMode: true })
      await waitFor(() => !api.snapshot().desktop.alive)
      assert.equal(api.viewState().desktop.whipMode, false)
    })
  })

  describe('latigazos de afuera en el panel', () => {
    before(async () => {
      await vscode.commands.executeCommand(COMMANDS.open)
      await waitFor(() => api.panelReady(), 15000)
    })

    for (const source of ['desktop', 'terminal'] as const) {
      it(`un latigazo desde ${source === 'desktop' ? 'la pantalla' : 'la terminal'} se anima con el grito del combo`, async () => {
        const id = `${source}-${Date.now()}`
        writeBridge(api, 'lash.json', { version: 1, id, at: Date.now(), target: 'effort', combo: 3, total: 50, source })
        await waitFor(() => api.lastPanelLash()?.id === id)
        const lash = api.lastPanelLash()!
        assert.equal(lash.source, source)
        assert.equal(lash.combo, 3)
        assert.equal(lash.comboTitle, '¡TRIPLE!')
        assert.equal(lash.sound, false)
      })
    }

    it('los latigazos de VS Code no se reenvian desde lash.json (ya los anima el panel)', async () => {
      const before = api.lastPanelLash()
      writeBridge(api, 'lash.json', { version: 1, id: `vscode-${Date.now()}`, at: Date.now(), target: 'model', combo: 1, total: 51, source: 'vscode' })
      await new Promise(resolve => setTimeout(resolve, 1200))
      assert.equal(api.lastPanelLash(), before)
    })
  })

  describe('al entrar a una conversacion de Claude Code', () => {
    const openClaudeConversation = (title: string) =>
      vscode.window.createWebviewPanel('claudeVSCodePanel', title, vscode.ViewColumn.One, {})

    const activeTabIsClaude = () => {
      const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
      return input instanceof vscode.TabInputWebview && input.viewType.endsWith('claudeVSCodePanel')
    }

    const setEnabled = async (enabled: boolean) => {
      writeBridge(api, 'config.json', { version: 1, enabled, sound: false })
      await waitFor(() => api.snapshot().config.enabled === enabled)
    }

    afterEach(async () => {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
      await setEnabled(true)
      await vscode.workspace.getConfiguration('latigo').update('showWithClaude', undefined, vscode.ConfigurationTarget.Global)
    })

    it('con el latigo prendido lo muestra en la barra lateral sin quitarle el foco a la conversacion', async () => {
      await setEnabled(true)
      await vscode.commands.executeCommand('workbench.action.closeSidebar')
      await waitFor(() => !api.panelVisible())
      const conversation = openClaudeConversation('Charla con Claude')
      await waitFor(() => api.panelVisible(), 10000)
      assert.ok(activeTabIsClaude(), 'la pestaña activa sigue siendo la conversacion')
      assert.ok(conversation.active)
      conversation.dispose()
    })

    it('con el latigo apagado no lo muestra', async () => {
      await setEnabled(false)
      await vscode.commands.executeCommand('workbench.action.closeSidebar')
      await waitFor(() => !api.panelVisible())
      const conversation = openClaudeConversation('Otra charla')
      await new Promise(resolve => setTimeout(resolve, 1500))
      assert.equal(api.panelVisible(), false)
      conversation.dispose()
    })

    it('con el ajuste showWithClaude apagado no lo muestra', async () => {
      await setEnabled(true)
      await vscode.workspace.getConfiguration('latigo').update('showWithClaude', false, vscode.ConfigurationTarget.Global)
      await vscode.commands.executeCommand('workbench.action.closeSidebar')
      await waitFor(() => !api.panelVisible())
      const conversation = openClaudeConversation('Charla sin latigo')
      await new Promise(resolve => setTimeout(resolve, 1500))
      assert.equal(api.panelVisible(), false)
      conversation.dispose()
    })

    it('prenderlo estando en la conversacion lo muestra de una vez', async () => {
      await setEnabled(false)
      await vscode.commands.executeCommand('workbench.action.closeSidebar')
      const conversation = openClaudeConversation('Charla para prender')
      await new Promise(resolve => setTimeout(resolve, 800))
      assert.equal(api.panelVisible(), false)
      await vscode.commands.executeCommand(COMMANDS.toggle)
      await waitFor(() => api.panelVisible(), 10000)
      assert.ok(activeTabIsClaude())
      conversation.dispose()
    })
  })
})
