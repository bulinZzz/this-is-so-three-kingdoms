import type { FactionId, GameState } from './model'

const MONTHS_PER_YEAR = 12
const FIRST_MONTH = 1

/** 结束当前回合，进入下一个月。 */
export function advanceTurn(state: GameState): void {
  state.currentTurn += 1

  if (state.currentDate.month === MONTHS_PER_YEAR) {
    state.currentDate.month = FIRST_MONTH
    state.currentDate.year += 1
    return
  }

  state.currentDate.month += 1
}

/** 本回合各势力的行动顺序：玩家势力先行动，其余按势力列表顺序。 */
export function resolveFactionOrder(state: GameState): FactionId[] {
  const otherFactions = state.factions
    .filter((faction) => faction.id !== state.playerFaction)
    .map((faction) => faction.id)

  return [state.playerFaction, ...otherFactions]
}
