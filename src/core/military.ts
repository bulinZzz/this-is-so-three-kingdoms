import { runAction, type ActionResult } from './actions'
import { isServing, scopeSitesFor } from './characters'
import { populationCap } from './development'
import { granaryOf } from './granary'
import { logisticsFactor } from './logistics'
import type { Character, CharacterId, FactionId, GameState } from './model'
import { createRandom, type Random } from './random'

/** 征兵产量的基准：每点统率征得的兵力。 */
export const RECRUIT_TROOPS_PER_COMMAND = 10
/** 带兵上限的基准：每点统率可带的兵力。兵力堆在一人身上会撞顶，多带一将才有意义。 */
export const TROOPS_LIMIT_PER_COMMAND = 150
/** 带兵上限每季的增长：每点统率带来的上限增量。上限是看得见却追不上的长期目标。 */
export const TROOPS_LIMIT_GROWTH_PER_COMMAND = 2
/** 带兵上限的硬上限；中等统率一局之内远不到顶。 */
export const TROOP_LIMIT_HARD_CAP = 99999
/** 征粮产量的基准：每点内政征得的粮食。 */
export const GRAIN_HARVEST_PER_POLITICS = 10
/** 征兵时每名士兵所需的粮食。 */
export const GRAIN_PER_TROOP = 1
/** 征兵时每点统率所需的金钱：募兵的安家与器械开销。 */
export const RECRUIT_MONEY_PER_COMMAND = 3
/** 征粮取之于民，每征一粮流失的人口。 */
export const POPULATION_LOSS_PER_GRAIN = 0.1
/** 出征时每名士兵所需的粮食，一次行军按投入兵力换算。 */
export const GRAIN_PER_ATTACK_TROOP = 0.05
/** 征兵、征粮与赈济产量的浮动幅度：实际产量落在基准的 1±此值 之间。 */
export const AMOUNT_VARIANCE = 0.1

/** 在基准上下按固定幅度浮动的一个整数量。 */
export function rollAmount(base: number, random: Random): number {
  return Math.round(base * (1 - AMOUNT_VARIANCE + random.next() * 2 * AMOUNT_VARIANCE))
}

/** 基准产量在浮动之后可能落在的区间，供界面标出「约多少」。 */
export function amountRange(base: number): [number, number] {
  return [Math.round(base * (1 - AMOUNT_VARIANCE)), Math.round(base * (1 + AMOUNT_VARIANCE))]
}

/** 该武将的带兵上限；剧本数据未记时按统率折算。 */
export function troopLimit(character: Character): number {
  return character.troopLimit ?? character.command * TROOPS_LIMIT_PER_COMMAND
}

/** 该武将本季的带兵上限增量：按统率计，止于硬上限。 */
function troopLimitGrowth(character: Character): number {
  return (
    Math.min(
      TROOP_LIMIT_HARD_CAP,
      troopLimit(character) + character.command * TROOPS_LIMIT_GROWTH_PER_COMMAND,
    ) - troopLimit(character)
  )
}

/** 该武将本季的兵力增量：与上限增量同数，止于增长后的上限。 */
export function troopGrowthOf(character: Character): number {
  const growth = troopLimitGrowth(character)
  const nextLimit = troopLimit(character) + growth

  return Math.max(0, Math.min(nextLimit, character.troops + growth) - character.troops)
}

/** 某势力本季的兵力增量：其名册中各将的增量之和；粮仓见底时为 0。 */
export function troopGrowth(state: GameState, factionId: FactionId): number {
  const faction = state.factions.find((item) => item.id === factionId)
  if (faction === undefined || faction.grain <= 0) {
    return 0
  }

  return state.characters
    .filter((character) => isServing(character) && character.factionId === factionId)
    .reduce((total, character) => total + troopGrowthOf(character), 0)
}

/**
 * 每季在仕武将的兵与带兵上限同步增长：上限按统率提高，兵力随之增加同数。
 * 这部分兵凭空得来，不经征兵、不耗人口与粮食；长到上限即止。
 * 粮仓见底时不长——先让逃兵把军队缩回养得起的规模，等粮回来再恢复。
 */
