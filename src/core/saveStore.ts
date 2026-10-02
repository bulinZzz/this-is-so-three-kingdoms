import type { GameDate, GameState } from './model'

export const SCHEMA_VERSION = 2

/** 手动存档槽位数量，槽位编号从 1 开始。 */
export const SLOT_COUNT = 10

export const AUTO_SAVE_KEY = 'this-is-so-three-kingdoms/auto'

export function slotKey(slot: number): string {
  return `this-is-so-three-kingdoms/slot-${slot}`
}

/** 落盘的完整数据结构。 */
export interface SaveData {
  schemaVersion: number
  gameState: GameState
}

/** 存档摘要，供界面展示槽位内容。 */
export interface SaveSummary {
  date: GameDate
  turn: number
}

export interface SaveStore {
  save(key: string, state: GameState): void
  /** 无存档、存档损坏或模式版本不匹配时返回 null。 */
  load(key: string): GameState | null
  loadSummary(key: string): SaveSummary | null
}
