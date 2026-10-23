// Donde vive el puente: la misma regla que usa el plugin de Claude Code.

import * as os from 'node:os'

/**
 * La carpeta base del puente, con la misma regla que el plugin de Claude Code:
 * `LATIGO_HOME` (las pruebas usan una temporal), luego `HOME` y si no la del
 * sistema (en Windows, USERPROFILE).
 */
export function bridgeHome(env: NodeJS.ProcessEnv = process.env): string {
  const candidates = [env.LATIGO_HOME, env.HOME].map(value => value?.trim())
  return candidates.find(value => value !== undefined && value !== '') ?? os.homedir()
}
