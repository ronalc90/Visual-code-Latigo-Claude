// Sonidos del panel: el latigazo y la subida de nivel. Se clona el elemento
// para que los latigazos seguidos se puedan solapar.

export type SoundName = 'crack' | 'level'

export class SoundPlayer {
  private readonly sources: Record<SoundName, HTMLAudioElement | null>

  constructor(urls: Record<SoundName, string | undefined>) {
    this.sources = {
      crack: SoundPlayer.load(urls.crack),
      level: SoundPlayer.load(urls.level),
    }
  }

  private static load(url: string | undefined): HTMLAudioElement | null {
    if (url === undefined || url === '') return null
    try {
      const audio = new Audio(url)
      audio.preload = 'auto'
      return audio
    } catch {
      return null
    }
  }

  play(name: SoundName, volume: number): void {
    const source = this.sources[name]
    if (source === null || volume <= 0) return
    try {
      const audio = source.cloneNode(true) as HTMLAudioElement
      audio.volume = Math.min(1, Math.max(0, volume))
      // El navegador puede negarse a sonar sin un gesto previo: no pasa nada.
      void audio.play().catch(() => undefined)
    } catch {
      // Sin audio el latigo igual se ve.
    }
  }
}
