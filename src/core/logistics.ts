import type { Character } from './model'

/**
 * 征地类动作的兵力系数：征粮、赈济与建设都要有人手，兵力越少越办不成事。
 * 兵力达到基准即按全额计，想靠把执行武将的兵遣散光来省军粮是行不通的。
 */

/** 兵力达到此数，内政类动作按全额计。 */
export const LOGISTICS_FULL_TROOPS = 3000

/** 该武将的兵力系数，取 0 到 1，止于 1。 */
export function logisticsFactor(character: Character): number {
  return Math.min(1, character.troops / LOGISTICS_FULL_TROOPS)
}
