import { isFactionDestroyed } from './military'
import type { GameState, Outcome } from './model'

/**
 * 一局的结局判定，复用军事模块的覆灭口径：失去全部战略点，或麾下不再有任何在仕武将。
 * 玩家势力覆灭即失败；其余势力全部覆灭即统一。玩家与对手同时覆灭时以失败论。
 */
export function evaluateOutcome(state: GameState): Outcome {
  if (isFactionDestroyed(state, state.playerFaction)) {
    return 'defeat'
  }

  const othersAllGone = state.factions.every(
    (faction) => faction.id === state.playerFaction || isFactionDestroyed(state, faction.id),
  )

  return othersAllGone ? 'victory' : 'ongoing'
}

/**
 * 结算本局结局：仅在仍进行中时写入 `outcome`，并把结束回合记在 `endedTurn`。
 * 返回是否刚刚结束——供回合推进与界面据此收尾。
 */
export function settleOutcome(state: GameState): boolean {
  if (state.outcome !== 'ongoing') {
    return false
  }

  const outcome = evaluateOutcome(state)
  if (outcome === 'ongoing') {
    return false
  }

  state.outcome = outcome
  state.endedTurn = state.currentTurn

  return true
}
