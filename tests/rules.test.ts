// Reglas puras: modelo de juego, niveles, puente y textos de la banda.

import { describe, expect, test } from 'claude-code/testing'

import { FRAME_COUNT, IMPACT_FROM, SKY_WIDTH, WHIP_WIDTH, layoutBand, levelBadge, partsWidth, skyRow, statsTable, whipParts } from '../hooks/band'
import {
  DEFAULT_CONFIG,
  DESKTOP_TTL_MS,
  PRESENCE_TTL_MS,
  bridgePaths,
  isDesktopAlive,
  isPresenceAlive,
  parseDesktopPresence,
  parseWhipModeRequest,
  serializeDesktopPresence,
  serializeWhipModeRequest,
  parseConfig,
  parseEffortRequests,
  parseEffortRequestsStrict,
  parseLashEvent,
  parsePresence,
  parseStatsFile,
  serializeConfig,
  serializeEffortRequests,
  serializeLashEvent,
  serializePresence,
  serializeStats,
} from '../hooks/bridge'
import { MAX_LEVEL, TIERS, isLevelUp, lookFor, mixHex, progressBar, progressFor, seededRandom, sparkRow } from '../hooks/levels'
import {
  COMBO_WINDOW_MS,
  EMPTY_STATS,
  comboTitle,
  effectiveEffort,
  isForcing,
  dayOf,
  mergeStats,
  nextCombo,
  normalizeStats,
  raiseEffort,
  raiseEffortBy,
  recordLash,
  topDays,
} from '../hooks/model'

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
}

describe('effort', () => {
  test('sube un nivel por latigazo y se planta en max', async () => {
    expect(raiseEffort('low')).toBe('medium')
    expect(raiseEffort('medium')).toBe('high')
    expect(raiseEffort('high')).toBe('xhigh')
    expect(raiseEffort('xhigh')).toBe('max')
    expect(raiseEffort('max')).toBe(null)
  })

  test('varios latigazos de golpe suben varios niveles sin pasar de max', async () => {
    expect(raiseEffortBy('low', 2)).toBe('high')
    expect(raiseEffortBy('high', 10)).toBe('max')
    expect(raiseEffortBy('medium', 0)).toBe('medium')
    expect(raiseEffortBy('medium', -3)).toBe('medium')
  })
})

describe('effort que sale', () => {
  test('sale el mayor entre el de la sesion y el forzado', async () => {
    expect(effectiveEffort(null, null)).toBe(null)
    expect(effectiveEffort('high', null)).toBe('high')
    expect(effectiveEffort(null, 'xhigh')).toBe('xhigh')
    expect(effectiveEffort('high', 'xhigh')).toBe('xhigh')
    expect(effectiveEffort('max', 'xhigh')).toBe('max')
  })

  test('el ⚡ solo cuando el latigo de verdad sube algo', async () => {
    expect(isForcing(null, null)).toBe(false)
    expect(isForcing('high', null)).toBe(false)
    expect(isForcing(null, 'high')).toBe(true)
    expect(isForcing('medium', 'high')).toBe(true)
    expect(isForcing('high', 'high')).toBe(false)
    expect(isForcing('max', 'xhigh')).toBe(false)
  })
})

describe('combos', () => {
  test('sigue dentro de la ventana y se reinicia fuera', async () => {
    expect(nextCombo(null, 0, 1000)).toBe(1)
    expect(nextCombo(1000, 1, 1000 + COMBO_WINDOW_MS)).toBe(2)
    expect(nextCombo(1000, 4, 1000 + COMBO_WINDOW_MS + 1)).toBe(1)
  })

  test('un reloj que va hacia atras no suma combo', async () => {
    expect(nextCombo(5000, 3, 4000)).toBe(1)
  })

  test('cada umbral tiene su grito', async () => {
    expect(comboTitle(1)).toBe('')
    expect(comboTitle(2)).toBe('¡DOBLE!')
    expect(comboTitle(3)).toBe('¡TRIPLE!')
    expect(comboTitle(5)).toBe('¡FURIA!')
    expect(comboTitle(7)).toBe('¡IMPARABLE!')
    expect(comboTitle(10)).toBe('¡LEYENDA!')
    expect(comboTitle(20)).toBe('¡¡DIOS DEL LÁTIGO!!')
    expect(comboTitle(999)).toBe('¡¡DIOS DEL LÁTIGO!!')
  })
})

