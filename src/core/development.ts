import type { DevelopmentKind, Site, SiteDevelopment, SiteType } from './model'
import type { Random } from './random'

/**
 * 内政建设：在自有战略点逐项投资农田、市集与民居，分别经营粮、金、人。
 * 经营落到具体地块，才有「经营哪一块」的取舍；等级各有上限，由战略点类型定档。
 * 数值为初值，待实测与 acceptance 调整。
 */

/** 三项开发的等级上限，按战略点类型定档；野地无归属，不可建设。 */
export const DEVELOPMENT_LIMIT_BY_SITE_TYPE: Record<SiteType, number> = {
  metropolis: 6,
  city: 5,
  town: 3,
  pass: 3,
  field: 0,
}

/** 战略点类型的人口上限基准；自然增长止于此，民居在此之上抬高。野地无人烟，无上限可言。 */
export const POPULATION_CAP_BY_SITE_TYPE: Record<SiteType, number> = {
  metropolis: 200000,
  city: 150000,
  town: 100000,
  pass: 40000,
  field: 0,
}

/** 建设进度的基准：目标第 n 级所需进度 = 基准 × (n + 1)，级别越高越费工夫。 */
export const DEVELOPMENT_PROGRESS_BASE = 250

/** 农田每级带来的粮产加成比例。 */
export const GRAIN_BONUS_PER_FARM_LEVEL = 0.1

/** 市集每级带来的金钱产出加成比例。 */
export const MONEY_BONUS_PER_MARKET_LEVEL = 0.15

/** 民居每级抬高的人口上限；人口本身不再因建房而立刻增加。 */
export const POPULATION_PER_HOUSING = 10000

/** 民居每级带来的人口增长率加成：民居不只抬高上限，也让人口攒得更快。 */
export const HOUSING_GROWTH_BONUS = 0.001

/** 开发项的中文名，供行动记录与界面展示。 */
export const DEVELOPMENT_LABELS: Record<DevelopmentKind, string> = {
  farm: '农田',
  market: '市集',
  housing: '民居',
}

/** 可建设的开发项，顺序供界面展示。 */
export const DEVELOPMENT_KINDS: readonly DevelopmentKind[] = ['farm', 'market', 'housing']

/** 未开发的三项等级；每次返回新对象，避免共享可变值。 */
export function emptyDevelopment(): SiteDevelopment {
  return { farm: 0, market: 0, housing: 0 }
}

/** 该战略点的三项开发等级；剧本数据未给时视为全 0。 */
export function developmentOf(site: Site): SiteDevelopment {
  return site.development ?? emptyDevelopment()
}

/** 该战略点某一项的当前等级。 */
export function developmentLevel(site: Site, kind: DevelopmentKind): number {
  return developmentOf(site)[kind]
}

/** 该战略点某一项的等级上限。 */
export function developmentLimit(site: Site): number {
  return DEVELOPMENT_LIMIT_BY_SITE_TYPE[site.type]
}

/** 该战略点当前的人口上限。 */
export function populationCap(site: Site): number {
  return POPULATION_CAP_BY_SITE_TYPE[site.type] + developmentOf(site).housing * POPULATION_PER_HOUSING
}

/** 该战略点某一项升到下一级所需的进度：第 n 级为 250 × (n + 1)，即 500、750、1000…… */
export function developmentRequirement(currentLevel: number): number {
  return DEVELOPMENT_PROGRESS_BASE * (currentLevel + 2)
}

/** 该战略点某一项的在建进度；尚无在建工程时为 0。 */
export function siteProgressOf(site: Site, kind: DevelopmentKind): number {
  return site.developmentProgress?.[kind] ?? 0
}

/** 记下该战略点某一项的在建进度。 */
export function setSiteProgress(site: Site, kind: DevelopmentKind, progress: number): void {
  site.developmentProgress = {
    ...site.developmentProgress,
    [kind]: Math.max(0, Math.round(progress)),
  }
}

/**
 * 战略点易主时的战火损耗：在前任已开发的设施里随机挑 1–2 项，各降一级（最低归零）。
 * 得城不是白得，前任的经营未必留得住；被降级的项，在建进度一并作废。
 * 返回被降级的项，供行动记录展示；无可降者返回空。
 */
export function damageOnCapture(site: Site, random: Random): DevelopmentKind[] {
  const leveled = DEVELOPMENT_KINDS.filter((kind) => developmentLevel(site, kind) > 0)
  if (leveled.length === 0) {
    return []
  }

  const count = Math.min(leveled.length, 1 + Math.floor(random.next() * 2))
  const remaining = [...leveled]
  const damaged: DevelopmentKind[] = []

  for (let picked = 0; picked < count; picked += 1) {
    const index = Math.floor(random.next() * remaining.length)
    const kind = remaining.splice(index, 1)[0]
    if (kind === undefined) {
      break
    }

    site.development = developmentOf(site)
    site.development[kind] -= 1
    setSiteProgress(site, kind, 0)
    damaged.push(kind)
  }

  return damaged
}
