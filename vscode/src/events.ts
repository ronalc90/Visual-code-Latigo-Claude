/** Algo que se puede soltar; compatible con `vscode.Disposable`. */
export interface Disposable {
  dispose(): void
}

export type Listener<T> = (value: T) => void

/** Un emisor tipado sin dependencias de VS Code, para poder probarlo en Node. */
export class Emitter<T> implements Disposable {
  private readonly listeners = new Set<Listener<T>>()

  readonly event = (listener: Listener<T>): Disposable => {
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }

  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(value)
      } catch {
        // Un oyente roto no tumba a los demas.
      }
    }
  }

  dispose(): void {
    this.listeners.clear()
  }
}
