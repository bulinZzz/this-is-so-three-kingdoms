import type { Character, FactionId } from './model'

/**
 * 势力倾向：对各势力的偏好。偏好是感觉，取值 0–100，50 为中性，未记录的对按 50。
 * 由偏好算出寻访成功率修正：偏好越高越容易招揽。与忠诚无关——忠诚是价值观。
 */

/** 中性偏好：偏好等于它时不增不减。 */
export const NEUTRAL_AFFINITY = 50

/** 偏好是否合法：0–100 的整数。 */
export function isValidAffinity(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100
}

/** 某人（或剧本人物数据）对某势力的偏好；未记录的对按中性。 */
export function affinityToward(
  character: Pick<Character, 'affinities'>,
  factionId: FactionId,
): number {
  return character.affinities[factionId] ?? NEUTRAL_AFFINITY
}

/**
 * 由偏好换算的寻访成功率系数：偏好 50 为 1，每高一分多 1%，每低一分少 1%。
 * 偏好 90 → ×1.4（+40%），偏好 20 → ×0.7（−30%）。
 */
export function recruitmentFactor(affinity: number): number {
  return 1 + (affinity - NEUTRAL_AFFINITY) / 100
}
