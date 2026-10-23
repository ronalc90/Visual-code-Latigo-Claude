import * as assert from 'node:assert/strict'

import { TIERS } from '../../../hooks/levels'
import { formatStatusBar } from '../../src/statusBarFormat'

describe('formatStatusBar', () => {
  it('encendido muestra la llama y el nivel', () => {
    assert.equal(formatStatusBar(true, 0).text, '$(flame) Látigo · Nv 1')
    assert.equal(formatStatusBar(true, TIERS[4]!.minLashes).text, '$(flame) Látigo · Nv 5')
  })

  it('apagado muestra otro icono y lo dice', () => {
    const content = formatStatusBar(false, 999)
    assert.equal(content.text, '$(circle-slash) Látigo · apagado')
    assert.match(content.tooltip, /^Látigo apagado\n/)
  })

  it('el tooltip trae nivel, progreso, total y como abrir el panel', () => {
    const tier = TIERS[0]!
    const next = TIERS[1]!
    const content = formatStatusBar(true, 10)
    const lines = content.tooltip.split('\n')
    assert.equal(lines[0], 'Látigo encendido')
    assert.equal(lines[1], `Nivel 1 · ${tier.name}`)
    assert.equal(lines[2], `${Math.floor((10 / next.minLashes) * 100)} % · faltan ${next.minLashes - 10} latigazos para ${next.name}`)
    assert.equal(lines[3], 'Total: 10 latigazos')
    assert.equal(lines[4], 'Clic para abrir el panel')
  })

  it('singular y miles con punto', () => {
    assert.match(formatStatusBar(true, 1).tooltip, /Total: 1 latigazo\n/)
    assert.match(formatStatusBar(true, TIERS[1]!.minLashes - 1).tooltip, /faltan 1 latigazo para/)
    assert.match(formatStatusBar(true, 12345).tooltip, /Total: 12\.345 latigazos/)
  })

  it('en el nivel maximo no promete otro nivel', () => {
    const content = formatStatusBar(true, TIERS[TIERS.length - 1]!.minLashes)
    assert.equal(content.text, `$(flame) Látigo · Nv ${TIERS.length}`)
    assert.match(content.tooltip, /Nivel máximo/)
  })

  it('totales raros no rompen el texto', () => {
    assert.equal(formatStatusBar(true, -5).text, '$(flame) Látigo · Nv 1')
    assert.equal(formatStatusBar(true, Number.NaN).text, '$(flame) Látigo · Nv 1')
  })
})
