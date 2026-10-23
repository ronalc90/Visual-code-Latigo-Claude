import { dayOf, topDays } from '../../hooks/model'
import type { BridgeSnapshot } from './bridgeState'
import type { ViewState } from './protocol'
import type { ExtensionSettings } from './settings'

/** Lo que el panel necesita para pintarse, sacado del puente y de los ajustes. */
export function buildViewState(snapshot: BridgeSnapshot, settings: ExtensionSettings, now: number, offsetMinutes: number): ViewState {
  const today = dayOf(now, offsetMinutes)
  return {
    enabled: snapshot.config.enabled,
    sound: snapshot.config.sound,
    volume: settings.volume,
    reducedMotion: settings.reducedMotion,
    stats: snapshot.stats,
    today: snapshot.stats.byDay[today] ?? 0,
    topDays: topDays(snapshot.stats, 5),
    session: { ...snapshot.session },
  }
}
