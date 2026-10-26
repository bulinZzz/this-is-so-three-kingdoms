import { isValidAffinity } from './affinity'
import {
  PERSONALITIES,
  type Character,
  type FactionId,
  type GameState,
  type Geography,
  type ProvinceId,
  type SiteId,
} from './model'
import { createRandom } from './random'

/** 麾下武将上限。安全阀：在仕武将数达到上限后不能再寻访，解任与替换留待迭代 9。 */
export const CHARACTER_LIMIT = 30

/** 在野武将可被寻访并入仕。 */
export function isRecruitable(character: Character): boolean {
  return character.status === 'wild'
}

/** 在仕武将：隶属某势力并列入其名册，驻守与否不限，参与一切结算。 */
export function isServing(character: Character): boolean {
  return character.status === 'serving'
}

/** 退场武将：已退出游戏（战死、阵亡或被斩杀），不再参与任何结算与名单。 */
export function isRetired(character: Character): boolean {
  return character.status === 'retired'
}

/** 某势力当前在仕的武将数，在野与退场不计入。 */
export function countServing(characters: readonly Character[], factionId: FactionId): number {
  return characters.filter(
    (character) => isServing(character) && character.factionId === factionId,
  ).length
}

/**
 * 在野者的招募州：取其活动范围首位所在州。
 * 数据校验保证与 provinceId 一致；运行时仍以首位为准，跨州列表也只认首位。
 */
export function recruitProvinceOf(character: Character, geography: Geography): ProvinceId | null {
  const first = character.scope[0]
  return geography.sites.find((site) => site.id === first)?.provinceId ?? null
}

/** 新开局克隆人物数据，不直接持有剧本里的对象；倾向表与活动范围也一并复制，免得运行时改动写回剧本。 */
export function cloneCharacters(characters: readonly Character[]): Character[] {
  return characters.map((character) => ({
    ...character,
    affinities: { ...character.affinities },
    scope: [...character.scope],
  }))
}

/**
 * 该武将当季可用的活动城池：清单内仍有本方城池时用整份清单；
 * 全数易主时退回当季随机落脚点。在野者不涉无籍规则，仍用清单。
 */
export function scopeSitesFor(state: GameState, character: Character): SiteId[] {
  if (!isServing(character) || character.factionId === null) {
    return character.scope
  }

  const ownsScope = character.scope.some(
    (siteId) =>
      state.geography.sites.find((site) => site.id === siteId)?.owner === character.factionId,
  )
  if (ownsScope) {
    return character.scope
  }

  return character.roamingSiteId === null || character.roamingSiteId === undefined
    ? []
    : [character.roamingSiteId]
}

/**
 * 每季初为无籍武将抽一次落脚点：活动范围内已无本方城池者，
 * 从本方城池中随机取一处，整季固定。固定种子下可复现。
 */
export function refreshRoamingSites(state: GameState): void {
  const random = createRandom(state.randomState)

  for (const character of state.characters) {
    const factionId = character.factionId
    if (!isServing(character) || factionId === null) {
      character.roamingSiteId = null
      continue
    }

    const ownsScope = character.scope.some(
      (siteId) => state.geography.sites.find((site) => site.id === siteId)?.owner === factionId,
    )
    if (ownsScope) {
      character.roamingSiteId = null
      continue
    }

    const ownSites = state.geography.sites.filter((site) => site.owner === factionId)
    character.roamingSiteId =
      ownSites.length > 0
        ? ownSites[Math.floor(random.next() * ownSites.length)].id
        : null
  }

  state.randomState = random.getState()
}

/** 每过一年，在世武将年龄加一；退场者不再参与结算，开局尚未出生者据此向出生接近。 */
export function growAges(state: GameState): void {
  for (const character of state.characters) {
    if (isRetired(character)) {
      continue
    }

    character.age += 1
  }
}

/** 武力、统率、智谋、内政、忠诚、士气的取值范围。 */
const STAT_MIN = 0
const STAT_MAX = 100

/** 兵种的取值集合，与战斗引擎的兵种表一致。 */
const ARM_TYPES = ['infantry', 'archer', 'cavalry'] as const

/** 年龄的合理区间。开局尚未出生者为负；超出此范围即为数据错误。 */
const AGE_MIN = -100
const AGE_MAX = 100

/**
 * 校验人物数据是否自洽：标识唯一、所在州存在、能力数值齐备、年龄在范围内、性格为既定标签、
 * 倾向指向的势力存在且偏好合法，在仕者必有有效势力、驻守须为本方所有且每点至多一人、君主唯一，
 * 在野与退场者不隶属势力也无驻地。返回全部问题，为空表示数据可用。
 */
