import { runAction, type ActionResult } from './actions'
import { estimateOf } from './intelligence'
import { factionTroops } from './military'
import type { Faction, FactionId, GameState } from './model'
import { createRandom } from './random'
import { adjustFavor, areAllied, areHostile, favorBetween, setRelation } from './relations'

/**
 * 外交动作：宣战、停战、结盟、赠礼与索取。
 * 状态与好感是两件事——宣战与停战改状态，赠礼与索取动好感；
 * 结盟与停战先要求好感达到门槛，再由对方掷一次是否应允。
 * 门槛与数值为初值，待实测调整。
 */

/** 结盟所需的好感门槛：达到后对方才可能应允。 */
export const ALLIANCE_FAVOR = 65

/** 停战所需的好感门槛。 */
export const PEACE_FAVOR = 40

/** 赠礼花费的金钱与带来的好感。 */
export const GIFT_MONEY = 500
export const GIFT_FAVOR = 12

/** 索取一次至多索得的粮食，以及成败时好感的变动。 */
export const DEMAND_GRAIN = 1000
export const DEMAND_FAVOR_PENALTY = 15
export const DEMAND_REFUSE_PENALTY = 5

/** 宣战带来的好感下降。 */
export const WAR_FAVOR_PENALTY = 30

function factionOf(state: GameState, id: FactionId): Faction | null {
  return state.factions.find((item) => item.id === id) ?? null
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * 对方应允一项请求的几率：好感为基线，索取与停战另按实力差修正
 * ——对方比己方越强，越不轻易让步；结盟是互利之事，只看好感。
 * 请求方的实力对他人只有个大概，故由调用方给出估计值（见 intelligence）。
 */
export function acceptanceChance(
  state: GameState,
  actor: FactionId,
  target: FactionId,
  kind: 'alliance' | 'makePeace' | 'demand',
  actorTroops: number,
): number {
  const favor = favorBetween(state, actor, target)
  const favorTerm = (favor - 50) / 50
  const other = factionTroops(state, target)
  const strengthTerm =
    kind === 'alliance' ? 0 : clamp(((other - actorTroops) / (other + actorTroops + 1)) * 0.4, -0.3, 0.3)

  return clamp(0.6 + favorTerm * 0.5 - strengthTerm, 0.05, 0.95)
}

/** 以模拟流掷一次对方是否应允；请求方的兵力在对方眼里只是估计，故与这一掷同出一流。 */
function respondsTo(
  state: GameState,
  actor: FactionId,
  target: FactionId,
  kind: 'alliance' | 'makePeace' | 'demand',
): boolean {
  const random = createRandom(state.randomState)
  const actorTroops = estimateOf(factionTroops(state, actor), random)
  const accepted = random.next() < acceptanceChance(state, actor, target, kind, actorTroops)
  state.randomState = random.getState()

  return accepted
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

/** 停战：与敌对方转为中立，须好感达到门槛且对方应允。 */
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
      if (favorBetween(current, factionId, targetId) < PEACE_FAVOR) {
        return '好感不足，对方不愿停战'
      }
      return null
    },
    execute: (current) => {
      if (target === null) {
        return { outcome: '停战未生效' }
      }
      if (!respondsTo(current, factionId, targetId, 'makePeace')) {
        return { targetId, outcome: `${target.name} 拒绝了停战` }
      }

      setRelation(current, factionId, targetId, 'neutral')

      return { targetId, outcome: `与 ${target.name} 停战` }
    },
  })
}

/** 结盟：与中立方结为同盟，须好感达到门槛且对方应允。 */
export function alliance(
  state: GameState,
  targetId: FactionId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const target = factionOf(state, targetId)

  return runAction(state, {
    kind: 'alliance',
    factionId,
    precondition: (current) => {
      if (target === null || target.id === factionId) {
        return '目标势力不存在'
      }
      if (areAllied(current, factionId, targetId)) {
        return '与对方已经是同盟'
      }
      if (areHostile(current, factionId, targetId)) {
        return '与对方敌对，须先停战'
      }
      if (favorBetween(current, factionId, targetId) < ALLIANCE_FAVOR) {
        return '好感不足，对方不愿结盟'
      }
      return null
    },
    execute: (current) => {
      if (target === null) {
        return { outcome: '结盟未生效' }
      }
      if (!respondsTo(current, factionId, targetId, 'alliance')) {
        return { targetId, outcome: `${target.name} 婉拒了结盟` }
      }

      setRelation(current, factionId, targetId, 'ally')
      adjustFavor(current, factionId, targetId, 5)

      return { targetId, outcome: `与 ${target.name} 结盟` }
    },
  })
}

/** 赠礼：花金钱提升对方好感。 */
export function gift(
  state: GameState,
  targetId: FactionId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const target = factionOf(state, targetId)

  return runAction(state, {
    kind: 'gift',
    factionId,
    precondition: (current) => {
      if (target === null || target.id === factionId) {
        return '目标势力不存在'
      }
      const faction = factionOf(current, factionId)
      if (faction === null || faction.money < GIFT_MONEY) {
        return '金钱不足'
      }
      return null
    },
    execute: (current) => {
      const faction = factionOf(current, factionId)
      if (target === null || faction === null) {
        return { outcome: '赠礼未生效' }
      }

      faction.money -= GIFT_MONEY
      const favor = adjustFavor(current, factionId, targetId, GIFT_FAVOR)

      return { targetId, outcome: `向 ${target.name} 赠礼，好感升至 ${favor}` }
    },
  })
}

/** 索取：向对方索要粮食，对方按好感与实力决定是否给予；予取皆损好感。 */
export function demand(
  state: GameState,
  targetId: FactionId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const target = factionOf(state, targetId)

  return runAction(state, {
    kind: 'demand',
    factionId,
    precondition: () => {
      if (target === null || target.id === factionId) {
        return '目标势力不存在'
      }
      return null
    },
    execute: (current) => {
      const actor = factionOf(current, factionId)
      if (target === null || actor === null) {
        return { outcome: '索取未生效' }
      }

      if (!respondsTo(current, factionId, targetId, 'demand')) {
        adjustFavor(current, factionId, targetId, -DEMAND_REFUSE_PENALTY)
        return { targetId, outcome: `${target.name} 拒绝了索取` }
      }

      const given = Math.min(target.grain, DEMAND_GRAIN)
      target.grain -= given
      actor.grain += given
      adjustFavor(current, factionId, targetId, -DEMAND_FAVOR_PENALTY)

      return { targetId, outcome: `向 ${target.name} 索得 ${given} 粮` }
    },
  })
}
