// Los atajos de teclado que el panel le muestra a la persona. Modulo puro: lo
// usan el webview y las pruebas (que revisan que coincida con package.json).

/** El atajo de `latigo.toggle` tal como lo declara package.json. */
export const TOGGLE_KEYBINDING = { mac: 'ctrl+cmd+l', other: 'shift+alt+l' } as const

/** Como se escribe ese atajo en el panel. */
export const TOGGLE_KEY_LABEL = { mac: '⌃⌘L', other: 'Shift+Alt+L' } as const

/**
 * El atajo global de la app de escritorio (solo Mac). Hace lo mismo que el de
 * VS Code: con la app abierta, la app lo atrapa en todo el sistema.
 */
export const DESKTOP_APP_KEY_LABEL = TOGGLE_KEY_LABEL.mac

/** `navigator.platform` (o `process.platform`) dice si es un Mac. */
export function isMacPlatform(platform: string): boolean {
  const name = platform.toLowerCase()
  return name.includes('mac') || name === 'darwin'
}

/** El atajo para prender y apagar el latigo, como se muestra en este sistema. */
export function toggleKeyLabel(platform: string): string {
  return isMacPlatform(platform) ? TOGGLE_KEY_LABEL.mac : TOGGLE_KEY_LABEL.other
}
