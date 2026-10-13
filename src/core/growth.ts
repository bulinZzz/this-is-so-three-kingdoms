import { runAction, type ActionResult } from './actions'
import { isServing } from './characters'
import type { AbilityKind, Character, CharacterId, FactionId, GameState } from './model'

/**
 * 武将成长：核心武将起步偏低、上限较高，成长只靠出战的积累。
 * 每参战一次按胜负得经验——胜 +2、败 +3（败仗反而长进更多）；经验攒够即可强化一项能力。
 */

/** 每获得一次强化额度所需的经验值。 */
export const EXP_PER_BOOST = 5

/** 出战胜、败各自的经验值。 */
export const WIN_EXP = 2
export const LOSS_EXP = 3

/** 一次强化提升的能力点数。 */
export const BOOST_GAIN = 2

/** 每名武将累计可强化的次数上限。 */
export const BOOST_MAX = 10

/** 能力项的上限：高出人物数据的本色上限（100），练满可超人本色二十点。 */
export const ABILITY_MAX = 120

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
  return Math.floor((character.exp ?? 0) / EXP_PER_BOOST) - (character.boosts ?? 0)
}

/**
 * 强化：把一次经验积累的额度用在某项能力上，使其提高一档，消耗行动力。
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
        return '经验不足，尚不能强化'
      }
      return null
    },
    execute: () => {
      if (character === null) {
        return { outcome: '强化未生效' }
      }

      character[kind] = Math.min(ABILITY_MAX, abilityOf(character, kind) + BOOST_GAIN)
      character.boosts = (character.boosts ?? 0) + 1

      return {
        targetId: character.id,
        outcome: `${character.name} 强化${ABILITY_LABELS[kind]}至 ${abilityOf(character, kind)}`,
      }
    },
  })
}
