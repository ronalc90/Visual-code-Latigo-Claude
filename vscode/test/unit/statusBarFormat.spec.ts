import * as assert from 'node:assert/strict'

import { TIERS } from '../../../hooks/levels'
import { formatStatusBar } from '../../src/statusBarFormat'

describe('formatStatusBar', () => {
  it('prendido muestra la llama y el nivel', () => {
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
    assert.equal(lines[0], 'Látigo prendido')
    assert.equal(lines[1], `Nivel 1 · ${tier.name}`)
    assert.equal(lines[2], `${Math.floor((10 / next.minLashes) * 100)} % · faltan ${next.minLashes - 10} latigazos para ${next.name}`)
    assert.equal(lines[3], 'Total: 10 latigazos')
    assert.equal(lines[4], 'Clic para abrir el panel')
  })

  it('un solo interruptor: el texto es el mismo con o sin la app de escritorio, sin un modo latigo aparte', () => {
    for (const desktop of [
      { alive: true, whipMode: true, hotkey: 'ok' as const },
      { alive: true, whipMode: false, hotkey: 'ocupado' as const },
      { alive: false, whipMode: false, hotkey: 'ok' as const },
    ]) {
      const content = formatStatusBar(true, TIERS[4]!.minLashes, desktop)
      assert.equal(content.text, '$(flame) Látigo · Nv 5')
      assert.doesNotMatch(content.tooltip, /Modo látigo/)
    }
  })

  it('con la app abierta y el puntero hecho latigo, el tooltip lo dice', () => {
    const content = formatStatusBar(true, 0, { alive: true, whipMode: true, hotkey: 'ok' })
    assert.equal(content.tooltip.split('\n')[1], 'Tu puntero es un látigo (app de escritorio)')
  })

  it('con la app cerrada, sin el puntero de latigo o con el latigo apagado no se menciona la app', () => {
    assert.doesNotMatch(formatStatusBar(true, 0, { alive: false, whipMode: false, hotkey: 'ok' }).tooltip, /app de escritorio/)
    assert.doesNotMatch(formatStatusBar(true, 0, { alive: true, whipMode: false, hotkey: 'ok' }).tooltip, /app de escritorio/)
    const off = formatStatusBar(false, 0, { alive: true, whipMode: true, hotkey: 'ok' })
    assert.equal(off.text, '$(circle-slash) Látigo · apagado')
    assert.doesNotMatch(off.tooltip, /app de escritorio/)
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
