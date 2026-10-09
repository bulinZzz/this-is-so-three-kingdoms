import { runAction, type ActionResult } from './actions'
import { affinityToward, joinLoyaltyFor, recruitmentFactor } from './affinity'
import { CHARACTER_LIMIT, countServing } from './characters'
import { wildTierFor } from './loyalty'
import type { CaptiveAttitude, CaptiveRecord, Character, CharacterId, FactionId, GameState } from './model'
import type { Random } from './random'
import { baseRecruitRate, clearContacts } from './seekTalent'

/** 劝降意愿的取值范围。 */
const WILL_MIN = 0
const WILL_MAX = 100

/** 意愿到「愿降」档的下限：到此，再劝一次即入仕。 */
export const WILLING_THRESHOLD = 80

/** 意愿分档得到的态度，自高到低；仅作展示，内部按意愿数值推进。 */
const ATTITUDE_STEPS: readonly { min: number; attitude: CaptiveAttitude }[] = [
  { min: WILLING_THRESHOLD, attitude: '愿降' },
  { min: 60, attitude: '心动' },
  { min: 40, attitude: '意有所动' },
  { min: 20, attitude: '不卑不亢' },
  { min: WILL_MIN, attitude: '宁死不屈' },
]

function clampWill(will: number): number {
  return Math.max(WILL_MIN, Math.min(WILL_MAX, will))
}

/** 意愿对应的态度。 */
export function attitudeOf(will: number): CaptiveAttitude {
  return (
    ATTITUDE_STEPS.find((step) => will >= step.min)?.attitude ??
    ATTITUDE_STEPS[ATTITUDE_STEPS.length - 1].attitude
  )
}

/**
 * 被俘时的初始劝降意愿（0–100）：性格基准 × 对俘获方的偏好系数 ×（1 − 忠诚 ÷ 100）。
 * 沿用原先的归附判定口径，只是不再当场掷骰，改作劝降的起点。
 */
export function initialWill(character: Character, captorId: FactionId): number {
  const chance =
    baseRecruitRate(character.personality) *
    recruitmentFactor(affinityToward(character, captorId)) *
    (1 - character.loyalty / 100)

  return clampWill(Math.round(chance * 100))
}

/** 归附者的忠诚初值：跟着对俘获方的偏好走，不高，但挨得起一两场败仗。 */
export function joinLoyalty(character: Character, captorId: FactionId): number {
  return joinLoyaltyFor(affinityToward(character, captorId))
}

/** 该武将被谁关着；不在营中时为 null。 */
export function captorOf(state: GameState, characterId: CharacterId): FactionId | null {
  for (const [factionId, records] of Object.entries(state.captives)) {
    if (records.some((record) => record.characterId === characterId)) {
      return factionId
    }
  }

  return null
}

/** 一名俘虏在营中的样子：武将、营中的记录与由此分档的态度。 */
export interface CaptiveView {
  character: Character
  record: CaptiveRecord
  attitude: CaptiveAttitude
}

/** 某势力俘虏营中的人，按意愿由高到低。 */
export function captivesOf(state: GameState, factionId: FactionId): CaptiveView[] {
  return (state.captives[factionId] ?? [])
    .map((record) => {
      const character = state.characters.find((item) => item.id === record.characterId)
      return character === undefined
        ? null
        : { character, record, attitude: attitudeOf(record.will) }
    })
    .filter((view): view is CaptiveView => view !== null)
    .sort((a, b) => b.record.will - a.record.will)
}

/** 关押：脱离战场与驻地，进入俘获方的俘虏营，意愿按被俘时的局面定初值。 */
export function takeCaptive(
  state: GameState,
  character: Character,
  captorId: FactionId,
): CaptiveRecord {
  const record: CaptiveRecord = {
    characterId: character.id,
    formerFactionId: character.factionId,
    will: initialWill(character, captorId),
  }

  character.status = 'captured'
  character.factionId = null
  character.stationedSiteId = null
  character.troops = 0

  state.captives[captorId] = [...(state.captives[captorId] ?? []), record]

  return record
}

