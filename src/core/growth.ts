import { runAction, type ActionResult } from './actions'
import { isServing } from './characters'
import type { AbilityKind, Character, CharacterId, FactionId, GameState } from './model'

/**
 * 武将成长：核心武将起步偏低、上限较高，成长只靠出战积累。
 * 每出战若干次得一次强化额度（额度可累积），攒够即可选一项能力 +1，累计有上限。
 */

/** 每累积多少次出战可得一次强化额度。 */
export const BATTLES_PER_BOOST = 3

/** 每名武将累计可强化的次数上限。 */
export const BOOST_MAX = 10

/** 能力项的上限，与人物数据同一口径。 */
export const ABILITY_MAX = 100

/** 可强化的四项能力，顺序供界面展示。 */
export const ABILITY_KINDS: readonly AbilityKind[] = ['might', 'intellect', 'command', 'politics']

/** 能力项的中文名。 */
export const ABILITY_LABELS: Record<AbilityKind, string> = {
  might: '武力',
  intellect: '智谋',
  command: '统率',
  politics: '内政',
}

/** 该武将当前的某项能力值。 */
export function abilityOf(character: Character, kind: AbilityKind): number {
  return character[kind]
}

/** 该武将已攒下、尚未用掉的强化额度。 */
export function boostCredits(character: Character): number {
  return Math.floor((character.battles ?? 0) / BATTLES_PER_BOOST) - (character.boosts ?? 0)
}

/**
 * 强化：把一次出战累积的额度用在某项能力上，使其 +1，消耗行动力。
 * 额度不足、该项已至上限或累计强化已满时拒绝且不扣行动力；与本人本季是否已行动无关。
 */
export function strengthen(
  state: GameState,
  characterId: CharacterId,
  kind: AbilityKind,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const character = state.characters.find((item) => item.id === characterId) ?? null

  return runAction(state, {
    kind: 'strengthen',
    factionId,
    precondition: () => {
      if (character === null) {
        return '武将不存在'
      }
      if (!isServing(character) || character.factionId !== factionId) {
        return '该武将不在此势力'
      }
      if ((character.boosts ?? 0) >= BOOST_MAX) {
        return `${character.name} 已至强化上限`
      }
      if (abilityOf(character, kind) >= ABILITY_MAX) {
        return `${ABILITY_LABELS[kind]} 已达上限`
      }
      if (boostCredits(character) < 1) {
        return '出战累积不足，尚不能强化'
      }
      return null
    },
    execute: () => {
      if (character === null) {
        return { outcome: '强化未生效' }
      }

      character[kind] = abilityOf(character, kind) + 1
      character.boosts = (character.boosts ?? 0) + 1

      return {
        targetId: character.id,
        outcome: `${character.name} 强化${ABILITY_LABELS[kind]}至 ${abilityOf(character, kind)}`,
      }
    },
  })
}
