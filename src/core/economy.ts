import { runAction, type ActionResult } from './actions'
import { isServing, scopeSitesFor } from './characters'
import {
  developmentOf,
  HOUSING_GROWTH_BONUS,
  MONEY_BONUS_PER_MARKET_LEVEL,
  populationCap,
} from './development'
import { granaryCap, granaryGrowth, granaryOf, GRANARY_SHIP_RATIO } from './granary'
import {
  factionTroops,
  hasActedThisTurn,
  markActed,
  officerBlockedReason,
  removeTroops,
  resettleTroops,
  rollAmount,
} from './military'
import { logisticsFactor } from './logistics'
import type { Character, CharacterId, FactionId, GameState, Site, SiteId } from './model'
import { createRandom } from './random'

/** 每点人口每季的税收，金钱的基础收入；市集建设在此之上加成（见 `siteMoneyYield`）。 */
export const MONEY_PER_POPULATION = 0.0018

/** 有驻将的据点，粮与金的产出高出 15%；空置的据点按基准计。驻将由此成了一项经营上的长期投入。 */
export const GARRISONED_YIELD_FACTOR = 1.15

/** 一处战略点本季的产出系数：驻将在此则为加成，空置则按基准。 */
export function siteYieldFactor(state: GameState, site: Site): number {
  const garrisoned = state.characters.some(
    (character) => isServing(character) && character.stationedSiteId === site.id,
  )

  return garrisoned ? GARRISONED_YIELD_FACTOR : 1
}

/** 每名士兵每季消耗的粮食。军队按规模吃粮，兵越多、开销越大。 */
export const GRAIN_UPKEEP_PER_TROOP = 0.025

/** 粮仓见底后，每季逃逸的兵力比例；逃兵散入本方各战略点人口，兵员流失因此是渐进的。 */
export const DESERTION_SHARE = 0.05

/** 人口每季的自然增长比例：各战略点按同一比例缓增，取整入账。 */
export const POPULATION_GROWTH_PER_SEASON = 0.005

/** 一处战略点每季的金钱产出：其人口的税收，市集与驻将的加成依次叠上。 */
export function siteMoneyYield(site: Site, factor = 1): number {
  return Math.round(
    site.population *
      MONEY_PER_POPULATION *
      (1 + developmentOf(site).market * MONEY_BONUS_PER_MARKET_LEVEL) *
      factor,
  )
}

/** 某势力每季的金钱收入：其自有战略点的税收之和。 */
export function moneyYield(state: GameState, factionId: FactionId): number {
  return state.geography.sites
    .filter((site) => site.owner === factionId)
    .reduce(
      (total, site) => total + siteMoneyYield(site, siteYieldFactor(state, site)),
      0,
    )
}

/** 某势力每季的军粮：在仕部队按规模计耗，退场者不计入。 */
export function troopUpkeep(state: GameState, factionId: FactionId): number {
  return Math.round(factionTroops(state, factionId) * GRAIN_UPKEEP_PER_TROOP)
}

/**
 * 一处战略点本季结算后的存粮：先按人口加上本季增量，止于上限。
 * 结算、运回预览与征粮上限都以它为口径，免得界面按旧存粮估算而偏低。
 */
export function grownGranaryOf(site: Site, factor = 1): number {
  return Math.min(granaryOf(site) + granaryGrowth(site, factor), granaryCap(site))
}

/** 某势力本季结算可从各点运回的粮食（各点存粮先加上本季增量，再取六成；不改动状态）。 */
export function granaryIncome(state: GameState, factionId: FactionId): number {
  return state.geography.sites
    .filter((site) => site.owner === factionId)
    .reduce(
      (total, site) =>
        total + Math.round(grownGranaryOf(site, siteYieldFactor(state, site)) * GRANARY_SHIP_RATIO),
      0,
    )
}

/** 各战略点存粮每季增加，止于上限；存粮随地块走，与归属无关，不消耗随机流。 */
export function growGranary(state: GameState): void {
  for (const site of state.geography.sites) {
    site.granary = grownGranaryOf(site, siteYieldFactor(state, site))
  }
}

/** 某势力每季从各点运回的粮食：取各点现有存粮的一部分，并自点上扣除。 */
export function shipGranary(state: GameState, factionId: FactionId): number {
  let shipped = 0

  for (const site of state.geography.sites) {
    if (site.owner !== factionId) {
      continue
    }
    const amount = Math.round(granaryOf(site) * GRANARY_SHIP_RATIO)
    if (amount <= 0) {
      continue
    }
    site.granary = granaryOf(site) - amount
    shipped += amount
  }

  return shipped
}

/** 某势力每季的粮食净收支：运回减军粮，可为负。 */
export function grainBalance(state: GameState, factionId: FactionId): number {
  return granaryIncome(state, factionId) - troopUpkeep(state, factionId)
}

/**
 * 结算各势力本季的粮食：先令各点存粮增加，再按保有量运回一部分入库，扣除军粮。
 * 粮仓不足以支付军粮时归零，并按比例遣散逃兵——逃兵散入本方各战略点人口，
 * 兵员流失是渐进的，直到人口产粮重新养得起现有部队。
 */
