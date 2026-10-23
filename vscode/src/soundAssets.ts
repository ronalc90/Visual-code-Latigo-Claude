// Los sonidos que la extension lleva en media/: todos los archivos de los
// estilos de hooks/sounds.ts (la unica fuente de verdad) y el de subir de
// nivel. Modulo puro: lo usan el build (para copiarlos desde assets/), el panel
// (para pasarle sus URIs al webview) y las pruebas.

import { SOUND_STYLES } from '../../hooks/sounds'

/** El sonido de subir de nivel, dentro de assets/ y de media/. */
export const LEVEL_SOUND = 'nivel.wav'

/** Los archivos de los latigazos, sin repetir y en el orden de SOUND_STYLES (p. ej. `sonidos/real-1.wav`). */
export function lashSoundPaths(): string[] {
  return [...new Set(SOUND_STYLES.flatMap(style => style.files.map(file => file.path)))]
}

/** Todo lo que el build copia de assets/ a media/, con la misma ruta relativa. */
export function soundAssetPaths(): string[] {
  return [...lashSoundPaths(), LEVEL_SOUND]
}

/** Los que no estan, segun `exists` (la ruta relativa a la carpeta de los sonidos). */
export function missingSoundAssets(paths: readonly string[], exists: (path: string) => boolean): string[] {
  return paths.filter(path => !exists(path))
}

/** El error del build cuando falta algun sonido: que falta, donde se busco y que hacer. */
export function missingSoundsMessage(missing: readonly string[], assetsDir: string): string {
  return [
    `Faltan ${missing.length === 1 ? '1 sonido' : `${missing.length} sonidos`} del látigo en ${assetsDir}:`,
    ...missing.map(path => `  - ${path}`),
    'Son los archivos de SOUND_STYLES (hooks/sounds.ts) más nivel.wav. Recupéralos o corrige hooks/sounds.ts antes de compilar.',
  ].join('\n')
}
