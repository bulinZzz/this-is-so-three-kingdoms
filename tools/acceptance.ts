import { expect, test } from 'vitest'
import { ACTION_COSTS } from '../src/core/actions'
import {
  ARM_STATS,
  ATTACKER_SELECTION,
  DEFENDER_SELECTION,
  SITE_DEFENSE_BONUS,
  attackBlockReason,
  attackCandidates,
  autoBattle,
  autoDeployment,
  autoFormation,
  defenderCandidates,
  deployDefenders,
  finishBattle,
  isAttackable,
  openAttack,
} from '../src/core/battle'
import { isRecruitable, isServing } from '../src/core/characters'
import { createInitialState } from '../src/core/createInitialState'
import { granaryOf } from '../src/core/granary'
import { BUILD_COST, build } from '../src/core/construction'
import {
  DEVELOPMENT_KINDS,
  developmentLevel,
  developmentLimit,
} from '../src/core/development'
import { declareWar } from '../src/core/diplomacy'
import {
  assignStation,
  attackGrainCost,
  factionTroops,
  harvestGrain,
  hasActedThisTurn,
  isFactionDestroyed,
  readyOfficers,
  RECRUIT_TROOPS_PER_COMMAND,
  recruit,
  recruitGrainCost,
  troopLimit,
} from '../src/core/military'
import type { Character, DevelopmentKind, FactionId, GameState, Outcome, Scenario, Season, Site, SiteId, SiteType } from '../src/core/model'
import { reward, REWARD_MONEY, disband } from '../src/core/personnel'
import { createRandom, type Random } from '../src/core/random'
import { areHostile } from '../src/core/relations'
import { SANGUO_208, SANGUO_ACCEPTANCE } from '../src/core/scenarios'
import { recruitChance, seekTalent, visit } from '../src/core/seekTalent'
import { advanceTurn } from '../src/core/turn'
import { factionTurnStream } from '../src/core/factionAi'

/**
 * 核心玩法推演：用无画面的规则层把一份剧本跑满若干季，输出逐季日志与汇总，
 * 供调数值后复跑对照。运行方式见 npm run acceptance。
 *
 * 推演用一个规则驱动的「玩家」代理，策略如下：
 *   先发育：在自有各州寻访与登门，征兵按剩余带兵空间补人、一季至多三次；
 *   建设与征粮各占一档，粮够两万便不再征粮，把行动力留给扩军。
 *   实力足够后，向接壤势力中兵力最弱的一位宣战，一次只打一家，打完再接下一家；
 *   进攻（安全边际内自名册编成）→ 补驻将（边境与刚夺下的点先留人）
 *   → 征兵（人口最多的点上补人）→ 拜访 → 经营（忠诚不足先赏赐，否则建设）
 *   → 征粮。正式剧本还会在兵多粮少时裁军，把兵力压回养得起的规模。
 * 他方来攻时按正常规则布阵迎战，不再把无人接手的来犯一律当作不战而下；
 * 守将不占出征名额，因此边境留驻将既能守土，又不妨碍下一季出兵。
 * 兵只从征兵来、粮落在战略点上：兵力完全靠征兵积累，粮要派人去取，两者都由代理逐季操持。
 * 武将统一归名册，征兵、征粮与出征都从名册选人，与身在何处无关；每人每季至多行动一次。
 * 外交只做宣战：宣战不限关系，一次只打一家，打不下便继续经营。
 * 代理不主动求和，赔款与行动力的代价不在它的取舍之内。
 * 全图每处战略点都有归属，故代理不再有无主之地可打；眼下无可攻打的目标时，
 * 先继续经营，实力足够再向接壤的最弱外邦宣战，接壤处无人可宣时停手。
 * 其他势力由 factionAi 自主行动，走与实机相同的回合收尾流程。
 * 它不代表最优打法，只用来观察数值松紧与局势走向；判断「好不好玩」仍要看实玩。
 * 正式剧本与验收小局各用一套策略参数：小局可以更快开战，正式剧本要先留够守土与发育。
 */

/** 推演参数：换种子或季数改这里。 */
const SEED = 208
/** 寻访所用抽卡流的种子，与模拟流互不干扰。 */
const DRAW_SEED = 5
/**
 * 季数上限。放宽到推演代理不再有进展之后的一截：代理打不动坚城，几十季下来版图便不再变化。
 * 上限只用来发现「数值松紧让一局永远打不完」这类问题；一局打到结局的样子另由构造小局覆盖。
 */
const SEASONS = 160
/** 发育期：开战前至少经过的季数。 */
const WAR_MIN_SEASONS = 6
/** 余粮超过此数时，即便已达发育目标也继续扩军——打不动下一处时靠体量慢慢压过去。 */
const ARMY_SURPLUS_GRAIN = 8000
/** 推演代理的名册上限，与游戏的玩家上限一致。 */
const ROSTER_LIMIT = 30
/** 一季至多征兵几次；每次都要换一名还有带兵空间的武将。 */
const RECRUITS_PER_SEASON = 3
/** 国库粮食达到此数后不再征粮，把行动力留给征兵与建设。 */
const HARVEST_STOP_GRAIN = 20000
/** 忠诚不足此数（新附者多在五十上下）就先赏一回，把人拉过这条安心线。 */
const REWARD_BELOW = 60
/** 战略点的相对价值，用于在多个安全目标中择优。 */
const SITE_VALUE: Record<SiteType, number> = { metropolis: 4, city: 3, town: 2, pass: 2, field: 1 }
const SEASON_LABELS: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }

/** 推演代理的策略参数：正式剧本要留足守土与发育，验收小局可以打得更直接。 */
interface PlaythroughPolicy {
  safeMargin: number
  warMinTroops: number
  armyGrowthRatio: number
  /** 出征编成取「刚好够用」的最少人数，余将留作守土。 */
  minimalParty: boolean
  /** 兵多粮少时是否裁军，把兵力压回可承受的规模。 */
  demobilize: boolean
  /** 征兵是否优先补给战力最高的几人，而不是按边际收益摊薄。 */
  concentrateRecruits: boolean
}

