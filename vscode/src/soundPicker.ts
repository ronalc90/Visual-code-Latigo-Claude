// La lista de «Látigo: Elegir sonido»: los estilos de hooks/sounds.ts con su
// descripcion, abierta en el que suena ahora.

import * as vscode from 'vscode'

import type { SoundStyle } from '../../hooks/sounds'
import { SOUND_STYLES } from '../../hooks/sounds'

type SoundItem = vscode.QuickPickItem & { style: SoundStyle }

/** Pregunta que sonido usar. Devuelve el elegido, o undefined si la persona cerro la lista. */
export function pickSoundStyle(current: SoundStyle): Promise<SoundStyle | undefined> {
  const items: SoundItem[] = SOUND_STYLES.map(style => ({
    label: style.label,
    description: style.id === current ? 'el que suena ahora' : undefined,
    detail: style.description,
    style: style.id,
  }))
  const picker = vscode.window.createQuickPick<SoundItem>()
  picker.title = 'Látigo: Elegir sonido'
  picker.placeholder = 'El sonido de cada latigazo'
  picker.matchOnDescription = true
  picker.matchOnDetail = true
  picker.items = items
  picker.activeItems = items.filter(item => item.style === current)
  return new Promise(resolve => {
    let chosen: SoundStyle | undefined
    picker.onDidAccept(() => {
      chosen = picker.selectedItems[0]?.style
      picker.hide()
    })
    picker.onDidHide(() => {
      picker.dispose()
      resolve(chosen)
    })
    picker.show()
  })
}
