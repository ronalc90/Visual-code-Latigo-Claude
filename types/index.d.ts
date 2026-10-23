export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Donde cayo el latigazo: el modelo es solo visual, el effort lo sube. */
export type Target = 'model' | 'effort'

/** El latigazo que se esta animando ahora. */
export type Lash = {
  frame: number
  target: Target
  combo: number
  raisedTo: Effort | null
}

export type Stats = {
  total: number
  onModel: number
  onEffort: number
  bestCombo: number
  byDay: Record<string, number>
}

declare module 'claude-code' {
  interface PluginState {
    latigo: {
      lash: Lash | null
      model: string | null
      effort: Effort | null
      boost: Effort | null
      stats: Stats
    }
  }
}
