import type { GameDate, GameState, Season } from './model'
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

function isSeason(value: unknown): value is Season {
  return SEASONS.includes(value as Season)
}

function isGameDate(value: unknown): value is GameDate {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<GameDate>

  return (
    typeof candidate.era === 'string' &&
    typeof candidate.year === 'number' &&
    isSeason(candidate.season)
  )
}

function isSaveData(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<SaveData>
  const gameState = candidate.gameState

  if (typeof candidate.schemaVersion !== 'number' || typeof gameState !== 'object' || gameState === null) {
    return false
  }

  return isGameDate((gameState as Partial<GameState>).currentDate)
}

export class LocalSaveStore implements SaveStore {
  constructor(private readonly storage: KeyValueStorage = window.localStorage) {}

  save(key: string, state: GameState): void {
    const data: SaveData = {
      schemaVersion: SCHEMA_VERSION,
      gameState: state,
    }

    this.storage.setItem(key, JSON.stringify(data))
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
