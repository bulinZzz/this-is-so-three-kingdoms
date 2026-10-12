import {
  developmentOf,
  MONEY_BONUS_PER_MARKET_LEVEL,
  populationCap,
} from './development'
import { granaryCap, granaryGrowth, granaryOf, GRANARY_SHIP_RATIO } from './granary'
import { factionTroops } from './military'
import type { FactionId, GameState, Site } from './model'

/** 每点人口每季的税收，金钱的基础收入；市集建设在此之上加成（见 `siteMoneyYield`）。 */
export const MONEY_PER_POPULATION = 0.002

/** 每名士兵每季消耗的粮食。维持军队本身是一项长期负担，但真正的开销在征兵与出征。 */
export const GRAIN_UPKEEP_PER_TROOP = 0.01

/** 人口每季的自然增长比例：各战略点按同一比例缓增，取整入账。 */
export const POPULATION_GROWTH_PER_SEASON = 0.002

/** 一处战略点每季的金钱产出：其人口的税收，市集等级在此之上加成。 */
export function siteMoneyYield(site: Site): number {
  return Math.round(
    site.population * MONEY_PER_POPULATION * (1 + developmentOf(site).market * MONEY_BONUS_PER_MARKET_LEVEL),
  )
}

/** 某势力每季的金钱收入：其自有战略点的税收之和。 */
export function moneyYield(state: GameState, factionId: FactionId): number {
  return state.geography.sites
    .filter((site) => site.owner === factionId)
    .reduce((total, site) => total + siteMoneyYield(site), 0)
}

/** 某势力每季的军粮：在仕部队按规模计耗，退场者不计入。 */
export function troopUpkeep(state: GameState, factionId: FactionId): number {
  return Math.round(factionTroops(state, factionId) * GRAIN_UPKEEP_PER_TROOP)
}

/** 某势力本季可从各点运回的粮食（按当前存粮估算，不改动状态），供界面预览与净收支共用。 */
export function granaryIncome(state: GameState, factionId: FactionId): number {
  return state.geography.sites
    .filter((site) => site.owner === factionId)
    .reduce((total, site) => total + Math.round(granaryOf(site) * GRANARY_SHIP_RATIO), 0)
}

/** 各战略点存粮每季增加，止于上限；存粮随地块走，与归属无关，不消耗随机流。 */
export function growGranary(state: GameState): void {
  for (const site of state.geography.sites) {
    site.granary = Math.min(granaryOf(site) + granaryGrowth(site), granaryCap(site))
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
 * 收不抵支时粮仓见底，不做减员——欠粮只体现在征兵与出征做不了，减负靠主动遣散。
 */
export function settleGrain(state: GameState): void {
  growGranary(state)

  for (const faction of state.factions) {
    const income = shipGranary(state, faction.id)
    const upkeep = troopUpkeep(state, faction.id)
    faction.grain = Math.max(0, faction.grain + income - upkeep)
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
 * 每季结算人口缓增：各战略点（含无主）按同一小比例自然增长，止于各自的人口上限。
 * 只与当前人口有关、与归属无关，不消耗随机流，结果可复现。
 */
export function growPopulation(state: GameState): void {
  for (const site of state.geography.sites) {
    const grown = site.population + Math.round(site.population * POPULATION_GROWTH_PER_SEASON)
    site.population = Math.min(grown, populationCap(site))
  }
}
