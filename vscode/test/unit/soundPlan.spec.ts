import * as assert from 'node:assert/strict'

import { SOUND_STYLES, soundStyle } from '../../../hooks/sounds'
import { parseSoundUris } from '../../webview/sound'
import { planLashSound, planTestSound } from '../../webview/soundPlan'
import { CRACK_AT, CRACK_DURATION, IMPACT_MS } from '../../webview/whipPreview'

const ON = { lashHasSound: true, soundOn: true }
const always = (value: number) => () => value

describe('sonido de los latigazos del panel', () => {
  it('el impacto de la animacion es el momento del golpe del chasquido', () => {
    assert.equal(IMPACT_MS, CRACK_DURATION * CRACK_AT * 1000)
    assert.ok(IMPACT_MS > 150 && IMPACT_MS < 250, String(IMPACT_MS))
  })

  it('usa el estilo elegido: un archivo al azar de ese estilo', () => {
    assert.equal(planLashSound('real-4', always(0.3), IMPACT_MS, ON)?.file.path, 'sonidos/real-4.wav')
    assert.equal(planLashSound('suave', always(0.9), IMPACT_MS, ON)?.file.path, 'sonidos/suave-2.wav')
    const seen = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map(value => planLashSound('real', always(value), IMPACT_MS, ON)?.file.path))
    assert.equal(seen.size, 6)
  })

  it('si el golpe del archivo llega antes que el impacto, se atrasa el play lo justo', () => {
    const plan = planLashSound('real-1', always(0), 200, ON)!
    assert.equal(plan.file.crackAtMs, 150)
    assert.equal(plan.soundDelayMs, 50)
    assert.equal(plan.animationDelayMs, 0)
  })

  it('si el golpe del archivo llega despues, se atrasa la animacion para que peguen juntos', () => {
    const plan = planLashSound('real-6', always(0), 200, ON)!
    assert.equal(plan.file.crackAtMs, 353)
    assert.equal(plan.soundDelayMs, 0)
    assert.equal(plan.animationDelayMs, 153)
  })

  it('en todos los archivos, el chasquido y el impacto caen en el mismo milisegundo', () => {
    for (const style of SOUND_STYLES) {
      style.files.forEach((file, index) => {
        const plan = planLashSound(style.id, always((index + 0.5) / style.files.length), IMPACT_MS, ON)!
        assert.equal(plan.file, file)
        const crack = plan.soundDelayMs + file.crackAtMs
        const impact = plan.animationDelayMs + IMPACT_MS
        assert.ok(Math.abs(crack - impact) <= 1, `${file.path}: chasquido ${crack} ms, impacto ${impact} ms`)
        assert.ok(plan.soundDelayMs >= 0 && plan.animationDelayMs >= 0)
      })
    }
  })

  it('no suena si el sonido esta apagado o si el latigazo ya sono en otro lado', () => {
    let calls = 0
    const random = () => {
      calls += 1
      return 0.5
    }
    assert.equal(planLashSound('real', random, IMPACT_MS, { lashHasSound: true, soundOn: false }), null)
    assert.equal(planLashSound('real', random, IMPACT_MS, { lashHasSound: false, soundOn: true }), null)
    // Sin sonido ni siquiera se sortea el archivo (las capturas quedan iguales).
    assert.equal(calls, 0)
  })
})

describe('Probar', () => {
  it('toca ya mismo un archivo del estilo elegido, sin depender del interruptor de sonido', () => {
    for (const style of SOUND_STYLES) {
      const plan = planTestSound(style.id, always(0.5))
      assert.ok(soundStyle(style.id).files.includes(plan.file))
      assert.equal(plan.soundDelayMs, 0)
      assert.equal(plan.animationDelayMs, 0)
    }
  })

  it('con «Real · al azar» va cambiando entre las grabaciones', () => {
    const paths = new Set([0, 0.25, 0.5, 0.75, 0.95].map(value => planTestSound('real', always(value)).file.path))
    assert.ok(paths.size >= 5)
  })
})

describe('URIs de los sonidos en el webview', () => {
  it('lee el JSON de data-sounds', () => {
    const uris = parseSoundUris(JSON.stringify({ 'sonidos/real-1.wav': 'https://webview/real-1.wav', 'nivel.wav': 'https://webview/nivel.wav' }))
    assert.equal(uris.get('sonidos/real-1.wav'), 'https://webview/real-1.wav')
    assert.equal(uris.get('nivel.wav'), 'https://webview/nivel.wav')
    assert.equal(uris.size, 2)
  })

  it('lo roto o raro queda vacio, sin lanzar', () => {
    for (const text of [undefined, '', '{', 'null', '[]', '"hola"', '42']) assert.equal(parseSoundUris(text).size, 0, String(text))
    const mixed = parseSoundUris(JSON.stringify({ ok: 'uri', numero: 4, vacio: '', objeto: {} }))
    assert.deepEqual([...mixed.entries()], [['ok', 'uri']])
  })

  it('una clave como __proto__ no ensucia nada', () => {
    const uris = parseSoundUris('{"__proto__":"x","nivel.wav":"uri"}')
    assert.equal(uris.get('nivel.wav'), 'uri')
    assert.equal(({} as Record<string, unknown>).x, undefined)
  })
})
