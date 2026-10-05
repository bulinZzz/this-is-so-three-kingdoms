import { ACTION_POINTS_PER_TURN } from './actions'
import { cloneCharacters } from './characters'
import { cloneGeography, EMPTY_GEOGRAPHY } from './geography'
import type { GameState, Scenario } from './model'
import { createRandom, createSeed } from './random'
import { SANGUO_208 } from './scenarios'

export interface NewGameOptions {
  scenario?: Scenario
  seed?: number
}

export function createInitialState(options: NewGameOptions = {}): GameState {
  const { scenario = SANGUO_208, seed = createSeed() } = options

  return {
    currentDate: { ...scenario.startDate },
    currentTurn: 1,
    actionPoints: ACTION_POINTS_PER_TURN,
    actedCharacterIds: [],
    history: [],
    playerFaction: scenario.playerFaction,
    geography: cloneGeography(scenario.geography ?? EMPTY_GEOGRAPHY),
    factions: scenario.factions.map((faction) => ({ ...faction })),
    characters: cloneCharacters(scenario.characters ?? []),
    randomState: createRandom(seed).getState(),
  }
}
