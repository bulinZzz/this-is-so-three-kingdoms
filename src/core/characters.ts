import { isValidAffinity } from './affinity'
import { PERSONALITIES, type Character, type FactionId, type GameState, type Geography } from './model'

/** 麾下武将上限。安全阀：在仕武将数达到上限后不能再寻访，解任与替换留待迭代 9。 */
export const CHARACTER_LIMIT = 30

/** 在野武将可被寻访并入仕。 */
export function isRecruitable(character: Character): boolean {
  return character.status === 'wild'
}

/** 某势力当前在仕的武将数，在野与退场不计入。 */
export function countServing(characters: readonly Character[], factionId: FactionId): number {
  return characters.filter(
    (character) => character.status === 'serving' && character.factionId === factionId,
  ).length
}

/** 新开局克隆人物数据，不直接持有剧本里的对象；倾向表也一并复制，免得运行时改动写回剧本。 */
export function cloneCharacters(characters: readonly Character[]): Character[] {
  return characters.map((character) => ({ ...character, affinities: { ...character.affinities } }))
}

/** 每过一年，全体武将年龄加一；开局尚未出生者据此向出生接近。 */
export function growAges(state: GameState): void {
  for (const character of state.characters) {
    character.age += 1
  }
}

/** 武力、统率、智谋、内政、忠诚、士气的取值范围。 */
const STAT_MIN = 0
const STAT_MAX = 100

/** 年龄的合理区间。开局尚未出生者为负；超出此范围即为数据错误。 */
const AGE_MIN = -100
const AGE_MAX = 100

/**
 * 校验人物数据是否自洽：标识唯一、所在州存在、能力数值齐备、年龄在范围内、性格为既定标签、
 * 倾向指向的势力存在且偏好合法，在仕者必有有效势力与自有驻地、君主唯一，
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
  const monarchCounts = new Map<FactionId, number>()

  for (const character of characters) {
    if (characterIds.has(character.id)) {
      problems.push(`武将 id 重复：${character.id}`)
    }
    characterIds.add(character.id)

    if (!provinceIdSet.has(character.provinceId)) {
      problems.push(`武将 ${character.id} 的所在州不存在：${character.provinceId}`)
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

    if (!Number.isInteger(character.troops) || character.troops < 0) {
      problems.push(`武将 ${character.id} 的兵力超出范围：${character.troops}`)
    }

    for (const [factionId, affinity] of Object.entries(character.affinities)) {
      if (!factionIdSet.has(factionId)) {
        problems.push(`武将 ${character.id} 的势力倾向指向不存在的势力：${factionId}`)
      }
      if (!isValidAffinity(affinity)) {
        problems.push(`武将 ${character.id} 的势力倾向超出范围：${affinity}`)
      }
    }

    if (character.status === 'wild' && character.tier === null) {
      problems.push(`在野武将 ${character.id} 没有卡池层级`)
    }

    if (character.isMonarch) {
      if (character.status !== 'serving' || character.factionId === null) {
        problems.push(`非在仕武将 ${character.id} 不应是君主`)
      } else {
        monarchCounts.set(character.factionId, (monarchCounts.get(character.factionId) ?? 0) + 1)
      }
    }

    if (character.status === 'serving') {
      if (character.factionId === null) {
        problems.push(`在仕武将 ${character.id} 没有所属势力`)
      } else if (!factionIdSet.has(character.factionId)) {
        problems.push(`武将 ${character.id} 的所属势力不存在：${character.factionId}`)
      }

      const station = character.stationedSiteId
      if (station === null) {
        problems.push(`在仕武将 ${character.id} 没有驻地`)
      } else if (!siteOwner.has(station)) {
        problems.push(`武将 ${character.id} 的驻地不存在：${station}`)
      } else if (siteOwner.get(station) !== character.factionId) {
        problems.push(`武将 ${character.id} 的驻地 ${station} 不属于其势力`)
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

  return problems
}
