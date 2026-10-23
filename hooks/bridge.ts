// El puente entre el mod de Claude Code y la extension de VS Code: unos pocos
// archivos JSON en `~/.claude-latigo/`. Cada lado lee y escribe aqui; ninguno
// abre sockets ni toca la red. Este modulo solo define rutas y formatos y
// valida lo que lee, para que un archivo roto nunca tumbe a nadie.

import type { Effort, Stats, Target } from './model'
import { isEffort, normalizeStats } from './model'
import type { SoundStyle } from './sounds'
import { DEFAULT_SOUND_STYLE, isSoundStyle } from './sounds'

export const BRIDGE_DIR_NAME = '.claude-latigo'
export const BRIDGE_VERSION = 1

export type BridgePaths = {
  dir: string
  /** El interruptor del latigo y las preferencias de sonido: lo cambian el atajo, los botones y /latigo on|off. */
  config: string
  /** Conteos de latigazos (la tabla y el nivel salen de aqui). */
  stats: string
  /** Latigazos al effort que manda VS Code; Claude Code los aplica. */
  effort: string
  /** El ultimo latigazo, para que el otro lado tambien lo anime. */
  lash: string
  /** Lo escribe el mod cada pocos segundos: hay una sesion viva y con que effort. */
  presence: string
  /** Lo escribe la app de escritorio: esta abierta, si el puntero es un latigo y si su atajo funciona. */
  desktop: string
}

export function bridgePaths(home: string): BridgePaths {
  const dir = `${home.replace(/[\\/]+$/, '')}/${BRIDGE_DIR_NAME}`
  return {
    dir,
    config: `${dir}/config.json`,
    stats: `${dir}/stats.json`,
    effort: `${dir}/effort.json`,
    lash: `${dir}/lash.json`,
    presence: `${dir}/presence.json`,
    desktop: `${dir}/desktop.json`,
  }
}

export type LatigoConfig = {
  /**
   * El unico interruptor. Prendido: el puntero es un latigo (con la app de
   * escritorio abierta), la banda de la consola anda y los latigazos suben el
   * effort. Apagado: todo normal y el effort vuelve a ser el de la sesion.
   */
  enabled: boolean
  sound: boolean
  /** Que sonido usar (ver hooks/sounds.ts). */
  soundStyle: SoundStyle
}

export const DEFAULT_CONFIG: LatigoConfig = { enabled: true, sound: true, soundStyle: DEFAULT_SOUND_STYLE }

export type EffortRequests = {
  /** Sube 1 por cada latigazo al effort dado en VS Code. */
  seq: number
  at: number
}

/** Quien dio el latigazo: la banda de la consola, el panel de VS Code o la app de escritorio (el latigo en pantalla). */
export type LashSource = 'terminal' | 'vscode' | 'desktop'

export type LashEvent = {
  id: string
  at: number
  target: Target
  combo: number
  /** Total de latigazos despues de este. */
  total: number
  source: LashSource
}

function parseJson(text: string | undefined | null): unknown {
  if (typeof text !== 'string' || text.trim() === '') return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function parseConfig(text: string | undefined | null): LatigoConfig {
  const raw = asRecord(parseJson(text))
  if (raw === undefined) return DEFAULT_CONFIG
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_CONFIG.enabled,
    sound: typeof raw.sound === 'boolean' ? raw.sound : DEFAULT_CONFIG.sound,
    soundStyle: isSoundStyle(raw.soundStyle) ? raw.soundStyle : DEFAULT_CONFIG.soundStyle,
  }
}

export function serializeConfig(config: LatigoConfig): string {
  return JSON.stringify({ version: BRIDGE_VERSION, enabled: config.enabled, sound: config.sound, soundStyle: config.soundStyle }, null, 2) + '\n'
}

export function parseStatsFile(text: string | undefined | null): Stats {
  const raw = asRecord(parseJson(text))
  return normalizeStats(raw?.stats)
}

export function serializeStats(stats: Stats): string {
  return JSON.stringify({ version: BRIDGE_VERSION, stats }, null, 2) + '\n'
}

