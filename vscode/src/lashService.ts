// El latigazo dado desde VS Code: combo, conteos, pedido de effort y aviso al
// otro lado. Las reglas (combo, conteo, niveles) son las de hooks/; aqui solo
// se ordena el flujo y se persiste a traves del BridgeStore.

import { isPresenceAlive } from '../../hooks/bridge'
import { progressFor, isLevelUp } from '../../hooks/levels'
import type { Stats, Target } from '../../hooks/model'
import { comboTitle, dayOf, EMPTY_STATS, mergeStats, nextCombo, recordLash } from '../../hooks/model'
import type { BridgeStore } from './bridgeStore'
import type { Clock } from './clock'
import { Emitter } from './events'

export type LashResult = {
  id: string
  at: number
  target: Target
  combo: number
  /** '' cuando no hay combo (combo 1). */
  comboTitle: string
  previousTotal: number
  total: number
  /** Nivel despues del latigazo. */
  level: number
  levelUp: boolean
  /** Al effort y con una sesion viva de Claude Code que lo va a aplicar. */
  reachedSession: boolean
  /** El contador de effort.json despues del latigazo, o null si no se toco. */
  effortSeq: number | null
  sound: boolean
}

export type IdFactory = () => string

const defaultId: IdFactory = () => `vscode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export class LashService {
  private lastLashAt: number | null = null
  private combo = 0
  /** Lo ultimo que se vio de las estadisticas; protege contra un archivo truncado. */
  private knownStats: Stats = EMPTY_STATS
  private readonly lashed = new Emitter<LashResult>()

  readonly onDidLash = this.lashed.event

  constructor(
    private readonly store: BridgeStore,
    private readonly clock: Clock,
    private readonly newId: IdFactory = defaultId,
    /** Los conteos que la extension ya conoce (lo que muestra el panel). */
    private readonly knownElsewhere: () => Stats = () => EMPTY_STATS,
  ) {}

  /** Da el latigazo. Devuelve null si el latigo esta apagado. */
  lash(target: Target): LashResult | null {
    const config = this.store.readConfig()
    if (!config.enabled) return null

    const now = this.clock.now()
    this.combo = nextCombo(this.lastLashAt, this.combo, now)
    this.lastLashAt = now
    const combo = this.combo

    // Si stats.json se lee vacio o a medias, lo ya conocido evita escribir un total menor.
    const known = mergeStats(this.knownStats, this.knownElsewhere())
    const before = mergeStats(known, this.store.readStats())
    const day = dayOf(now, this.clock.timezoneOffsetMinutes(now))
    const after = recordLash(before, target, combo, day)
    this.store.writeStats(after)
    this.knownStats = after

    let effortSeq: number | null = null
    let reachedSession = false
    if (target === 'effort' && isPresenceAlive(this.store.readPresence(), now)) {
      // Solo se pide effort si hay una sesion que lo aplique; si no, el
      // latigazo cuenta pero no queda un pedido colgado para la proxima sesion.
      effortSeq = this.store.incrementEffortSeq(now).seq
      reachedSession = true
    }

    const id = this.newId()
    this.store.writeLash({ id, at: now, target, combo, total: after.total, source: 'vscode' })

    const result: LashResult = {
      id,
      at: now,
      target,
      combo,
      comboTitle: comboTitle(combo),
      previousTotal: before.total,
      total: after.total,
      level: progressFor(after.total).tier.level,
      levelUp: isLevelUp(before.total, after.total),
      reachedSession,
      effortSeq,
      sound: config.sound,
    }
    this.lashed.fire(result)
    return result
  }

  dispose(): void {
    this.lashed.dispose()
  }
}
