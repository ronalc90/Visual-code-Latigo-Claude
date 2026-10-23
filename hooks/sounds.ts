// Los sonidos que se pueden elegir. Modulo puro: lo usan el plugin, la extension
// de VS Code y (copiado a JSON al compilar) la app de escritorio.
//
// Como suena un latigo real, segun 6 grabaciones (scripts/sonidos_reales.py):
// el zumbido antes del golpe casi no se oye (40 a 60 dB por debajo); el golpe es
// un chasquido instantaneo que cubre todas las frecuencias (centro en 4,5-5,5 kHz,
// sin graves); y despues viene un siseo que se apaga en 120 a 500 ms: el
// "suufff" del aire. A veces el chasquido es doble.

export type SoundStyle = 'real' | 'real-1' | 'real-2' | 'real-3' | 'real-4' | 'real-5' | 'real-6' | 'aire' | 'suave'

export type SoundFile = {
  /** Dentro de assets/. */
  path: string
  /**
   * Cuando suena el golpe, en ms desde que arranca el archivo. Con esto la
   * animacion pega justo con el chasquido; las pruebas de la app de escritorio
   * comprueban que coincide con el archivo.
   */
  crackAtMs: number
}

export type SoundStyleInfo = {
  id: SoundStyle
  label: string
  description: string
  /** Cada latigazo toma uno al azar. */
  files: readonly SoundFile[]
}

const REAL: readonly SoundFile[] = [150, 150, 150, 180, 346, 353].map((crackAtMs, index) => ({
  path: `sonidos/real-${index + 1}.wav`,
  crackAtMs,
}))

const AIRE: readonly SoundFile[] = [160, 140, 200, 180].map((crackAtMs, index) => ({
  path: `sonidos/aire-${index + 1}.wav`,
  crackAtMs,
}))

const SUAVE: readonly SoundFile[] = [90, 110].map((crackAtMs, index) => ({
  path: `sonidos/suave-${index + 1}.wav`,
  crackAtMs,
}))

export const SOUND_STYLES: readonly SoundStyleInfo[] = [
  { id: 'real', label: 'Real · al azar', description: 'Cada latigazo usa una de las 6 grabaciones reales.', files: REAL },
  { id: 'real-1', label: 'Real 1 · seco', description: 'Chasquido limpio y corto.', files: [REAL[0]!] },
  { id: 'real-2', label: 'Real 2 · doble', description: 'Dos chasquidos casi juntos.', files: [REAL[1]!] },
  { id: 'real-3', label: 'Real 3 · corto', description: 'Chasquido corto con un eco leve.', files: [REAL[2]!] },
  { id: 'real-4', label: 'Real 4 · suufff largo', description: 'El siseo del aire se queda sonando.', files: [REAL[3]!] },
  { id: 'real-5', label: 'Real 5 · completo', description: 'Se oye el látigo cortando el aire antes del golpe.', files: [REAL[4]!] },
  { id: 'real-6', label: 'Real 6 · completo 2', description: 'Otro latigazo completo, más seco.', files: [REAL[5]!] },
  {
    id: 'aire',
    label: 'Aire · sintético',
    description: 'Hecho imitando las grabaciones; en la app de escritorio cambia con cómo mueves el mouse.',
    files: AIRE,
  },
  { id: 'suave', label: 'Suave · para la oficina', description: 'Un chasquido bajito y corto.', files: SUAVE },
]

export const DEFAULT_SOUND_STYLE: SoundStyle = 'real'

export function isSoundStyle(value: unknown): value is SoundStyle {
  return typeof value === 'string' && SOUND_STYLES.some(style => style.id === value)
}

export function soundStyle(id: SoundStyle): SoundStyleInfo {
  return SOUND_STYLES.find(style => style.id === id) ?? SOUND_STYLES[0]!
}

/** Un archivo del estilo, elegido con `random` en [0, 1). */
export function pickSoundFile(id: SoundStyle, random: number): SoundFile {
  const files = soundStyle(id).files
  return files[Math.min(files.length - 1, Math.floor(Math.max(0, random) * files.length))]!
}

/** Cuanto esperar para dar play y que el golpe del archivo caiga en `impactMs`. */
export function crackDelayMs(file: SoundFile, impactMs: number): number {
  return Math.max(0, Math.round(impactMs - file.crackAtMs))
}
