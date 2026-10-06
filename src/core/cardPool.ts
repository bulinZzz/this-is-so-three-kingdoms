import type { CharacterTier, GameState, ProvinceId } from './model'

/** 州控制程度：无、基础、二级、三级。 */
export type ControlLevel = 'none' | CharacterTier

const TIER_RANK: Record<CharacterTier, number> = { basic: 1, second: 2, third: 3 }
const CONTROL_RANK: Record<ControlLevel, number> = { none: 0, basic: 1, second: 2, third: 3 }

/**
 * 玩家对某州的控制程度。
 * 占该州至少一个战略点为基础，成为该州归属势力为二级，占该州全部战略点为三级。
 */
export function provinceControl(state: GameState, provinceId: ProvinceId): ControlLevel {
  const sites = state.geography.sites.filter((site) => site.provinceId === provinceId)
  const owned = sites.filter((site) => site.owner === state.playerFaction).length

  if (owned === 0) {
    return 'none'
  }
  if (owned === sites.length) {
    return 'third'
  }

  const province = state.geography.provinces.find((item) => item.id === provinceId)

  return province?.owner === state.playerFaction ? 'second' : 'basic'
}

/** 某层级的人物是否已随当前州控制度放出。 */
export function isTierAvailable(tier: CharacterTier | null, control: ControlLevel): boolean {
  if (tier === null) {
    return false
  }

  return TIER_RANK[tier] <= CONTROL_RANK[control]
}
