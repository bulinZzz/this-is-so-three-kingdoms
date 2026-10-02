import type { FactionId, GameState, Season } from './model'

const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']

/** 结束当前回合，进入下一个季节，冬季之后跨入下一年的春季。 */
export function advanceTurn(state: GameState): void {
  state.currentTurn += 1

  const index = SEASONS.indexOf(state.currentDate.season)
  if (index === SEASONS.length - 1) {
    state.currentDate.season = SEASONS[0]
    state.currentDate.year += 1
    return
  }

  state.currentDate.season = SEASONS[index + 1]
}

/** 本回合各势力的行动顺序：玩家势力先行动，其余按势力列表顺序。 */
export function resolveFactionOrder(state: GameState): FactionId[] {
  const otherFactions = state.factions
    .filter((faction) => faction.id !== state.playerFaction)
    .map((faction) => faction.id)

  return [state.playerFaction, ...otherFactions]
}
