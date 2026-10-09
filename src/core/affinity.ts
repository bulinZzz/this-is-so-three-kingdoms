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

/**
 * 入仕某势力者的忠诚初值：跟着对该势力的偏好走，不高，但挨得起一两场败仗。
 * 寻访投效与劝降归附同用此值——在野之人本无忠诚可言，入仕时才按对主家的感觉定下。
 */
export function joinLoyaltyFor(affinity: number): number {
  return 50 + Math.round(affinity / 5)
}

/** 定性分档的门槛：偏好不低于 70 作亲附，不高于 30 作疏离，其余为中立。 */
const AFFINITY_CLOSE = 70
const AFFINITY_ALOOF = 30

/** 势力倾向的定性态度，供界面展示，不必露出数值。 */
export type AffinityAttitude = '亲附' | '中立' | '疏离'

/** 由偏好分档得到的定性态度。 */
export function affinityAttitude(affinity: number): AffinityAttitude {
  if (affinity >= AFFINITY_CLOSE) {
    return '亲附'
  }
  if (affinity <= AFFINITY_ALOOF) {
    return '疏离'
  }

  return '中立'
}
