import { validateCharacters } from './characters'
import { validateGeography } from './geography'
import type {
  ArmType,
  Character,
  CharacterStatus,
  CharacterTier,
  Faction,
  FactionRelation,
  GameDate,
  GameState,
  Geography,
  Outcome,
  Province,
  RelationKind,
  Season,
  Site,
  SiteType,
} from './model'
import {
  SCHEMA_VERSION,
  type SaveData,
  type SaveLoadResult,
  type SaveStore,
  type SaveSummary,
} from './saveStore'

/** 存档所需的存储能力，与浏览器的 localStorage 结构相容。 */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * 取得浏览器的 localStorage。
 * 隐私模式、受限 iframe 或禁用站点数据时，访问 `window.localStorage` 本身就可能抛错；
 * 这里把它收成 null，让对局在没有持久化能力时也能照常开局。
 */
export function resolveBrowserStorage(): KeyValueStorage | null {
  try {
    if (typeof window === 'undefined') {
      return null
    }
    return window.localStorage
  } catch {
    return null
  }
}

const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']
const OUTCOMES: readonly Outcome[] = ['ongoing', 'victory', 'defeat']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSeason(value: unknown): value is Season {
  return SEASONS.includes(value as Season)
}

function isGameDate(value: unknown): value is GameDate {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.era === 'string' &&
    typeof value.year === 'number' &&
    isSeason(value.season)
  )
}

const SITE_TYPES: readonly SiteType[] = ['metropolis', 'city', 'town', 'pass', 'field']
const CHARACTER_STATUSES: readonly CharacterStatus[] = ['wild', 'serving', 'captured', 'retired']
const ARM_TYPES: readonly ArmType[] = ['infantry', 'archer', 'cavalry']
const RELATION_KINDS: readonly RelationKind[] = ['hostile', 'neutral']
const CHARACTER_TIERS: readonly CharacterTier[] = ['basic', 'second', 'third']

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isFactionId(value: unknown): value is string {
  return typeof value === 'string'
}

function isFactionOrNull(value: unknown): value is string | null {
  return value === null || isFactionId(value)
}

function isProvinceShape(value: unknown): value is Province {
  return (
    isRecord(value) &&
    isFactionId(value.id) &&
    typeof value.name === 'string' &&
    isFactionOrNull(value.owner)
  )
}

function isSiteShape(value: unknown): value is Site {
  if (!isRecord(value)) {
    return false
  }

  const development = value.development
  const progress = value.developmentProgress

  return (
    isFactionId(value.id) &&
    typeof value.name === 'string' &&
    SITE_TYPES.includes(value.type as SiteType) &&
    isFactionId(value.provinceId) &&
    isFactionOrNull(value.owner) &&
    isStringArray(value.neighbors) &&
    isNonNegativeInteger(value.population) &&
    (value.granary === undefined || isNonNegativeInteger(value.granary)) &&
    (development === undefined ||
      (isRecord(development) &&
        isNonNegativeInteger(development.farm) &&
        isNonNegativeInteger(development.market) &&
        isNonNegativeInteger(development.housing))) &&
    (progress === undefined ||
      (isRecord(progress) &&
        Object.values(progress).every((item) => isNonNegativeInteger(item))))
  )
}

function isFactionShape(value: unknown): value is Faction {
  return (
    isRecord(value) &&
    isFactionId(value.id) &&
    typeof value.name === 'string' &&
    typeof value.color === 'string' &&
    isNonNegativeNumber(value.grain) &&
    isNonNegativeNumber(value.money)
  )
}

