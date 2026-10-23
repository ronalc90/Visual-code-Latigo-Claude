import * as path from 'node:path'

import Mocha from 'mocha'

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 20000 })
  mocha.addFile(path.resolve(__dirname, 'extension.spec.js'))
  return new Promise((resolve, reject) => {
    mocha.run(failures => (failures > 0 ? reject(new Error(`${failures} pruebas fallaron`)) : resolve()))
  })
}
