import type { FactionId, GameState, FactionRelation, RelationKind } from './model'

/**
 * 势力间关系的查询与调整。关系是对称的，存储时一方在前一方在后，查询时两序皆可。
 * 关系含状态（同盟 / 敌对 / 中立）与好感（0–100，50 为中性）两层：
 * 状态决定能否开战与用兵，好感决定外交动作的门槛与成败。
 * 未声明的势力对为中立、好感取中性。
 */

/** 中立状态；未声明的势力对即中立。 */
export const NEUTRAL: RelationKind = 'neutral'

/** 好感的中性值：未记录的对按此计。 */
export const NEUTRAL_FAVOR = 50

/** 好感的取值范围。 */
const FAVOR_MIN = 0
const FAVOR_MAX = 100

function findRelation(state: GameState, a: FactionId, b: FactionId): FactionRelation | undefined {
  return state.relations.find(
    (item) =>
      (item.factions[0] === a && item.factions[1] === b) ||
      (item.factions[0] === b && item.factions[1] === a),
  )
}

function clampFavor(value: number): number {
  return Math.max(FAVOR_MIN, Math.min(FAVOR_MAX, value))
}

/** 两方的关系；未声明时为中立。 */
export function relationBetween(state: GameState, a: FactionId, b: FactionId): RelationKind {
  return findRelation(state, a, b)?.kind ?? NEUTRAL
}

/** 两方的好感；未记录时为中性。 */
export function favorBetween(state: GameState, a: FactionId, b: FactionId): number {
  return findRelation(state, a, b)?.favor ?? NEUTRAL_FAVOR
}

/** 两方是否同盟。同一个势力不算同盟。 */
export function areAllied(state: GameState, a: FactionId, b: FactionId): boolean {
  return a !== b && relationBetween(state, a, b) === 'ally'
}

/** 两方是否敌对。同一个势力不算敌对。 */
export function areHostile(state: GameState, a: FactionId, b: FactionId): boolean {
  return a !== b && relationBetween(state, a, b) === 'hostile'
}

/** 记下（或更新）一对势力的状态，保留现有好感；未记录者新建，好感取中性。 */
export function setRelation(
  state: GameState,
  a: FactionId,
  b: FactionId,
  kind: RelationKind,
): void {
  const relation = findRelation(state, a, b)
  if (relation === undefined) {
    state.relations.push({ factions: [a, b], kind, favor: NEUTRAL_FAVOR })
    return
  }

  relation.kind = kind
}

/** 调整两方的好感，夹在 0–100；未记录的对以中性为起点新建。返回调整后的好感。 */
export function adjustFavor(
  state: GameState,
  a: FactionId,
  b: FactionId,
  delta: number,
): number {
  const relation = findRelation(state, a, b)
  if (relation === undefined) {
    const favor = clampFavor(NEUTRAL_FAVOR + delta)
    state.relations.push({ factions: [a, b], kind: NEUTRAL, favor })
    return favor
  }

  relation.favor = clampFavor(relation.favor + delta)
  return relation.favor
}