export function growTroops(state: GameState): void {
  for (const character of state.characters) {
    if (!isServing(character) || character.factionId === null) {
      continue
    }
    const faction = state.factions.find((item) => item.id === character.factionId)
    if (faction === undefined || faction.grain <= 0) {
      continue
    }
    const growth = troopLimitGrowth(character)
    character.troopLimit = troopLimit(character) + growth
    character.troops = Math.min(troopLimit(character), character.troops + growth)
  }
}

/** 某势力当前的总兵力，为其在仕武将所统率部队之和；退场者不计入。 */
export function factionTroops(state: GameState, factionId: FactionId): number {
  return state.characters
    .filter((character) => isServing(character) && character.factionId === factionId)
    .reduce((total, character) => total + character.troops, 0)
}

/**
 * 从某势力的在仕武将中按现有兵力比例扣减指定数量的兵，返回实际减员数。
 * 用于粮尽逃兵：各队按同一比例缩水，避免只从某一人身上抽走。
 */
export function removeTroops(state: GameState, factionId: FactionId, count: number): number {
  const officers = state.characters.filter(
    (character) => isServing(character) && character.factionId === factionId && character.troops > 0,
  )
  const total = officers.reduce((sum, officer) => sum + officer.troops, 0)
  const target = Math.min(total, Math.max(0, Math.round(count)))
  if (target <= 0) {
    return 0
  }

  const shares = officers.map((officer) => {
    const exact = (officer.troops * target) / total
    return { officer, exact, take: Math.floor(exact) }
  })
  let remainder = target - shares.reduce((sum, share) => sum + share.take, 0)
  for (const share of [...shares].sort((a, b) => b.exact - b.take - (a.exact - a.take))) {
    if (remainder <= 0) {
      break
    }
    share.take += 1
    remainder -= 1
  }

  return shares.reduce((removed, share) => {
    const taken = Math.min(share.officer.troops, share.take)
    share.officer.troops -= taken
    return removed + taken
  }, 0)
}

/**
 * 把若干散兵按随机次序分入本方各战略点，作为当地人口；每点不超过人口上限，
 * 装不下的部分继续分往尚未满的点，全部装满则散失。返回实际落籍的兵数。
 */
export function resettleTroops(state: GameState, factionId: FactionId, count: number): number {
  let remaining = Math.max(0, Math.round(count))
  if (remaining <= 0) {
    return 0
  }

  const random = createRandom(state.randomState)
  let settled = 0

  while (remaining > 0) {
    const open = state.geography.sites.filter(
      (site) => site.owner === factionId && site.population < populationCap(site),
    )
    if (open.length === 0) {
      break
    }

    for (let i = open.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random.next() * (i + 1))
      ;[open[i], open[j]] = [open[j], open[i]]
    }

    const share = Math.floor(remaining / open.length)
    const extra = remaining % open.length
    let placed = 0

    open.forEach((site, index) => {
      const want = share + (index < extra ? 1 : 0)
      const room = populationCap(site) - site.population
      const added = Math.min(room, want, remaining)
      site.population += added
      remaining -= added
      placed += added
    })

    settled += placed
    if (placed === 0) {
      break
    }
  }

  state.randomState = random.getState()

  return settled
}

/** 势力是否已覆灭：失去全部战略点，或麾下不再有任何在仕武将。 */
export function isFactionDestroyed(state: GameState, factionId: FactionId): boolean {
  const holdsSite = state.geography.sites.some((site) => site.owner === factionId)
  const hasOfficer = state.characters.some(
    (character) => isServing(character) && character.factionId === factionId,
  )

  return !holdsSite || !hasOfficer
}

/** 该武将本回合是否已执行征兵、征粮或出征。 */
export function hasActedThisTurn(state: GameState, characterId: CharacterId): boolean {
  return state.actedCharacterIds.includes(characterId)
}

/** 记下该武将本回合已执行征兵、征粮或出征。 */
export function markActed(state: GameState, characterId: CharacterId): void {
  state.actedCharacterIds.push(characterId)
}

/** 该武将是否为指定势力的在仕部属；不满足时返回原因。缺省按玩家势力评判。 */
export function officerBlockedReason(
  state: GameState,
  character: Character | null,
  factionId: FactionId = state.playerFaction,
): string | null {
  if (character === null) {
    return '武将不存在'
  }
  if (!isServing(character) || character.factionId !== factionId) {
    return '该武将不在此势力'
  }
  return null
}

