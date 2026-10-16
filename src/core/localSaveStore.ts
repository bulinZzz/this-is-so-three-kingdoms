import type { GameDate, GameState, Outcome, Season } from './model'
import {
  SCHEMA_VERSION,
  type SaveData,
  type SaveStore,
  type SaveSummary,
} from './saveStore'

/** 存档所需的存储能力，与浏览器的 localStorage 结构相容。 */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
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
  constructor(private readonly storage: KeyValueStorage = window.localStorage) {}

  save(key: string, state: GameState): boolean {
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

  load(key: string): GameState | null {
    return this.read(key)?.gameState ?? null
  }

  loadSummary(key: string): SaveSummary | null {
    const state = this.read(key)?.gameState
    if (state === undefined) {
      return null
    }

    return { date: { ...state.currentDate }, turn: state.currentTurn }
  }

  private read(key: string): SaveData | null {
    const raw = this.storage.getItem(key)
    if (raw === null) {
      return null
    }

    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }

    if (!isSaveData(data) || data.schemaVersion !== SCHEMA_VERSION) {
      return null
    }

    return data
  }
}
