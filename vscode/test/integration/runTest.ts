// Corre las pruebas de integracion dentro de un VS Code real, el instalado en
// la maquina (no se descarga nada). Perfil, extensiones y puente en carpetas
// temporales para no tocar la configuracion de nadie.
//
// VSCODE_EXECUTABLE cambia el ejecutable de VS Code.

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { runTests } from '@vscode/test-electron'

const DEFAULT_VSCODE = '/Users/gt/Downloads/Visual Studio Code.app/Contents/MacOS/Electron'

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..', '..', '..')
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js')
  const vscodeExecutablePath = process.env.VSCODE_EXECUTABLE ?? DEFAULT_VSCODE
  if (!fs.existsSync(vscodeExecutablePath)) {
    throw new Error(`No encuentro VS Code en ${vscodeExecutablePath}. Usa VSCODE_EXECUTABLE para indicar otro.`)
  }

  // Si esto corre desde una terminal integrada de VS Code (o desde otra app de
  // Electron), esta variable haria que Electron arranque como Node y no como editor.
  delete process.env.ELECTRON_RUN_AS_NODE

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'latigo-integracion-'))
  const latigoHome = path.join(scratch, 'home')
  const userDataDir = path.join(scratch, 'user-data')
  const extensionsDir = path.join(scratch, 'extensions')
  const workspace = path.join(scratch, 'workspace')
  for (const dir of [latigoHome, userDataDir, extensionsDir, workspace]) fs.mkdirSync(dir, { recursive: true })

  try {
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv: { LATIGO_HOME: latigoHome, LATIGO_TEST_HOME: latigoHome, NODE_ENV: 'test' },
      launchArgs: [
        workspace,
        '--disable-extensions',
        '--disable-workspace-trust',
        '--skip-welcome',
        '--skip-release-notes',
        '--disable-telemetry',
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
      ],
    })
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error('Fallaron las pruebas de integracion:', error)
  process.exit(1)
})
