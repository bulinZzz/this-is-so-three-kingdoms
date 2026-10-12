import { developmentOf, GRAIN_BONUS_PER_FARM_LEVEL } from './development'
import type { Site } from './model'

/**
 * 存粮：粮食落到战略点上。每点各有一份存粮，每季增加、有上限；征粮自此一次性取走，
 * 势力每季另从各点运回一部分作为底子。存粮随地块走，与归属无关，易主后归新主。
 * 数值为初值，待实测与 acceptance 调整。
 */

/** 每点人口每季在战略点上积累的存粮。粮要派人去取才到得了粮仓。 */
export const SITE_GRANARY_PER_POPULATION = 0.004

/** 战略点存粮的上限，按人口折算：存粮在点上累积，满则不再增加。 */
export const SITE_GRANARY_CAP_PER_POPULATION = 1

/** 势力每季从各点存粮中自动运回的比例（作为底子）；余粮留在点上，供征粮一次性取走。 */
export const GRANARY_SHIP_RATIO = 0.6

/** 一处战略点当前的存粮；剧本数据未给时视为 0。 */
export function granaryOf(site: Site): number {
  return site.granary ?? 0
}

/** 该战略点本季的存粮增量；农田建设在此之上加成。 */
export function granaryGrowth(site: Site): number {
  const weighted = site.population * (1 + developmentOf(site).farm * GRAIN_BONUS_PER_FARM_LEVEL)

  return Math.round(weighted * SITE_GRANARY_PER_POPULATION)
}

/** 该战略点存粮的上限。 */
export function granaryCap(site: Site): number {
  return Math.round(site.population * SITE_GRANARY_CAP_PER_POPULATION)
}

/** 开局时该战略点的存粮初值：取一季的增量，使开局即有粮可取。 */
export function initialGranary(site: Site): number {
  return granaryGrowth(site)
}