function policyFor(scenario: Scenario): PlaythroughPolicy {
  if (scenario.id === SANGUO_208.id) {
    return {
      safeMargin: 1.2,
      warMinTroops: 30000,
      armyGrowthRatio: 1.3,
      minimalParty: true,
      demobilize: true,
      concentrateRecruits: true,
    }
  }

  return {
    safeMargin: 1.2,
    warMinTroops: 20000,
    armyGrowthRatio: 1.3,
    minimalParty: false,
    demobilize: false,
    concentrateRecruits: false,
  }
}
/** 结局在汇总里的说法。 */
const OUTCOME_LABELS: Record<Outcome, string> = {
  ongoing: '未分胜负（跑满季数上限）',
  victory: '统一',
  defeat: '覆灭',
}

/** 势力在简报里的单字标记，未列出的用势力名。 */
const FACTION_MARKS: Record<FactionId, string> = {
  caocao: '曹',
  liubei: '刘',
  sunquan: '孙',
  liuzhang: '璋',
  mateng: '马',
  gongsunkang: '公',
  shixie: '士',
  zhanglu: '张',
  jingnan: '荆',
  nanman: '蛮',
}

function siteOf(state: GameState, siteId: SiteId): Site {
  const site = state.geography.sites.find((item) => item.id === siteId)
  if (site === undefined) {
    throw new Error(`战略点不存在：${siteId}`)
  }
  return site
}

/** 一名武将在一次出征里的预计战力，取伤害公式中与兵力、兵种、武力相关的部分。 */
function officerAttackPower(character: Character): number {
  return character.troops * ARM_STATS[character.armType].attack * (1 + character.might * 0.003)
}

/** 一名武将再征一次兵能带来的边际战力：先填实际能补上的兵，再按兵种与武力折算。 */
function recruitMarginalPower(character: Character): number {
  const headroom = troopLimit(character) - character.troops
  const gain = Math.min(headroom, character.command * RECRUIT_TROOPS_PER_COMMAND)

  return gain * ARM_STATS[character.armType].attack * (1 + character.might * 0.003)
}

/** 一名守将的预计抗打击能力，取减伤公式中与兵力、兵种、统率相关的部分。 */
function officerDefensePower(character: Character): number {
  return character.troops * ARM_STATS[character.armType].defense * (1 + character.command * 0.003)
}

/** 守方战力：该点能召来的守将合计，再乘据点的防守补正；与自动布阵取同一批人。 */
function defenderPowerOf(state: GameState, siteId: SiteId): number {
  const site = siteOf(state, siteId)
  if (site.owner === null) {
    return 0
  }

  const defenders = defenderCandidates(state, siteId, site.owner).slice(0, DEFENDER_SELECTION + 1)

  return (
    defenders.reduce((total, character) => total + officerDefensePower(character), 0) *
    (1 + SITE_DEFENSE_BONUS[site.type])
  )
}

/** 一支出征队伍的战力合计。 */
function partyPowerOf(state: GameState, memberIds: readonly string[]): number {
  return memberIds.reduce((total, characterId) => {
    const character = state.characters.find((item) => item.id === characterId)
    return total + (character === undefined ? 0 : officerAttackPower(character))
  }, 0)
}

/**
 * 就该目标排出的出征编成：按战力从高到低取人。
 * 正式剧本取「刚好够用」的最少人数，余将留作守土；验收小局按满编五人取。
 */
function bestParty(
  state: GameState,
  targetId: SiteId,
  margin: number,
  minimal: boolean,
): string[] | null {
  const pool = attackCandidates(state, targetId)
    .filter((item) => !hasActedThisTurn(state, item.id))
    .sort((a, b) => officerAttackPower(b) - officerAttackPower(a))
  if (pool.length === 0) {
    return null
  }

  const defence = defenderPowerOf(state, targetId)
  const limit = Math.min(ATTACKER_SELECTION, pool.length)

  if (!minimal) {
    const members = pool.slice(0, limit)
    const power = members.reduce((total, character) => total + officerAttackPower(character), 0)
    return power > defence * margin ? members.map((character) => character.id) : null
  }

  let power = 0
  for (let size = 1; size <= limit; size += 1) {
    power += officerAttackPower(pool[size - 1]!)
    if (power > defence * margin) {
      return pool.slice(0, size).map((character) => character.id)
    }
  }

  return null
}

/**
 * 拜访一位已接触的在野者：在会面之处仍在自己手里的人里，挑当前最可能应允的一位登门。
 * 寻访到头之后，招人便靠这一步继续推进。返回本季的记录条目；无人可访时返回 null。
 */
function visitContact(state: GameState, random: Random): string | null {
  const player = state.playerFaction
  const target = (state.contactedCandidates[player] ?? [])
    .filter((contact) => siteOf(state, contact.siteId).owner === player)
    .map((contact) => state.characters.find((item) => item.id === contact.characterId))
    .filter((item): item is Character => item !== undefined && isRecruitable(item))
    .sort((a, b) => recruitChance(b, player) - recruitChance(a, player))[0]

  if (target === undefined) {
    return null
  }

  const result = visit(state, random, target.id)
  return result.ok ? result.record.outcome : null
}

function servingCount(state: GameState, factionId: FactionId): number {
  return state.characters.filter(
    (item) => item.status === 'serving' && item.factionId === factionId,
  ).length
}

/** 忠诚不足 REWARD_BELOW 的在仕者里，挑忠诚最低的一位；君主不计。 */
function rewardTargetOf(state: GameState): Character | null {
  const player = state.playerFaction
  const nearest = state.characters
    .filter(
      (item) =>
        item.status === 'serving' &&
        item.factionId === player &&
        !item.isMonarch &&
        item.loyalty < REWARD_BELOW,
    )
    .sort((a, b) => a.loyalty - b.loyalty)[0]

  return nearest ?? null
}