export function parseEffortRequests(text: string | undefined | null): EffortRequests {
  const raw = asRecord(parseJson(text))
  const seq = Math.floor(finiteNumber(raw?.seq, 0))
  return { seq: seq > 0 ? seq : 0, at: finiteNumber(raw?.at, 0) }
}

/**
 * Como parseEffortRequests, pero sin inventar: null si el archivo falta o no es
 * un pedido valido. Sirve para distinguir un contador reiniciado (un numero
 * menor, leido bien) de una lectura que fallo un instante.
 */
export function parseEffortRequestsStrict(text: string | undefined | null): EffortRequests | null {
  const raw = asRecord(parseJson(text))
  if (raw === undefined || typeof raw.seq !== 'number' || !Number.isFinite(raw.seq) || raw.seq < 0) return null
  return { seq: Math.floor(raw.seq), at: finiteNumber(raw.at, 0) }
}

export function serializeEffortRequests(requests: EffortRequests): string {
  return JSON.stringify({ version: BRIDGE_VERSION, seq: requests.seq, at: requests.at }) + '\n'
}

export function parseLashEvent(text: string | undefined | null): LashEvent | null {
  const raw = asRecord(parseJson(text))
  if (raw === undefined) return null
  const target = raw.target
  const source = raw.source
  if (typeof raw.id !== 'string' || (target !== 'model' && target !== 'effort') || (source !== 'terminal' && source !== 'vscode' && source !== 'desktop')) {
    return null
  }
  return {
    id: raw.id,
    at: finiteNumber(raw.at, 0),
    target,
    combo: Math.max(1, Math.floor(finiteNumber(raw.combo, 1))),
    total: Math.max(0, Math.floor(finiteNumber(raw.total, 0))),
    source,
  }
}

export function serializeLashEvent(event: LashEvent): string {
  return JSON.stringify({ version: BRIDGE_VERSION, ...event }) + '\n'
}

/** Una sesion de Claude Code se da por viva si escribio presencia hace menos de esto. */
export const PRESENCE_TTL_MS = 15_000

export type Presence = {
  at: number
  model: string | null
  /** El effort que la sesion usa sin latigo. */
  effort: Effort | null
  /** El effort que el latigo esta forzando, o null. */
  boost: Effort | null
}

export function parsePresence(text: string | undefined | null): Presence | null {
  const raw = asRecord(parseJson(text))
  if (raw === undefined) return null
  return {
    at: finiteNumber(raw.at, 0),
    model: typeof raw.model === 'string' ? raw.model : null,
    effort: isEffort(raw.effort) ? raw.effort : null,
    boost: isEffort(raw.boost) ? raw.boost : null,
  }
}

export function serializePresence(presence: Presence): string {
  return JSON.stringify({ version: BRIDGE_VERSION, ...presence }) + '\n'
}

export function isPresenceAlive(presence: Presence | null, now: number): boolean {
  return presence !== null && now - presence.at >= 0 && now - presence.at < PRESENCE_TTL_MS
}

/** La app de escritorio se da por abierta si escribio presencia hace menos de esto. */
export const DESKTOP_TTL_MS = 6_000

/** Si el atajo global de la app funciona: `ocupado` cuando otra app ya lo tiene. */
export type HotkeyStatus = 'ok' | 'ocupado'

export type DesktopPresence = {
  at: number
  /** El puntero es un latigo ahora (la app esta abierta y el latigo prendido). */
  whipMode: boolean
  hotkey: HotkeyStatus
}

export function parseDesktopPresence(text: string | undefined | null): DesktopPresence | null {
  const raw = asRecord(parseJson(text))
  if (raw === undefined) return null
  return { at: finiteNumber(raw.at, 0), whipMode: raw.whipMode === true, hotkey: raw.hotkey === 'ocupado' ? 'ocupado' : 'ok' }
}

export function serializeDesktopPresence(presence: DesktopPresence): string {
  return JSON.stringify({ version: BRIDGE_VERSION, ...presence }) + '\n'
}

export function isDesktopAlive(presence: DesktopPresence | null, now: number): boolean {
  return presence !== null && now - presence.at >= 0 && now - presence.at < DESKTOP_TTL_MS
}
