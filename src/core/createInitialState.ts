import { ACTION_POINTS_PER_TURN } from './actions'
import { cloneCharacters } from './characters'
import { cloneGeography, EMPTY_GEOGRAPHY } from './geography'
import { guardFor } from './guards'
import type { FactionId, GameState, Geography, Scenario } from './model'
import { createRandom, createSeed } from './random'
import { SANGUO_208 } from './scenarios'

export interface NewGameOptions {
  scenario?: Scenario
  seed?: number
}

/** 为所有无主战略点补上凭险自守的守军；有主点不设。在已克隆的地理上写入，不动剧本数据。 */
function withGuards(geography: Geography): Geography {
  for (const site of geography.sites) {
    if (site.owner === null) {
      site.guard = guardFor(site)
    }
  }

  return geography
}

export function createInitialState(options: NewGameOptions = {}): GameState {
  const { scenario = SANGUO_208, seed = createSeed() } = options

  const factions = scenario.factions.map((faction) => ({ ...faction }))

  return {
    currentDate: { ...scenario.startDate },
    currentTurn: 1,
    actionPoints: Object.fromEntries(factions.map((faction) => [faction.id, ACTION_POINTS_PER_TURN])),
    actedCharacterIds: [],
    contactedCandidates: Object.fromEntries(factions.map((faction) => [faction.id, []])),
    captives: Object.fromEntries(factions.map((faction) => [faction.id, []])),
    history: [],
    firedEvents: [],
    relations: (scenario.relations ?? []).map((relation) => ({
      factions: [...relation.factions] as [FactionId, FactionId],
      kind: relation.kind,
      favor: relation.favor,
    })),
    playerFaction: scenario.playerFaction,
    outcome: 'ongoing',
    endedTurn: null,
    geography: withGuards(cloneGeography(scenario.geography ?? EMPTY_GEOGRAPHY)),
    factions,
    characters: cloneCharacters(scenario.characters ?? []),
    randomState: createRandom(seed).getState(),
  }
}