describe('estadisticas', () => {
  test('cuentan por blanco, por dia y guardan el mejor combo', async () => {
    let stats = recordLash(EMPTY_STATS, 'effort', 1, '2026-10-22')
    stats = recordLash(stats, 'effort', 2, '2026-10-22')
    stats = recordLash(stats, 'model', 1, '2026-10-23')
    expect(stats).toEqual({ total: 3, onModel: 1, onEffort: 2, bestCombo: 2, byDay: { '2026-10-22': 2, '2026-10-23': 1 } })
  })

  test('no mutan la copia anterior', async () => {
    const before = recordLash(EMPTY_STATS, 'model', 1, '2026-10-22')
    recordLash(before, 'model', 1, '2026-10-22')
    expect(before.total).toBe(1)
    expect(EMPTY_STATS.total).toBe(0)
  })

  test('lo roto se limpia sin tumbar nada', async () => {
    expect(normalizeStats(undefined)).toEqual(EMPTY_STATS)
    expect(normalizeStats('basura')).toEqual(EMPTY_STATS)
    expect(normalizeStats(null)).toEqual(EMPTY_STATS)
    expect(normalizeStats({ total: -4, onModel: Number.NaN, bestCombo: 2.7, byDay: { '2026-10-01': 'y', hackeo: 9 } })).toEqual({
      total: 0,
      onModel: 0,
      onEffort: 0,
      bestCombo: 2,
      byDay: { '2026-10-01': 0 },
    })
  })

  test('lo vacio sale como copia nueva y el valor compartido no se puede ensuciar', async () => {
    const fresh = normalizeStats(undefined)
    fresh.byDay['2026-10-22'] = 3
    expect(normalizeStats(undefined).byDay).toEqual({})
    expect(Object.isFrozen(EMPTY_STATS)).toBe(true)
    expect(Object.isFrozen(EMPTY_STATS.byDay)).toBe(true)
  })

  test('juntar dos copias se queda con el mayor de cada campo', async () => {
    const a = { total: 10, onModel: 4, onEffort: 6, bestCombo: 3, byDay: { '2026-10-21': 4, '2026-10-22': 6 } }
    const b = { total: 12, onModel: 5, onEffort: 5, bestCombo: 2, byDay: { '2026-10-22': 8 } }
    expect(mergeStats(a, b)).toEqual({ total: 12, onModel: 5, onEffort: 6, bestCombo: 3, byDay: { '2026-10-21': 4, '2026-10-22': 8 } })
    expect(mergeStats(a, EMPTY_STATS)).toEqual(a)
  })

  test('los mejores dias salen ordenados y sin ceros', async () => {
    const stats = { ...EMPTY_STATS, byDay: { '2026-10-01': 3, '2026-10-02': 9, '2026-10-03': 3, '2026-10-04': 0 } }
    expect(topDays(stats, 5)).toEqual([['2026-10-02', 9], ['2026-10-03', 3], ['2026-10-01', 3]])
    expect(topDays(stats, 1)).toEqual([['2026-10-02', 9]])
  })

  test('el dia es el local, no el UTC', async () => {
    const lateNightBogota = Date.UTC(2026, 9, 23, 3, 0)
    expect(dayOf(lateNightBogota, 300)).toBe('2026-10-22')
    expect(dayOf(lateNightBogota, 0)).toBe('2026-10-23')
  })
})

