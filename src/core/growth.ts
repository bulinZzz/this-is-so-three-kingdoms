import { runAction, type ActionResult } from './actions'
import { isServing } from './characters'
import { troopLimit, TROOP_LIMIT_HARD_CAP } from './military'
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

/** 一次强化提升的带兵上限与对应兵力。 */
export const TROOP_BOOST_GAIN = 500

/** 每名武将累计可强化的次数上限。 */
export const BOOST_MAX = 10

/** 能力项的上限：高出人物数据的本色上限（100），练满可超人本色二十点。 */
export const ABILITY_MAX = 120

/** 可强化的四项能力，顺序供界面展示。 */
export const ABILITY_KINDS: readonly AbilityKind[] = ['might', 'intellect', 'command', 'politics']

/** 强化可投向的目标：四项能力之外，另有带兵上限。 */
export type StrengthenKind = AbilityKind | 'troops'

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
 * 强化：把一次经验积累的额度用在某项能力或带兵上限上，消耗行动力。
 * 能力提升一档；带兵上限提升时，兵力随之等量增加。
 * 额度不足、能力已至上限、带兵上限已至硬上限或累计强化已满时拒绝且不扣行动力；
 * 与本人本季是否已行动无关。
 */
export function strengthen(
  state: GameState,
  characterId: CharacterId,
  kind: StrengthenKind,
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
      if (kind === 'troops') {
        if (troopLimit(character) >= TROOP_LIMIT_HARD_CAP) {
          return '带兵上限已达上限'
        }
      } else if (abilityOf(character, kind) >= ABILITY_MAX) {
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

      character.boosts = (character.boosts ?? 0) + 1

      if (kind === 'troops') {
        const before = troopLimit(character)
        const next = Math.min(TROOP_LIMIT_HARD_CAP, before + TROOP_BOOST_GAIN)
        const gain = next - before
        character.troopLimit = next
        character.troops = Math.min(next, character.troops + gain)

        return {
          targetId: character.id,
          outcome: `${character.name} 带兵上限与兵力各 +${gain}`,
        }
      }

      character[kind] = Math.min(ABILITY_MAX, abilityOf(character, kind) + BOOST_GAIN)

      return {
        targetId: character.id,
        outcome: `${character.name} 强化${ABILITY_LABELS[kind]}至 ${abilityOf(character, kind)}`,
      }
    },
  })
}
