import { dayOf, topDays } from '../../hooks/model'
import type { BridgeSnapshot } from './bridgeState'
import type { ViewState } from './protocol'
import type { ExtensionSettings } from './settings'

/** Lo que sabe la extension de la app de escritorio, aparte del puente. */
export type DesktopAppStatus = {
  supported: boolean
  appMissing: boolean
}

export const NO_DESKTOP_APP: DesktopAppStatus = { supported: false, appMissing: false }

/** Lo que el panel necesita para pintarse, sacado del puente y de los ajustes. */
export function buildViewState(
  snapshot: BridgeSnapshot,
  settings: ExtensionSettings,
  now: number,
  offsetMinutes: number,
  desktopApp: DesktopAppStatus = NO_DESKTOP_APP,
): ViewState {
  const today = dayOf(now, offsetMinutes)
  return {
    enabled: snapshot.config.enabled,
    sound: snapshot.config.sound,
    soundStyle: snapshot.config.soundStyle,
    volume: settings.volume,
    reducedMotion: settings.reducedMotion,
    stats: snapshot.stats,
    today: snapshot.stats.byDay[today] ?? 0,
    topDays: topDays(snapshot.stats, 5),
    session: { ...snapshot.session },
    desktop: {
      supported: desktopApp.supported,
      alive: snapshot.desktop.alive,
      whipMode: snapshot.desktop.whipMode,
      hotkey: snapshot.desktop.hotkey,
      // Si la app ya esta abierta, el intento fallido quedo atras.
      appMissing: desktopApp.appMissing && !snapshot.desktop.alive,
    },
  }
}