/**
 * 可在该点执行征兵、征粮或在名册中候命的武将：本势力在仕、本季未行动。
 * 驻将照样在列，只是不能出征；兵为零者也可征兵，出兵另按有无兵力筛选。
 */
export function readyOfficers(state: GameState, factionId: FactionId): Character[] {
  return state.characters.filter(
    (character) =>
      isServing(character) &&
      character.factionId === factionId &&
      !hasActedThisTurn(state, character.id),
  )
}

/** 一次征兵消耗的粮食，由统兵者的统率换算出基准。 */
export function recruitGrainCost(character: Character): number {
  return Math.round(character.command * RECRUIT_TROOPS_PER_COMMAND * GRAIN_PER_TROOP)
}

/** 一次征兵消耗的金钱，按统兵者的统率换算。 */
export function recruitMoneyCost(character: Character): number {
  return Math.round(character.command * RECRUIT_MONEY_PER_COMMAND)
}

/** 一次出征消耗的粮食，按投入兵力换算。 */
export function attackGrainCost(troops: number): number {
  return Math.round(troops * GRAIN_PER_ATTACK_TROOP)
}

/**
 * 在一处自有战略点征兵：消耗粮食、金钱与行动力，从名册中选一名未行动的武将执行。
 * 粮或金钱不足、已达带兵上限、该点人口枯竭或该武将本季已行动时拒绝且不扣行动力。
 * 兵力按统兵者的统率浮动，补到带兵上限为止，且不超过该点现有人口；
 * 所征之兵自该点人口中扣除，粮与金按统率基准固定；征兵占用该武将本季的行动。
 */
export function recruit(
  state: GameState,
  siteId: string,
  characterId: CharacterId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const character = state.characters.find((item) => item.id === characterId) ?? null
  const grainCost = character === null ? 0 : recruitGrainCost(character)
  const moneyCost = character === null ? 0 : recruitMoneyCost(character)

  return runAction(state, {
    kind: 'recruit',
    factionId,
    precondition: (current) => {
      const site = current.geography.sites.find((item) => item.id === siteId)
      if (site === undefined) {
        return '战略点不存在'
      }
      if (site.owner !== factionId) {
        return '只能在本方战略点征兵'
      }

      const blocked = officerBlockedReason(current, character, factionId)
      if (blocked !== null) {
        return blocked
      }
      if (
        factionId !== current.playerFaction &&
        character !== null &&
        !scopeSitesFor(current, character).includes(siteId)
      ) {
        return `${character.name} 的活动范围不含此处`
      }
      if (character !== null && hasActedThisTurn(current, character.id)) {
        return `${character.name} 本回合已行动`
      }
      if (character !== null && character.troops >= troopLimit(character)) {
        return `${character.name} 已达带兵上限`
      }
      if (site.population < 1) {
        return '该点人口不足，无可征之兵'
      }
      const faction = current.factions.find((item) => item.id === factionId)
      if (faction === undefined || faction.grain < grainCost) {
        return '粮食不足'
      }
      if (faction.money < moneyCost) {
        return '金钱不足'
      }
      return null
    },
    execute: (current) => {
      const faction = current.factions.find((item) => item.id === factionId)
      const site = current.geography.sites.find((item) => item.id === siteId)
      if (character === null || faction === undefined || site === undefined) {
        return { outcome: '征兵未生效' }
      }

      const random = createRandom(current.randomState)
      const gained = Math.min(
        rollAmount(character.command * RECRUIT_TROOPS_PER_COMMAND, random),
        troopLimit(character) - character.troops,
        site.population,
      )
      current.randomState = random.getState()

      character.troops += gained
      site.population -= gained
      faction.grain -= grainCost
      faction.money -= moneyCost
      markActed(current, character.id)

      return {
        targetId: site.id,
        outcome: `${character.name} 在${site.name}征得 ${gained} 兵（人口 −${gained}，粮 −${grainCost}，金 −${moneyCost}）`,
      }
    },
  })
}

/**
 * 一次征粮的产量基准：由该武将的内政与其兵力共同决定。
 * 兵力达到基准即全额；兵力清零者几乎征不到粮，堵住「把征粮武将的兵遣散光」的退化解法。
 */
