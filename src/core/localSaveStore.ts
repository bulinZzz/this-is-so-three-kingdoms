import type { GameState } from './model'
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

function isSaveData(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<SaveData>

  return (
    typeof candidate.schemaVersion === 'number' &&
    typeof candidate.gameState === 'object' &&
    candidate.gameState !== null
  )
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
