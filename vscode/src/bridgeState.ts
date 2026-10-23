// La foto actual del puente (interruptor, conteos, sesion de Claude Code y app
// de escritorio) y los latigazos que llegan de afuera (la terminal o el latigo
// en pantalla). Se refresca cuando el watcher avisa o cuando la extension
// escribe algo.

import type { DesktopPresence, LashEvent, LatigoConfig, Presence } from '../../hooks/bridge'
import { isDesktopAlive, isPresenceAlive } from '../../hooks/bridge'
import type { Stats } from '../../hooks/model'
import { mergeStats } from '../../hooks/model'
import type { BridgeFile } from './bridgeWatcher'
import type { BridgeStore } from './bridgeStore'
import type { Clock } from './clock'
import { Emitter } from './events'

export type SessionInfo = {
  alive: boolean
  model: string | null
  effort: Presence['effort']
  boost: Presence['boost']
}

export type DesktopInfo = {
  /** La app de escritorio escribio su presencia hace poco. */
  alive: boolean
  /** El modo latigo (el puntero hecho latigo) esta activo; false si la app esta cerrada. */
  whipMode: boolean
}

export type BridgeSnapshot = {
  config: LatigoConfig
  stats: Stats
  session: SessionInfo
  desktop: DesktopInfo
}

function sessionFrom(presence: Presence | null, now: number): SessionInfo {
  const alive = isPresenceAlive(presence, now)
  return {
    alive,
    model: alive ? (presence?.model ?? null) : null,
    effort: alive ? (presence?.effort ?? null) : null,
    boost: alive ? (presence?.boost ?? null) : null,
  }
}

function desktopFrom(presence: DesktopPresence | null, now: number): DesktopInfo {
  const alive = isDesktopAlive(presence, now)
  return { alive, whipMode: alive && presence?.whipMode === true }
}

function sameSnapshot(a: BridgeSnapshot, b: BridgeSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export class BridgeState {
  private current: BridgeSnapshot
  private lastLashId: string | null
  private readonly changed = new Emitter<BridgeSnapshot>()
  private readonly externalLash = new Emitter<LashEvent>()

  readonly onDidChange = this.changed.event
  /** Un latigazo dado fuera de VS Code: en la banda de Claude Code o con el latigo en pantalla. */
  readonly onExternalLash = this.externalLash.event

  constructor(
    private readonly store: BridgeStore,
    private readonly clock: Clock,
  ) {
    this.current = this.read()
    // El latigazo que ya estaba en disco al arrancar no se vuelve a animar.
    this.lastLashId = this.store.readLash()?.id ?? null
  }

  get snapshot(): BridgeSnapshot {
    return this.current
  }

  private read(previousStats?: Stats): BridgeSnapshot {
    const stats = this.store.readStats()
    return {
      config: this.store.readConfig(),
      // Los conteos solo crecen: un archivo truncado no los devuelve a cero.
      stats: previousStats === undefined ? stats : mergeStats(previousStats, stats),
      session: sessionFrom(this.store.readPresence(), this.clock.now()),
      desktop: desktopFrom(this.store.readDesktop(), this.clock.now()),
    }
  }

  /** Relee el puente y avisa si algo cambio. `file` = el archivo que cambio, si se sabe. */
  refresh(file?: BridgeFile): void {
    if (file === 'lash' || file === undefined) this.checkLash()
    if (file === 'lash' || file === 'effort') return
    const next = this.read(this.current.stats)
    if (!sameSnapshot(next, this.current)) {
      this.current = next
      this.changed.fire(next)
    }
  }

  private checkLash(): void {
    const lash = this.store.readLash()
    if (lash === null || lash.id === this.lastLashId) return
    this.lastLashId = lash.id
    // Los de VS Code ya los animo el propio panel.
    if (lash.source !== 'vscode') this.externalLash.fire(lash)
  }

  dispose(): void {
    this.changed.dispose()
    this.externalLash.dispose()
  }
}
