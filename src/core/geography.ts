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
  const factionIdSet = new Set(factionIds)

  for (const province of geography.provinces) {
    if (provinceIds.has(province.id)) {
      problems.push(`州 id 重复：${province.id}`)
    }
    provinceIds.add(province.id)

    if (province.owner !== null && !factionIdSet.has(province.owner)) {
      problems.push(`州 ${province.id} 的归属势力不存在：${province.owner}`)
    }
  }

  for (const site of geography.sites) {
    if (siteIds.has(site.id)) {
      problems.push(`战略点 id 重复：${site.id}`)
    }
    siteIds.add(site.id)
  }

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

/**
 * 重算各州归属：占该州战略点最多者为归属势力。
 * 与他方并列时不改判，原归属势力得以保持；州内没有任何势力战略点时归属为空。
 * 归属取决于此前的归属，结果与过程相关，不能只由当前版图推出。
 */
export function resolveProvinceOwners(geography: Geography): void {
  for (const province of geography.provinces) {
    const counts = new Map<FactionId, number>()

    for (const site of geography.sites) {
      if (site.provinceId === province.id && site.owner !== null) {
        counts.set(site.owner, (counts.get(site.owner) ?? 0) + 1)
      }
    }

    province.owner = pickOwner(counts, province.owner)
  }
}

/** 取战略点最多者为归属；并列时保留原归属势力，无从保留则为无归属。 */
function pickOwner(counts: Map<FactionId, number>, current: FactionId | null): FactionId | null {
  if (counts.size === 0) {
    return null
  }

  const maxCount = Math.max(...counts.values())
  const leaders = [...counts.entries()]
    .filter(([, count]) => count === maxCount)
    .map(([factionId]) => factionId)

  if (leaders.length === 1) {
    return leaders[0] ?? null
  }

  return current !== null && leaders.includes(current) ? current : null
}