export function validateCharacters(
  characters: readonly Character[],
  factionIds: readonly FactionId[],
  geography: Geography,
): string[] {
  const problems: string[] = []
  const characterIds = new Set<string>()
  const factionIdSet = new Set(factionIds)
  const provinceIdSet = new Set(geography.provinces.map((province) => province.id))
  const siteOwner = new Map(geography.sites.map((site) => [site.id, site.owner]))
  const siteProvince = new Map(geography.sites.map((site) => [site.id, site.provinceId]))
  const monarchCounts = new Map<FactionId, number>()
  const stationCounts = new Map<string, number>()

  for (const character of characters) {
    if (characterIds.has(character.id)) {
      problems.push(`武将 id 重复：${character.id}`)
    }
    characterIds.add(character.id)

    if (!provinceIdSet.has(character.provinceId)) {
      problems.push(`武将 ${character.id} 的所在州不存在：${character.provinceId}`)
    }

    if (!Array.isArray(character.scope) || character.scope.length === 0) {
      problems.push(`武将 ${character.id} 的活动范围为空`)
    } else {
      const seenSites = new Set<string>()
      for (const siteId of character.scope) {
        if (!siteOwner.has(siteId)) {
          problems.push(`武将 ${character.id} 的活动范围含不存在的城池：${siteId}`)
        }
        if (seenSites.has(siteId)) {
          problems.push(`武将 ${character.id} 的活动范围重复列出：${siteId}`)
        }
        seenSites.add(siteId)
      }

      if (
        isRecruitable(character) &&
        siteProvince.get(character.scope[0]) !== character.provinceId
      ) {
        problems.push(
          `在野武将 ${character.id} 的首位城池不属于其所在州：${character.scope[0]}`,
        )
      }
    }

    for (const [label, value] of [
      ['武力', character.might],
      ['统率', character.command],
      ['智谋', character.intellect],
      ['内政', character.politics],
      ['忠诚', character.loyalty],
    ] as const) {
      if (!Number.isInteger(value) || value < STAT_MIN || value > STAT_MAX) {
        problems.push(`武将 ${character.id} 的${label}超出范围：${value}`)
      }
    }

    if (!Number.isInteger(character.age) || character.age < AGE_MIN || character.age > AGE_MAX) {
      problems.push(`武将 ${character.id} 的年龄超出范围：${character.age}`)
    }

    if (!PERSONALITIES.includes(character.personality)) {
      problems.push(`武将 ${character.id} 的性格不合法：${character.personality}`)
    }

    if (!ARM_TYPES.includes(character.armType)) {
      problems.push(`武将 ${character.id} 的兵种不合法：${character.armType}`)
    }

    if (!Number.isInteger(character.troops) || character.troops < 0) {
      problems.push(`武将 ${character.id} 的兵力超出范围：${character.troops}`)
    }

    for (const [label, value] of [
      ['带兵上限', character.troopLimit],
      ['经验值', character.exp],
      ['强化次数', character.boosts],
    ] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        problems.push(`武将 ${character.id} 的${label}不合法：${value}`)
      }
    }

    for (const [factionId, affinity] of Object.entries(character.affinities)) {
      if (!factionIdSet.has(factionId)) {
        problems.push(`武将 ${character.id} 的势力倾向指向不存在的势力：${factionId}`)
      }
      if (!isValidAffinity(affinity)) {
        problems.push(`武将 ${character.id} 的势力倾向超出范围：${affinity}`)
      }
    }

    if (isRecruitable(character) && character.tier === null) {
      problems.push(`在野武将 ${character.id} 没有卡池层级`)
    }

    if (character.isMonarch) {
      if (!isServing(character) || character.factionId === null) {
        problems.push(`非在仕武将 ${character.id} 不应是君主`)
      } else {
        monarchCounts.set(character.factionId, (monarchCounts.get(character.factionId) ?? 0) + 1)
      }
    }

    if (isServing(character)) {
      if (character.factionId === null) {
        problems.push(`在仕武将 ${character.id} 没有所属势力`)
      } else if (!factionIdSet.has(character.factionId)) {
        problems.push(`武将 ${character.id} 的所属势力不存在：${character.factionId}`)
      }

      const station = character.stationedSiteId
      if (station !== null) {
        if (!siteOwner.has(station)) {
          problems.push(`武将 ${character.id} 的驻地不存在：${station}`)
        } else if (siteOwner.get(station) !== character.factionId) {
          problems.push(`武将 ${character.id} 的驻地 ${station} 不属于其势力`)
        }

        stationCounts.set(station, (stationCounts.get(station) ?? 0) + 1)
      }

      continue
    }

    if (character.factionId !== null) {
      problems.push(`非在仕武将 ${character.id} 不应隶属势力：${character.factionId}`)
    }
    if (character.stationedSiteId !== null) {
      problems.push(`非在仕武将 ${character.id} 不应有驻地：${character.stationedSiteId}`)
    }
    if (character.troops !== 0) {
      problems.push(`非在仕武将 ${character.id} 不应有部队：${character.troops}`)
    }
  }

  for (const [factionId, count] of monarchCounts) {
    if (count > 1) {
      problems.push(`势力 ${factionId} 有多名君主`)
    }
  }

  for (const [siteId, count] of stationCounts) {
    if (count > 1) {
      problems.push(`战略点 ${siteId} 有 ${count} 名驻将`)
    }
  }

  return problems
}
