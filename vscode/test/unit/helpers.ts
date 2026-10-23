import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { bridgePaths } from '../../../hooks/bridge'
import { BridgeStore } from '../../src/bridgeStore'
import type { Clock } from '../../src/clock'

/** Un reloj que solo avanza cuando la prueba lo pide. Zona horaria fija (UTC-5, Bogota). */
export class FakeClock implements Clock {
  constructor(
    public time = Date.UTC(2026, 9, 22, 15, 0, 0),
    public offsetMinutes = 300,
  ) {}

  now(): number {
    return this.time
  }

  timezoneOffsetMinutes(): number {
    return this.offsetMinutes
  }

  advance(ms: number): void {
    this.time += ms
  }
}

export type TempBridge = { home: string; store: BridgeStore; cleanup(): void }

export function tempBridge(): TempBridge {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'latigo-test-'))
  const store = new BridgeStore(bridgePaths(home))
  store.ensureDir()
  return { home, store, cleanup: () => fs.rmSync(home, { recursive: true, force: true }) }
}

export function writeRaw(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text, 'utf8')
}

export function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
}

export function waitFor(check: () => boolean, timeoutMs = 4000, intervalMs = 20): Promise<void> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (check()) return resolve()
      if (Date.now() - started > timeoutMs) return reject(new Error('timeout esperando la condicion'))
      setTimeout(tick, intervalMs)
    }
    tick()
  })
}