function isCharacterShape(value: unknown): value is Character {
  if (!isRecord(value)) {
    return false
  }

  const affinities = value.affinities
  const optionalNumbers = [value.troopLimit, value.exp, value.boosts]

  return (
    isFactionId(value.id) &&
    typeof value.name === 'string' &&
    CHARACTER_STATUSES.includes(value.status as CharacterStatus) &&
    isFactionOrNull(value.factionId) &&
    isFactionId(value.provinceId) &&
    isStringArray(value.scope) &&
    (value.roamingSiteId === undefined ||
      value.roamingSiteId === null ||
      typeof value.roamingSiteId === 'string') &&
    isFiniteNumber(value.might) &&
    isFiniteNumber(value.command) &&
    isFiniteNumber(value.intellect) &&
    isFiniteNumber(value.politics) &&
    isFiniteNumber(value.age) &&
    typeof value.personality === 'string' &&
    isRecord(affinities) &&
    Object.values(affinities).every((item) => isFiniteNumber(item)) &&
    isFiniteNumber(value.loyalty) &&
    typeof value.isMonarch === 'boolean' &&
    ARM_TYPES.includes(value.armType as ArmType) &&
    (value.stationedSiteId === null || typeof value.stationedSiteId === 'string') &&
    isNonNegativeInteger(value.troops) &&
    (value.tier === null || CHARACTER_TIERS.includes(value.tier as CharacterTier)) &&
    optionalNumbers.every((item) => item === undefined || isNonNegativeInteger(item))
  )
}

function isRelationShape(value: unknown): value is FactionRelation {
  return (
    isRecord(value) &&
    Array.isArray(value.factions) &&
    value.factions.length === 2 &&
    value.factions.every((item) => typeof item === 'string') &&
    RELATION_KINDS.includes(value.kind as RelationKind) &&
    isFiniteNumber(value.favor) &&
    value.favor >= 0 &&
    value.favor <= 100
  )
}

function isContactedShape(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFactionId(value.characterId) &&
    isFactionId(value.siteId)
  )
}

function isCaptiveShape(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFactionId(value.characterId) &&
    isFactionOrNull(value.formerFactionId) &&
    isFiniteNumber(value.will) &&
    value.will >= 0 &&
    value.will <= 100
  )
}

function isActionRecordShape(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.kind === 'string' &&
    isFactionOrNull(value.factionId) &&
    isGameDate(value.date) &&
    typeof value.outcome === 'string' &&
    (value.targetId === undefined || value.targetId === null || typeof value.targetId === 'string') &&
    (value.battle === undefined || isRecord(value.battle))
  )
}

/**
 * 世界状态的必需字段、类型与跨对象引用校验。
 * 顶层结构、数组元素、枚举值、数值范围与势力/城池/人物引用都在这里检查；
 * 任何一层不合格都按损坏存档处理，不把残局带进游戏。
 */
