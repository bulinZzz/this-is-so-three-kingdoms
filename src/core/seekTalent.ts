import { runAction, type ActionResult } from './actions'
import { isTierAvailable, provinceControl } from './cardPool'
import { CHARACTER_LIMIT, countServing, isRecruitable } from './characters'
import type { GameState, SiteId } from './model'
import type { Random } from './random'

/**
 * 人才寻访：在玩家自有的据点就地发起，候选取自该据点所在的州中层级已放出的在野者，
 * 抽取一名令其入仕并驻守该据点。抽取只消耗传入的抽卡随机源，与模拟随机源互不干扰。
 */
export function seekTalent(state: GameState, random: Random, siteId: SiteId): ActionResult {
  const site = state.geography.sites.find((item) => item.id === siteId) ?? null
  const candidates =
    site === null
      ? []
      : state.characters.filter(
          (character) =>
            isRecruitable(character) &&
            character.provinceId === site.provinceId &&
            isTierAvailable(character.tier, provinceControl(state, site.provinceId)),
        )

  return runAction(state, {
    kind: 'seekTalent',
    precondition: (current) => {
      if (site === null) {
        return '据点不存在'
      }
      if (site.owner !== current.playerFaction) {
        return '此处不是自有据点'
      }
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
      picked.stationedSiteId = site?.id ?? null

      return { targetId: site?.id ?? null, outcome: `招募 ${picked.name}` }
    },
  })
}
