import { runAction, type ActionResult } from './actions'
import type { Character, CharacterId, FactionId, GameState, SiteId } from './model'

/** 每次征兵补充的兵力。 */
export const TROOPS_PER_RECRUIT = 2000
/** 征兵时每名士兵所需的粮食。 */
export const GRAIN_PER_TROOP = 1
/** 一次征兵消耗的粮食。 */
export const RECRUIT_GRAIN_COST = TROOPS_PER_RECRUIT * GRAIN_PER_TROOP

/** 某势力当前的总兵力，为其在仕武将所统率部队之和。 */
export function factionTroops(state: GameState, factionId: FactionId): number {
  return state.characters
    .filter((character) => character.status === 'serving' && character.factionId === factionId)
    .reduce((total, character) => total + character.troops, 0)
}

/** 该武将本回合是否已执行调动或进攻。 */
export function hasActedThisTurn(state: GameState, characterId: CharacterId): boolean {
  return state.actedCharacterIds.includes(characterId)
}

/** 记下该武将本回合已执行调动或进攻。 */
export function markActed(state: GameState, characterId: CharacterId): void {
  state.actedCharacterIds.push(characterId)
}

/** 该武将是否为玩家可在其驻地行动的部属；不满足时返回原因。 */
export function officerBlockedReason(state: GameState, character: Character | null): string | null {
  if (character === null) {
    return '武将不存在'
  }
  if (character.status !== 'serving' || character.factionId !== state.playerFaction) {
    return '该武将不在此势力'
  }
  if (character.stationedSiteId === null) {
    return '该武将没有驻地'
  }
  return null
}

/** 在武将驻地就地补充兵力：消耗粮食与行动力，粮食不足时拒绝且不扣行动力。 */
export function recruit(state: GameState, characterId: CharacterId): ActionResult {
  const character = state.characters.find((item) => item.id === characterId) ?? null

  return runAction(state, {
    kind: 'recruit',
    precondition: (current) => {
      const blocked = officerBlockedReason(current, character)
      if (blocked !== null) {
        return blocked
      }
      const faction = current.factions.find((item) => item.id === current.playerFaction)
      if (faction === undefined || faction.grain < RECRUIT_GRAIN_COST) {
        return '粮食不足'
      }
      return null
    },
    execute: (current) => {
      const faction = current.factions.find((item) => item.id === current.playerFaction)
      if (character === null || faction === undefined) {
        return { outcome: '征兵未生效' }
      }

      character.troops += TROOPS_PER_RECRUIT
      faction.grain -= RECRUIT_GRAIN_COST

      return {
        targetId: character.stationedSiteId,
        outcome: `${character.name} 征得 ${TROOPS_PER_RECRUIT} 兵`,
      }
    },
  })
}

/** 把武将及其部队调到相邻的自有据点；每个武将每回合至多调动或进攻一次。 */
export function transfer(
  state: GameState,
  characterId: CharacterId,
  targetSiteId: SiteId,
): ActionResult {
  const character = state.characters.find((item) => item.id === characterId) ?? null
  const target = state.geography.sites.find((site) => site.id === targetSiteId) ?? null

  return runAction(state, {
    kind: 'transfer',
    precondition: (current) => {
      const blocked = officerBlockedReason(current, character)
      if (blocked !== null) {
        return blocked
      }
      if (target === null) {
        return '目标据点不存在'
      }
      if (target.owner !== current.playerFaction) {
        return '目标不是自有据点'
      }
      const station = current.geography.sites.find(
        (site) => site.id === character?.stationedSiteId,
      )
      if (station === undefined || !station.neighbors.includes(targetSiteId)) {
        return '目标与驻地不相邻'
      }
      if (hasActedThisTurn(current, characterId)) {
        return '该武将本回合已行动'
      }
      return null
    },
    execute: (current) => {
      if (character === null || target === null) {
        return { outcome: '调动未生效' }
      }

      character.stationedSiteId = target.id
      markActed(current, characterId)

      return { targetId: target.id, outcome: `${character.name} 移驻 ${target.name}` }
    },
  })
}
