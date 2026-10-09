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

/** 势力之间的关系：同盟或敌对；未声明的势力对为中立。 */
export type RelationKind = 'ally' | 'hostile'

/** 一对势力之间的关系，顺序不计。 */
export interface FactionRelation {
  factions: [FactionId, FactionId]
  kind: RelationKind
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

/** 性格标签：武将的性情，集中定义。决定基准招聘成功率，将来也用于送礼、答问等交互。 */
export const PERSONALITIES = ['open', 'scheming', 'brave', 'steady', 'cautious', 'proud'] as const

export type Personality = (typeof PERSONALITIES)[number]

/**
 * 武将：能力、倾向与处境。
 * 兵种随部队留待迭代 8。
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
   * 年龄，开局时的岁数；开局尚未出生者记负数（如 -5 表示五年后出生）。
   * 只作记录，随年份增长，不参与结算；展示时不足二十岁作「未冠」。
   */
  age: number
  /** 性格，取自集中定义的少量标签；决定基准招聘成功率，将来也用于送礼、答问等交互。 */
  personality: Personality
  /**
   * 势力倾向：对各势力的偏好，0–100 的自然数，50 为中性；只记非中性者，未记录的对按 50。
   * 影响寻访成功率与招降难度；与忠诚无关——偏好是感觉，忠诚是价值观。
   */
  affinities: Partial<Record<FactionId, number>>
  /** 忠诚，个人的价值观，未出仕者为 0；与倾向无关，随经历变化。 */
  loyalty: number
  /** 是否为所在势力的君主，每个势力有且只有一人。 */
  isMonarch: boolean
  /** 驻守的自有战略点，供部队定位与调动；未出仕者为 null。 */
  stationedSiteId: SiteId | null
  /** 所统率部队的兵力；未出仕者为 0。 */
  troops: number
  /** 在野者所属的寻访卡池层级；非在野者不参与寻访，为 null。 */
  tier: CharacterTier | null
}

/** 一位已被某势力接触、尚未入仕的在野者，并记下他是在哪个自有战略点被遇到的。 */
export interface ContactedCandidate {
  characterId: CharacterId
  siteId: SiteId
}

/** 俘虏的态度，由劝降意愿分档而来，仅作展示。 */
export type CaptiveAttitude = '宁死不屈' | '不卑不亢' | '意有所动' | '心动' | '愿降'

/** 一名被俘武将与俘获方之间的关系：意愿即劝降进度（0–100），越高越易归附。 */
export interface CaptiveRecord {
  characterId: CharacterId
  /** 被俘时所属的势力，供俘虏营标出他的来历；被俘后其 factionId 已清空。 */
  formerFactionId: FactionId | null
  will: number
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
  /** 势力间的初始关系；未声明的势力对为中立。 */
  relations?: FactionRelation[]
}

/** 玩家可执行的行动。 */
export type ActionKind =
  | 'seekTalent'
  | 'visit'
  | 'recruit'
  | 'harvestGrain'
  | 'transfer'
  | 'attack'
  | 'persuade'
  | 'executeCaptive'
  | 'releaseCaptive'

/** 写入历史的记录类型：行动之外，世界结算（如叛离）也占一条。 */
export type ActionRecordKind = ActionKind | 'defect'

/** 战报中一方的要点。 */
export interface BattleReportSide {
  /** 主将姓名；守方无将时为空串。 */
  commander: string
  /** 参战武将姓名，按主将、副将、军师排列；无将时为空。 */
  officers: string[]
  /** 投入兵力。守方不含防守补正，仍是实际驻守的兵力。 */
  troops: number
  /** 战力，含随机浮动与防守补正，供双方对比。 */
  power: number
  /** 伤亡兵力。 */
  casualties: number
  /** 战后剩余兵力；不含因败退无路被俘者。 */
  remaining: number
}

/** 一名被俘武将的结局，供战报的俘虏窗口展示。 */
export interface CaptiveReport {
  /** 被俘者姓名。 */
  name: string
  /** 原属势力名。 */
  formerFaction: string
  /** 被俘时的态度，由劝降意愿分档而来。 */
  attitude: CaptiveAttitude
}

/** 一场战斗里单挑的结果，供战斗演出与战报使用；提出单挑的可以是攻方，也可以是守方。 */
export interface DuelReport {
  /** 提出单挑的是哪一方。 */
  challengerSide: 'attacker' | 'defender'
  /** 挑战方出马者姓名。 */
  challenger: string
  /** 挑战者标识。 */
  challengerId: CharacterId
  /** 应战方出马者姓名；拒战或无人可应时为空串。 */
  answerer: string
  /** 应战者标识；无应战者时为 null。 */
  answererId: CharacterId | null
  /** 应战方是否拒战（含无人可应）。 */
  refused: boolean
  /** 挑战方是否取胜；拒战时为 null。 */
  challengerWon: boolean | null
  /** 阵亡者姓名；无人阵亡时为空串。 */
  fallen: string
  /** 挑战方这一场士气的增减。 */
  challengerMoraleDelta: number
  /** 应战方这一场士气的增减。 */
  answererMoraleDelta: number
}

/** 一场战斗的战报；规则层结算时产出，表现层只读。 */
export interface BattleReport {
  /** 目标战略点名。 */
  siteName: string
  /** 目标是否无守军。 */
  undefended: boolean
  /** 攻方是否获胜。 */
  attackerWins: boolean
  /** 交战中的单挑；未发起单挑时为空。 */
  duel: DuelReport | null
  attacker: BattleReportSide
  defender: BattleReportSide
  /** 被俘武将的去向；无人被俘时为空。 */
  captives: CaptiveReport[]
}

/** 一条行动记录：行动类型、势力、时间、目标与结果。 */
export interface ActionRecord {
  kind: ActionRecordKind
  /** 发起行动的势力。 */
  factionId: FactionId
  /** 行动发生的日期。 */
  date: GameDate
  /** 行动目标，如寻访所在的州；没有具体目标时为 null。 */
  targetId: string | null
  /** 行动结果的描述，供界面展示。 */
  outcome: string
  /** 进攻的战报；其余行动没有。 */
  battle?: BattleReport
}

export interface GameState {
  currentDate: GameDate
  currentTurn: number
  /** 各势力当季剩余行动力，按势力分别存放；结束回合时恢复为当季预算。 */
  actionPoints: Record<FactionId, number>
  /** 本回合已执行调动或进攻的武将，结束回合时清空。 */
  actedCharacterIds: CharacterId[]
  /** 各势力已接触但尚未招到的在野者，供再次拜访；结束回合不清空。 */
  contactedCandidates: Record<FactionId, ContactedCandidate[]>
  /** 各势力关押的俘虏与其劝降意愿；被俘者的状态同时记为 captured。 */
  captives: Record<FactionId, CaptiveRecord[]>
  /** 全局行动历史，按发生顺序追加，回合推进不清空。 */
  history: ActionRecord[]
  /** 势力间的关系；未列出的势力对为中立。 */
  relations: FactionRelation[]
  playerFaction: FactionId
  geography: Geography
  factions: Faction[]
  characters: Character[]
  /** 随机数发生器的内部状态，随存档一起落盘。 */
  randomState: number
}
