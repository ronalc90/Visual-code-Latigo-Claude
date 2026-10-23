// Lo que el panel anima por cada latigazo, sea de VS Code o de afuera (la
// terminal o el latigo en pantalla). Modulo puro: sin vscode.

import type { LashEvent } from '../../hooks/bridge'
import { isLevelUp } from '../../hooks/levels'
import { comboTitle } from '../../hooks/model'
import type { LashResult } from './lashService'
import type { LashAnimation } from './protocol'

/** Un latigazo dado en el panel o con un comando de VS Code. */
export function animationForResult(result: LashResult): LashAnimation {
  return {
    id: result.id,
    target: result.target,
    combo: result.combo,
    comboTitle: result.comboTitle,
    total: result.total,
    levelUp: result.levelUp,
    reachedSession: result.reachedSession,
    sound: result.sound,
    source: 'vscode',
  }
}

/** Un latigazo dado fuera de VS Code, con el grito de su combo. */
export function animationForExternal(event: LashEvent): LashAnimation {
  return {
    id: event.id,
    target: event.target,
    combo: event.combo,
    comboTitle: comboTitle(event.combo),
    total: event.total,
    levelUp: isLevelUp(event.total - 1, event.total),
    reachedSession: true,
    // El sonido ya lo pone quien dio el latigazo (la terminal o la app).
    sound: false,
    source: event.source,
  }
}