/** 一项如今建得起的建设：该项未满级、金钱付得起，建在人口最多的自有点上。 */
function developmentSiteOf(state: GameState, kind: DevelopmentKind): Site | null {
  const player = state.playerFaction
  const money = state.factions.find((item) => item.id === player)?.money ?? 0
  const site = state.geography.sites
    .filter(
      (item) =>
        item.owner === player &&
        developmentLevel(item, kind) < developmentLimit(item) &&
        money >= BUILD_COST,
    )
    .sort((a, b) => b.population - a.population)[0]

  return site ?? null
}

/** 玩家自有战略点上某一项开发的累计等级。 */
function developmentTotal(state: GameState, kind: DevelopmentKind): number {
  const player = state.playerFaction
  return state.geography.sites
    .filter((site) => site.owner === player)
    .reduce((sum, site) => sum + developmentLevel(site, kind), 0)
}

function dateLabel(state: GameState): string {
  const { era, year, season } = state.currentDate
  return `${era}${year}·${SEASON_LABELS[season]}`
}

/** 各势力的在仕人数与覆灭标记。 */
function factionLine(state: GameState): string {
  return state.factions
    .map((faction) => {
      const mark = FACTION_MARKS[faction.id] ?? faction.name
      const destroyed = isFactionDestroyed(state, faction.id) ? '（已覆灭）' : ''
      return `${mark}${servingCount(state, faction.id)}${destroyed}`
    })
    .join('　')
}

/** 版图：各战略点归属的单字标记。 */
function territoryLine(state: GameState): string {
  return state.geography.sites
    .map((site) => {
      const mark = site.owner === null ? '无主' : (FACTION_MARKS[site.owner] ?? site.owner)
      return `${site.name}·${mark}`
    })
    .join('　')
}

interface Playthrough {
  state: GameState
  lines: string[]
  seed: number
  seasons: number
  battles: number
  wins: number
  apSpent: number
  apBudget: number
  /** 赏赐次数。 */
  rewards: number
  /** 各势力覆灭于第几季。 */
  destroyedAt: Map<FactionId, number>
  /** 每季检查到的状态异常；为空表示整局状态自洽。 */
  problems: string[]
  /** 最后一次版图易手的回合。 */
  lastTerritoryChangeTurn: number
  /** 跑满上限仍未结束，且长期没有版图变化。 */
  stalled: boolean
}

interface PlaythroughOptions {
  seed?: number
  seasons?: number
  drawSeed?: number
  collectLines?: boolean
  policy?: Partial<PlaythroughPolicy>
}

/**
 * 就某目标点排一支出征队伍，不要求已经宣战——用于在开战前判断打不打得动。
 * 取人与战力口径与 `bestParty` 相同：名册中未驻守、有兵、本季未行动的武将。
 */
function warPartyOf(
  state: GameState,
  targetId: SiteId,
  margin: number,
  minimal: boolean,
): string[] | null {
  const player = state.playerFaction
  const pool = state.characters
    .filter(
      (character) =>
        character.status === 'serving' &&
        character.factionId === player &&
        character.stationedSiteId === null &&
        character.troops > 0 &&
        !hasActedThisTurn(state, character.id),
    )
    .sort((a, b) => officerAttackPower(b) - officerAttackPower(a))
  if (pool.length === 0) {
    return null
  }

  const defence = defenderPowerOf(state, targetId)
  const limit = Math.min(ATTACKER_SELECTION, pool.length)

  if (!minimal) {
    const members = pool.slice(0, limit)
    const power = members.reduce((total, character) => total + officerAttackPower(character), 0)
    return power > defence * margin ? members.map((character) => character.id) : null
  }

  let power = 0
  for (let size = 1; size <= limit; size += 1) {
    power += officerAttackPower(pool[size - 1]!)
    if (power > defence * margin) {
      return pool.slice(0, size).map((character) => character.id)
    }
  }

  return null
}

/**
 * 是否到了向该势力开战的时候：经过发育期、兵力达到发育目标，
 * 且至少能对一处接壤据点排出一支有胜算的队伍、付得起出征粮草。
 */
function readyForWar(
  state: GameState,
  targetId: FactionId,
  armyTarget: number,
  policy: PlaythroughPolicy,
): boolean {
  const player = state.playerFaction
  if (state.currentTurn < WAR_MIN_SEASONS) {
    return false
  }

  if (factionTroops(state, player) < armyTarget) {
    return false
  }

  const own = state.geography.sites.filter((site) => site.owner === player)
  const grain = state.factions.find((item) => item.id === player)?.grain ?? 0

  return state.geography.sites
    .filter(
      (site) =>
        site.owner === targetId && own.some((base) => base.neighbors.includes(site.id)),
    )
    .some((site) => {
      const party = warPartyOf(state, site.id, policy.safeMargin, policy.minimalParty)
      if (party === null) {
        return false
      }
      const need = party.reduce((total, characterId) => {
        const character = state.characters.find((item) => item.id === characterId)
        return total + (character?.troops ?? 0)
      }, 0)
      return grain >= attackGrainCost(need)
    })
}

/**
 * 就着玩家的自有领地向外看：接壤势力里最弱的一位。
 * 已宣战者不在列（打他已不必再宣）；无接壤者则返回 null。
 */
function warTargetOf(state: GameState): FactionId | null {
  const player = state.playerFaction
  const own = state.geography.sites.filter((site) => site.owner === player)
  const adjacent = state.factions
    .filter((faction) => faction.id !== player)
    .filter((faction) => !areHostile(state, player, faction.id))
    .filter((faction) =>
      state.geography.sites.some(
        (site) =>
          site.owner === faction.id && own.some((base) => base.neighbors.includes(site.id)),
      ),
    )
    .sort((a, b) => factionTroops(state, a.id) - factionTroops(state, b.id))

  return adjacent[0]?.id ?? null
}

