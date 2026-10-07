import { NEUTRAL_AFFINITY } from './affinity'
import type { Character, CharacterTier, GameState } from './model'
import { clearContacts } from './seekTalent'

/** 各挫折带来的忠诚下降，集中定义。 */
export const LOYALTY_LOSS = {
  /** 驻守的战略点失守、守将逃出。 */
  siteLost: 10,
  /** 参与进攻并失败。 */
  battleLost: 8,
}

/** 忠诚低于它，再受一次挫折即叛离。 */
export const DEFECT_THRESHOLD = 40

/** 叛离者对原势力偏好的下降幅度。 */
const DEFECT_AFFINITY_LOSS = 30

/** 回归在野后进二级池所需的能力下限（四项最高值）；不及者进基础池。 */
const WILD_SECOND_TIER_MIN = 85

/**
 * 忠诚下降，夹在 0 以上。君主的忠诚无意义，不参与升降；在野与退场者也不计。
 */
export function loseLoyalty(character: Character, amount: number): void {
  if (character.status !== 'serving' || character.isMonarch) {
    return
  }

  character.loyalty = Math.max(0, character.loyalty - amount)
}

/** 回归在野者可进的卡池层级：能力高者二级，其余基础池；三级只留给原本标在三级的名将。 */
export function wildTierFor(character: Character): CharacterTier {
  const best = Math.max(character.might, character.command, character.intellect, character.politics)

  return best >= WILD_SECOND_TIER_MIN ? 'second' : 'basic'
}

/** 忠诚的定性提示，供界面展示；忠心者不标。 */
export function loyaltyHint(loyalty: number): string | null {
  if (loyalty < DEFECT_THRESHOLD) {
    return '离心'
  }
  if (loyalty < DEFECT_THRESHOLD + 20) {
    return '不满'
  }

  return null
}

/**
 * 触发叛离：忠诚低于阈值者在仕者离走，转为在野。
 * 只在受挫（败仗、失守）时判定——忠诚低而不再受挫者不会自行离开，等下一次触发（将来的离间、笼络）。
 * 转为在野后：州取驻地所在州、卡池层级按能力、对原势力偏好下降、清出各势力的接触名单。
 * 返回去向说明并写入历史；未叛离返回 null。
 */
export function maybeDefect(state: GameState, character: Character, reason: string): string | null {
  const factionId = character.factionId
  if (character.status !== 'serving' || character.isMonarch || factionId === null) {
    return null
  }
  if (character.loyalty >= DEFECT_THRESHOLD) {
    return null
  }

  const station = state.geography.sites.find((site) => site.id === character.stationedSiteId)

  character.status = 'wild'
  character.factionId = null
  character.stationedSiteId = null
  character.troops = 0
  character.loyalty = 0
  character.provinceId = station?.provinceId ?? character.provinceId
  character.tier = wildTierFor(character)
  character.affinities[factionId] = Math.max(
    0,
    (character.affinities[factionId] ?? NEUTRAL_AFFINITY) - DEFECT_AFFINITY_LOSS,
  )
  clearContacts(state, character.id)

  const factionName = state.factions.find((faction) => faction.id === factionId)?.name ?? factionId
  const outcome = `${character.name} 弃${factionName}而去（${reason}）`

  state.history.push({
    kind: 'defect',
    factionId,
    date: { ...state.currentDate },
    targetId: character.id,
    outcome,
  })

  return outcome
}
