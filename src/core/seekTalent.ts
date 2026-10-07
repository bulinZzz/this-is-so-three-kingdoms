import { runAction, type ActionResult } from './actions'
import { isTierAvailable, provinceControl } from './cardPool'
import { CHARACTER_LIMIT, countServing, isRecruitable } from './characters'
import type { FactionId, GameState, SiteId } from './model'
import type { Random } from './random'

/** 招募入仕者自带的初始兵力。 */
export const RECRUIT_INITIAL_TROOPS = 500

/**
 * 人才寻访：在指定势力自有的战略点就地发起，候选取自该战略点所在的州中层级已放出的在野者，
 * 抽取一名令其入仕并驻守该战略点。抽取只消耗传入的抽卡随机源，与模拟随机源互不干扰。
 * 缺省为玩家势力发起。
 */
export function seekTalent(
  state: GameState,
  random: Random,
  siteId: SiteId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
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
    factionId,
    precondition: (current) => {
      if (site === null) {
        return '战略点不存在'
      }
      if (site.owner !== factionId) {
        return '此处不是自有战略点'
      }
      if (countServing(current.characters, factionId) >= CHARACTER_LIMIT) {
        return '麾下已满'
      }
      if (candidates.length === 0) {
        return '此处已无可寻之人'
      }
      return null
    },
    execute: () => {
      const picked = candidates[Math.floor(random.next() * candidates.length)]

      picked.status = 'serving'
      picked.factionId = factionId
      picked.stationedSiteId = site?.id ?? null
      picked.troops = RECRUIT_INITIAL_TROOPS

      return { targetId: site?.id ?? null, outcome: `招募 ${picked.name}` }
    },
  })
}
