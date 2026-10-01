import type { GameState, Scenario } from './model'
import { SANGUO_208 } from './scenarios'

export function createInitialState(scenario: Scenario = SANGUO_208): GameState {
  return {
    currentDate: { ...scenario.startDate },
    currentTurn: 1,
    playerFaction: scenario.playerFaction,
    factions: scenario.factions.map((faction) => ({ ...faction })),
  }
}
