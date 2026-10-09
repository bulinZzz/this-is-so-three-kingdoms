import { ACTION_POINTS_PER_TURN } from './actions'
import type { DefenseChoice } from './battle'
import { growAges } from './characters'
import { collectGrain } from './economy'
import { factionTurnStream, runFactionTurns, type FactionTurnSignal } from './factionAi'
import { growTroops } from './military'
import type { FactionId, GameState, Season } from './model'

export type { DefenseRequest, FactionTurnSignal } from './factionAi'

const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']

/**
 * 结束当前回合，进入下一个季节，冬季之后跨入下一年的春季；当季行动力恢复为预算，
 * 武将的行动次数一并重置，各势力按自有战略点收取粮产、在仕武将按统率自然增长兵力，
 * 跨年时全体武将年龄加一。行动历史跨回合保留。
 */
export function advanceTurn(state: GameState): void {
  state.currentTurn += 1
  for (const faction of state.factions) {
    state.actionPoints[faction.id] = ACTION_POINTS_PER_TURN
  }
  state.actedCharacterIds = []

  const index = SEASONS.indexOf(state.currentDate.season)
  if (index === SEASONS.length - 1) {
    state.currentDate.season = SEASONS[0]
    state.currentDate.year += 1
    growAges(state)
  } else {
    state.currentDate.season = SEASONS[index + 1]
  }

  collectGrain(state)
  growTroops(state)
}

/**
 * 结束本回合：其他势力按各自的最小行为集先行行动，随后结算并进入下一季。
 * 玩家自己的行动由界面在回合内完成，不在此列。
 */
export function endTurn(state: GameState): void {
  runFactionTurns(state)
  advanceTurn(state)
}

/** 一回合的推进：他方来攻我方时暂停，交回界面决定，再继续推进到回合结束。 */
export interface TurnRun {
  /** 推进一步；本回合跑完则返回 null。首次调用不带决定。 */
  advance(decision?: DefenseChoice | null): FactionTurnSignal | null
}

/**
 * 开始推进一个回合：他方依次行动，攻打我方时停下等待决定。
 * 用 `advance` 逐次推进——先取到「待应战」的请求，再以守方的迎战编成与出马者作答，
 * 随即取到这一战的战报；如此往复，跑完自动进入下一季。
 */
export function beginTurn(state: GameState): TurnRun {
  const stream = factionTurnStream(state)

  return {
    advance(decision: DefenseChoice | null = null): FactionTurnSignal | null {
      const step = stream.next(decision)
      if (step.done) {
        advanceTurn(state)
        return null
      }

      return step.value
    },
  }
}

/** 本回合各势力的行动顺序：玩家势力先行动，其余按势力列表顺序。 */
export function resolveFactionOrder(state: GameState): FactionId[] {
  const otherFactions = state.factions
    .filter((faction) => faction.id !== state.playerFaction)
    .map((faction) => faction.id)

  return [state.playerFaction, ...otherFactions]
}