function gameStateProblems(value: unknown): string[] {
  if (!isRecord(value)) {
    return ['存档状态不是对象']
  }

  const problems: string[] = []
  const geographyRecord = isRecord(value.geography) ? value.geography : null

  if (!isGameDate(value.currentDate) || !Number.isInteger(value.currentDate.year)) {
    problems.push('当前日期结构不合法')
  }
  const currentTurn = value.currentTurn
  if (!Number.isInteger(currentTurn) || (currentTurn as number) < 1) {
    problems.push('当前回合数不合法')
  }
  if (typeof value.playerFaction !== 'string') {
    problems.push('玩家势力缺失')
  }
  if (!OUTCOMES.includes(value.outcome as Outcome)) {
    problems.push('结局枚举不合法')
  }
  const endedTurn = value.endedTurn
  if (endedTurn !== null && !isNonNegativeInteger(endedTurn)) {
    problems.push('结束回合不合法')
  }
  if (value.outcome === 'ongoing' && endedTurn !== null) {
    problems.push('进行中的对局不应有结束回合')
  }
  if (value.outcome !== 'ongoing' && !isNonNegativeInteger(endedTurn)) {
    problems.push('已结束的对局缺少结束回合')
  }
  if (!isNonNegativeInteger(value.randomState)) {
    problems.push('随机状态不合法')
  }
  if (!isStringArray(value.actedCharacterIds)) {
    problems.push('已行动武将列表不合法')
  }
  if (!isStringArray(value.firedEvents)) {
    problems.push('已触发事件列表不合法')
  }

  const factions = Array.isArray(value.factions) ? value.factions : []
  if (!Array.isArray(value.factions) || factions.length === 0) {
    problems.push('势力列表缺失')
  }
  const factionIds = new Set<string>()
  for (const faction of factions) {
    if (!isFactionShape(faction)) {
      problems.push('势力条目结构不合法')
      continue
    }
    if (factionIds.has(faction.id)) {
      problems.push(`势力 id 重复：${faction.id}`)
    }
    factionIds.add(faction.id)
  }

  const provinces = geographyRecord !== null && Array.isArray(geographyRecord.provinces)
    ? geographyRecord.provinces
    : []
  const sites = geographyRecord !== null && Array.isArray(geographyRecord.sites)
    ? geographyRecord.sites
    : []
  if (geographyRecord === null || !Array.isArray(geographyRecord.provinces)) {
    problems.push('州列表缺失')
  }
  if (geographyRecord === null || !Array.isArray(geographyRecord.sites)) {
    problems.push('战略点列表缺失')
  }
  const provinceIds = new Set<string>()
  for (const province of provinces) {
    if (!isProvinceShape(province)) {
      problems.push('州条目结构不合法')
      continue
    }
    provinceIds.add(province.id)
  }
  const siteIds = new Set<string>()
  for (const site of sites) {
    if (!isSiteShape(site)) {
      problems.push('战略点条目结构不合法')
      continue
    }
    if (siteIds.has(site.id)) {
      problems.push(`战略点 id 重复：${site.id}`)
    }
    siteIds.add(site.id)
    if (!provinceIds.has(site.provinceId)) {
      problems.push(`战略点 ${site.id} 的所属州不存在：${site.provinceId}`)
    }
    if (site.owner !== null && !factionIds.has(site.owner)) {
      problems.push(`战略点 ${site.id} 的归属势力不存在：${site.owner}`)
    }
  }

  const characters = Array.isArray(value.characters) ? value.characters : []
  if (!Array.isArray(value.characters)) {
    problems.push('武将列表缺失')
  }
  const characterIds = new Set<string>()
  for (const character of characters) {
    if (!isCharacterShape(character)) {
      problems.push('武将条目结构不合法')
      continue
    }
    if (characterIds.has(character.id)) {
      problems.push(`武将 id 重复：${character.id}`)
    }
    characterIds.add(character.id)
    if (!provinceIds.has(character.provinceId)) {
      problems.push(`武将 ${character.id} 的所在州不存在：${character.provinceId}`)
    }
    if (character.factionId !== null && !factionIds.has(character.factionId)) {
      problems.push(`武将 ${character.id} 的所属势力不存在：${character.factionId}`)
    }
    if (character.stationedSiteId !== null && !siteIds.has(character.stationedSiteId)) {
      problems.push(`武将 ${character.id} 的驻地不存在：${character.stationedSiteId}`)
    }
  }

  if (typeof value.playerFaction === 'string' && !factionIds.has(value.playerFaction)) {
    problems.push(`玩家势力不存在：${value.playerFaction}`)
  }

  const actionPoints = value.actionPoints
  if (!isRecord(actionPoints)) {
    problems.push('行动力表缺失')
  } else {
    for (const factionId of factionIds) {
      if (!isNonNegativeNumber(actionPoints[factionId])) {
        problems.push(`势力 ${factionId} 的行动力不合法`)
      }
    }
    for (const [factionId, points] of Object.entries(actionPoints)) {
      if (!factionIds.has(factionId) || !isNonNegativeNumber(points)) {
        problems.push(`行动力条目不合法：${factionId}`)
      }
    }
  }

  const relations = Array.isArray(value.relations) ? value.relations : []
  if (!Array.isArray(value.relations)) {
    problems.push('关系列表缺失')
  }
  for (const relation of relations) {
    if (!isRelationShape(relation)) {
      problems.push('势力关系结构不合法')
      continue
    }
    if (!factionIds.has(relation.factions[0]) || !factionIds.has(relation.factions[1])) {
      problems.push('势力关系指向不存在的势力')
    }
  }

  const contactedCandidates = value.contactedCandidates
  if (!isRecord(contactedCandidates)) {
    problems.push('接触名单缺失')
  } else {
    for (const [factionId, candidates] of Object.entries(contactedCandidates)) {
      if (!factionIds.has(factionId) || !Array.isArray(candidates)) {
        problems.push(`接触名单不合法：${factionId}`)
        continue
      }
      for (const candidate of candidates) {
        if (
          !isContactedShape(candidate) ||
          !characterIds.has(candidate.characterId) ||
          !siteIds.has(candidate.siteId)
        ) {
          problems.push(`接触名单含无效引用：${factionId}`)
        }
      }
    }
  }

  const captives = value.captives
  const captiveCharacterIds = new Set<string>()
  if (!isRecord(captives)) {
    problems.push('俘虏营缺失')
  } else {
    for (const [factionId, records] of Object.entries(captives)) {
      if (!factionIds.has(factionId) || !Array.isArray(records)) {
        problems.push(`俘虏营不合法：${factionId}`)
        continue
      }
      for (const record of records) {
        if (!isCaptiveShape(record) || !characterIds.has(record.characterId)) {
          problems.push(`俘虏记录含无效引用：${factionId}`)
          continue
        }
        if (captiveCharacterIds.has(record.characterId)) {
          problems.push(`俘虏重复关押：${record.characterId}`)
        }
        captiveCharacterIds.add(record.characterId)
        const captive = characters.find(
          (character) => isCharacterShape(character) && character.id === record.characterId,
        )
        if (captive !== undefined && captive.status !== 'captured') {
          problems.push(`俘虏 ${record.characterId} 的状态不是被俘`)
        }
        if (record.formerFactionId !== null && !factionIds.has(record.formerFactionId)) {
          problems.push(`俘虏 ${record.characterId} 的原属势力不存在`)
        }
      }
    }
  }

  const history = Array.isArray(value.history) ? value.history : []
  if (!Array.isArray(value.history)) {
    problems.push('行动历史缺失')
  }
  for (const record of history) {
    if (!isActionRecordShape(record)) {
      problems.push('行动历史条目结构不合法')
      break
    }
  }

  if (problems.length > 0) {
    return problems
  }

  try {
    problems.push(
      ...validateGeography(geographyRecord as unknown as Geography, [...factionIds]),
    )
    problems.push(...validateCharacters(characters as Character[], [...factionIds], geographyRecord as unknown as Geography))
  } catch {
    problems.push('地理或人物数据无法完成一致性校验')
  }

  return problems
}