/** 接壤处是否仍有活着的敌对势力——有则先把这一家打完，暂不另启战端。 */
function hasAdjacentHostile(state: GameState): boolean {
  const player = state.playerFaction
  const own = state.geography.sites.filter((site) => site.owner === player)

  return state.factions.some(
    (faction) =>
      faction.id !== player &&
      !isFactionDestroyed(state, faction.id) &&
      areHostile(state, player, faction.id) &&
      state.geography.sites.some(
        (site) =>
          site.owner === faction.id && own.some((base) => base.neighbors.includes(site.id)),
      ),
  )
}

/** 一处自有战略点是否与敌对势力接壤——只有这类点需要留驻将。 */
function isBorderSite(state: GameState, site: Site): boolean {
  const player = state.playerFaction

  return site.neighbors.some((neighborId) => {
    const neighbor = siteOf(state, neighborId)
    return (
      neighbor.owner !== null &&
      neighbor.owner !== player &&
      areHostile(state, player, neighbor.owner)
    )
  })
}

/** 接壤敌军的兵力总和，用来决定先补哪一处守将。 */
function hostilePressureAt(state: GameState, site: Site): number {
  return site.neighbors.reduce((total, neighborId) => {
    const neighbor = siteOf(state, neighborId)
    if (neighbor.owner === null || neighbor.owner === state.playerFaction) {
      return total
    }
    return (
      total +
      defenderCandidates(state, neighborId, neighbor.owner).reduce(
        (sum, character) => sum + character.troops,
        0,
      )
    )
  }, 0)
}

/** 尚未派驻将、且与敌对势力接壤的自有战略点；压力大的先补。 */
function ungarrisonedBorderSites(state: GameState): Site[] {
  const player = state.playerFaction

  return state.geography.sites
    .filter(
      (site) =>
        site.owner === player &&
        isBorderSite(state, site) &&
        !state.characters.some(
          (character) => isServing(character) && character.stationedSiteId === site.id,
        ),
    )
    .sort((a, b) => hostilePressureAt(state, b) - hostilePressureAt(state, a))
}

/**
 * 给接壤敌境的自有战略点补驻将。守将不占出征名额、也不因本季已行动而不能迎战，
 * 所以先把最硬的守将派到压力最大的一处；仍留够三人，免得守土把攻势掏空。
 */
function garrisonBorders(state: GameState, maxSites = 2): string[] {
  const player = state.playerFaction
  const records: string[] = []

  for (const site of ungarrisonedBorderSites(state).slice(0, maxSites)) {
    if (state.actionPoints[player] < ACTION_COSTS.station) {
      break
    }

    const free = state.characters.filter(
      (character) =>
        isServing(character) &&
        character.factionId === player &&
        character.stationedSiteId === null &&
        character.troops > 0,
    )
    if (free.length <= 3) {
      break
    }

    const defender = free.sort(
      (a, b) =>
        Number(a.isMonarch) - Number(b.isMonarch) ||
        officerDefensePower(b) - officerDefensePower(a),
    )[0]
    if (defender === undefined) {
      break
    }

    const result = assignStation(state, site.id, defender.id)
    if (result.ok) {
      records.push(result.record.outcome)
    }
  }

  return records
}

/**
 * 战火由玩家的宣战点燃：先经营，实力足够后向接壤的最弱外邦宣战。
 * 一次只打一家——接壤处还有活着的敌对势力时不再另启战端；
 * 全图每处战略点都有归属，故没有无主之地可打，接壤处无人可宣时便继续经营。
 */
function igniteWar(
  state: GameState,
  armyTarget: number,
  policy: PlaythroughPolicy,
): string | null {
  const player = state.playerFaction
  if (state.geography.sites.some((site) => isAttackable(state, site.id, player))) {
    return null
  }
  if (hasAdjacentHostile(state)) {
    return null
  }

  const target = warTargetOf(state)
  if (target === null || !readyForWar(state, target, armyTarget, policy)) {
    return null
  }

  const result = declareWar(state, target)
  return result.ok ? result.record.outcome : null
}

/**
 * 本季他方行动。来犯我方时按正常规则布阵：从该点可用的守将中按防守战力取人，
 * 与界面自动布阵走同一条路径，而不是把无人接手的来犯一律当作不战而下。
 */
function runFactionTurnsWithDefense(state: GameState, notes: string[] = []): void {
  const stream = factionTurnStream(state)
  let step = stream.next(null)
  let awaitingDefenseReport = false

  while (!step.done) {
    const signal = step.value

    if (signal.kind === 'defense') {
      const battle = signal.request.battle
      if (!battle.finished) {
        const candidates = defenderCandidates(state, signal.request.targetSiteId, state.playerFaction)
          .sort((a, b) => officerDefensePower(b) - officerDefensePower(a))
          .slice(0, DEFENDER_SELECTION + 1)
        deployDefenders(battle, state, autoFormation(candidates))
      }
      notes.push(
        `${signal.request.attackerId} 来犯 ${battle.siteName}，守将 ` +
          `${battle.defender.units.map((unit) => unit.name).join('、') || '无人迎战'}`,
      )
      awaitingDefenseReport = true
      step = stream.next(battle)
      continue
    }

    if (signal.kind === 'battle' && awaitingDefenseReport) {
      notes.push(`　${signal.outcome}`)
      awaitingDefenseReport = false
    }

    step = stream.next(null)
  }
}

/**
 * 兵多粮少时按同一比例裁军，把总兵力压回可承受的规模。
 * 遣散不耗行动力，散去的兵员转为各郡人口，下一季的粮产也随之回升。
 */
function demobilizeExcess(state: GameState, targetTroops: number): string[] {
  const player = state.playerFaction
  const grain = state.factions.find((item) => item.id === player)?.grain ?? 0
  const total = factionTroops(state, player)
  if (grain >= 1200 || total <= targetTroops) {
    return []
  }

  const records: string[] = []
  const officers = state.characters
    .filter(
      (character) =>
        isServing(character) &&
        character.factionId === player &&
        character.troops > 0,
    )
    .sort((a, b) => b.troops - a.troops)

  for (const officer of officers) {
    const keep = Math.floor((targetTroops * officer.troops) / total)
    if (keep >= officer.troops) {
      continue
    }
    const result = disband(state, officer.id, keep)
    if (result.ok) {
      records.push(result.record.outcome)
    }
  }

  return records
}

