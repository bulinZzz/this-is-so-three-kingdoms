import { runAction, type ActionResult } from './actions'
import { becomeWild } from './captives'
import { isServing } from './characters'
import type { Character, CharacterId, FactionId, GameState } from './model'

/**
 * 人事：解任、赏赐与遣散。
 * 解任把在仕武将罢为在野，用于腾出麾下名额与裁汰；赏赐花金钱把忠诚拉回；
 * 遣散把兵力降到所需数量，不耗行动力、不算已行动、不退还粮食。
 * 数值为初值，待实测调整。
 */

/** 赏赐花费的金钱与带来的忠诚增幅。 */
export const REWARD_MONEY = 300
export const REWARD_LOYALTY = 8

/** 忠诚的上限。 */
const LOYALTY_MAX = 100

function characterOf(state: GameState, id: CharacterId): Character | null {
  return state.characters.find((item) => item.id === id) ?? null
}

/**
 * 解任：把一名在仕武将罢为在野，卸下驻地与部队，用于腾出麾下名额或裁汰。
 * 君主不可解任。任命入仕已有寻访与劝降两条途径，不另设动作。
 */
export function dismiss(
  state: GameState,
  characterId: CharacterId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const character = characterOf(state, characterId)

  return runAction(state, {
    kind: 'dismiss',
    factionId,
    precondition: () => {
      if (character === null) {
        return '武将不存在'
      }
      if (!isServing(character) || character.factionId !== factionId) {
        return '该武将不在此势力'
      }
      if (character.isMonarch) {
        return '君主不可解任'
      }
      return null
    },
    execute: (current) => {
      if (character === null) {
        return { outcome: '解任未生效' }
      }

      becomeWild(current, character)

      return { targetId: character.id, outcome: `解任 ${character.name}` }
    },
  })
}

/** 赏赐：花金钱提升一名麾下武将的忠诚，这是忠诚唯一的回升途径。 */
export function reward(
  state: GameState,
  characterId: CharacterId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const character = characterOf(state, characterId)

  return runAction(state, {
    kind: 'reward',
    factionId,
    precondition: (current) => {
      if (character === null) {
        return '武将不存在'
      }
      if (!isServing(character) || character.factionId !== factionId) {
        return '该武将不在此势力'
      }
      const faction = current.factions.find((item) => item.id === factionId)
      if (faction === undefined || faction.money < REWARD_MONEY) {
        return '金钱不足'
      }
      return null
    },
    execute: (current) => {
      const faction = current.factions.find((item) => item.id === factionId)
      if (character === null || faction === undefined) {
        return { outcome: '赏赐未生效' }
      }

      faction.money -= REWARD_MONEY
      character.loyalty = Math.min(LOYALTY_MAX, character.loyalty + REWARD_LOYALTY)

      return { targetId: character.id, outcome: `赏赐 ${character.name}，忠诚升至 ${character.loyalty}` }
    },
  })
}

/**
 * 遣散：把一名武将的兵力减到指定数量（0–当前兵力），不耗行动力、不算已行动、不退还粮食。
 * 兵力的下限与上限在此夹定，写一条 `disband` 记录。
 */
export function disband(
  state: GameState,
  characterId: CharacterId,
  remaining: number,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const character = characterOf(state, characterId)
  const target =
    character === null ? 0 : Math.max(0, Math.min(character.troops, Math.round(remaining)))

  return runAction(state, {
    kind: 'disband',
    factionId,
    precondition: () => {
      if (character === null) {
        return '武将不存在'
      }
      if (!isServing(character) || character.factionId !== factionId) {
        return '该武将不在此势力'
      }
      return null
    },
    execute: () => {
      if (character === null) {
        return { outcome: '遣散未生效' }
      }

      const lost = character.troops - target
      character.troops = target

      return { targetId: character.id, outcome: `${character.name} 遣散 ${lost} 兵` }
    },
  })
}
