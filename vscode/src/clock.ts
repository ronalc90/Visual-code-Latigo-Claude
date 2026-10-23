/** La hora del sistema, inyectable para que las pruebas controlen el tiempo. */
export interface Clock {
  now(): number
  /** Minutos de desfase local en el instante `at`, como `Date#getTimezoneOffset`. */
  timezoneOffsetMinutes(at: number): number
}

export const systemClock: Clock = {
  now: () => Date.now(),
  timezoneOffsetMinutes: at => new Date(at).getTimezoneOffset(),
}
