import { runAction, type ActionResult } from './actions'
import { affinityToward, joinLoyaltyFor, recruitmentFactor } from './affinity'
import { isTierAvailable, provinceControl } from './cardPool'
import { CHARACTER_LIMIT, countServing, isRecruitable, recruitProvinceOf } from './characters'
import { TROOPS_LIMIT_PER_COMMAND } from './military'
import type {
  Character,
  CharacterId,
  CharacterTier,
  FactionId,
  GameState,
  Personality,
  Site,
  SiteId,
} from './model'
import type { Random } from './random'

/**
 * 各性格的基准招聘成功率。性格决定起点，偏好决定加成：
 * 择主越开放者起得越高，骄矜、谨慎者起得越低。
 */
const BASE_RECRUIT_RATE: Record<Personality, number> = {
  open: 0.7,
  scheming: 0.65,
  brave: 0.55,
  steady: 0.5,
  cautious: 0.45,
  proud: 0.35,
}

/** 一次拜访使目标对己方偏好增加的幅度（含两端）。 */
const VISIT_GAIN_MIN = 5
const VISIT_GAIN_MAX = 15

/** 某性格的基准招聘成功率。 */
export function baseRecruitRate(personality: Personality): number {
  return BASE_RECRUIT_RATE[personality]
}

/**
 * 聘金：招到人时按层级支付，层级越高越贵。
 * 人是本作最稀缺的资产，黄金由此直接接进名册。
 */
const HIRE_COST_BY_TIER: Record<CharacterTier, number> = {
  basic: 200,
  second: 400,
  third: 800,
}

/** 招聘某人应付的聘金；无层级的在野者不收。 */
export function hireCost(character: Character): number {
  return character.tier === null ? 0 : HIRE_COST_BY_TIER[character.tier]
}

/** 招聘某人的成功率：性格基准 × 对发起势力的偏好系数，夹在 0–1 之间，偏好越高越易招到。 */
export function recruitChance(character: Character, factionId: FactionId): number {
  const chance =
    baseRecruitRate(character.personality) * recruitmentFactor(affinityToward(character, factionId))

  return Math.max(0, Math.min(1, chance))
}

/**
 * 已经认得路的人：接触过、且会面之处仍在自己手里。他们从「待招募」里登门即可，
 * 不再进寻访的抽取池；会面之处易主后重归池中，日后在别处还可能再遇上。
 */
function reachableContacts(state: GameState, factionId: FactionId): Set<CharacterId> {
  const owned = new Set(
    state.geography.sites.filter((site) => site.owner === factionId).map((site) => site.id),
  )

  return new Set(
    (state.contactedCandidates[factionId] ?? [])
      .filter((candidate) => owned.has(candidate.siteId))
      .map((candidate) => candidate.characterId),
  )
}

/** 该州该层级中可供寻访的在野者：认得路的除外。 */
function candidatesAt(state: GameState, site: Site, factionId: FactionId): Character[] {
  const known = reachableContacts(state, factionId)

  return state.characters.filter(
    (character) =>
      isRecruitable(character) &&
      recruitProvinceOf(character, state.geography) === site.provinceId &&
      isTierAvailable(character.tier, provinceControl(state, site.provinceId, factionId)) &&
      !known.has(character.id),
  )
}

/** 一次拜访带来的偏好增量。 */
function rollVisitGain(random: Random): number {
  return VISIT_GAIN_MIN + Math.floor(random.next() * (VISIT_GAIN_MAX - VISIT_GAIN_MIN + 1))
}

/** 记下某势力与某在野者的接触，供再次拜访；同一人只留最近一次的会面地点。 */
function markContacted(
  state: GameState,
  factionId: FactionId,
  characterId: CharacterId,
  siteId: SiteId,
): void {
  const candidates = state.contactedCandidates[factionId] ?? []
  const existing = candidates.find((candidate) => candidate.characterId === characterId)

  if (existing === undefined) {
    candidates.push({ characterId, siteId })
  } else {
    existing.siteId = siteId
  }

  state.contactedCandidates[factionId] = candidates
}

/** 某武将入仕后，把它从各势力的接触名单里清掉。 */
export function clearContacts(state: GameState, characterId: CharacterId): void {
  for (const factionId of Object.keys(state.contactedCandidates)) {
    state.contactedCandidates[factionId] = state.contactedCandidates[factionId].filter(
      (candidate) => candidate.characterId !== characterId,
    )
  }
}

