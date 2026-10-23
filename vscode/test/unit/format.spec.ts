import * as assert from 'node:assert/strict'

import { formatCount, formatDay, plural } from '../../src/format'

describe('format', () => {
  it('formatCount separa miles con punto', () => {
    assert.equal(formatCount(0), '0')
    assert.equal(formatCount(999), '999')
    assert.equal(formatCount(1000), '1.000')
    assert.equal(formatCount(1234567), '1.234.567')
    assert.equal(formatCount(-3), '0')
    assert.equal(formatCount(Number.POSITIVE_INFINITY), '0')
    assert.equal(formatCount(12.9), '12')
  })

  it('plural elige la palabra', () => {
    assert.equal(plural(1, 'latigazo', 'latigazos'), '1 latigazo')
    assert.equal(plural(0, 'latigazo', 'latigazos'), '0 latigazos')
    assert.equal(plural(7000, 'latigazo', 'latigazos'), '7.000 latigazos')
  })

  it('formatDay escribe la fecha en corto', () => {
    assert.equal(formatDay('2026-10-22'), '22 oct 2026')
    assert.equal(formatDay('2026-01-05'), '5 ene 2026')
    assert.equal(formatDay('no-es-fecha'), 'no-es-fecha')
  })
})
