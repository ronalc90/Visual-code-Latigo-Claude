import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Effort, Lash, Stats, Target } from '../types'
import {
  EMPTY_STATS,
  IMPACT_FROM,
  WHIP_FRAMES,
  comboColor,
  comboTitle,
  dayOf,
  effortRank,
  isEffort,
  nextCombo,
  normalizeStats,
  raiseEffort,
  recordLash,
  statsTable,
} from './logic'

const FRAME_MS = 70
const SOUND = 'assets/latigo.wav'
const STORE_KEY = 'stats'

const lash = atom({ plugin: 'latigo', key: 'lash' } as const, null as Lash | null)
const model = atom({ plugin: 'latigo', key: 'model' } as const, null as string | null)
const effort = atom({ plugin: 'latigo', key: 'effort' } as const, null as Effort | null)
const boost = atom({ plugin: 'latigo', key: 'boost' } as const, null as Effort | null)
const stats = atom({ plugin: 'latigo', key: 'stats' } as const, EMPTY_STATS as Stats)

function today(now: number): string {
  return dayOf(now, new Date(now).getTimezoneOffset())
}

function shortModel(name: string): string {
  return name.replace(/^claude-/, '').replace(/\[.*\]$/, '')
}

let lastLashAt: number | null = null
let combo = 0
let animation: { cancel: () => void } | null = null

async function crack($: EngineInterface, target: Target): Promise<void> {
  const now = await $.clock.now()
  combo = nextCombo(lastLashAt, combo, now)
  lastLashAt = now

  $.audio.play({ asset: SOUND }).catch(() => undefined)

  let raisedTo: Effort | null = null
  if (target === 'effort') {
    const current = (await read($, boost)) ?? (await read($, effort)) ?? 'medium'
    raisedTo = raiseEffort(current)
    if (raisedTo === null) {
      $.ui.toast('El effort ya esta en max: mas duro no se puede.')
    } else {
      const next = raisedTo
      await update($, boost, () => next)
    }
  }

  const hitCombo = combo
  await update($, stats, previous => recordLash(previous, target, hitCombo, today(now)))
  await $.store.set(STORE_KEY, await read($, stats))

  animation?.cancel()
  let frame = 0
  await update($, lash, () => ({ frame, target, combo: hitCombo, raisedTo }))
  animation = $.clock.every(FRAME_MS, () => {
    frame += 1
    if (frame >= WHIP_FRAMES.length) {
      animation?.cancel()
      animation = null
      void update($, lash, () => null)
      return
    }
    void update($, lash, current => (current === null ? null : { ...current, frame }))
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get(STORE_KEY)
    await update($, stats, () => normalizeStats(stored))
    const name = await $.session.model()
    await update($, model, () => name)
    await $.command.register({
      name: 'latigo',
      description: 'Tabla de latigazos. `/latigo calma` deja el effort como estaba.',
    })
    return next(e)
  })

  on('command.run', { command: 'latigo' }, async ($, e) => {
    if (e.args.trim() === 'calma') {
      await update($, boost, () => null)
      return { text: 'Calma: el effort vuelve a ser el de la sesion.' }
    }
    const now = await $.clock.now()
    return { text: statsTable(await read($, stats), today(now), await read($, boost)) }
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || !isEffort(e.effort)) {
      return yield* next(e)
    }
    const seen = e.effort
    if ((await read($, effort)) !== seen) await update($, effort, () => seen)
    if ((await read($, model)) !== e.model) await update($, model, () => e.model)

    const forced = await read($, boost)
    if (forced !== null && effortRank(forced) > effortRank(seen)) {
      return yield* next({ ...e, effort: forced })
    }
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const current = await read($, lash)
    const modelName = await read($, model)
    const seen = await read($, effort)
    const forced = await read($, boost)
    const total = (await read($, stats)).total

    const shownEffort = forced !== null && (seen === null || effortRank(forced) > effortRank(seen)) ? forced : seen
    const isImpact = current !== null && current.frame >= IMPACT_FROM
    const hit = (target: Target) => isImpact && current?.target === target
    const whip = current === null ? '╾━~' : (WHIP_FRAMES[current.frame] ?? '')
    const modelLabel = shortModel(modelName ?? 'claude')
    const effortLabel = `effort: ${shownEffort ?? '?'}${forced !== null ? ' ⚡' : ''}`

    return (
      <Box flexDirection="row">
        <Text color={isImpact ? 'redBright' : 'yellow'} bold={isImpact}>
          {whip.padEnd(22, ' ')}
        </Text>
        <Button
          key="model"
          hotkey="m"
          label={hit('model') ? `✸ ${modelLabel} ✸` : modelLabel}
          onPress={() => crack($, 'model')}
        />
        <Text> </Text>
        <Button
          key="effort"
          hotkey="e"
          variant="primary"
          label={hit('effort') ? `✸ ${effortLabel} ✸` : effortLabel}
          onPress={() => crack($, 'effort')}
        />
        <Text> </Text>
        {current !== null && current.combo >= 2 ? (
          <Text color={comboColor(current.combo)} bold>
            x{current.combo} {comboTitle(current.combo)}
          </Text>
        ) : (
          <Text dimColor>{total === 1 ? '1 latigazo' : `${total} latigazos`}</Text>
        )}
      </Box>
    )
  })
}