/** 版图快照：用来判断一季之内是否有战略点易手。 */
function siteOwnersKey(state: GameState): string {
  return state.geography.sites.map((site) => `${site.id}:${site.owner ?? '-'}`).join('|')
}

/** 每季检查一次的关键状态不变量：数值、归属、武将处境与俘虏关系。 */
function checkStateInvariants(state: GameState): string[] {
  const problems: string[] = []
  const factionIds = new Set(state.factions.map((faction) => faction.id))
  const siteIds = new Set(state.geography.sites.map((site) => site.id))
  const provinceIds = new Set(state.geography.provinces.map((province) => province.id))
  const characterIds = new Set(state.characters.map((character) => character.id))
  const stationCounts = new Map<SiteId, number>()

  const finiteNonNegative = (value: number, label: string): void => {
    if (!Number.isFinite(value) || value < 0) {
      problems.push(`${label} 非法：${value}`)
    }
  }

  if (!Number.isInteger(state.currentTurn) || state.currentTurn < 1) {
    problems.push(`回合数非法：${state.currentTurn}`)
  }
  if (!Number.isFinite(state.randomState) || !Number.isInteger(state.randomState)) {
    problems.push(`随机状态非法：${state.randomState}`)
  }
  if (state.outcome === 'ongoing' && state.endedTurn !== null) {
    problems.push('进行中的对局带有结束回合')
  }
  if (state.outcome !== 'ongoing' && state.endedTurn === null) {
    problems.push('已结束的对局缺少结束回合')
  }

  for (const faction of state.factions) {
    finiteNonNegative(faction.grain, `${faction.id} 粮食`)
    finiteNonNegative(faction.money, `${faction.id} 金钱`)
    finiteNonNegative(state.actionPoints[faction.id] ?? 0, `${faction.id} 行动力`)
  }

  for (const province of state.geography.provinces) {
    if (province.owner !== null && !factionIds.has(province.owner)) {
      problems.push(`州 ${province.id} 归属不存在：${province.owner}`)
    }
  }

  for (const site of state.geography.sites) {
    finiteNonNegative(site.population, `${site.id} 人口`)
    finiteNonNegative(granaryOf(site), `${site.id} 存粮`)
    if (!provinceIds.has(site.provinceId)) {
      problems.push(`战略点 ${site.id} 的州不存在：${site.provinceId}`)
    }
    if (site.owner !== null && !factionIds.has(site.owner)) {
      problems.push(`战略点 ${site.id} 归属不存在：${site.owner}`)
    }
  }

  for (const character of state.characters) {
    finiteNonNegative(character.troops, `${character.id} 兵力`)
    if (!Number.isFinite(character.might) || character.might < 0 || character.might > 120) {
      problems.push(`武将 ${character.id} 武力非法：${character.might}`)
    }
    if (!Number.isFinite(character.command) || character.command < 0 || character.command > 120) {
      problems.push(`武将 ${character.id} 统率非法：${character.command}`)
    }
    if (!Number.isFinite(character.intellect) || character.intellect < 0 || character.intellect > 120) {
      problems.push(`武将 ${character.id} 智谋非法：${character.intellect}`)
    }
    if (!Number.isFinite(character.politics) || character.politics < 0 || character.politics > 120) {
      problems.push(`武将 ${character.id} 内政非法：${character.politics}`)
    }
    if (!Number.isFinite(character.loyalty) || character.loyalty < 0 || character.loyalty > 100) {
      problems.push(`武将 ${character.id} 忠诚非法：${character.loyalty}`)
    }

    if (character.status === 'serving') {
      if (character.factionId === null || !factionIds.has(character.factionId)) {
        problems.push(`在仕武将 ${character.id} 的势力不存在`)
      }
      if (character.stationedSiteId !== null) {
        if (!siteIds.has(character.stationedSiteId)) {
          problems.push(`武将 ${character.id} 的驻地不存在：${character.stationedSiteId}`)
        } else {
          const site = state.geography.sites.find((item) => item.id === character.stationedSiteId)
          if (site !== undefined && site.owner !== character.factionId) {
            problems.push(`武将 ${character.id} 驻守非本方据点：${character.stationedSiteId}`)
          }
        }
        stationCounts.set(
          character.stationedSiteId,
          (stationCounts.get(character.stationedSiteId) ?? 0) + 1,
        )
      }
      if (character.isMonarch && character.factionId === null) {
        problems.push(`君主 ${character.id} 没有势力`)
      }
      continue
    }

    if (character.factionId !== null || character.stationedSiteId !== null || character.troops !== 0) {
      problems.push(`非在仕武将 ${character.id} 仍带有势力、驻地或兵力`)
    }
    if (character.status === 'wild' && character.tier === null) {
      problems.push(`在野武将 ${character.id} 没有卡池层级`)
    }
    if (character.isMonarch && character.status !== 'captured') {
      problems.push(`非在仕武将 ${character.id} 不应是君主`)
    }
  }

  for (const [siteId, count] of stationCounts) {
    if (count > 1) {
      problems.push(`战略点 ${siteId} 有 ${count} 名驻将`)
    }
  }

  const captiveIds = new Set<string>()
  for (const [factionId, records] of Object.entries(state.captives)) {
    if (!factionIds.has(factionId)) {
      problems.push(`俘虏营归属不存在：${factionId}`)
    }
    for (const record of records) {
      if (!characterIds.has(record.characterId)) {
        problems.push(`俘虏不存在：${record.characterId}`)
        continue
      }
      if (captiveIds.has(record.characterId)) {
        problems.push(`俘虏重复关押：${record.characterId}`)
      }
      captiveIds.add(record.characterId)
      const character = state.characters.find((item) => item.id === record.characterId)
      if (character !== undefined && character.status !== 'captured') {
        problems.push(`俘虏 ${record.characterId} 状态不是被俘`)
      }
      if (
        record.formerFactionId !== null &&
        !factionIds.has(record.formerFactionId)
      ) {
        problems.push(`俘虏 ${record.characterId} 的原属势力不存在`)
      }
    }
  }

  return problems
}

