import type { Random } from './random'

/**
 * 他方的情报。己方详情只有自己知道，外部只窥得个大概：凡以他方实力作判断的地方
 * ——他方进攻的门槛、应允外交的条件——都只取估计值，遂不出一条固定的胜负线。
 */

/** 估计值相对真值的最大偏差。 */
export const INTEL_SPREAD = 0.4

/** 就一项他方实力给出一次估计：在真值上下摇摆，最低不为负。 */
export function estimateOf(trueValue: number, random: Random): number {
  return Math.max(0, trueValue * (1 + (random.next() * 2 - 1) * INTEL_SPREAD))
}
