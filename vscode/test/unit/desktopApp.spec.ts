import * as assert from 'node:assert/strict'

import type { ExecFile } from '../../src/desktopApp'
import { DESKTOP_APP_INSTALL_URL, DesktopAppUnsupportedError, isDesktopAppSupported, launchDesktopApp } from '../../src/desktopApp'

describe('app de escritorio', () => {
  it('por ahora solo existe para Mac', () => {
    assert.equal(isDesktopAppSupported('darwin'), true)
    assert.equal(isDesktopAppSupported('win32'), false)
    assert.equal(isDesktopAppSupported('linux'), false)
  })

  it('en Mac la abre con open -a "Látigo", sin shell', async () => {
    const calls: Array<[string, readonly string[]]> = []
    const run: ExecFile = (file, args, done) => {
      calls.push([file, args])
      done(null)
    }
    await launchDesktopApp('darwin', run)
    assert.deepEqual(calls, [['open', ['-a', 'Látigo']]])
  })

  it('si open falla (no esta instalada) se rechaza', async () => {
    const run: ExecFile = (_file, _args, done) => done(new Error('Unable to find application named Látigo'))
    await assert.rejects(launchDesktopApp('darwin', run), /Unable to find application/)
  })

  it('fuera de Mac ni lo intenta', async () => {
    let called = false
    const run: ExecFile = (_file, _args, done) => {
      called = true
      done(null)
    }
    await assert.rejects(launchDesktopApp('win32', run), DesktopAppUnsupportedError)
    assert.equal(called, false)
  })

  it('la guia de instalacion apunta a la seccion del README', () => {
    assert.equal(DESKTOP_APP_INSTALL_URL, 'https://github.com/ronalc90/Visual-code-Latigo-Claude#app-de-escritorio')
  })
})