describe('niveles', () => {
  test('son 14, empiezan en cero y suben cada vez mas espaciados', async () => {
    expect(TIERS.length).toBe(14)
    expect(MAX_LEVEL).toBe(14)
    expect(TIERS[0]!.minLashes).toBe(0)
    for (let i = 1; i < TIERS.length; i++) {
      const gap = TIERS[i]!.minLashes - TIERS[i - 1]!.minLashes
      const previousGap = i > 1 ? TIERS[i - 1]!.minLashes - TIERS[i - 2]!.minLashes : 0
      expect(TIERS[i]!.level).toBe(i + 1)
      expect(gap > previousGap).toBe(true)
    }
  })

  test('el progreso va de 0 a 1 dentro de cada nivel', async () => {
    expect(progressFor(0)).toMatchObject({ progress: 0, remaining: 25 })
    expect(progressFor(0).tier.name).toBe('Cuero crudo')
    expect(progressFor(24).tier.level).toBe(1)
    expect(progressFor(25).tier.level).toBe(2)
    const mid = progressFor(42)
    expect(mid.tier.level).toBe(2)
    expect(Math.abs(mid.progress - (42 - 25) / (60 - 25)) < 1e-9).toBe(true)
    expect(mid.remaining).toBe(18)
  })

  test('el nivel maximo no tiene siguiente', async () => {
    const top = progressFor(1_000_000)
    expect(top.tier.name).toBe('Divino')
    expect(top.next).toBe(null)
    expect(top.progress).toBe(1)
    expect(top.remaining).toBe(0)
  })

  test('totales raros caen en el primer nivel', async () => {
    expect(progressFor(-5).tier.level).toBe(1)
    expect(progressFor(Number.NaN).tier.level).toBe(1)
    expect(progressFor(Number.POSITIVE_INFINITY).tier.level).toBe(1)
  })

  test('detecta el latigazo exacto que sube de nivel', async () => {
    expect(isLevelUp(24, 25)).toBe(true)
    expect(isLevelUp(25, 26)).toBe(false)
    expect(isLevelUp(6999, 7000)).toBe(true)
    expect(isLevelUp(7000, 7001)).toBe(false)
  })

  test('el color avanza poquito a poco: un latigazo casi no se nota', async () => {
    const a = lookFor(1300)
    const b = lookFor(1301)
    const delta = Math.abs(luminance(a.lash) - luminance(b.lash))
    expect(delta < 1).toBe(true)
  })

  test('con los niveles el latigo se vuelve dorado y brillante', async () => {
    const leather = lookFor(0).lash
    const gold = lookFor(2600).lash
    const divine = lookFor(7000).lash
    expect(luminance(gold) > luminance(leather) + 80).toBe(true)
    expect(luminance(divine) > luminance(gold)).toBe(true)
    expect(lookFor(0).sparkDensity).toBe(0)
    expect(lookFor(7000).sparkDensity > lookFor(1300).sparkDensity).toBe(true)
  })

  test('mezclar colores respeta los extremos y el punto medio', async () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixHex('#102030', '#102030', 0.3)).toBe('#102030')
    expect(mixHex('#000000', '#ffffff', 7)).toBe('#ffffff')
  })
})