export function settleGrain(state: GameState): void {
  growGranary(state)

  for (const faction of state.factions) {
    const income = shipGranary(state, faction.id)
    const upkeep = troopUpkeep(state, faction.id)
    const available = faction.grain + income

    if (available >= upkeep) {
      faction.grain = available - upkeep
      continue
    }

    faction.grain = 0
    const deserters = Math.ceil(factionTroops(state, faction.id) * DESERTION_SHARE)
    const removed = removeTroops(state, faction.id, deserters)
    if (removed <= 0) {
      continue
    }

    resettleTroops(state, faction.id, removed)
    state.history.push({
      kind: 'desertion',
      factionId: faction.id,
      date: { ...state.currentDate },
      targetId: null,
      outcome: `粮尽，${faction.name}逃兵 ${removed}`,
    })
  }
}

/**
 * 结算各势力本季的金钱收入：基础税收入库。
 * 金钱的支出（内政建设与外交）在行动发生时扣除，不在此处结算。
 */
export function settleMoney(state: GameState): void {
  for (const faction of state.factions) {
    faction.money += moneyYield(state, faction.id)
  }
}

/**
 * 一处战略点本季的人口增量：按同一比例自然增长，民居每级再加快少许，止于人口上限。
 * 结算与面板预览都以它为口径，免得界面自行估算。
 */
export function grownPopulationOf(site: Site): number {
  const rate = POPULATION_GROWTH_PER_SEASON + developmentOf(site).housing * HOUSING_GROWTH_BONUS
  const grown = site.population + Math.round(site.population * rate)

  return Math.min(grown, populationCap(site)) - site.population
}

/** 某势力每季的人口增量：其自有战略点的自然增长之和。 */
export function populationGrowth(state: GameState, factionId: FactionId): number {
  return state.geography.sites
    .filter((site) => site.owner === factionId)
    .reduce((total, site) => total + grownPopulationOf(site), 0)
}

/**
 * 每季结算人口缓增：各战略点（含无主）按同一小比例自然增长，止于各自的人口上限。
 * 只与当前人口有关、与归属无关，不消耗随机流，结果可复现。
 */
export function growPopulation(state: GameState): void {
  for (const site of state.geography.sites) {
    site.population += grownPopulationOf(site)
  }
}

/** 一次赈济投入的粮食上限；基准一粮养三口人。 */
export const RELIEF_GRAIN = 500
export const RELIEF_POPULATION_PER_GRAIN = 3
/** 内政对赈济的加成：以内政五十为基准，每点增减百分之零点六。 */
export const RELIEF_POLITICS_PER_POINT = 0.006

/** 该武将主赈时一粮养几口人：内政越高，同样的粮养的人越多。 */
export function reliefPopulationPerGrain(character: Character): number {
  return RELIEF_POPULATION_PER_GRAIN * (1 + (character.politics - 50) * RELIEF_POLITICS_PER_POINT)
}

/** 一次赈济按满额投粮折算的基准人口，供界面标出「约多少」。 */
export function reliefBaseline(character: Character, grain: number): number {
  return Math.round(
    Math.min(RELIEF_GRAIN, Math.max(0, grain)) *
      reliefPopulationPerGrain(character) *
      logisticsFactor(character),
  )
}

/**
 * 赈济：在自有战略点投粮养民，从名册中选一名未行动的武将执行，耗一点行动力。
 * 一粮养几口人由执行者的内政决定，产出还按其兵力折算——兵太少便收效甚微；
 * 用粮先取该点存粮，不足的部分再由国库补上。产量上下浮动，受人口上限与两处存粮之和限制。
 * 人口已满、无粮可投或该武将本季已行动时拒绝且不扣行动力。执行后该武将本季已行动。
 */
export function relief(
  state: GameState,
  siteId: SiteId,
  characterId: CharacterId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const site = state.geography.sites.find((item) => item.id === siteId) ?? null
  const character = state.characters.find((item) => item.id === characterId) ?? null

  return runAction(state, {
    kind: 'relief',
    factionId,
    precondition: (current) => {
      if (site === null) {
        return '战略点不存在'
      }
      if (site.owner !== factionId) {
        return '只能在本方战略点赈济'
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
      if (site.population >= populationCap(site)) {
        return '人口已达上限'
      }
      const faction = current.factions.find((item) => item.id === factionId)
      if (faction === undefined || granaryOf(site) + faction.grain < 1) {
        return '粮食不足'
      }
      return null
    },
    execute: (current) => {
      const faction = current.factions.find((item) => item.id === factionId)
      if (site === null || faction === undefined || character === null) {
        return { outcome: '赈济未生效' }
      }

      const random = createRandom(current.randomState)
      const perGrain = reliefPopulationPerGrain(character)
      const budget = Math.min(RELIEF_GRAIN, granaryOf(site) + faction.grain)
      const rolled = Math.max(
        0,
        rollAmount(Math.round(budget * perGrain * logisticsFactor(character)), random),
      )
      const people = Math.min(rolled, populationCap(site) - site.population)
      // 用粮按实际落籍的人数折算，至多投满预算；人口上限或兵力不足时都不会多扣。
      const grainSpent =
        people > 0 ? Math.min(budget, Math.max(1, Math.ceil(people / perGrain))) : 0
      current.randomState = random.getState()

      // 先用该点存粮，不足的部分再由国库补上。
      const fromSite = Math.min(granaryOf(site), grainSpent)
      site.granary = granaryOf(site) - fromSite
      faction.grain -= grainSpent - fromSite
      site.population += people
      markActed(current, character.id)

      return {
        targetId: site.id,
        outcome:
          people > 0
            ? `${character.name} 在${site.name}赈济，人口 +${people}（粮 −${grainSpent}）`
            : `${character.name} 在${site.name}赈济，应者寥寥，人口未增（粮未耗）`,
      }
    },
  })
}
