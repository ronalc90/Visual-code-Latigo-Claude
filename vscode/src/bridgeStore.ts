// Lectura y escritura de los archivos del puente en `~/.claude-latigo/`.
// Los formatos y los parsers son los de hooks/bridge.ts (la unica fuente de
// verdad); aqui solo va el disco: escrituras atomicas y lecturas que nunca
// lanzan aunque el archivo este roto o no exista.

import * as fs from 'node:fs'
import * as path from 'node:path'

import type { BridgePaths, EffortRequests, LashEvent, LatigoConfig, Presence } from '../../hooks/bridge'
import {
  parseConfig,
  parseEffortRequests,
  parseLashEvent,
  parsePresence,
  parseStatsFile,
  serializeConfig,
  serializeEffortRequests,
  serializeLashEvent,
  serializeStats,
} from '../../hooks/bridge'
import type { Stats } from '../../hooks/model'

/** Las operaciones de disco que usa el store; se pueden reemplazar en pruebas. */
export interface FileSystem {
  readText(file: string): string | undefined
  writeTextAtomic(file: string, text: string): void
  ensureDir(dir: string): void
}

let tempCounter = 0

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES'])

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Renombra reintentando unas veces si el sistema dice que el archivo esta
 * ocupado (pasa en Windows cuando otro proceso lo tiene abierto un instante).
 */
export function renameWithRetry(
  rename: (from: string, to: string) => void,
  from: string,
  to: string,
  attempts = 5,
  wait: (ms: number) => void = sleepSync,
): void {
  for (let attempt = 1; ; attempt++) {
    try {
      rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (attempt >= attempts || code === undefined || !RETRYABLE.has(code)) throw error
      wait(15 * attempt)
    }
  }
}

export const nodeFileSystem: FileSystem = {
  readText(file) {
    try {
      return fs.readFileSync(file, 'utf8')
    } catch {
      return undefined
    }
  },
  writeTextAtomic(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    tempCounter += 1
    const temp = `${file}.${process.pid}.${Date.now()}.${tempCounter}.tmp`
    try {
      fs.writeFileSync(temp, text, 'utf8')
      renameWithRetry(fs.renameSync, temp, file)
    } catch (error) {
      try {
        fs.rmSync(temp, { force: true })
      } catch {
        // Nada mas que limpiar.
      }
      throw error
    }
  },
  ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true })
  },
}

export class BridgeStore {
  constructor(
    readonly paths: BridgePaths,
    private readonly files: FileSystem = nodeFileSystem,
  ) {}

  ensureDir(): void {
    this.files.ensureDir(this.paths.dir)
  }

  readConfig(): LatigoConfig {
    return parseConfig(this.files.readText(this.paths.config))
  }

  writeConfig(config: LatigoConfig): void {
    this.files.writeTextAtomic(this.paths.config, serializeConfig(config))
  }

  /** Lee, cambia solo lo pedido y escribe; devuelve como quedo. */
  updateConfig(patch: Partial<LatigoConfig>): LatigoConfig {
    const next = { ...this.readConfig(), ...patch }
    this.writeConfig(next)
    return next
  }

  readStats(): Stats {
    return parseStatsFile(this.files.readText(this.paths.stats))
  }

  writeStats(stats: Stats): void {
    this.files.writeTextAtomic(this.paths.stats, serializeStats(stats))
  }

  readEffortRequests(): EffortRequests {
    return parseEffortRequests(this.files.readText(this.paths.effort))
  }

  /** Suma un latigazo al effort para que Claude Code lo aplique. */
  incrementEffortSeq(at: number): EffortRequests {
    const next = { seq: this.readEffortRequests().seq + 1, at }
    this.files.writeTextAtomic(this.paths.effort, serializeEffortRequests(next))
    return next
  }

  readLash(): LashEvent | null {
    return parseLashEvent(this.files.readText(this.paths.lash))
  }

  writeLash(event: LashEvent): void {
    this.files.writeTextAtomic(this.paths.lash, serializeLashEvent(event))
  }

  readPresence(): Presence | null {
    return parsePresence(this.files.readText(this.paths.presence))
  }
}
