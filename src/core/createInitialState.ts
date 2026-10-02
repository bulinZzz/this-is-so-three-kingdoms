import { cloneGeography, EMPTY_GEOGRAPHY } from './geography'
import type { GameState, Scenario } from './model'
import { createRandom, createSeed } from './random'
import { SANGUO_207 } from './scenarios'

export interface NewGameOptions {
  scenario?: Scenario
  seed?: number
}

export function createInitialState(options: NewGameOptions = {}): GameState {
  const { scenario = SANGUO_207, seed = createSeed() } = options

  return {
    currentDate: { ...scenario.startDate },
    currentTurn: 1,
    playerFaction: scenario.playerFaction,
    geography: cloneGeography(scenario.geography ?? EMPTY_GEOGRAPHY),
    factions: scenario.factions.map((faction) => ({ ...faction })),
    randomState: createRandom(seed).getState(),
  }
}
