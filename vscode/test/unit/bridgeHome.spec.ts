import * as assert from 'node:assert/strict'
import * as os from 'node:os'

import { bridgeHome } from '../../src/bridgeHome'

describe('bridgeHome', () => {
  it('LATIGO_HOME manda (las pruebas usan una carpeta temporal)', () => {
    assert.equal(bridgeHome({ LATIGO_HOME: '/tmp/latigo', HOME: '/Users/ana' }), '/tmp/latigo')
  })

  it('sin LATIGO_HOME usa HOME, como el plugin de Claude Code', () => {
    assert.equal(bridgeHome({ HOME: '/Users/ana' }), '/Users/ana')
  })

  it('sin HOME (Windows desde el menu) usa la carpeta del sistema, la misma USERPROFILE del plugin', () => {
    assert.equal(bridgeHome({}), os.homedir())
  })

  it('valores en blanco no cuentan', () => {
    assert.equal(bridgeHome({ LATIGO_HOME: '  ', HOME: '/Users/ana' }), '/Users/ana')
    assert.equal(bridgeHome({ LATIGO_HOME: '', HOME: '' }), os.homedir())
  })
})
