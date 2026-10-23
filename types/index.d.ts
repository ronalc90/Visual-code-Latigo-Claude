export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Donde cayo el latigazo: el modelo es solo visual, el effort lo sube. */
export type Target = 'model' | 'effort'

export type Stats = {
  total: number
  onModel: number
  onEffort: number
  bestCombo: number
  /** Latigazos por dia local, `YYYY-MM-DD`. */
  byDay: Record<string, number>
}

/** El latigazo que se esta animando ahora. */
export type Lash = {
  frame: number
  target: Target
  combo: number
  raisedTo: Effort | null
  isLevelUp: boolean
}

declare module 'claude-code' {
  interface PluginState {
    latigo: {
      lash: Lash | null
      model: string | null
      effort: Effort | null
      boost: Effort | null
      stats: Stats
      enabled: boolean
      sound: boolean
      twinkle: number
      /** Ya se cargaron conteos e interruptor en esta sesion (un /clear arranca otra). */
      ready: boolean
    }
  }
}
