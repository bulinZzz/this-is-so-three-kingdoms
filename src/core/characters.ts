import type { Character, FactionId, ProvinceId } from './model'

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

/** 新开局克隆人物数据，不直接持有剧本里的对象。 */
export function cloneCharacters(characters: readonly Character[]): Character[] {
  return characters.map((character) => ({ ...character }))
}

/**
 * 校验人物数据是否自洽：标识唯一、所在州存在、在仕者必有有效势力、在野与退场者不隶属任何势力。
 * 返回全部问题，为空表示数据可用。
 */
export function validateCharacters(
  characters: readonly Character[],
  factionIds: readonly FactionId[],
  provinceIds: readonly ProvinceId[],
): string[] {
  const problems: string[] = []
  const characterIds = new Set<string>()
  const factionIdSet = new Set(factionIds)
  const provinceIdSet = new Set(provinceIds)

  for (const character of characters) {
    if (characterIds.has(character.id)) {
      problems.push(`武将 id 重复：${character.id}`)
    }
    characterIds.add(character.id)

    if (!provinceIdSet.has(character.provinceId)) {
      problems.push(`武将 ${character.id} 的所在州不存在：${character.provinceId}`)
    }

    if (character.status === 'serving') {
      if (character.factionId === null) {
        problems.push(`在仕武将 ${character.id} 没有所属势力`)
      } else if (!factionIdSet.has(character.factionId)) {
        problems.push(`武将 ${character.id} 的所属势力不存在：${character.factionId}`)
      }
      continue
    }

    if (character.factionId !== null) {
      problems.push(`非在仕武将 ${character.id} 不应隶属势力：${character.factionId}`)
    }
  }

  return problems
}
