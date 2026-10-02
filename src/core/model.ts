/** 季节，游戏以「一季」为一个回合。 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/**
 * 年号纪年日期。
 *
 * 年号作为独立字段保存：将来「称帝」等事件只需更换年号的取值、并把纪年重置为 1，
 * 不必改动存档格式。
 */
export interface GameDate {
  /** 年号，如「建安」。称帝等事件可更换，将来可由玩家改名。 */
  era: string
  /** 年号纪年，自元年起算。建安十二年即 12。 */
  year: number
  season: Season
}

export type FactionId = string

export interface Faction {
  id: FactionId
  name: string
  color: string
}

export type ProvinceId = string

/** 州：初版只作为地理分组。 */
export interface Province {
  id: ProvinceId
  name: string
}

export type SiteId = string

/** 战略点的类型，决定其定位与所携带的属性。 */
export type SiteType = 'city' | 'pass' | 'field'

/**
 * 战略点：领土与进攻的基本单位。
 * 不以行政级别为限，城市、关隘、野地皆可成为战略点。
 */
export interface Site {
  id: SiteId
  name: string
  type: SiteType
  provinceId: ProvinceId
  /** 当前归属势力，无归属时为 null。 */
  owner: FactionId | null
  /** 相邻战略点，用于表达地缘与行军路径。 */
  neighbors: SiteId[]
}

/** 天下地理结构。 */
export interface Geography {
  provinces: Province[]
  sites: Site[]
}

/** 开局剧本：一组初始条件的集合，不同时间点的开局各是一份剧本。 */
export interface Scenario {
  id: string
  name: string
  startDate: GameDate
  playerFaction: FactionId
  factions: Faction[]
  /** 剧本的地理数据，未提供时开局没有任何战略点。 */
  geography?: Geography
}

export interface GameState {
  currentDate: GameDate
  currentTurn: number
  playerFaction: FactionId
  geography: Geography
  factions: Faction[]
  /** 随机数发生器的内部状态，随存档一起落盘。 */
  randomState: number
}
