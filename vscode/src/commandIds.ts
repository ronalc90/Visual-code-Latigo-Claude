/** Ids de los comandos; tienen que coincidir con package.json (lo revisa una prueba). */
export const COMMANDS = {
  open: 'latigo.open',
  toggle: 'latigo.toggle',
  turnOn: 'latigo.turnOn',
  turnOff: 'latigo.turnOff',
  lashEffort: 'latigo.lashEffort',
  lashModel: 'latigo.lashModel',
  toggleSound: 'latigo.toggleSound',
  soundOn: 'latigo.soundOn',
  soundOff: 'latigo.soundOff',
  showStats: 'latigo.showStats',
  installClaudePlugin: 'latigo.installClaudePlugin',
  toggleWhipMode: 'latigo.toggleWhipMode',
} as const

export const VIEW_CONTAINER_ID = 'latigo'
export const VIEW_ID = 'latigo.panel'

/** Contexto para los botones del titulo del panel. */
export const CONTEXT_ENABLED = 'latigo.enabled'
export const CONTEXT_SOUND = 'latigo.sound'

export const CLAUDE_PLUGIN_INSTALL = 'claude plugin install latigo --marketplace ronalc90/Visual-code-Latigo-Claude'