/** 跑一局固定种子的推演，返回逐季日志与最终状态。 */
function runPlaythrough(scenario: Scenario, options: PlaythroughOptions = {}): Playthrough {
  const seed = options.seed ?? SEED
  const seasons = options.seasons ?? SEASONS
  const collectLines = options.collectLines ?? true
  const state = createInitialState({ scenario, seed })
  const drawRandom = createRandom(options.drawSeed ?? DRAW_SEED)
  const policy = { ...policyFor(scenario), ...options.policy }
  /** 开战前的兵力目标：不低于最低门槛，也不低于开局兵力的一又三成。 */
  const armyTarget = Math.max(
    policy.warMinTroops,
    Math.round(factionTroops(state, state.playerFaction) * policy.armyGrowthRatio),
  )
  const lines: string[] = []
  let battles = 0
  let wins = 0
  let apSpent = 0
  let apBudget = 0
  let rewards = 0
  /** 建设在农田、市集与民居之间轮转，保证三项都被演练到。 */
  let buildCycle = 0
  const destroyedAt = new Map<FactionId, number>()
  const problemSet = new Set<string>()
  let lastTerritoryChangeTurn = 1
  const pushLine = (line: string): void => {
    if (collectLines) {
      lines.push(line)
    }
  }
  const check = (phase: string): void => {
    for (const problem of checkStateInvariants(state)) {
      problemSet.add(`${phase}：${problem}`)
    }
  }

  for (let season = 0; season < seasons; season += 1) {
    const player = state.playerFaction
    const before = state.actionPoints[player]
    const ownersBefore = siteOwnersKey(state)
    apBudget += before
    const actions: string[] = []

    // 兵多而粮少时先裁军：自然增长的兵力会吃空国库，散了的人归入各郡人口，来季又能多产粮。
    if (policy.demobilize) {
      actions.push(...demobilizeExcess(state, Math.round(armyTarget * 1.2)))
    }

    // 开局无战事的剧本里先宣战点火，之后各季不再重复。
    const war = igniteWar(state, armyTarget, policy)
    if (war !== null) {
      actions.push(war)
    }

    // 实力未到先发育：打不动、粮不够或兵力未压过对手时，这一季不出兵。
    const warReady = state.factions.some(
      (faction) =>
        faction.id !== player &&
        !isFactionDestroyed(state, faction.id) &&
        areHostile(state, player, faction.id) &&
        readyForWar(state, faction.id, armyTarget, policy),
    )

    // 同一季的第二波优先续攻首战未下的目标。
    let focusTargetId: SiteId | null = null

    for (let round = 0; round < 3; round += 1) {
      if (!warReady || state.actionPoints[player] < ACTION_COSTS.attack) {
        break
      }

      const plans = state.geography.sites
        .filter((site) => isAttackable(state, site.id))
        .map((site) => {
          const party = bestParty(state, site.id, policy.safeMargin, policy.minimalParty)
          if (party === null || attackBlockReason(state, site.id, party) !== null) {
            return null
          }
          return {
            site,
            party,
            power: partyPowerOf(state, party),
            defence: defenderPowerOf(state, site.id),
          }
        })
        .filter(
          (plan): plan is { site: Site; party: string[]; power: number; defence: number } =>
            plan !== null,
        )
        .sort((a, b) => {
          if (focusTargetId !== null) {
            const focusGap =
              Number(b.site.id === focusTargetId) - Number(a.site.id === focusTargetId)
            if (focusGap !== 0) {
              return focusGap
            }
          }
          const value = SITE_VALUE[b.site.type] - SITE_VALUE[a.site.type]
          return value !== 0 ? value : a.defence - b.defence
        })

      const plan = plans[0]
      if (plan === undefined) {
        break
      }

      const opened = openAttack(state, plan.site.id, autoDeployment(plan.party))
      if (!opened.ok) {
        break
      }
      autoBattle(opened.battle)
      const result = finishBattle(state, opened.battle)
      check('战斗结算后')

      battles += 1
      const captured = siteOf(state, plan.site.id).owner === player
      if (captured) {
        wins += 1
        focusTargetId = null
      } else {
        // 同季第二波仍打同一处：首战已让未驻守的守将本季行动过，第二波面对的守军更少。
        focusTargetId = plan.site.id
      }

      const report = result.ok ? result.record.battle : undefined
      const detail =
        report === undefined
          ? ''
          : `，我损 ${report.attacker.casualties}／敌损 ${report.defender.casualties}`
      actions.push(
        `${captured ? '夺取' : '受阻'} ${plan.site.name}` +
          `（我 ${Math.round(plan.power)} 对敌 ${Math.round(plan.defence)}${detail}）`,
      )
    }

    // 寻访放在攻势之后：开战时先把行动力交给两波进攻，余力再用来招人。
    if (
      state.actionPoints[player] >= ACTION_COSTS.seekTalent &&
      servingCount(state, player) < ROSTER_LIMIT
    ) {
      for (const site of state.geography.sites) {
        if (site.owner !== player) {
          continue
        }
        const result = seekTalent(state, drawRandom, site.id)
        if (result.ok) {
          actions.push(result.record.outcome)
          break
        }
      }
    }

    // 征兵：按剩余带兵空间轮流补人，一季至多三次；先为当季征粮与补驻将留出行动力。
    const grainNow = state.factions.find((item) => item.id === player)?.grain ?? 0
    const garrisonNeeded = Math.min(ungarrisonedBorderSites(state).length, 2)
    const reserved =
      (grainNow < HARVEST_STOP_GRAIN ? ACTION_COSTS.harvestGrain : 0) +
      garrisonNeeded * ACTION_COSTS.station
    const recruitBudget = Math.min(
      RECRUITS_PER_SEASON,
      Math.max(
        0,
        Math.floor((state.actionPoints[player] - reserved) / ACTION_COSTS.recruit),
      ),
    )

    for (let round = 0; round < recruitBudget; round += 1) {
      const grain = state.factions.find((item) => item.id === player)?.grain ?? 0
      if (factionTroops(state, player) >= armyTarget && grain <= ARMY_SURPLUS_GRAIN) {
        break
      }

      const recruitSite = state.geography.sites
        .filter((site) => site.owner === player && site.population >= 1)
        .sort((a, b) => b.population - a.population)[0]
      const recruiterPool =
        recruitSite === undefined
          ? []
          : readyOfficers(state, player).filter(
              (item) => item.troops < troopLimit(item) && grain >= recruitGrainCost(item),
            )
      const recruiter = recruiterPool.sort(
        policy.concentrateRecruits
          ? (a, b) =>
              officerAttackPower(b) - officerAttackPower(a) ||
              b.command - a.command
          : (a, b) => recruitMarginalPower(b) - recruitMarginalPower(a),
      )[0]

      if (recruitSite === undefined || recruiter === undefined) {
        break
      }

      // 留出一次出征的粮：军粮按兵力逐季扣，征兵不能把粮吃到见底。
      const reserve = attackGrainCost(factionTroops(state, player))
      if (grain - recruitGrainCost(recruiter) < reserve) {
        break
      }

      const result = recruit(state, recruitSite.id, recruiter.id)
      if (!result.ok) {
        break
      }
      actions.push(result.record.outcome)
    }

    // 补驻将：边境空置的据点先留一名守将，再谈其他。
    actions.push(...garrisonBorders(state))

    // 招人未尽时的余力用来登门：寻访到头后，仍可拜访已认得路的人，直到人满或行动力不足。
    if (servingCount(state, player) < ROSTER_LIMIT && state.actionPoints[player] >= ACTION_COSTS.visit) {
      const visited = visitContact(state, drawRandom)
      if (visited !== null) {
        actions.push(visited)
      }
    }

    // 经营：余力所及，每季至多办一件——忠诚不足先赏赐，否则投进建设。
    if (state.actionPoints[player] >= ACTION_COSTS.build) {
      const playerFaction = state.factions.find((item) => item.id === player)
      const money = playerFaction?.money ?? 0
      const rewardTarget = rewardTargetOf(state)

      if (rewardTarget !== null && money >= REWARD_MONEY) {
        const result = reward(state, rewardTarget.id)
        if (result.ok) {
          rewards += 1
          actions.push(result.record.outcome)
        }
      } else {
        const kind = DEVELOPMENT_KINDS[buildCycle % DEVELOPMENT_KINDS.length]
        const site = kind === undefined ? null : developmentSiteOf(state, kind)
        const builder = readyOfficers(state, player)
          .filter((item) => item.troops > 0)
          .sort((a, b) => b.politics - a.politics)[0]
        if (kind !== undefined && site !== null && builder !== undefined) {
          const result = build(state, site.id, kind, builder.id)
          if (result.ok) {
            buildCycle += 1
            actions.push(result.record.outcome)
          }
        }
      }
    }

    // 余下的行动力交给征粮，直到用尽、无人可派或国库已够用；粮够了便把行动力留给下次征兵与建设。
    while (state.actionPoints[player] >= ACTION_COSTS.harvestGrain) {
      const grainLeft = state.factions.find((item) => item.id === player)?.grain ?? 0
      if (grainLeft >= HARVEST_STOP_GRAIN) {
        break
      }

      const harvester = readyOfficers(state, player)
        .filter((item) => item.troops > 0)
        .sort((a, b) => b.politics - a.politics)[0]
      const granarySite = state.geography.sites
        .filter((site) => site.owner === player && granaryOf(site) > 0)
        .sort((a, b) => granaryOf(b) - granaryOf(a))[0]
      if (harvester === undefined || granarySite === undefined) {
        break
      }

      const result = harvestGrain(state, granarySite.id, harvester.id)
      if (!result.ok) {
        break
      }
      actions.push(result.record.outcome)
    }

    apSpent += before - state.actionPoints[player]
    const faction = state.factions.find((item) => item.id === player)
    const granary = state.geography.sites
      .filter((site) => site.owner === player)
      .reduce((total, site) => total + granaryOf(site), 0)
    pushLine(
      `第 ${state.currentTurn} 季　${dateLabel(state)}　行动力 ${before}→${state.actionPoints[player]}　` +
        `兵力 ${factionTroops(state, player)}　存 ${granary}　粮 ${faction?.grain ?? 0}　金 ${faction?.money ?? 0}　${factionLine(state)}`,
    )
    pushLine(`　　${actions.length === 0 ? '（无行动）' : actions.join('；')}`)

    const defenseNotes: string[] = []
    runFactionTurnsWithDefense(state, defenseNotes)
    for (const note of defenseNotes) {
      pushLine(`　　${note}`)
    }
    check('他方行动后')
    advanceTurn(state)
    check('每季结算后')

    if (siteOwnersKey(state) !== ownersBefore) {
      lastTerritoryChangeTurn = state.currentTurn - 1
    }

    // 覆灭可能发生在玩家或他方手中，进入新一季后再判定，记在刚结束的那一季。
    for (const faction of state.factions) {
      if (isFactionDestroyed(state, faction.id) && !destroyedAt.has(faction.id)) {
        destroyedAt.set(faction.id, state.currentTurn - 1)
      }
    }

    // 结局一旦定下（统一或覆灭）就不必再跑，上限只是兜底。
    if (state.outcome !== 'ongoing') {
      break
    }
  }

  pushLine(`　　终局版图　${territoryLine(state)}`)
  const finalTurn = state.currentTurn - 1

  return {
    state,
    lines,
    seed,
    seasons,
    battles,
    wins,
    apSpent,
    apBudget,
    rewards,
    destroyedAt,
    problems: [...problemSet],
    lastTerritoryChangeTurn,
    stalled: state.outcome === 'ongoing' && finalTurn - lastTerritoryChangeTurn >= 20,
  }
}

