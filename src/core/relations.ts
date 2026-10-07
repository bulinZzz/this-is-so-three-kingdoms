import type { FactionId, GameState, RelationKind } from './model'

/**
 * 势力间关系的查询。关系是对称的，存储时一方在前一方在后，查询时两序皆可。
 * 迭代 6 只用到两件事：同盟之间不能开战；他方只对敌对势力用兵。
 * 完整的结盟、宣战、停战等外交动作留待迭代 9。
 */
export function relationBetween(
  state: GameState,
  a: FactionId,
  b: FactionId,
): RelationKind | null {
  const relation = state.relations.find(
    (item) =>
      (item.factions[0] === a && item.factions[1] === b) ||
      (item.factions[0] === b && item.factions[1] === a),
  )

  return relation?.kind ?? null
}

/** 两方是否同盟。同一个势力不算同盟。 */
export function areAllied(state: GameState, a: FactionId, b: FactionId): boolean {
  return a !== b && relationBetween(state, a, b) === 'ally'
}

/** 两方是否敌对。同一个势力不算敌对。 */
export function areHostile(state: GameState, a: FactionId, b: FactionId): boolean {
  return a !== b && relationBetween(state, a, b) === 'hostile'
}