describe('particulas', () => {
  test('el mismo cuadro da las mismas chispas', async () => {
    const look = lookFor(5000)
    expect(sparkRow(look, 26, 7)).toBe(sparkRow(look, 26, 7))
    expect(sparkRow(look, 26, 7) === sparkRow(look, 26, 8)).toBe(false)
  })

  test('la fila mide exactamente el ancho pedido', async () => {
    for (const total of [60, 900, 7000]) {
      for (const width of [0, 1, 26, 80]) {
        expect([...sparkRow(lookFor(total), width, 3)].length).toBe(width)
      }
    }
  })

  test('sin chispas en los primeros niveles', async () => {
    expect(sparkRow(lookFor(10), 26, 3).trim()).toBe('')
  })

  test('mas nivel, mas chispas', async () => {
    const countSparks = (total: number) => {
      let n = 0
      for (let frame = 0; frame < 200; frame++) n += sparkRow(lookFor(total), 26, frame).replace(/ /g, '').length
      return n
    }
    expect(countSparks(7000) > countSparks(1300)).toBe(true)
    expect(countSparks(1300) > countSparks(120)).toBe(true)
  })

  test('el generador con semilla es estable y queda en [0, 1)', async () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    for (let i = 0; i < 100; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x >= 0 && x < 1).toBe(true)
    }
  })

  test('la barra de progreso siempre mide su ancho', async () => {
    expect(progressBar(0, 10)).toBe('░░░░░░░░░░')
    expect(progressBar(1, 10)).toBe('██████████')
    expect(progressBar(0.5, 10)).toBe('█████░░░░░')
    expect(progressBar(3, 4)).toBe('████')
    expect(progressBar(-1, 4)).toBe('░░░░')
  })
})

describe('puente', () => {
  test('las rutas viven en ~/.claude-latigo', async () => {
    expect(bridgePaths('/Users/ana/')).toEqual({
      dir: '/Users/ana/.claude-latigo',
      config: '/Users/ana/.claude-latigo/config.json',
      stats: '/Users/ana/.claude-latigo/stats.json',
      effort: '/Users/ana/.claude-latigo/effort.json',
      lash: '/Users/ana/.claude-latigo/lash.json',
      presence: '/Users/ana/.claude-latigo/presence.json',
      desktop: '/Users/ana/.claude-latigo/desktop.json',
      whipMode: '/Users/ana/.claude-latigo/whipmode.json',
    })
  })

  test('la configuracion va y vuelve, y lo roto da los valores por defecto', async () => {
    expect(parseConfig(serializeConfig({ enabled: false, sound: true }))).toEqual({ enabled: false, sound: true })
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG)
    expect(parseConfig('{no es json')).toEqual(DEFAULT_CONFIG)
    expect(parseConfig('[]')).toEqual(DEFAULT_CONFIG)
    expect(parseConfig('{"enabled":"si"}')).toEqual(DEFAULT_CONFIG)
  })

  test('las estadisticas van y vuelven', async () => {
    const stats = recordLash(EMPTY_STATS, 'effort', 2, '2026-10-22')
    expect(parseStatsFile(serializeStats(stats))).toEqual(stats)
    expect(parseStatsFile('{}')).toEqual(EMPTY_STATS)
  })

  test('los latigazos al effort cuentan desde cero y no aceptan basura', async () => {
    expect(parseEffortRequests(serializeEffortRequests({ seq: 7, at: 99 }))).toEqual({ seq: 7, at: 99 })
    expect(parseEffortRequests(undefined)).toEqual({ seq: 0, at: 0 })
    expect(parseEffortRequests('{"seq":-3}')).toEqual({ seq: 0, at: 0 })
    expect(parseEffortRequests('{"seq":"9"}')).toEqual({ seq: 0, at: 0 })
  })

  test('la lectura estricta no inventa un contador', async () => {
    expect(parseEffortRequestsStrict('{"seq":4,"at":9}')).toEqual({ seq: 4, at: 9 })
    expect(parseEffortRequestsStrict('{"seq":0}')).toEqual({ seq: 0, at: 0 })
    expect(parseEffortRequestsStrict(null)).toBe(null)
    expect(parseEffortRequestsStrict('')).toBe(null)
    expect(parseEffortRequestsStrict('{roto')).toBe(null)
    expect(parseEffortRequestsStrict('{"seq":-1}')).toBe(null)
    expect(parseEffortRequestsStrict('{"seq":"3"}')).toBe(null)
  })

  test('el ultimo latigazo se valida campo por campo', async () => {
    const event = { id: 'v-1', at: 5, target: 'effort' as const, combo: 3, total: 40, source: 'vscode' as const }
    expect(parseLashEvent(serializeLashEvent(event))).toEqual(event)
    expect(parseLashEvent('{"id":"x","target":"pie","source":"vscode"}')).toBe(null)
    expect(parseLashEvent('{"id":"x","target":"model","source":"marte"}')).toBe(null)
    expect(parseLashEvent('{"id":"x","target":"effort","source":"desktop"}')).toMatchObject({ source: 'desktop' })
    expect(parseLashEvent('basura')).toBe(null)
    expect(parseLashEvent('{"id":"x","target":"model","source":"terminal","combo":0}')).toMatchObject({ combo: 1, total: 0 })
  })

  test('la app de escritorio: presencia y pedido del modo latigo', async () => {
    const desktop = { at: 1000, whipMode: true }
    expect(parseDesktopPresence(serializeDesktopPresence(desktop))).toEqual(desktop)
    expect(parseDesktopPresence('{"at":5}')).toEqual({ at: 5, whipMode: false })
    expect(parseDesktopPresence('basura')).toBe(null)
    expect(isDesktopAlive(desktop, 1000 + DESKTOP_TTL_MS - 1)).toBe(true)
    expect(isDesktopAlive(desktop, 1000 + DESKTOP_TTL_MS)).toBe(false)
    expect(parseWhipModeRequest(serializeWhipModeRequest({ seq: 3, active: true }))).toEqual({ seq: 3, active: true })
    expect(parseWhipModeRequest('{"seq":1}')).toBe(null)
  })

  test('la presencia caduca a los 15 segundos', async () => {
    const presence = { at: 1000, model: 'claude-opus-5-5', effort: 'high' as const, boost: 'max' as const }
    expect(parsePresence(serializePresence(presence))).toEqual(presence)
    expect(parsePresence('{"at":1,"effort":"turbo"}')).toEqual({ at: 1, model: null, effort: null, boost: null })
    expect(isPresenceAlive(presence, 1000 + PRESENCE_TTL_MS - 1)).toBe(true)
    expect(isPresenceAlive(presence, 1000 + PRESENCE_TTL_MS)).toBe(false)
    expect(isPresenceAlive(presence, 500)).toBe(false)
    expect(isPresenceAlive(null, 1000)).toBe(false)
  })
})

