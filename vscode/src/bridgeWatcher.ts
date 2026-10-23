// Vigila la carpeta del puente. `fs.watch` es inmediato pero en algunas
// plataformas se pierde eventos (o no funciona en carpetas de red), asi que
// ademas se sondea cada archivo con `fs.watchFile`. Los avisos se agrupan con
// un debounce corto para no releer el mismo archivo varias veces seguidas.

import * as fs from 'node:fs'
import * as path from 'node:path'

import type { BridgePaths } from '../../hooks/bridge'
import type { Disposable } from './events'

/** Los archivos que se vigilan; whipmode.json no, porque lo escribe la propia extension. */
export type BridgeFile = 'config' | 'stats' | 'effort' | 'lash' | 'presence' | 'desktop'

export const BRIDGE_FILES: readonly BridgeFile[] = ['config', 'stats', 'effort', 'lash', 'presence', 'desktop']

export type WatcherOptions = {
  debounceMs?: number
  pollIntervalMs?: number
}

export class BridgeWatcher implements Disposable {
  private readonly debounceMs: number
  private readonly pollIntervalMs: number
  private readonly timers = new Map<BridgeFile, ReturnType<typeof setTimeout>>()
  private readonly polled: string[] = []
  private watcher: fs.FSWatcher | undefined
  private disposed = false

  constructor(
    private readonly paths: BridgePaths,
    private readonly onChange: (file: BridgeFile) => void,
    options: WatcherOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 80
    this.pollIntervalMs = options.pollIntervalMs ?? 1000
  }

  start(): void {
    try {
      this.watcher = fs.watch(this.paths.dir, { persistent: false }, (_event, fileName) => {
        if (typeof fileName !== 'string' || fileName === '') {
          // Sin nombre de archivo (pasa en algunas plataformas): se revisan todos.
          for (const each of BRIDGE_FILES) this.schedule(each)
          return
        }
        const file = this.fileFor(fileName)
        if (file !== undefined) this.schedule(file)
      })
      this.watcher.on('error', () => this.closeWatcher())
    } catch {
      // Sin fs.watch queda el sondeo.
      this.watcher = undefined
    }
    for (const file of BRIDGE_FILES) {
      const full = this.paths[file]
      fs.watchFile(full, { persistent: false, interval: this.pollIntervalMs }, (current, previous) => {
        if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) this.schedule(file)
      })
      this.polled.push(full)
    }
  }

  /** El archivo del puente con ese nombre; los temporales y ajenos se ignoran. */
  private fileFor(fileName: string): BridgeFile | undefined {
    const base = path.basename(fileName)
    return BRIDGE_FILES.find(file => path.basename(this.paths[file]) === base)
  }

  private schedule(file: BridgeFile): void {
    if (this.disposed) return
    const pending = this.timers.get(file)
    if (pending !== undefined) clearTimeout(pending)
    this.timers.set(
      file,
      setTimeout(() => {
        this.timers.delete(file)
        if (!this.disposed) this.onChange(file)
      }, this.debounceMs),
    )
  }

  private closeWatcher(): void {
    try {
      this.watcher?.close()
    } catch {
      // Ya estaba cerrado.
    }
    this.watcher = undefined
  }

  dispose(): void {
    this.disposed = true
    this.closeWatcher()
    for (const full of this.polled.splice(0)) fs.unwatchFile(full)
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }
}
