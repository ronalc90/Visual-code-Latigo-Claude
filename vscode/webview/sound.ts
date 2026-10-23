// Sonidos del panel: los latigazos (el estilo elegido) y la subida de nivel.
// Cada archivo se carga una sola vez y se clona al sonar, para que los
// latigazos seguidos se puedan solapar.

/**
 * Las URIs de los sonidos que manda la extension en `data-sounds` (JSON con
 * la ruta de cada archivo). Lo que no sea texto se descarta; lo roto da vacio.
 */
export function parseSoundUris(text: string | undefined): Map<string, string> {
  const uris = new Map<string, string>()
  if (text === undefined || text === '') return uris
  try {
    const raw = JSON.parse(text) as unknown
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return uris
    for (const [path, uri] of Object.entries(raw)) {
      if (typeof uri === 'string' && uri !== '') uris.set(path, uri)
    }
  } catch {
    // Sin sonidos el latigo igual se ve.
  }
  return uris
}

export class SoundPlayer {
  private readonly loaded = new Map<string, HTMLAudioElement | null>()

  constructor(private readonly uris: ReadonlyMap<string, string>) {}

  /** Deja cargados estos archivos, para que el primer latigazo no espere. */
  prepare(paths: readonly string[]): void {
    for (const path of paths) this.source(path)
  }

  /** Suena `path` (la ruta dentro de media/) a este volumen, dentro de `delayMs`. */
  play(path: string, volume: number, delayMs = 0): void {
    const source = this.source(path)
    if (source === null || volume <= 0) return
    const start = () => {
      try {
        const audio = source.cloneNode(true) as HTMLAudioElement
        audio.volume = Math.min(1, Math.max(0, volume))
        // El navegador puede negarse a sonar sin un gesto previo: no pasa nada.
        void audio.play().catch(() => undefined)
      } catch {
        // Sin audio el latigo igual se ve.
      }
    }
    if (delayMs > 0) window.setTimeout(start, delayMs)
    else start()
  }

  private source(path: string): HTMLAudioElement | null {
    const known = this.loaded.get(path)
    if (known !== undefined) return known
    const audio = SoundPlayer.load(this.uris.get(path))
    this.loaded.set(path, audio)
    return audio
  }

  private static load(uri: string | undefined): HTMLAudioElement | null {
    if (uri === undefined) return null
    try {
      const audio = new Audio(uri)
      audio.preload = 'auto'
      return audio
    } catch {
      return null
    }
  }
}
