import type { GameDate, GameState } from './model'

/**
 * 存档版本。改动会打破旧存档与世界一致性的内容时递增：
 * 存档内含整份地理归属，剧本改了归属之后，旧存档会让玩家看到一个过时的天下；
 * 结局字段（`outcome`、`endedTurn`）加入世界状态后，缺这两项的旧存档会被误判为已结束，随之升版；
 * 野地退出归属与行军图、邻接与人口一并改写，旧存档的邻接与守军已不合新规则；
 * 虎牢关与汜水关合为一关、河北一带改归袁氏，版图与邻接再次变动；
 * 「建安十三年（新）」荆南四郡入图、荆州改归荆南，新图归属与邻接随之改写；
 * 新图再补柴桑与赤壁、合肥与京口，扬州归属与邻接又一次变动；
 * 新图再补关中的槐里、长安与潼关，司隶归属与邻接随之改写；
 * 新图再补南郑、阳平关与葭萌关，凉州与益州归属、邻接一并改写；
 * 新图再补建业与濡须口，扬州东段的邻接改为合肥—濡须口—建业—京口一条链；
 * 新图的濡须口由无主野地改作孙权所据的关隘，江东的北门户随之立起；
 * 新图再补益州的涪城、雒城与成都，益州三点的邻接与归属一并落定；
 * 新图再补益州巴郡的江州与白帝城，涪城—江州—白帝城—夷陵连成一线，益州由是与荆州相通；
 * 新图益州内部再开雒城—江州一条通路，益州一线的邻接随之改写；
 * 新图再补益州的绵竹，涪城—绵竹—雒城—成都串成一线，益州各点守军一并落定；
 * 新图再补汉中的定军山野地，南郑与阳平关之间多一处无归属的据点；
 * 新图补入中原与河北的洛阳、虎牢关、陈留、许都与邺，尽归曹操，袁氏一家撤去；
 * 新图的定军山改连通葭萌关而不通阳平关，汉中一线的邻接随之改写。
 */
export const SCHEMA_VERSION = 50

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
