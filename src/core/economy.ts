import type { FactionId, GameState, SiteType } from './model'

/**
 * 各类型战略点每季的粮产。
 * 初值供核心玩法验证：每季的自动粮产只作底子，粮食主要靠「征粮」主动获取，
 * 所以数值压得较低；待迭代 8 引入部队耗粮后一并平衡，最终数值记入《游戏机制》。
 */
export const GRAIN_YIELD_BY_SITE_TYPE: Record<SiteType, number> = {
  city: 300,
  pass: 150,
  field: 100,
}

/** 某势力每季的粮产：其自有战略点的产量之和。 */
export function grainYield(state: GameState, factionId: FactionId): number {
  return state.geography.sites
    .filter((site) => site.owner === factionId)
    .reduce((total, site) => total + GRAIN_YIELD_BY_SITE_TYPE[site.type], 0)
}

/** 结算各势力本季的粮产，计入势力粮食；没有自有战略点的势力粮产为零。 */
export function collectGrain(state: GameState): void {
  for (const faction of state.factions) {
    faction.grain += grainYield(state, faction.id)
  }
}
