import { ACTION_COSTS, runAction, type ActionResult } from './actions'
import type { Character, CharacterId, FactionId, GameState, SiteId } from './model'
import { createRandom, type Random } from './random'

/** 每季自然增长的基准：每点统率带来的兵力。 */
export const TROOPS_GROWTH_PER_COMMAND = 2
/** 征兵产量的基准：每点统率征得的兵力。 */
export const RECRUIT_TROOPS_PER_COMMAND = 10
/** 征粮产量的基准：每点内政征得的粮食。 */
export const GRAIN_HARVEST_PER_POLITICS = 10
/** 征粮产量的地盘加成：每处自有战略点带来的粮食。 */
export const GRAIN_HARVEST_PER_SITE = 200
/** 征兵时每名士兵所需的粮食。 */
export const GRAIN_PER_TROOP = 1
/** 自然增长、征兵与征粮产量的浮动幅度：实际产量落在基准的 1±此值 之间。 */
const AMOUNT_VARIANCE = 0.25
/** 一次调动最多派出的武将数。 */
export const MAX_TRANSFER_PARTY = 3

/** 在基准上下按固定幅度浮动的一个整数量。 */
function rollAmount(base: number, random: Random): number {
  return Math.round(base * (1 - AMOUNT_VARIANCE + random.next() * 2 * AMOUNT_VARIANCE))
}

/** 某势力当前的总兵力，为其在仕武将所统率部队之和。 */
export function factionTroops(state: GameState, factionId: FactionId): number {
  return state.characters
    .filter((character) => character.status === 'serving' && character.factionId === factionId)
    .reduce((total, character) => total + character.troops, 0)
}

/** 势力是否已覆灭：失去全部战略点，或麾下不再有任何在仕武将。 */
export function isFactionDestroyed(state: GameState, factionId: FactionId): boolean {
  const holdsSite = state.geography.sites.some((site) => site.owner === factionId)
  const hasOfficer = state.characters.some(
    (character) => character.status === 'serving' && character.factionId === factionId,
  )

  return !holdsSite || !hasOfficer
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

/** 一次征兵消耗的粮食，由统兵者的统率换算出基准。 */
export function recruitGrainCost(character: Character): number {
  return Math.round(character.command * RECRUIT_TROOPS_PER_COMMAND * GRAIN_PER_TROOP)
}

/**
 * 在武将驻地就地补充兵力：消耗粮食与行动力，粮不足或该武将本季已行动时拒绝且不扣行动力。
 * 兵力按统兵者的统率浮动，粮食按统率基准固定消耗；征兵占用该武将本季的行动。
 */
export function recruit(state: GameState, characterId: CharacterId): ActionResult {
  const character = state.characters.find((item) => item.id === characterId) ?? null
  const cost = character === null ? 0 : recruitGrainCost(character)

  return runAction(state, {
    kind: 'recruit',
    precondition: (current) => {
      const blocked = officerBlockedReason(current, character)
      if (blocked !== null) {
        return blocked
      }
      if (character !== null && hasActedThisTurn(current, character.id)) {
        return `${character.name} 本回合已行动`
      }
      const faction = current.factions.find((item) => item.id === current.playerFaction)
      if (faction === undefined || faction.grain < cost) {
        return '粮食不足'
      }
      return null
    },
    execute: (current) => {
      const faction = current.factions.find((item) => item.id === current.playerFaction)
      if (character === null || faction === undefined) {
        return { outcome: '征兵未生效' }
      }

      const random = createRandom(current.randomState)
      const gained = rollAmount(character.command * RECRUIT_TROOPS_PER_COMMAND, random)
      current.randomState = random.getState()

      character.troops += gained
      faction.grain -= cost
      markActed(current, character.id)

      return {
        targetId: character.stationedSiteId,
        outcome: `${character.name} 征得 ${gained} 兵`,
      }
    },
  })
}

/** 一次征粮的产量基准：随该武将的内政与其势力自有战略点数增长。 */
export function harvestGrainBaseline(state: GameState, character: Character): number {
  const sites = state.geography.sites.filter((site) => site.owner === character.factionId).length

  return Math.round(character.politics * GRAIN_HARVEST_PER_POLITICS + sites * GRAIN_HARVEST_PER_SITE)
}

/**
 * 征粮：派一名部属征收粮食，消耗行动力，结果直接入库，并占用该武将本季的行动。
 * 产量按该武将的内政与势力自有战略点数浮动；不像征兵那样需要粮食，也不占用粮食。
 */
export function harvestGrain(state: GameState, characterId: CharacterId): ActionResult {
  const character = state.characters.find((item) => item.id === characterId) ?? null

  return runAction(state, {
    kind: 'harvestGrain',
    precondition: (current) => {
      const blocked = officerBlockedReason(current, character)
      if (blocked !== null) {
        return blocked
      }
      if (character !== null && hasActedThisTurn(current, character.id)) {
        return `${character.name} 本回合已行动`
      }
      return null
    },
    execute: (current) => {
      const faction =
        character === null
          ? undefined
          : current.factions.find((item) => item.id === character.factionId)
      if (character === null || faction === undefined) {
        return { outcome: '征粮未生效' }
      }

      const random = createRandom(current.randomState)
      const gained = rollAmount(harvestGrainBaseline(current, character), random)
      current.randomState = random.getState()

      faction.grain += gained
      markActed(current, character.id)

      return {
        targetId: character.stationedSiteId,
        outcome: `${character.name} 征得 ${gained} 粮`,
      }
    },
  })
}

/**
 * 每季结算兵力自然增长：各势力在仕武将按统率获得一笔带浮动的补充。
 * 增量只与统率有关、与当前兵力无关，各方并行增长，差距不随回合放大。
 */
export function growTroops(state: GameState): void {
  const random = createRandom(state.randomState)

  for (const character of state.characters) {
    if (character.status !== 'serving') {
      continue
    }

    character.troops += rollAmount(character.command * TROOPS_GROWTH_PER_COMMAND, random)
  }

  state.randomState = random.getState()
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
