import type { Character, Site, SiteGuard, SiteType } from './model'

/**
 * 战略点的地方守备：强度、名号与应战台词集中在这里定义，便于调数值。
 * 守备独立于武将体系（见 model 的 `SiteGuard`）。无主战略点在开局补上一支，不随季增长；
 * 有主战略点不落库，在守将尽出或调空时就地成军——据点越大，民力越厚，攻取要付的代价也越高。
 * 野地无人烟，不设守备。
 */

/** 设守备的战略点类型：城池与关隘。野地无归属，也不在守备之列。 */
type GuardedSiteType = Exclude<SiteType, 'field'>

// 以下守军数值均为暂定，待实测调整。
/** 守军兵力占战略点人口的比例。 */
const GUARD_TROOP_RATIO = 0.05
/** 各类型守军的兵力上限：关隘最少、都会最多。 */
const GUARD_TROOP_CAP: Record<GuardedSiteType, number> = {
  metropolis: 6000,
  city: 5000,
  town: 3000,
  pass: 3000,
}
/** 各类型守军的武力、统率与智谋：能力随类型递增。 */
const GUARD_ABILITY: Record<GuardedSiteType, Pick<SiteGuard, 'might' | 'command' | 'intellect'>> = {
  metropolis: { might: 68, command: 72, intellect: 70 },
  city: { might: 58, command: 62, intellect: 60 },
  town: { might: 55, command: 55, intellect: 50 },
  pass: { might: 62, command: 60, intellect: 48 },
}
/** 名号词表：城池为义军之属，关隘另给一类。 */
const GUARD_NAMES: Record<GuardedSiteType, { titles: readonly string[]; leader: string }> = {
  metropolis: { titles: ['义军', '民兵'], leader: '领袖' },
  city: { titles: ['义军', '民兵'], leader: '领袖' },
  town: { titles: ['义军', '民兵'], leader: '领袖' },
  pass: { titles: ['戍卒', '关卒'], leader: '校尉' },
}

/** 战略点标识的确定性折算：名号据此选取，与列表顺序无关，固定种子下稳定可复现。 */
function hashId(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0
  }

  return hash
}

/** 守军化为临时武将时所用标识前缀：`guard:<siteId>`。不入武将体系，故以此区别于寻常武将。 */
export const GUARD_CHARACTER_PREFIX = 'guard:'

/** 守军头目应战时的台词，按名号里的类别——戍卒与义军说话自然不同。 */
const GUARD_RESPONSES: Record<string, string> = {
  义军: '我等乡勇保境安民，岂容你等来犯！',
  民兵: '乡里父老所托，岂能让你踏进一步！',
  戍卒: '此关有某把守，休想过关！',
  关卒: '关上的人还在，退回去！',
}

/** 守军头目的应战台词；非守军则返回 null，交由寻常武将的台词。 */
export function guardResponseLineOf(character: Character): string | null {
  if (!character.id.startsWith(GUARD_CHARACTER_PREFIX)) {
    return null
  }

  const title = character.name.split('·')[0]

  return title === undefined ? null : GUARD_RESPONSES[title] ?? null
}

/** 给一个战略点生成地方守备：强度由类型与人口推导，名号由类型与标识确定；野地无守备。 */
export function guardFor(site: Site): SiteGuard | null {
  if (site.type === 'field') {
    return null
  }

  const ability = GUARD_ABILITY[site.type]
  const names = GUARD_NAMES[site.type]
  const title = names.titles[hashId(site.id) % names.titles.length] ?? names.titles[0]

  return {
    name: `${title}·${names.leader}`,
    troops: Math.min(Math.round(site.population * GUARD_TROOP_RATIO), GUARD_TROOP_CAP[site.type]),
    might: ability.might,
    command: ability.command,
    intellect: ability.intellect,
  }
}
