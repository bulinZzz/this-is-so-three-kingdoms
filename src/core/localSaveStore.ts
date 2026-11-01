import type { GameDate, GameState, Outcome, Season } from './model'
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

/**
 * 世界状态的必需字段与类型校验，只查类型不查内容。
 * 半损的存档缺在哪一层都在这里落回 null，不把残局带进游戏。
 */
function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) {
    return false
  }

  const geography = value.geography

  return (
    isGameDate(value.currentDate) &&
    typeof value.currentTurn === 'number' &&
    isRecord(value.actionPoints) &&
    Array.isArray(value.actedCharacterIds) &&
    isRecord(value.contactedCandidates) &&
    isRecord(value.captives) &&
    Array.isArray(value.history) &&
    Array.isArray(value.firedEvents) &&
    Array.isArray(value.relations) &&
    typeof value.playerFaction === 'string' &&
    OUTCOMES.includes(value.outcome as Outcome) &&
    (value.endedTurn === null || typeof value.endedTurn === 'number') &&
    isRecord(geography) &&
    Array.isArray(geography.sites) &&
    Array.isArray(value.factions) &&
    Array.isArray(value.characters) &&
    typeof value.randomState === 'number'
  )
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
