import { disbandTroops, factionTroops } from './military'
import type { FactionId, GameState } from './model'

/**
 * 每点人口每季的粮产。人口是产粮的基础，战略点类型只决定人口初值，不再对粮产另起作用。
 * 数值为初值，待与部队耗粮（见 `GRAIN_UPKEEP_PER_TROOP`）一并按实测平衡。
 */
export const GRAIN_PER_POPULATION = 0.004

/** 每名士兵每季消耗的粮食。维持军队是一项长期负担，兵力越多、粮耗越大。 */
export const GRAIN_UPKEEP_PER_TROOP = 0.05

/** 人口每季的自然增长比例：各战略点按同一比例缓增，取整入账。 */
export const POPULATION_GROWTH_PER_SEASON = 0.002

/**
 * 缺粮时每季至多逃散的比例。逃散是渐进的：缺口再大，一季之内也不会让部队跑光，
 * 玩家因而有时间补救（征粮、撤军），粮荒表现为持续失血而非一夜崩盘。
 */
export const MAX_DISBAND_RATIO = 0.25

/** 某势力每季的粮产：其自有战略点的人口之和乘以单位产粮。 */
export function grainYield(state: GameState, factionId: FactionId): number {
  const population = state.geography.sites
    .filter((site) => site.owner === factionId)
    .reduce((total, site) => total + site.population, 0)

  return Math.round(population * GRAIN_PER_POPULATION)
}

/** 某势力每季的军粮：在仕部队按规模计耗，退场者不计入。 */
export function troopUpkeep(state: GameState, factionId: FactionId): number {
  return Math.round(factionTroops(state, factionId) * GRAIN_UPKEEP_PER_TROOP)
}

/** 某势力每季的粮食净收支：粮产减军粮，可为负。 */
export function grainBalance(state: GameState, factionId: FactionId): number {
  return grainYield(state, factionId) - troopUpkeep(state, factionId)
}

/**
 * 结算各势力本季的粮食：粮产为收入，军粮为支出，结余入库。
 * 收不抵支时粮仓见底，各部队按缺口占应支军粮的比例逃散（每季有上限），并留一条记录。
 */
export function settleGrain(state: GameState): void {
  for (const faction of state.factions) {
    const available = faction.grain + grainYield(state, faction.id)
    const upkeep = troopUpkeep(state, faction.id)

    if (available >= upkeep) {
      faction.grain = available - upkeep
      continue
    }

    const ratio = Math.min(MAX_DISBAND_RATIO, (upkeep - available) / upkeep)
    const lost = disbandTroops(state, faction.id, ratio)
    faction.grain = 0

    if (lost > 0) {
      state.history.push({
        kind: 'disband',
        factionId: faction.id,
        date: { ...state.currentDate },
        targetId: null,
        outcome: `粮尽，${lost} 兵逃散`,
      })
    }
  }
}

/**
 * 每季结算人口缓增：各战略点（含无主）按同一小比例自然增长。
 * 只与当前人口有关、与归属无关，不消耗随机流，结果可复现。
 */
export function growPopulation(state: GameState): void {
  for (const site of state.geography.sites) {
    site.population += Math.round(site.population * POPULATION_GROWTH_PER_SEASON)
  }
}
