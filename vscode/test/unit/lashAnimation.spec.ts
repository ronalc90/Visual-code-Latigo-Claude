import * as assert from 'node:assert/strict'

import { TIERS } from '../../../hooks/levels'
import { animationForExternal, animationForResult } from '../../src/lashAnimation'

describe('animaciones de latigazos', () => {
  it('un latigazo de la pantalla llega con el grito de su combo y sin sonido', () => {
    const lash = animationForExternal({ id: 'd1', at: 1, target: 'effort', combo: 3, total: 40, source: 'desktop' })
    assert.deepEqual(lash, { id: 'd1', target: 'effort', combo: 3, comboTitle: '¡TRIPLE!', total: 40, levelUp: false, reachedSession: true, sound: false, source: 'desktop' })
  })

  it('uno de la terminal tambien, y sin combo no hay grito', () => {
    const lash = animationForExternal({ id: 't1', at: 1, target: 'model', combo: 1, total: 3, source: 'terminal' })
    assert.equal(lash.source, 'terminal')
    assert.equal(lash.comboTitle, '')
    assert.equal(animationForExternal({ id: 't2', at: 1, target: 'model', combo: 20, total: 3, source: 'terminal' }).comboTitle, '¡¡DIOS DEL LÁTIGO!!')
  })

  it('marca la subida de nivel cuando el latigazo de afuera cruza el umbral', () => {
    const threshold = TIERS[1]!.minLashes
    assert.equal(animationForExternal({ id: 'a', at: 1, target: 'effort', combo: 1, total: threshold, source: 'desktop' }).levelUp, true)
    assert.equal(animationForExternal({ id: 'b', at: 1, target: 'effort', combo: 1, total: threshold + 1, source: 'desktop' }).levelUp, false)
  })

  it('uno de VS Code conserva lo que calculo el servicio', () => {
    const lash = animationForResult({ id: 'v', at: 1, target: 'effort', combo: 2, comboTitle: '¡DOBLE!', previousTotal: 1, total: 2, level: 1, levelUp: false, reachedSession: false, effortSeq: null, sound: true })
    assert.deepEqual(lash, { id: 'v', target: 'effort', combo: 2, comboTitle: '¡DOBLE!', total: 2, levelUp: false, reachedSession: false, sound: true, source: 'vscode' })
  })
})
