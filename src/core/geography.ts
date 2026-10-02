import type { FactionId, Geography } from './model'

/** 空的地理结构，新开局克隆它，不直接持有。 */
export const EMPTY_GEOGRAPHY: Geography = { provinces: [], sites: [] }

export function cloneGeography(geography: Geography): Geography {
  return {
    provinces: geography.provinces.map((province) => ({ ...province })),
    sites: geography.sites.map((site) => ({ ...site, neighbors: [...site.neighbors] })),
  }
}

/**
 * 校验地理数据是否自洽：引用完整、邻接对称、标识唯一。
 * 返回全部问题，为空表示数据可用。
 */
export function validateGeography(
  geography: Geography,
  factionIds: readonly FactionId[],
): string[] {
  const problems: string[] = []
  const provinceIds = new Set<string>()
  const siteIds = new Set<string>()

  for (const province of geography.provinces) {
    if (provinceIds.has(province.id)) {
      problems.push(`州 id 重复：${province.id}`)
    }
    provinceIds.add(province.id)
  }

  for (const site of geography.sites) {
    if (siteIds.has(site.id)) {
      problems.push(`战略点 id 重复：${site.id}`)
    }
    siteIds.add(site.id)
  }

  const factionIdSet = new Set(factionIds)

  for (const site of geography.sites) {
    if (!provinceIds.has(site.provinceId)) {
      problems.push(`战略点 ${site.id} 的所属州不存在：${site.provinceId}`)
    }
    if (site.owner !== null && !factionIdSet.has(site.owner)) {
      problems.push(`战略点 ${site.id} 的归属势力不存在：${site.owner}`)
    }
  }

  const sitesById = new Map(geography.sites.map((site) => [site.id, site]))

  for (const site of geography.sites) {
    const seen = new Set<string>()

    for (const neighborId of site.neighbors) {
      if (seen.has(neighborId)) {
        problems.push(`战略点 ${site.id} 的相邻列表重复：${neighborId}`)
        continue
      }
      seen.add(neighborId)

      if (neighborId === site.id) {
        problems.push(`战略点 ${site.id} 不能与自身相邻`)
        continue
      }

      const neighbor = sitesById.get(neighborId)
      if (neighbor === undefined) {
        problems.push(`战略点 ${site.id} 的相邻战略点不存在：${neighborId}`)
        continue
      }
      if (!neighbor.neighbors.includes(site.id)) {
        problems.push(`战略点 ${site.id} 与 ${neighborId} 的相邻关系不对称`)
      }
    }
  }

  return problems
}
