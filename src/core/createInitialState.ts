import { ACTION_POINTS_PER_TURN } from './actions'
import { cloneCharacters } from './characters'
import { cloneGeography, EMPTY_GEOGRAPHY } from './geography'
import type { FactionId, GameState, Scenario } from './model'
import { createRandom, createSeed } from './random'
import { SANGUO_208 } from './scenarios'

export interface NewGameOptions {
  scenario?: Scenario
  seed?: number
}

export function createInitialState(options: NewGameOptions = {}): GameState {
  const { scenario = SANGUO_208, seed = createSeed() } = options

  const factions = scenario.factions.map((faction) => ({ ...faction }))

  return {
    currentDate: { ...scenario.startDate },
    currentTurn: 1,
    actionPoints: Object.fromEntries(factions.map((faction) => [faction.id, ACTION_POINTS_PER_TURN])),
    actedCharacterIds: [],
    history: [],
    relations: (scenario.relations ?? []).map((relation) => ({
      factions: [...relation.factions] as [FactionId, FactionId],
      kind: relation.kind,
    })),
    playerFaction: scenario.playerFaction,
    geography: cloneGeography(scenario.geography ?? EMPTY_GEOGRAPHY),
    factions,
    characters: cloneCharacters(scenario.characters ?? []),
    randomState: createRandom(seed).getState(),
  }
}
