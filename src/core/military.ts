import { ACTION_COSTS, runAction, type ActionResult } from './actions'
import type { Character, CharacterId, FactionId, GameState, SiteId } from './model'

/** 每次征兵补充的兵力。 */
export const TROOPS_PER_RECRUIT = 2000
/** 征兵时每名士兵所需的粮食。 */
export const GRAIN_PER_TROOP = 1
/** 一次征兵消耗的粮食。 */
export const RECRUIT_GRAIN_COST = TROOPS_PER_RECRUIT * GRAIN_PER_TROOP
/** 一次调动最多派出的武将数。 */
export const MAX_TRANSFER_PARTY = 3

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

/** 该武将的驻地是否与目标战略点相邻。 */
export function stationAdjacentTo(
  state: GameState,
  character: Character,
  targetSiteId: SiteId,
): boolean {
  const station = state.geography.sites.find((site) => site.id === character.stationedSiteId)

  return station !== undefined && station.neighbors.includes(targetSiteId)
}

/**
 * 调动：把一批武将及其部队移到相邻的自有战略点。
 * 参战者须驻守在与目标相邻的自有战略点、本季未行动；每名武将每季至多调动或进攻一次。
 */
export function transfer(
  state: GameState,
  characterIds: readonly CharacterId[],
  targetSiteId: SiteId,
): ActionResult {
  const characters = characterIds
    .map((id) => state.characters.find((item) => item.id === id))
    .filter((item): item is Character => item !== undefined)
  const target = state.geography.sites.find((site) => site.id === targetSiteId) ?? null

  return runAction(state, {
    kind: 'transfer',
    cost: ACTION_COSTS.transfer * characters.length,
    precondition: (current) => {
      if (target === null) {
        return '目标战略点不存在'
      }
      if (target.owner !== current.playerFaction) {
        return '目标不是自有战略点'
      }
      if (characters.length === 0) {
        return '没有可调动的武将'
      }
      if (characters.length > MAX_TRANSFER_PARTY) {
        return `一次至多调动 ${MAX_TRANSFER_PARTY} 名武将`
      }

      for (const character of characters) {
        const blocked = officerBlockedReason(current, character)
        if (blocked !== null) {
          return blocked
        }
        if (hasActedThisTurn(current, character.id)) {
          return `${character.name} 本回合已行动`
        }
        if (!stationAdjacentTo(current, character, targetSiteId)) {
          return `${character.name} 的驻地与目标不相邻`
        }
      }
      return null
    },
    execute: (current) => {
      if (target === null || characters.length === 0) {
        return { outcome: '调动未生效' }
      }

      for (const character of characters) {
        character.stationedSiteId = target.id
        markActed(current, character.id)
      }

      return {
        targetId: target.id,
        outcome: `${characters.map((item) => item.name).join('、')} 移驻 ${target.name}`,
      }
    },
  })
}

/** 该战略点是否可作为调动目标：自有，且至少有一个自有战略点与它相邻。 */
export function isTransferTarget(state: GameState, targetSiteId: SiteId): boolean {
  const target = state.geography.sites.find((site) => site.id === targetSiteId)
  if (target === undefined || target.owner !== state.playerFaction) {
    return false
  }

  return state.geography.sites.some(
    (site) =>
      site.id !== target.id &&
      site.owner === state.playerFaction &&
      site.neighbors.includes(target.id),
  )
}

/**
 * 可调入某战略点的候选部属：驻守在与它相邻的自有战略点的人。
 * 本季已行动者也在列，由界面标出不可选。
 */
export function transferCandidates(state: GameState, targetSiteId: SiteId): Character[] {
  if (!isTransferTarget(state, targetSiteId)) {
    return []
  }

  return state.characters.filter(
    (character) =>
      officerBlockedReason(state, character) === null &&
      stationAdjacentTo(state, character, targetSiteId),
  )
}