function summarize(run: Playthrough): string {
  const { state } = run
  const player = state.playerFaction
  const destroyed = state.factions
    .filter((faction) => isFactionDestroyed(state, faction.id))
    .map((faction) => {
      const at = run.destroyedAt.get(faction.id)
      return at === undefined ? faction.name : `${faction.name}（第 ${at} 季）`
    })
  const wild = state.characters.filter((item) => item.status === 'wild').length
  const retired = state.characters.filter((item) => item.status === 'retired').length

  return [
    '----- 汇总 -----',
    `结局　${OUTCOME_LABELS[state.outcome]}`,
    `行动力 ${run.apSpent}/${run.apBudget}（${Math.round((run.apSpent / run.apBudget) * 100)}%）` +
      `　战斗 ${run.battles} 场、夺取 ${run.wins} 场`,
    `覆灭势力：${destroyed.join('、') || '无'}`,
    `在野武将 ${wild} 名　退场武将 ${retired} 名`,
    `终局兵力 ${factionTroops(state, player)}　终局粮 ${state.factions.find((item) => item.id === player)?.grain ?? 0}` +
      `　终局金 ${state.factions.find((item) => item.id === player)?.money ?? 0}`,
    `建设 农田 ${developmentTotal(state, 'farm')} 级　市集 ${developmentTotal(state, 'market')} 级　民居 ${developmentTotal(state, 'housing')} 级` +
      `　赏赐 ${run.rewards} 次`,
    `终局版图　${territoryLine(state)}`,
  ].join('\n')
}

