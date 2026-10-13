import { runAction, type ActionResult } from './actions'
import type { DevelopmentKind, FactionId, GameState, Site, SiteDevelopment, SiteType } from './model'
import type { Random } from './random'

/**
 * 内政建设：在自有战略点逐项投资农田、市集与民居，分别经营粮、金、人。
 * 经营落到具体地块，才有「经营哪一块」的取舍；等级各有上限，由战略点类型定档。
 * 数值为初值，待实测与 acceptance 调整。
 */

/** 三项开发的等级上限，按战略点类型定档。 */
export const DEVELOPMENT_LIMIT_BY_SITE_TYPE: Record<SiteType, number> = {
  metropolis: 6,
  city: 5,
  town: 3,
  pass: 3,
  field: 2,
}

/** 战略点类型的人口上限基准；自然增长止于此，民居在此之上抬高。 */
export const POPULATION_CAP_BY_SITE_TYPE: Record<SiteType, number> = {
  metropolis: 200000,
  city: 150000,
  town: 100000,
  pass: 40000,
  field: 20000,
}

/** 建设的基础花费：第 n 级花费 = 基础 × n，逐级递增。 */
export const BUILD_COST_BASE = 200

/** 农田每级带来的粮产加成比例。 */
export const GRAIN_BONUS_PER_FARM_LEVEL = 0.1

/** 市集每级带来的金钱产出加成比例。 */
export const MONEY_BONUS_PER_MARKET_LEVEL = 0.15

/** 建民居立即增加的人口，同时等量抬高该点的人口上限。 */
export const POPULATION_PER_HOUSING = 10000

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

/** 建设该项下一级的花费。 */
export function buildCost(site: Site, kind: DevelopmentKind): number {
  return BUILD_COST_BASE * (developmentLevel(site, kind) + 1)
}

/**
 * 建设：在自有战略点提升一项开发等级，消耗行动力与金钱。
 * 非自有战略点、已达该项上限或金钱不足时拒绝且不扣行动力。
 * 民居建成时立即增加该点人口（不超过新建后的人口上限）。
 */
export function build(
  state: GameState,
  siteId: string,
  kind: DevelopmentKind,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const site = state.geography.sites.find((item) => item.id === siteId) ?? null
  const cost = site === null ? 0 : buildCost(site, kind)

  return runAction(state, {
    kind: 'build',
    factionId,
    precondition: (current) => {
      if (site === null) {
        return '战略点不存在'
      }
      if (site.owner !== factionId) {
        return '此处不是自有战略点'
      }
      if (developmentLevel(site, kind) >= developmentLimit(site)) {
        return `${DEVELOPMENT_LABELS[kind]} 已达上限`
      }
      const faction = current.factions.find((item) => item.id === factionId)
      if (faction === undefined || faction.money < cost) {
        return '金钱不足'
      }
      return null
    },
    execute: (current) => {
      const faction = current.factions.find((item) => item.id === factionId)
      if (site === null || faction === undefined) {
        return { outcome: '建设未生效' }
      }

      site.development = developmentOf(site)
      site.development[kind] += 1
      faction.money -= cost

      if (kind === 'housing') {
        site.population = Math.min(site.population + POPULATION_PER_HOUSING, populationCap(site))
      }

      return {
        targetId: site.id,
        outcome: `${site.name} 兴建${DEVELOPMENT_LABELS[kind]}（${site.development[kind]} 级）`,
      }
    },
  })
}

/**
 * 战略点易主时的战火损耗：在前任已开发的设施里随机挑 1–2 项，各降一级（最低归零）。
 * 得城不是白得，前任的经营未必留得住。返回被降级的项，供行动记录展示；无可降者返回空。
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
    damaged.push(kind)
  }

  return damaged
}
