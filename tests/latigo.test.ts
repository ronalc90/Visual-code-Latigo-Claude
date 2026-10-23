import { describe, expect, mock, test } from 'claude-code/testing'

import {
  COMBO_WINDOW_MS,
  EMPTY_STATS,
  comboTitle,
  nextCombo,
  normalizeStats,
  raiseEffort,
  recordLash,
  statsTable,
} from '../hooks/logic'

const BAND = {
  plugin: 'latigo',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

describe('reglas del latigo', () => {
  test('el effort sube un nivel por latigazo y se planta en max', async () => {
    expect(raiseEffort('low')).toBe('medium')
    expect(raiseEffort('high')).toBe('xhigh')
    expect(raiseEffort('xhigh')).toBe('max')
    expect(raiseEffort('max')).toBe(null)
  })

  test('el combo sigue dentro de la ventana y se reinicia fuera', async () => {
    expect(nextCombo(null, 0, 1000)).toBe(1)
    expect(nextCombo(1000, 1, 1000 + COMBO_WINDOW_MS)).toBe(2)
    expect(nextCombo(1000, 4, 1000 + COMBO_WINDOW_MS + 1)).toBe(1)
    expect(comboTitle(1)).toBe('')
    expect(comboTitle(2)).toBe('¡DOBLE!')
    expect(comboTitle(3)).toBe('¡TRIPLE!')
    expect(comboTitle(10)).toBe('¡LEYENDA!')
  })

  test('la tabla cuenta por blanco, por dia y guarda el mejor combo', async () => {
    let stats = recordLash(EMPTY_STATS, 'effort', 1, '2026-10-22')
    stats = recordLash(stats, 'effort', 2, '2026-10-22')
    stats = recordLash(stats, 'model', 1, '2026-10-23')
    expect(stats).toEqual({
      total: 3,
      onModel: 1,
      onEffort: 2,
      bestCombo: 2,
      byDay: { '2026-10-22': 2, '2026-10-23': 1 },
    })
    const table = statsTable(stats, '2026-10-22', 'xhigh')
    expect(table).toContain('| Latigazos en total | 3 |')
    expect(table).toContain('| Hoy | 2 |')
    expect(table).toContain('| Mejor combo | x2 |')
    expect(table).toContain('| 1 | 2026-10-22 | 2 |')
  })

  test('lo que venga roto del store no tumba la tabla', async () => {
    expect(normalizeStats(undefined)).toEqual(EMPTY_STATS)
    expect(normalizeStats('basura')).toEqual(EMPTY_STATS)
    expect(normalizeStats({ total: -4, bestCombo: 2.7, byDay: { x: 'y' } })).toEqual({
      total: 0,
      onModel: 0,
      onEffort: 0,
      bestCombo: 2,
      byDay: { x: 0 },
    })
  })
})

describe('la banda', () => {
  for (const surface of ['terminal', 'vscode', 'desktop'] as const) {
    test(`en ${surface}: latigazo al effort lo sube y dos seguidos hacen combo`, async ($, on) => {
      const clock = mock.clock(on, { now: 1_000_000 })
      mock.store(on)
      const ui = await $.ui.mount({ ...BAND, surface })

      expect((await ui.find({ key: 'effort' }))?.props.label).toBe('effort: ?')

      await ui.press({ key: 'effort' })
      await clock.advance(200)
      await ui.press({ key: 'effort' })
      await clock.settle()

      expect(await ui.find({ text: /x2 ¡DOBLE!/ })).toBeDefined()

      await clock.advance(2000)
      expect((await ui.find({ key: 'effort' }))?.props.label).toBe('effort: xhigh ⚡')
      expect(await ui.find({ text: /2 latigazos/ })).toBeDefined()
      await ui.unmount()
    })

    test(`en ${surface}: latigazo al modelo es solo visual`, async ($, on) => {
      const clock = mock.clock(on, { now: 1_000_000 })
      mock.store(on)
      const ui = await $.ui.mount({ ...BAND, surface })

      await ui.press({ key: 'model' })
      await clock.advance(2000)

      expect((await ui.find({ key: 'effort' }))?.props.label).toBe('effort: ?')
      expect(await ui.find({ text: /1 latigazo$/ })).toBeDefined()
      await ui.unmount()
    })
  }
})
