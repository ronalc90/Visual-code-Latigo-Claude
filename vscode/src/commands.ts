import * as vscode from 'vscode'

import { COMMANDS } from './commandIds'
import type { LatigoController } from './controller'

/** Registra los comandos de la paleta; cada uno delega en el controlador. */
export function registerCommands(controller: LatigoController): vscode.Disposable[] {
  const register = (id: string, run: (...args: unknown[]) => unknown) => vscode.commands.registerCommand(id, run)
  return [
    register(COMMANDS.open, () => controller.open()),
    register(COMMANDS.toggle, () => controller.toggle()),
    register(COMMANDS.turnOn, () => controller.setEnabled(true, { announce: true })),
    register(COMMANDS.turnOff, () => controller.setEnabled(false, { announce: true })),
    register(COMMANDS.lashEffort, () => controller.lash('effort')),
    register(COMMANDS.lashModel, () => controller.lash('model')),
    register(COMMANDS.toggleSound, () => controller.toggleSound()),
    register(COMMANDS.soundOn, () => controller.setSound(true)),
    register(COMMANDS.soundOff, () => controller.setSound(false)),
    register(COMMANDS.showStats, () => controller.showStats()),
    register(COMMANDS.installClaudePlugin, () => controller.installClaudePlugin()),
    // Con un estilo como argumento (p. ej. desde un atajo propio) lo guarda sin preguntar.
    register(COMMANDS.chooseSound, style => controller.chooseSoundStyle(style)),
  ]
}
