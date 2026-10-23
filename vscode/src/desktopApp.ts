// La app de escritorio del latigo (macOS): convierte el puntero en un latigo
// sobre toda la pantalla. La extension solo la abre y le pide prender o apagar
// el modo latigo por el puente; aqui va lo de abrirla, sin vscode.

import { execFile } from 'node:child_process'

/** El nombre con que se instala la app en /Applications. */
export const DESKTOP_APP_NAME = 'Látigo'

/** Donde el README explica como instalar la app de escritorio. */
export const DESKTOP_APP_INSTALL_URL = 'https://github.com/ronalc90/Visual-code-Latigo-Claude#app-de-escritorio'

/** Por ahora la app solo existe para Mac. */
export function isDesktopAppSupported(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'darwin'
}

/** Corre un programa sin shell; lo mismo que `child_process.execFile`, inyectable en pruebas. */
export type ExecFile = (file: string, args: readonly string[], done: (error: Error | null) => void) => void

const nodeExecFile: ExecFile = (file, args, done) => {
  execFile(file, [...args], { timeout: 10_000 }, error => done(error))
}

export class DesktopAppUnsupportedError extends Error {
  constructor() {
    super('La app de escritorio del látigo por ahora solo existe para Mac.')
  }
}

/**
 * Abre la app con `open -a "Látigo"`. Se rechaza si no es Mac o si `open` falla
 * (casi siempre porque la app no esta instalada).
 */
export function launchDesktopApp(platform: NodeJS.Platform = process.platform, run: ExecFile = nodeExecFile): Promise<void> {
  if (!isDesktopAppSupported(platform)) return Promise.reject(new DesktopAppUnsupportedError())
  return new Promise((resolve, reject) => {
    run('open', ['-a', DESKTOP_APP_NAME], error => (error === null ? resolve() : reject(error)))
  })
}