/** 把某人移出俘虏营。 */
function removeCaptive(state: GameState, factionId: FactionId, characterId: CharacterId): void {
  state.captives[factionId] = (state.captives[factionId] ?? []).filter(
    (record) => record.characterId !== characterId,
  )
}

/** 转为在野：脱去势力与部队，忠诚清零，按能力重定卡池层级，并清出接触名单。 */
function becomeWild(state: GameState, character: Character): void {
  character.status = 'wild'
  character.factionId = null
  character.stationedSiteId = null
  character.troops = 0
  character.loyalty = 0
  character.tier = wildTierFor(character)
  clearContacts(state, character.id)
}

/** 入仕安置的结果：已入仕、麾下已满而转为在野、本势力已无寸土无处安置。 */
type ServeOutcome = 'serving' | 'wild' | 'none'

/**
 * 入仕某势力并驻守其一处理得的战略点：兵力从零起，忠诚取给定值（传 null 则沿用当前值）。
 * 该势力已无寸土时无处安置，返回 `none`；麾下武将已达上限时不再接收，转为在野，返回 `wild`。
 */
function serveUnder(
  state: GameState,
  character: Character,
  factionId: FactionId,
  loyalty: number | null,
): ServeOutcome {
  const site = state.geography.sites.find((item) => item.owner === factionId)
  if (site === undefined) {
    return 'none'
  }

  if (countServing(state.characters, factionId) >= CHARACTER_LIMIT) {
    becomeWild(state, character)
    return 'wild'
  }

  character.status = 'serving'
  character.factionId = factionId
  character.stationedSiteId = site.id
  character.troops = 0
  if (loyalty !== null) {
    character.loyalty = loyalty
  }
  clearContacts(state, character.id)

  return 'serving'
}

/** 归附：入仕俘获方，忠诚按对俘获方的偏好给一个不高不低的初值。 */
function joinCaptive(state: GameState, character: Character, factionId: FactionId): ServeOutcome {
  const result = serveUnder(state, character, factionId, joinLoyalty(character, factionId))
  if (result === 'none') {
    return 'none'
  }

  removeCaptive(state, factionId, character.id)

  return result
}

/** 回归旧主：释放或攻方正是其旧主时入仕，忠诚沿用被俘前之值。 */
function rejoinLord(state: GameState, character: Character, factionId: FactionId): ServeOutcome {
  const result = serveUnder(state, character, factionId, null)
  if (result === 'none') {
    return 'none'
  }

  removeCaptive(state, factionId, character.id)

  return result
}

/**
 * 一次劝降的意愿增幅（初版，待细化）：以性格为底，忠诚越高越难劝，再叠一点随机。
 * 数值上使普通降将约 3–5 次、忠臣不超过 8 次可劝成。
 */
function persuadeGain(character: Character, random: Random): number {
  const base = (16 + baseRecruitRate(character.personality) * 20) * (1 - character.loyalty / 250)

  return Math.round(base) + Math.floor(random.next() * 5)
}

/**
 * 劝降：花行动力使对方的意愿上升；到「愿降」档再劝一次即入仕。
 * 君主不事二主，不可劝降，只能斩杀。增幅为初版数值，待细化。
 */
export function persuade(
  state: GameState,
  random: Random,
  characterId: CharacterId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const character = state.characters.find((item) => item.id === characterId) ?? null

  return runAction(state, {
    kind: 'persuade',
    factionId,
    precondition: (current) => {
      if (character === null) {
        return '武将不存在'
      }
      if (captorOf(current, characterId) !== factionId) {
        return '此人不在你的俘虏营中'
      }
      if (character.isMonarch) {
        return '君主不可劝降，只能斩杀'
      }
      return null
    },
    execute: (current) => {
      const record = (current.captives[factionId] ?? []).find(
        (item) => item.characterId === characterId,
      )
      if (character === null || record === undefined) {
        return { outcome: '劝降未生效' }
      }

      if (record.will >= WILLING_THRESHOLD) {
        const result = joinCaptive(current, character, factionId)
        if (result === 'none') {
          return { targetId: character.id, outcome: `${character.name} 愿降，却无处安置` }
        }
        if (result === 'wild') {
          return { targetId: character.id, outcome: `麾下已满，${character.name} 愿降而不得收，转为在野` }
        }
        return { targetId: character.id, outcome: `劝降奏效，${character.name} 归附` }
      }

      record.will = clampWill(record.will + persuadeGain(character, random))

      return {
        targetId: character.id,
        outcome: `劝降 ${character.name}，其态「${attitudeOf(record.will)}」`,
      }
    },
  })
}

