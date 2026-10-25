import { ACTION_POINTS_PER_TURN } from './actions'
import type { BattleState } from './battle'
import { growAges, refreshRoamingSites } from './characters'
import { growPopulation, settleGrain, settleMoney } from './economy'
import { fireEvents } from './events'
import { factionTurnStream, runFactionTurns, type FactionTurnSignal } from './factionAi'
import { growTroopLimits } from './military'
import type { FactionId, GameState, Season } from './model'
import { settleOutcome } from './victory'

export type { DefenseRequest, FactionTurnSignal } from './factionAi'

const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']

/**
 * 结束当前回合，进入下一个季节，冬季之后跨入下一年的春季；当季行动力恢复为预算，
 * 武将的行动次数一并重置，随即按数据求值一次本季事件，各势力结算粮食（各点运回减军粮）
 * 与金钱收入、各战略点人口与存粮缓增、在仕武将的带兵上限随季小幅提高，跨年时全体武将年龄加一。
 * 兵力不随季增长——兵只从征兵来。行动历史跨回合保留。
 *
 * 结局判定分两处：翻季之前先看上一季的行动是否已把某方打光，好把终局记在真正结束的那一季；
 * 翻季之后的事件与年龄结算同样可能打光一方（在仕武将老死），故末尾再判一次。
 */
export function advanceTurn(state: GameState): void {
  settleOutcome(state)

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

  refreshRoamingSites(state)
  fireEvents(state)
  settleGrain(state)
  settleMoney(state)
  growPopulation(state)
  growTroopLimits(state)
  settleOutcome(state)
}

/**
 * 结束本回合：其他势力按各自的最小行为集先行行动，随后结算并进入下一季。
 * 玩家自己的行动由界面在回合内完成，不在此列。
 */
export function endTurn(state: GameState): void {
  runFactionTurns(state)
  advanceTurn(state)
}

/** 一回合的推进：他方来攻我方时暂停，交回界面布阵指挥，再继续推进到回合结束。 */
export interface TurnRun {
  /** 推进一步；本回合跑完则返回 null。首次调用不带战斗。 */
  advance(decision?: BattleState | null): FactionTurnSignal | null
}

/**
 * 开始推进一个回合：他方依次行动，攻打我方时停下等待守方布阵。
 * 用 `advance` 逐次推进——先取到「待布阵」的请求，再把打完的战斗交回，
 * 随即取到这一战的战报；如此往复，跑完自动进入下一季。
 */
export function beginTurn(state: GameState): TurnRun {
  const stream = factionTurnStream(state)

  return {
    advance(decision: BattleState | null = null): FactionTurnSignal | null {
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
