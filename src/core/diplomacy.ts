import { runAction, type ActionResult } from './actions'
import type { Faction, FactionId, GameState } from './model'
import { adjustFavor, areHostile, setRelation } from './relations'

/**
 * 外交只保留宣战与求和两条路径。
 * 宣战把中立转为敌对；求和把敌对转回中立，须缴纳赔款。
 * 赔款与高昂的行动力是求和的代价，使「宣战—进攻—求和」无法在同一季内免费走完；
 * 求和本身不再掷骰判定，玩家不会因一次拒绝而彻底卡住。
 */

/** 求和须付给对方的赔款（金）。 */
export const PEACE_TRIBUTE = 1000

/** 宣战带来的好感下降。 */
export const WAR_FAVOR_PENALTY = 30

function factionOf(state: GameState, id: FactionId): Faction | null {
  return state.factions.find((item) => item.id === id) ?? null
}

/** 宣战：把双方关系转为敌对，好感随之下降。 */
export function declareWar(
  state: GameState,
  targetId: FactionId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const target = factionOf(state, targetId)

  return runAction(state, {
    kind: 'declareWar',
    factionId,
    precondition: (current) => {
      if (target === null || target.id === factionId) {
        return '目标势力不存在'
      }
      if (areHostile(current, factionId, targetId)) {
        return '与对方已经敌对'
      }
      return null
    },
    execute: (current) => {
      if (target === null) {
        return { outcome: '宣战未生效' }
      }

      setRelation(current, factionId, targetId, 'hostile')
      adjustFavor(current, factionId, targetId, -WAR_FAVOR_PENALTY)

      return { targetId, outcome: `向 ${target.name} 宣战` }
    },
  })
}

/** 求和：与敌对方转为中立，须支付赔款；对方一律应允。 */
export function makePeace(
  state: GameState,
  targetId: FactionId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const target = factionOf(state, targetId)

  return runAction(state, {
    kind: 'makePeace',
    factionId,
    precondition: (current) => {
      if (target === null || target.id === factionId) {
        return '目标势力不存在'
      }
      if (!areHostile(current, factionId, targetId)) {
        return '与对方并不敌对'
      }
      const faction = factionOf(current, factionId)
      if (faction === null || faction.money < PEACE_TRIBUTE) {
        return `赔款不足，须 ${PEACE_TRIBUTE} 金`
      }
      return null
    },
    execute: (current) => {
      const faction = factionOf(current, factionId)
      if (target === null || faction === null) {
        return { outcome: '求和未生效' }
      }

      faction.money -= PEACE_TRIBUTE
      target.money += PEACE_TRIBUTE
      setRelation(current, factionId, targetId, 'neutral')

      return { targetId, outcome: `与 ${target.name} 求和，赔款 ${PEACE_TRIBUTE} 金` }
    },
  })
}
