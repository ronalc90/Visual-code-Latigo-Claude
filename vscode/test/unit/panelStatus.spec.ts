import * as assert from 'node:assert/strict'

import type { DesktopCard } from '../../src/panelStatus'
import { desktopCard, switchHint } from '../../src/panelStatus'
import type { ViewState } from '../../src/protocol'

type Desktop = ViewState['desktop']

const mac = (overrides: Partial<Desktop> = {}): Desktop => ({ supported: true, alive: false, whipMode: false, hotkey: 'ok', appMissing: false, ...overrides })

describe('tarjeta «App de escritorio»', () => {
  it('fuera de Mac no se muestra, pase lo que pase', () => {
    for (const enabled of [true, false]) {
      const card = desktopCard(enabled, { ...mac({ alive: true, whipMode: true, hotkey: 'ocupado' }), supported: false })
      assert.equal(card.kind, 'hidden')
      assert.equal(card.action, 'none')
      assert.equal(card.warning, null)
    }
  })

  it('abierta y con el latigo prendido: punto verde, el puntero es un latigo y como apagarlo', () => {
    const card = desktopCard(true, mac({ alive: true, whipMode: true }))
    assert.deepEqual(card, {
      kind: 'whip',
      tone: 'live',
      status: 'Abierta · tu puntero es un látigo',
      hint: 'Esc o ⌃⌘L apagan el látigo.',
      action: 'none',
      warning: null,
    } satisfies DesktopCard)
  })

  it('abierta con el latigo apagado: punto gris y como prenderlo', () => {
    const card = desktopCard(false, mac({ alive: true, whipMode: false }))
    assert.deepEqual(card, {
      kind: 'idle',
      tone: 'idle',
      status: 'Abierta · el látigo está apagado',
      hint: '⌃⌘L o el interruptor de arriba lo prenden.',
      action: 'none',
      warning: null,
    } satisfies DesktopCard)
  })

  it('cerrada: ofrece abrirla', () => {
    for (const enabled of [true, false]) {
      const card = desktopCard(enabled, mac())
      assert.equal(card.kind, 'closed')
      assert.equal(card.tone, 'idle')
      assert.equal(card.status, 'Cerrada')
      assert.equal(card.action, 'open')
      assert.equal(card.warning, null)
    }
  })

  it('si abrirla fallo: no esta instalada y ofrece la guia', () => {
    const card = desktopCard(true, mac({ appMissing: true }))
    assert.deepEqual(card, {
      kind: 'missing',
      tone: 'warn',
      status: 'No está instalada',
      hint: 'Instálala y luego dale a Reintentar.',
      action: 'install',
      warning: null,
    } satisfies DesktopCard)
  })

  it('una presencia vieja con whipMode o atajo ocupado no cuenta si la app esta cerrada', () => {
    const card = desktopCard(true, mac({ alive: false, whipMode: true, hotkey: 'ocupado' }))
    assert.equal(card.kind, 'closed')
    assert.equal(card.warning, null)
  })

  it('con el atajo ocupado por otra app: el aviso y las ayudas sin ⌃⌘L', () => {
    const warning = 'Otra app usa ⌃⌘L: prende y apaga desde aquí o desde el menú de la app.'
    const whip = desktopCard(true, mac({ alive: true, whipMode: true, hotkey: 'ocupado' }))
    assert.equal(whip.warning, warning)
    assert.equal(whip.hint, 'Esc apaga el látigo.')
    const idle = desktopCard(false, mac({ alive: true, whipMode: false, hotkey: 'ocupado' }))
    assert.equal(idle.warning, warning)
    assert.equal(idle.hint, 'El interruptor de arriba lo prende.')
    assert.equal(desktopCard(true, mac({ alive: true, whipMode: false, hotkey: 'ocupado' })).warning, warning)
  })

  it('mientras la app sigue el ultimo cambio del interruptor, lo dice sin ofrecer nada', () => {
    const turningOn = desktopCard(true, mac({ alive: true, whipMode: false }))
    assert.equal(turningOn.kind, 'switching')
    assert.equal(turningOn.status, 'Abierta · prendiendo el látigo…')
    assert.equal(turningOn.tone, 'idle')
    const turningOff = desktopCard(false, mac({ alive: true, whipMode: true }))
    assert.equal(turningOff.kind, 'switching')
    assert.equal(turningOff.status, 'Abierta · apagando el látigo…')
    assert.equal(turningOff.tone, 'live')
    for (const card of [turningOn, turningOff]) {
      assert.equal(card.action, 'none')
      assert.equal(card.hint, '')
    }
  })
})

describe('la linea debajo del interruptor', () => {
  it('apagado dice que todo vuelve a la normalidad, haya o no app', () => {
    for (const desktop of [mac(), mac({ alive: true, whipMode: true }), { ...mac(), supported: false }]) {
      assert.equal(switchHint(false, desktop), 'Apagado: no suena, no anima y el effort vuelve a ser el de la sesión.')
    }
  })

  it('con la app abierta y el puntero hecho latigo explica el clic sobre Claude', () => {
    assert.equal(switchHint(true, mac({ alive: true, whipMode: true })), 'Tu puntero es un látigo: cada clic sobre una conversación de Claude le sube el effort.')
  })

  it('en Mac con la app cerrada invita a abrirla', () => {
    assert.equal(
      switchHint(true, mac()),
      'Prendido: cada latigazo al effort lo sube un nivel en Claude Code. Abre la app de escritorio y tu puntero será un látigo.',
    )
  })

  it('sin app de escritorio (Windows y Linux) o mientras la app se pone al dia, solo lo esencial', () => {
    const base = 'Prendido: cada latigazo al effort lo sube un nivel en Claude Code.'
    assert.equal(switchHint(true, { ...mac(), supported: false }), base)
    assert.equal(switchHint(true, mac({ alive: true, whipMode: false })), base)
  })
})