describe('banda', () => {
  test('el latigo se estira, revienta y se recoge', async () => {
    const look = lookFor(0)
    const widths = Array.from({ length: FRAME_COUNT }, (_, frame) => partsWidth(whipParts(look, frame)))
    expect(widths[0]! < widths[4]!).toBe(true)
    expect(whipParts(look, IMPACT_FROM).some(part => part.role === 'tip')).toBe(true)
    expect(whipParts(look, 0).some(part => part.role === 'tip')).toBe(false)
    expect(whipParts(look, null).map(part => part.text).join('')).toBe('╾━~')
  })

  test('ningun cuadro se sale de su zona', async () => {
    for (const total of [0, 220, 2600, 7000]) {
      for (let frame = 0; frame < FRAME_COUNT; frame++) {
        expect(partsWidth(whipParts(lookFor(total), frame)) < WHIP_WIDTH).toBe(true)
      }
    }
  })

  test('el grito sale de la punta en la fila de arriba y la fila no cambia de ancho', async () => {
    for (const total of [0, 220, 2600, 7000]) {
      const look = lookFor(total)
      for (const frame of [null, 0, IMPACT_FROM, IMPACT_FROM + 1, IMPACT_FROM + 2, FRAME_COUNT - 1]) {
        const sky = skyRow(look, frame, sparkRow(look, SKY_WIDTH, 3))
        expect([...(sky.before + sky.crack + sky.after)].length).toBe(SKY_WIDTH)
      }
    }
    const crackOf = (total: number) => skyRow(lookFor(total), IMPACT_FROM + 1, '').crack
    expect(crackOf(0)).toBe('¡CHAS!')
    expect(crackOf(7000)).toBe('❂¡¡CHAAAAS!!❂')
    expect(skyRow(lookFor(0), 0, '').crack).toBe('')
    expect(skyRow(lookFor(0), null, '').crack).toBe('')
  })

  test('la banda suelta piezas en orden cuando no cabe', async () => {
    const base = {
      modelLabel: '✸ opus-5-5 ✸',
      effortLabel: '✸ effort: xhigh ⚡ ✸',
      combo: 3,
      comboTitle: '¡TRIPLE!',
      progress: progressFor(232),
      totalText: '· 232 latigazos ',
      toggleLabel: 'apagar',
    }
    expect(layoutBand({ ...base, columns: 200 })).toMatchObject({ barWidth: 10, showTotal: true, comboText: 'x3 ¡TRIPLE! ' })
    expect(layoutBand({ ...base, columns: 112 })).toMatchObject({ barWidth: 0, showTotal: true })
    expect(layoutBand({ ...base, columns: 96 })).toMatchObject({ barWidth: 0, showTotal: false, badge: 'Nv 5 Bronce' })
    expect(layoutBand({ ...base, columns: 86 })).toMatchObject({ badge: 'Nv 5', comboText: 'x3 ¡TRIPLE! ' })
    expect(layoutBand({ ...base, columns: 40 })).toMatchObject({ badge: 'Nv 5', comboText: 'x3 ' })
    expect(layoutBand({ ...base, combo: 1, columns: 200 }).comboText).toBe('')
  })

  test('lo que se elige siempre cabe si hay espacio para lo basico', async () => {
    const w = (t: string) => [...t].length
    for (let columns = 70; columns <= 220; columns++) {
      for (const total of [0, 232, 7000]) {
        const input = {
          columns,
          modelLabel: '✸ opus-5-5 ✸',
          effortLabel: '✸ effort: medium ⚡ ✸',
          combo: 12,
          comboTitle: '¡LEYENDA!',
          progress: progressFor(total),
          totalText: `· ${total} latigazos `,
          toggleLabel: 'apagar',
        }
        const layout = layoutBand(input)
        const used = WHIP_WIDTH + w(input.modelLabel) + 5 + w(input.effortLabel) + 5 + w('apagar') + 4 + w(layout.comboText) + w(layout.badge) + 1 + (layout.showTotal ? w(input.totalText) : 0)
        if (columns >= 86) expect(used <= columns).toBe(true)
      }
    }
  })

  test('la insignia de nivel muestra nombre y barra', async () => {
    expect(levelBadge(progressFor(42), 10)).toBe('Nv 2 Cuero curtido █████░░░░░')
    expect(levelBadge(progressFor(42), 0)).toBe('Nv 2 Cuero curtido')
  })

  test('la tabla trae nivel, conteos, mejores dias y el top en camino', async () => {
    let stats = recordLash(EMPTY_STATS, 'effort', 1, '2026-10-22')
    stats = recordLash(stats, 'effort', 2, '2026-10-22')
    stats = recordLash(stats, 'model', 1, '2026-10-23')
    const table = statsTable(stats, '2026-10-22', 'xhigh', true)
    expect(table).toContain('encendido')
    expect(table).toContain('Nv 1 · Cuero crudo')
    expect(table).toContain('Faltan 22 para Cuero curtido')
    expect(table).toContain('| Latigazos en total | 3 |')
    expect(table).toContain('| Hoy | 2 |')
    expect(table).toContain('| Mejor combo | x2 |')
    expect(table).toContain('| Effort forzado ahora | xhigh |')
    expect(table).toContain('| 1 | 2026-10-22 | 2 |')
    expect(table).toContain('Top global · próximamente')
    expect(statsTable(EMPTY_STATS, '2026-10-22', null, false)).toContain('apagado')
  })
})
