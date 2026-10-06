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
  /** 粮食，初版唯一的资源，征兵与维持部队所用。 */
  grain: number
}

export type ProvinceId = string

/** 州：地理分组，并记录归属势力。 */
export interface Province {
  id: ProvinceId
  name: string
  /** 当前归属势力，无归属时为 null。 */
  owner: FactionId | null
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

/** 武将状态：在野、在仕、被俘、退场。 */
export type CharacterStatus = 'wild' | 'serving' | 'captured' | 'retired'

/** 人物卡池层级：基础、二级、三级。层级越高，越需要更高的州控制度才会放出。 */
export type CharacterTier = 'basic' | 'second' | 'third'

/**
 * 武将：能力、倾向与处境。
 * 野心、声望、性格与年龄留待迭代 7；兵种随部队留待迭代 8。
 */
export interface Character {
  id: CharacterId
  name: string
  status: CharacterStatus
  /** 所属势力，未出仕时为 null。 */
  factionId: FactionId | null
  /** 所在州，决定可被哪一州寻访到。 */
  provinceId: ProvinceId
  /** 武力，参与战斗结算。 */
  might: number
  /** 统率，参与战斗结算。 */
  command: number
  /** 智谋，参与战斗结算。 */
  intellect: number
  /** 内政，影响征兵、征粮等经营行为；当前为静态字段。 */
  politics: number
  /**
   * 势力倾向：最倾向的势力，无倾向时为 null。
   * 初版只记一个主要倾向，多重倾向与其数值计算留待迭代 7。
   */
  factionAffinity: FactionId | null
  /** 忠诚，静态度量，未出仕者为 0；计算留待迭代 7。 */
  loyalty: number
  /** 是否为所在势力的君主，每个势力有且只有一人。 */
  isMonarch: boolean
  /** 驻守的自有战略点，供部队定位与调动；未出仕者为 null。 */
  stationedSiteId: SiteId | null
  /** 所统率部队的兵力；未出仕者为 0。 */
  troops: number
  /** 士气，0–100，参与战力计算，可被单挑改变。 */
  morale: number
  /** 在野者所属的寻访卡池层级；非在野者不参与寻访，为 null。 */
  tier: CharacterTier | null
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
export type ActionKind = 'seekTalent' | 'recruit' | 'transfer' | 'attack'

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
  /** 本回合已执行调动或进攻的武将，结束回合时清空。 */
  actedCharacterIds: CharacterId[]
  /** 全局行动历史，按发生顺序追加，回合推进不清空。 */
  history: ActionRecord[]
  playerFaction: FactionId
  geography: Geography
  factions: Faction[]
  characters: Character[]
  /** 随机数发生器的内部状态，随存档一起落盘。 */
  randomState: number
}
