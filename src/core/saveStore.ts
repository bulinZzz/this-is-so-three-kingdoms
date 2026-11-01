import type { GameDate, GameState } from './model'

/**
 * 存档版本。改动会打破旧存档与世界一致性的内容时递增。
 *
 * 存档内含整份地理归属与人物处境；外交裁剪后，关系只剩敌对与中立，
 * 旧存档里的同盟状态已无对应含义，随这一版失效。
 */
export const SCHEMA_VERSION = 102

/** 手动存档槽位数量，槽位编号从 1 开始。 */
export const SLOT_COUNT = 10

export const AUTO_SAVE_KEY = 'this-is-so-three-kingdoms/auto'

/** 手动槽位的键位前缀，供多标签页监听区分存档写入。 */
export const SLOT_KEY_PREFIX = 'this-is-so-three-kingdoms/slot-'

export function slotKey(slot: number): string {
  return `${SLOT_KEY_PREFIX}${slot}`
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

/**
 * 一次读取的结果。存档层的调用点据此区分「本来就没有存档」与「读不出来」，
 * 后者不能静默当作新开局。
 */
export type SaveLoadStatus = 'loaded' | 'empty' | 'invalid' | 'unavailable'

export interface SaveLoadResult {
  status: SaveLoadStatus
  /** 仅在 `loaded` 时带有完整状态。 */
  state: GameState | null
}

export interface SaveStore {
  /** 写入存档；存储不可用时返回 false，调用点据此提示保存失败。 */
  save(key: string, state: GameState): boolean
  /** 读取并区分无存档、损坏与存储不可用。 */
  loadResult(key: string): SaveLoadResult
  /** 无存档、存档损坏或模式版本不匹配时返回 null。 */
  load(key: string): GameState | null
  loadSummary(key: string): SaveSummary | null
  /** 清除该键位的存档；存储访问失败时返回 false。 */
  remove(key: string): boolean
}