/** 斩杀俘虏：当即退场。 */
export function executeCaptive(
  state: GameState,
  characterId: CharacterId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const character = state.characters.find((item) => item.id === characterId) ?? null

  return runAction(state, {
    kind: 'executeCaptive',
    factionId,
    precondition: (current) => {
      if (character === null) {
        return '武将不存在'
      }
      if (captorOf(current, characterId) !== factionId) {
        return '此人不在你的俘虏营中'
      }
      return null
    },
    execute: (current) => {
      if (character === null) {
        return { outcome: '斩杀未生效' }
      }

      removeCaptive(current, factionId, characterId)
      character.status = 'retired'
      character.factionId = null
      character.stationedSiteId = null
      character.troops = 0

      return { targetId: character.id, outcome: `斩杀俘虏 ${character.name}` }
    },
  })
}

/** 释放俘虏：转为在野，回到他所在州的卡池，日后可再被寻访。君主只可斩杀，不可释放。 */
export function releaseCaptive(
  state: GameState,
  characterId: CharacterId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const character = state.characters.find((item) => item.id === characterId) ?? null

  return runAction(state, {
    kind: 'releaseCaptive',
    factionId,
    precondition: (current) => {
      if (character === null) {
        return '武将不存在'
      }
      if (captorOf(current, characterId) !== factionId) {
        return '此人不在你的俘虏营中'
      }
      if (character.isMonarch) {
        return '君主不可释放，只能斩杀'
      }
      return null
    },
    execute: (current) => {
      if (character === null) {
        return { outcome: '释放未生效' }
      }

      removeCaptive(current, factionId, characterId)
      becomeWild(current, character)

      return { targetId: character.id, outcome: `释放 ${character.name}，他回到在野` }
    },
  })
}

/**
 * 某势力覆灭时，其营中俘虏交由攻方处置：旧主正是攻方的直接回归，其余转入攻方的俘虏营。
 * 返回去向说明，供写入战报。
 */
export function absorbCaptives(
  state: GameState,
  fromFactionId: FactionId,
  toFactionId: FactionId,
): string[] {
  const records = [...(state.captives[fromFactionId] ?? [])]
  const notes: string[] = []

  for (const record of records) {
    const character = state.characters.find((item) => item.id === record.characterId)
    removeCaptive(state, fromFactionId, record.characterId)
    if (character === undefined) {
      continue
    }

    if (record.formerFactionId === toFactionId) {
      const result = rejoinLord(state, character, toFactionId)
      if (result === 'serving') {
        notes.push(`${character.name} 重归旧主`)
      } else if (result === 'wild') {
        notes.push(`麾下已满，${character.name} 未能重归旧主，转为在野`)
      } else {
        notes.push(`${character.name} 无处安置`)
      }
    } else {
      state.captives[toFactionId] = [...(state.captives[toFactionId] ?? []), record]
      notes.push(`${character.name} 转入${factionNameOf(state, toFactionId)}营`)
    }
  }

  return notes
}

/** 势力名；查不到时退回标识。 */
function factionNameOf(state: GameState, factionId: FactionId): string {
  return state.factions.find((faction) => faction.id === factionId)?.name ?? factionId
}

/** 其他势力关着的人：到「愿降」档即入仕；本版 AI 不主动劝降，未到者一直关着。 */
export function recruitWillingCaptives(state: GameState, factionId: FactionId): void {
  for (const record of [...(state.captives[factionId] ?? [])]) {
    if (record.will < WILLING_THRESHOLD) {
      continue
    }

    const character = state.characters.find((item) => item.id === record.characterId)
    if (character === undefined || character.isMonarch) {
      continue
    }

    joinCaptive(state, character, factionId)
  }
}