/** 某人入仕某势力，直接归入名册，兵力从零起，忠诚按其对该势力的偏好定初值。 */
function join(state: GameState, character: Character, factionId: FactionId): void {
  character.status = 'serving'
  character.factionId = factionId
  character.stationedSiteId = null
  character.troops = 0
  character.troopLimit = character.command * TROOPS_LIMIT_PER_COMMAND
  character.loyalty = joinLoyaltyFor(affinityToward(character, factionId))
  clearContacts(state, character.id)
}

/**
 * 人才寻访：在指定势力自有的战略点就地发起，候选取自该战略点所在的州中层级已放出的在野者，
 * 已经认得路的（接触过、会面之处仍在手）不再入池，那些人走「拜访」。
 * 抽到一人后判定招聘——性格基准 × 偏好系数：成则付聘金入仕，败则记下会面之处，可日后再次拜访。
 * 抽取与判定只消耗传入的抽卡随机源，与模拟随机源互不干扰。缺省为玩家势力发起。
 */
export function seekTalent(
  state: GameState,
  random: Random,
  siteId: SiteId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const site = state.geography.sites.find((item) => item.id === siteId) ?? null
  const candidates = site === null ? [] : candidatesAt(state, site, factionId)

  return runAction(state, {
    kind: 'seekTalent',
    factionId,
    precondition: (current) => {
      if (site === null) {
        return '战略点不存在'
      }
      if (site.owner !== factionId) {
        return '此处不是自有战略点'
      }
      if (
        factionId === current.playerFaction &&
        countServing(current.characters, factionId) >= CHARACTER_LIMIT
      ) {
        return '麾下已满'
      }
      if (candidates.length === 0) {
        return '此处已无可寻之人'
      }
      return null
    },
    execute: (current) => {
      if (site === null) {
        return { outcome: '寻访未生效' }
      }

      const picked = candidates[Math.floor(random.next() * candidates.length)]

      if (random.next() >= recruitChance(picked, factionId)) {
        markContacted(current, factionId, picked.id, site.id)
        return { targetId: site.id, outcome: `寻访到 ${picked.name}，但他不愿出仕` }
      }

      const cost = hireCost(picked)
      const faction = current.factions.find((item) => item.id === factionId)
      if (faction === undefined || faction.money < cost) {
        markContacted(current, factionId, picked.id, site.id)
        return {
          targetId: site.id,
          outcome: `寻访到 ${picked.name}，愿仕，但聘金不足（需 ${cost} 金）`,
        }
      }

      join(current, picked, factionId)
      faction.money -= cost
      return { targetId: site.id, outcome: `招募 ${picked.name}（聘金 −${cost}）` }
    },
  })
}

/**
 * 拜访一位已接触的在野者：花行动力，使其对己方的偏好随机上升，然后重新判定招聘；
 * 招到时同样付聘金。未招到之前他仍在野，其他势力也可能把他招走。
 */
export function visit(
  state: GameState,
  random: Random,
  characterId: CharacterId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const character = state.characters.find((item) => item.id === characterId) ?? null
  const contact =
    state.contactedCandidates[factionId]?.find((candidate) => candidate.characterId === characterId) ??
    null

  return runAction(state, {
    kind: 'visit',
    factionId,
    precondition: (current) => {
      if (character === null) {
        return '武将不存在'
      }
      if (!isRecruitable(character)) {
        return '此人已不在野'
      }
      if (contact === null) {
        return '尚未与此人接触'
      }
      const site = current.geography.sites.find((item) => item.id === contact.siteId)
      if (site === undefined || site.owner !== factionId) {
        return '会面之处已非自有'
      }
      if (
        factionId === current.playerFaction &&
        countServing(current.characters, factionId) >= CHARACTER_LIMIT
      ) {
        return '麾下已满'
      }
      return null
    },
    execute: (current) => {
      if (character === null || contact === null) {
        return { outcome: '拜访未生效' }
      }

      const before = affinityToward(character, factionId)
      character.affinities[factionId] = Math.max(0, Math.min(100, before + rollVisitGain(random)))

      if (random.next() >= recruitChance(character, factionId)) {
        return { targetId: character.id, outcome: `拜访 ${character.name}，意愿上升，但仍未应允` }
      }

      const cost = hireCost(character)
      const faction = current.factions.find((item) => item.id === factionId)
      if (faction === undefined || faction.money < cost) {
        return {
          targetId: character.id,
          outcome: `${character.name} 愿仕，但聘金不足（需 ${cost} 金）`,
        }
      }

      join(current, character, factionId)
      faction.money -= cost
      return { targetId: character.id, outcome: `${character.name} 应允出仕（聘金 −${cost}）` }
    },
  })
}