test('荆扬一隅固定种子推演', () => {
  const run = runPlaythrough(SANGUO_ACCEPTANCE)
  console.log(`\n===== 核心玩法推演（荆扬一隅，种子 ${SEED}，上限 ${SEASONS} 季）=====`)
  console.log(run.lines.join('\n'))
  console.log(summarize(run))

  // 同一存档重复推演结果一致
  expect(runPlaythrough(SANGUO_ACCEPTANCE).lines).toEqual(run.lines)

  // 验收小局必须走到统一：这是「一局能打完」的最小闭环。
  expect(run.state.outcome).toBe('victory')
  expect(run.battles).toBeGreaterThan(0)
})

test('建安十三年固定种子推演', () => {
  const run = runPlaythrough(SANGUO_208)
  console.log(`\n===== 核心玩法推演（建安十三年，种子 ${SEED}，上限 ${SEASONS} 季）=====`)
  console.log(run.lines.join('\n'))
  console.log(summarize(run))

  // 同一存档重复推演结果一致
  expect(runPlaythrough(SANGUO_208).lines).toEqual(run.lines)

  // 正式剧本的中盘验证：不覆灭、能连续打灭弱小势力，说明开局与扩张路径可行。
  // 全图统一仍受「双方兵力都撞上带兵上限后，守方六队加据点补正难以攻破」的
  // 既有数值问题所限；这项限制记在《想法记录》，不靠放宽本用例的断言来掩盖。
  expect(run.state.outcome).not.toBe('defeat')
  expect(run.destroyedAt.size).toBeGreaterThanOrEqual(2)
  expect(run.wins).toBeGreaterThanOrEqual(5)
})

const STRESS_SEEDS = Array.from({ length: 20 }, (_, index) => index + 1)
const LONG_STRESS_SEEDS = [208, 1, 7, 13, 19]

function stressLine(run: Playthrough): Record<string, string | number | boolean> {
  const player = run.state.playerFaction
  return {
    seed: run.seed,
    outcome: run.state.outcome,
    turn: run.state.currentTurn - 1,
    destroyed: run.destroyedAt.size,
    playerAlive: !isFactionDestroyed(run.state, player),
    normalEnd: run.state.outcome !== 'ongoing',
    battles: run.battles,
    wins: run.wins,
    stalled: run.stalled,
    problems: run.problems.length,
  }
}

test('正式剧本多随机种子压力测试', { timeout: 180_000 }, () => {
  const results = STRESS_SEEDS.map((seed) =>
    runPlaythrough(SANGUO_208, {
      seed,
      seasons: 60,
      drawSeed: seed * 7919 + 13,
      collectLines: false,
    }),
  )

  for (const run of results) {
    console.log(`STRESS ${JSON.stringify(stressLine(run))}`)
  }

  expect(results).toHaveLength(STRESS_SEEDS.length)
  expect(results.every((run) => run.problems.length === 0)).toBe(true)
  expect(results.some((run) => run.battles > 0)).toBe(true)

  // 固定种子重跑必须一致：换随机种子只改变局面，不改变可复现性。
  const first = runPlaythrough(SANGUO_208, {
    seed: 11,
    seasons: 60,
    drawSeed: 11 * 7919 + 13,
    collectLines: false,
  })
  const second = runPlaythrough(SANGUO_208, {
    seed: 11,
    seasons: 60,
    drawSeed: 11 * 7919 + 13,
    collectLines: false,
  })
  expect(second.state).toEqual(first.state)
})

test('正式剧本长局压力测试', { timeout: 300_000 }, () => {
  const results = LONG_STRESS_SEEDS.map((seed) =>
    runPlaythrough(SANGUO_208, {
      seed,
      seasons: 200,
      drawSeed: seed * 7919 + 13,
      collectLines: false,
    }),
  )

  for (const run of results) {
    console.log(`LONG ${JSON.stringify(stressLine(run))}`)
  }

  expect(results.every((run) => run.problems.length === 0)).toBe(true)
  expect(results.every((run) => run.state.currentTurn - 1 <= 200)).toBe(true)
})