export function harvestGrainBaseline(character: Character): number {
  return Math.round(character.politics * GRAIN_HARVEST_PER_POLITICS * logisticsFactor(character))
}

/**
 * 任命或撤换驻将：每点至多一名驻将，耗一点行动力，不改变武将的已行动状态。
 * 传 null 表示撤下该点现有的驻将；换人时原驻将自动卸任。
 */
export function assignStation(
  state: GameState,
  siteId: string,
  characterId: CharacterId | null,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const character =
    characterId === null ? null : (state.characters.find((item) => item.id === characterId) ?? null)

  return runAction(state, {
    kind: 'station',
    factionId,
    precondition: (current) => {
      const site = current.geography.sites.find((item) => item.id === siteId)
      if (site === undefined) {
        return '战略点不存在'
      }
      if (site.owner !== factionId) {
        return '只能在本方战略点任命驻将'
      }
      if (characterId !== null) {
        const blocked = officerBlockedReason(current, character, factionId)
        if (blocked !== null) {
          return blocked
        }
        if (
          factionId !== current.playerFaction &&
          character !== null &&
          !character.scope.includes(siteId)
        ) {
          return `${character.name} 的活动范围不含此处`
        }
      }
      const incumbent = current.characters.find(
        (item) => isServing(item) && item.stationedSiteId === siteId,
      )
      if ((incumbent?.id ?? null) === characterId) {
        return characterId === null ? '该点没有驻将' : `${character?.name ?? ''} 已驻守该点`
      }
      return null
    },
    execute: (current) => {
      const site = current.geography.sites.find((item) => item.id === siteId)
      const incumbent = current.characters.find(
        (item) => isServing(item) && item.stationedSiteId === siteId,
      )
      if (site === undefined) {
        return { outcome: '任命未生效' }
      }

      if (incumbent !== undefined) {
        incumbent.stationedSiteId = null
      }
      if (character !== null) {
        character.stationedSiteId = siteId
      }

      return {
        targetId: site.id,
        outcome:
          character === null
            ? `${site.name} 不再设驻将`
            : `任命 ${character.name} 驻守 ${site.name}`,
      }
    },
  })
}

/**
 * 征粮：在一处自有战略点征收粮食，消耗行动力，从名册选一名未行动的武将执行。
 * 取量不超过该点存粮，且随内政与兵力浮动；取之于民，该点人口随之少量流失。
 */
export function harvestGrain(
  state: GameState,
  siteId: string,
  characterId: CharacterId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const character = state.characters.find((item) => item.id === characterId) ?? null

  return runAction(state, {
    kind: 'harvestGrain',
    factionId,
    precondition: (current) => {
      const site = current.geography.sites.find((item) => item.id === siteId)
      if (site === undefined) {
        return '战略点不存在'
      }
      if (site.owner !== factionId) {
        return '只能在本方战略点征粮'
      }

      const blocked = officerBlockedReason(current, character, factionId)
      if (blocked !== null) {
        return blocked
      }
      if (
        factionId !== current.playerFaction &&
        character !== null &&
        !scopeSitesFor(current, character).includes(siteId)
      ) {
        return `${character.name} 的活动范围不含此处`
      }
      if (character !== null && hasActedThisTurn(current, character.id)) {
        return `${character.name} 本回合已行动`
      }
      return null
    },
    execute: (current) => {
      const faction = current.factions.find((item) => item.id === factionId)
      const site = current.geography.sites.find((item) => item.id === siteId)
      if (character === null || faction === undefined || site === undefined) {
        return { outcome: '征粮未生效' }
      }

      const random = createRandom(current.randomState)
      const gained = Math.min(rollAmount(harvestGrainBaseline(character), random), granaryOf(site))
      current.randomState = random.getState()

      const lost = Math.min(site.population, Math.round(gained * POPULATION_LOSS_PER_GRAIN))
      site.granary = granaryOf(site) - gained
      site.population -= lost
      faction.grain += gained
      markActed(current, character.id)

      return {
        targetId: site.id,
        outcome: `${character.name} 在${site.name}征得 ${gained} 粮（人口 −${lost}）`,
      }
    },
  })
}
