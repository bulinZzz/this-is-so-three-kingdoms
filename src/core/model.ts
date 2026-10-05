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

export type CharacterId = string

/** 武将状态：在野、在仕、退场。 */
export type CharacterStatus = 'wild' | 'serving' | 'retired'

/**
 * 武将：初版只承载寻访所需的最少字段，战斗属性留待迭代 4。
 * 不在三家之列的势力，其部属按在野处理。
 */
export interface Character {
  id: CharacterId
  name: string
  status: CharacterStatus
  /** 所属势力，未出仕时为 null。 */
  factionId: FactionId | null
  /** 所在州，决定可被哪一州寻访到。 */
  provinceId: ProvinceId
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
  /** 剧本的人物数据，未提供时开局没有任何武将。 */
  characters?: Character[]
}

/** 玩家可执行的行动。 */
export type ActionKind = 'seekTalent'

/** 一条行动记录：行动类型、势力、时间、目标与结果。 */
export interface ActionRecord {
  kind: ActionKind
  /** 发起行动的势力。 */
  factionId: FactionId
  /** 行动发生的日期。 */
  date: GameDate
  /** 行动目标，如寻访所在的州；没有具体目标时为 null。 */
  targetId: string | null
  /** 行动结果的描述，供界面展示。 */
  outcome: string
}

export interface GameState {
  currentDate: GameDate
  currentTurn: number
  /** 当季剩余行动力，结束回合时恢复为当季预算。 */
  actionPoints: number
  /** 全局行动历史，按发生顺序追加，回合推进不清空。 */
  history: ActionRecord[]
  playerFaction: FactionId
  geography: Geography
  factions: Faction[]
  characters: Character[]
  /** 随机数发生器的内部状态，随存档一起落盘。 */
  randomState: number
}