function isGameState(value: unknown): value is GameState {
  return gameStateProblems(value).length === 0
}

function isSaveData(value: unknown): value is SaveData {
  if (!isRecord(value)) {
    return false
  }

  return typeof value.schemaVersion === 'number' && isGameState(value.gameState)
}

export class LocalSaveStore implements SaveStore {
  private readonly storage: KeyValueStorage | null

  constructor(storage: KeyValueStorage | null = resolveBrowserStorage()) {
    this.storage = storage
  }

  save(key: string, state: GameState): boolean {
    if (this.storage === null) {
      return false
    }

    const data: SaveData = {
      schemaVersion: SCHEMA_VERSION,
      gameState: state,
    }

    try {
      this.storage.setItem(key, JSON.stringify(data))
    } catch {
      // 存储配额用尽等写入失败：对局照常进行，只是这一份进度没能落盘。
      return false
    }

    return true
  }

  loadResult(key: string): SaveLoadResult {
    const storage = this.storage
    if (storage === null) {
      return { status: 'unavailable', state: null }
    }

    let raw: string | null
    try {
      raw = storage.getItem(key)
    } catch {
      // 存储对象存在但不可读（隐私模式、站点数据被禁用等），按不可用处理。
      return { status: 'unavailable', state: null }
    }

    if (raw === null) {
      return { status: 'empty', state: null }
    }

    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      return { status: 'invalid', state: null }
    }

    if (!isSaveData(data) || data.schemaVersion !== SCHEMA_VERSION) {
      return { status: 'invalid', state: null }
    }

    return { status: 'loaded', state: data.gameState }
  }

  load(key: string): GameState | null {
    return this.loadResult(key).state
  }

  loadSummary(key: string): SaveSummary | null {
    const state = this.loadResult(key).state
    if (state === null) {
      return null
    }

    return { date: { ...state.currentDate }, turn: state.currentTurn }
  }

  remove(key: string): boolean {
    if (this.storage === null) {
      return false
    }

    try {
      this.storage.removeItem(key)
    } catch {
      return false
    }

    return true
  }
}
