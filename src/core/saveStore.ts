import type { GameDate, GameState } from './model'

/**
 * 存档版本。改动会打破旧存档与世界一致性的内容时递增。
 *
 * 存档内含整份地理归属与人物处境；武将调度与战斗重做后，人物的兵种、驻守含义与战斗记录都已不同，
 * 旧存档随这一版失效。
 */
export const SCHEMA_VERSION = 100

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
  /** 写入存档；存储不可用时返回 false，调用点据此提示保存失败。 */
  save(key: string, state: GameState): boolean
  /** 无存档、存档损坏或模式版本不匹配时返回 null。 */
  load(key: string): GameState | null
  loadSummary(key: string): SaveSummary | null
}
