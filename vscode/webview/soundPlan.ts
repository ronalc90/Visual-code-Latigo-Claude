// Que sonido toca el panel y cuando. Modulo puro (sin DOM): lo usan el webview
// y las pruebas.

import type { SoundFile, SoundStyle } from '../../hooks/sounds'
import { crackDelayMs, pickSoundFile } from '../../hooks/sounds'

export type SoundPlan = {
  file: SoundFile
  /** Cuanto esperar para darle play al archivo. */
  soundDelayMs: number
  /** Cuanto esperar para arrancar la animacion del latigazo. */
  animationDelayMs: number
}

/**
 * El sonido de un latigazo del panel, sincronizado con la animacion: si el
 * golpe del archivo llega antes que el impacto de la animacion se atrasa el
 * play; si llega despues, se atrasa la animacion. Asi el chasquido cae justo
 * en el impacto. null si no suena: el latigazo viene sin sonido (lo puso otro
 * lado) o el sonido esta apagado.
 */
export function planLashSound(
  style: SoundStyle,
  random: () => number,
  impactMs: number,
  conditions: { lashHasSound: boolean; soundOn: boolean },
): SoundPlan | null {
  if (!conditions.lashHasSound || !conditions.soundOn) return null
  const file = pickSoundFile(style, random())
  return { file, soundDelayMs: crackDelayMs(file, impactMs), animationDelayMs: Math.max(0, Math.round(file.crackAtMs - impactMs)) }
}

/**
 * «Probar»: un archivo al azar del estilo, ya mismo. No depende del interruptor
 * de sonido porque es una accion explicita de la persona.
 */
export function planTestSound(style: SoundStyle, random: () => number): SoundPlan {
  return { file: pickSoundFile(style, random()), soundDelayMs: 0, animationDelayMs: 0 }
}
