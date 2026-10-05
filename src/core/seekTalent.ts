import { runAction, type ActionResult } from './actions'
import { CHARACTER_LIMIT, countServing, isRecruitable } from './characters'
import type { GameState, ProvinceId } from './model'
import type { Random } from './random'

/** 玩家势力当前占地所在的州。 */
function playerProvinces(state: GameState): Set<ProvinceId> {
  return new Set(
    state.geography.sites
      .filter((site) => site.owner === state.playerFaction)
      .map((site) => site.provinceId),
  )
}

/**
 * 人才寻访：范围是玩家势力当前占地所在的州，从该州在野武将中抽取一名，令其入仕。
 * 抽取只消耗传入的抽卡随机源，与随存档落盘的模拟随机源互不干扰。
 */
export function seekTalent(state: GameState, random: Random): ActionResult {
  const provinces = playerProvinces(state)
  const candidates = state.characters.filter(
    (character) => isRecruitable(character) && provinces.has(character.provinceId),
  )

  return runAction(state, {
    kind: 'seekTalent',
    precondition: (current) => {
      if (countServing(current.characters, current.playerFaction) >= CHARACTER_LIMIT) {
        return '麾下已满'
      }
      if (candidates.length === 0) {
        return '此处已无可寻之人'
      }
      return null
    },
    execute: (current) => {
      const picked = candidates[Math.floor(random.next() * candidates.length)]
      picked.status = 'serving'
      picked.factionId = current.playerFaction

      return { targetId: picked.provinceId, outcome: `招募 ${picked.name}` }
    },
  })
}
