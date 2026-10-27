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
  defenderCandidates,
  finishBattle,
  isAttackable,
  openAttack,
} from '../src/core/battle'
import { isRecruitable } from '../src/core/characters'
import { createInitialState } from '../src/core/createInitialState'
import { granaryOf } from '../src/core/granary'
import {
  build,
  buildCost,
  DEVELOPMENT_KINDS,
  developmentLevel,
  developmentLimit,
} from '../src/core/development'
import { declareWar, demand } from '../src/core/diplomacy'
import {
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
import { reward, REWARD_MONEY } from '../src/core/personnel'
import { createRandom, type Random } from '../src/core/random'
import { areAllied, areHostile, favorBetween } from '../src/core/relations'
import { SANGUO_208, SANGUO_ACCEPTANCE } from '../src/core/scenarios'
import { recruitChance, seekTalent, visit } from '../src/core/seekTalent'
import { endTurn } from '../src/core/turn'

/**
 * 核心玩法推演：用无画面的规则层把一份剧本跑满若干季，输出逐季日志与汇总，
 * 供调数值后复跑对照。运行方式见 npm run acceptance。
 *
 * 推演用一个规则驱动的「玩家」代理，策略如下：
 *   先发育：寻访与登门把人收满三十，征兵按边际战力分给不同的人、一季至多三次；
 *   建设与征粮各占一档，粮够两万便不再征粮，把行动力留给扩军。
 *   实力足够后，向接壤势力中兵力最弱的一位宣战，一次只打一家，打完再接下一家；
 *   进攻（安全边际内挑价值最高者，自名册编成）→ 征兵（人口最多的点上补边际战力最高的人）
 *   → 拜访（寻访到头后登门争取已认得路的人）→ 经营与外交（每季至多一项：
 *   缺粮则向可开口的弱者索取、忠诚不足六十则赏赐、否则建农田 / 市集 / 民居）
 *   → 征粮（粮未满两万时，余力交给内政最高者，自存粮最多的点取用）。
 * 兵只从征兵来、粮落在战略点上：兵力完全靠征兵积累，粮要派人去取，两者都由代理逐季操持。
 * 武将统一归名册，征兵、征粮与出征都从名册选人，与身在何处无关；每人每季至多行动一次。
 * 外交只做索取与宣战：赠礼、停战与结盟无处可施。宣战不限关系——同盟亦可宣战，
 * 与玩家手中的手段一致，但次序上先把非同盟打完，接壤处再无外人时才撕盟。
 * 全图每处战略点都有归属，故代理不再有无主之地可打；眼下无可攻打的目标时，
 * 先继续经营，实力足够再向接壤的最弱外邦宣战，接壤处无人可宣时停手。
 * 其他势力由 factionAi 自主行动，走与实机相同的回合收尾流程。
 * 它不代表最优打法，只用来观察数值松紧与局势走向；判断「好不好玩」仍要看实玩。
 */

/** 推演参数：换种子或季数改这里。 */
const SEED = 208
/** 寻访所用抽卡流的种子，与模拟流互不干扰。 */
const DRAW_SEED = 5
/**
 * 季数上限。放宽到推演代理不再有进展之后的一截：代理打不动坚城，几十季下来版图便不再变化。
 * 上限只用来发现「数值松紧让一局永远打不完」这类问题；一局打到结局的样子另由构造小局覆盖。
 */
const SEASONS = 60
/**
 * 进攻前要求我方战力高于守方的倍数。
 * 攻守战力按同一口径（兵力 × 兵种攻防 × 属性加成）估算，留五成余量即可；
 * 先前把攻方系数 0.6 与守方系数 0.15 一并算入，读数虚高，才出现「优势兵力惨败」。
 */
const SAFE_MARGIN = 1.5
/** 发育期：开战前至少经过的季数。 */
const WAR_MIN_SEASONS = 6
/** 宣战门槛：全军兵力低于此数时，代理只经营，不主动开战。 */
const WAR_MIN_TROOPS = 20000
/** 发育目标：以开局兵力为基准，至少攒到它的这个倍数再谈开战。 */
const ARMY_GROWTH_RATIO = 1.3
/** 余粮超过此数时，即便已达发育目标也继续扩军——打不动下一处时靠体量慢慢压过去。 */
const ARMY_SURPLUS_GRAIN = 8000
/** 推演代理的名册上限，与游戏的玩家上限一致。 */
const ROSTER_LIMIT = 30
/** 一季至多征兵几次；每次都要换一名还有带兵空间的武将。 */
const RECRUITS_PER_SEASON = 3
/** 国库粮食达到此数后不再征粮，把行动力留给征兵与建设。 */
const HARVEST_STOP_GRAIN = 20000
/** 粮食低于此数时，代理先向外索取（对象见 demandTargetOf）。 */
const DEMAND_GRAIN_BELOW = 3000
/** 忠诚不足此数（新附者多在五十上下）就先赏一回，把人拉过这条安心线。 */
const REWARD_BELOW = 60
/** 战略点的相对价值，用于在多个安全目标中择优。 */
const SITE_VALUE: Record<SiteType, number> = { metropolis: 4, city: 3, town: 2, pass: 2, field: 1 }
const SEASON_LABELS: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }
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
 * 就该目标排出的出征编成：按战力从高到低取至多五人，合起来须明显强过守方预计战力。
 * 只派一两个人会被人多的一方围掉，故不按「够了就收手」取人。
 */
function bestParty(state: GameState, targetId: SiteId, margin: number): string[] | null {
  const pool = attackCandidates(state, targetId)
    .filter((item) => !hasActedThisTurn(state, item.id))
    .sort((a, b) => officerAttackPower(b) - officerAttackPower(a))
  if (pool.length === 0) {
    return null
  }

  const members = pool.slice(0, ATTACKER_SELECTION)
  const defence = defenderPowerOf(state, targetId)
  const power = members.reduce((total, character) => total + officerAttackPower(character), 0)

  return power > defence * margin ? members.map((character) => character.id) : null
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

/** 可索取的对象：非敌对、好感尚可（≥ 40）的他方里兵力最弱的一位——强者不吃这一套。 */
function demandTargetOf(state: GameState): FactionId | null {
  const player = state.playerFaction
  const candidate = state.factions
    .filter(
      (faction) =>
        faction.id !== player &&
        !areHostile(state, player, faction.id) &&
        favorBetween(state, player, faction.id) >= 40,
    )
    .sort((a, b) => factionTroops(state, a.id) - factionTroops(state, b.id))[0]

  return candidate?.id ?? null
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
        money >= buildCost(item, kind),
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
  battles: number
  wins: number
  apSpent: number
  apBudget: number
  /** 赏赐次数，以及索取成功次数与索得的粮食合计。 */
  rewards: number
  demands: number
  demandedGrain: number
  /** 各势力覆灭于第几季。 */
  destroyedAt: Map<FactionId, number>
}

/**
 * 就某目标点排一支出征队伍，不要求已经宣战——用于在开战前判断打不打得动。
 * 取人与战力口径与 `bestParty` 相同：名册中未驻守、有兵、本季未行动的武将。
 */
function warPartyOf(state: GameState, targetId: SiteId, margin: number): string[] | null {
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

  const members = pool.slice(0, ATTACKER_SELECTION)
  const defence = defenderPowerOf(state, targetId)
  const power = members.reduce((total, character) => total + officerAttackPower(character), 0)

  return power > defence * margin ? members.map((character) => character.id) : null
}

/**
 * 是否到了向该势力开战的时候：经过发育期、兵力达到发育目标，
 * 且至少能对一处接壤据点排出一支有胜算的队伍、付得起出征粮草。
 */
function readyForWar(state: GameState, targetId: FactionId, armyTarget: number): boolean {
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
      const party = warPartyOf(state, site.id, SAFE_MARGIN)
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
 * 就着玩家的自有领地向外看：接壤势力里最弱的一位。非同盟先于同盟——先把外人打完，
 * 接壤处再无外人可打时才轮到同盟，撕盟是最后一步；已宣战者不在列（打他已不必再宣）。
 * 无接壤者则返回 null。
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
  const outsider = adjacent.find((faction) => !areAllied(state, player, faction.id))

  return (outsider ?? adjacent[0])?.id ?? null
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

/**
 * 战火由玩家的宣战点燃：先经营，实力足够后向接壤的最弱外邦宣战。
 * 一次只打一家——接壤处还有活着的敌对势力时不再另启战端；
 * 全图每处战略点都有归属，故没有无主之地可打，接壤处无人可宣时便继续经营。
 */
function igniteWar(state: GameState, armyTarget: number): string | null {
  const player = state.playerFaction
  if (state.geography.sites.some((site) => isAttackable(state, site.id, player))) {
    return null
  }
  if (hasAdjacentHostile(state)) {
    return null
  }

  const target = warTargetOf(state)
  if (target === null || !readyForWar(state, target, armyTarget)) {
    return null
  }

  const result = declareWar(state, target)
  return result.ok ? result.record.outcome : null
}

/** 跑一局固定种子的推演，返回逐季日志与最终状态。 */
function runPlaythrough(scenario: Scenario): Playthrough {
  const state = createInitialState({ scenario, seed: SEED })
  const drawRandom = createRandom(DRAW_SEED)
  /** 开战前的兵力目标：不低于最低门槛，也不低于开局兵力的一又三成。 */
  const armyTarget = Math.max(
    WAR_MIN_TROOPS,
    Math.round(factionTroops(state, state.playerFaction) * ARMY_GROWTH_RATIO),
  )
  const lines: string[] = []
  let battles = 0
  let wins = 0
  let apSpent = 0
  let apBudget = 0
  let seekExhausted = false
  let rewards = 0
  let demands = 0
  let demandedGrain = 0
  /** 建设在农田、市集与民居之间轮转，保证三项都被演练到。 */
  let buildCycle = 0
  const destroyedAt = new Map<FactionId, number>()

  for (let season = 0; season < SEASONS; season += 1) {
    const player = state.playerFaction
    const before = state.actionPoints[player]
    apBudget += before
    const actions: string[] = []

    // 开局无战事的剧本里先宣战点火，之后各季不再重复。
    const war = igniteWar(state, armyTarget)
    if (war !== null) {
      actions.push(war)
    }

    if (
      !seekExhausted &&
      state.actionPoints[player] >= ACTION_COSTS.seekTalent &&
      servingCount(state, player) < ROSTER_LIMIT
    ) {
      const result = seekTalent(state, drawRandom, 'jiangxia')
      if (result.ok) {
        actions.push(result.record.outcome)
      } else {
        seekExhausted = true
      }
    }

    // 实力未到先发育：打不动、粮不够或兵力未压过对手时，这一季不出兵。
    const warReady = state.factions.some(
      (faction) =>
        faction.id !== player &&
        !isFactionDestroyed(state, faction.id) &&
        areHostile(state, player, faction.id) &&
        readyForWar(state, faction.id, armyTarget),
    )

    for (let round = 0; round < 3; round += 1) {
      if (!warReady || state.actionPoints[player] < ACTION_COSTS.attack) {
        break
      }

      const plans = state.geography.sites
        .filter((site) => isAttackable(state, site.id))
        .map((site) => {
          const party = bestParty(state, site.id, SAFE_MARGIN)
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

      battles += 1
      const captured = siteOf(state, plan.site.id).owner === player
      if (captured) {
        wins += 1
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

    // 征兵：按剩余带兵空间轮流补人，一季至多三次；先为当季建设与征粮留出行动力。
    const grainNow = state.factions.find((item) => item.id === player)?.grain ?? 0
    const canBuild = DEVELOPMENT_KINDS.some((kind) => developmentSiteOf(state, kind) !== null)
    const reserved =
      (canBuild ? ACTION_COSTS.build : 0) +
      (grainNow < HARVEST_STOP_GRAIN ? ACTION_COSTS.harvestGrain : 0)
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
      const recruiter =
        recruitSite === undefined
          ? undefined
          : readyOfficers(state, player)
              .filter(
                (item) => item.troops < troopLimit(item) && grain >= recruitGrainCost(item),
              )
              .sort((a, b) => recruitMarginalPower(b) - recruitMarginalPower(a))[0]

      if (recruitSite === undefined || recruiter === undefined) {
        break
      }

      const result = recruit(state, recruitSite.id, recruiter.id)
      if (!result.ok) {
        break
      }
      actions.push(result.record.outcome)
    }

    // 招人未尽时的余力用来登门：寻访到头后，仍可拜访已认得路的人，直到人满或行动力不足。
    if (servingCount(state, player) < ROSTER_LIMIT && state.actionPoints[player] >= ACTION_COSTS.visit) {
      const visited = visitContact(state, drawRandom)
      if (visited !== null) {
        actions.push(visited)
      }
    }

    // 经营与外交：余力所及，每季至多办一件——缺粮先索取，忠诚不足先赏赐，否则投进建设。
    if (state.actionPoints[player] >= ACTION_COSTS.build) {
      const playerFaction = state.factions.find((item) => item.id === player)
      const money = playerFaction?.money ?? 0
      const grainLeft = playerFaction?.grain ?? 0
      const rewardTarget = rewardTargetOf(state)
      const demandTarget = grainLeft < DEMAND_GRAIN_BELOW ? demandTargetOf(state) : null

      if (demandTarget !== null) {
        const grainBefore = playerFaction?.grain ?? 0
        const result = demand(state, demandTarget)
        if (result.ok) {
          const gained = (playerFaction?.grain ?? 0) - grainBefore
          if (gained > 0) {
            demands += 1
            demandedGrain += gained
          }
          actions.push(result.record.outcome)
        }
      } else if (rewardTarget !== null && money >= REWARD_MONEY) {
        const result = reward(state, rewardTarget.id)
        if (result.ok) {
          rewards += 1
          actions.push(result.record.outcome)
        }
      } else {
        const kind = DEVELOPMENT_KINDS[buildCycle % DEVELOPMENT_KINDS.length]
        const site = kind === undefined ? null : developmentSiteOf(state, kind)
        if (kind !== undefined && site !== null) {
          const result = build(state, site.id, kind)
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
    lines.push(
      `第 ${state.currentTurn} 季　${dateLabel(state)}　行动力 ${before}→${state.actionPoints[player]}　` +
        `兵力 ${factionTroops(state, player)}　存 ${granary}　粮 ${faction?.grain ?? 0}　金 ${faction?.money ?? 0}　${factionLine(state)}`,
    )
    lines.push(`　　${actions.length === 0 ? '（无行动）' : actions.join('；')}`)

    endTurn(state)

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

  lines.push(`　　终局版图　${territoryLine(state)}`)

  return { state, lines, battles, wins, apSpent, apBudget, rewards, demands, demandedGrain, destroyedAt }
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
      `　赏赐 ${run.rewards} 次　索取 ${run.demands} 次（得粮 ${run.demandedGrain}）`,
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

  // 推演收尾只该有两种样子：推到了结局，或跑满上限仍未分出胜负。
  // 前者意味着某方被彻底打光，后者意味着数值或代理策略还留着一局打不完的口子。
  expect(run.state.currentTurn - 1 === SEASONS || run.state.outcome !== 'ongoing').toBe(true)
  expect(run.battles).toBeGreaterThan(0)
})

test('建安十三年固定种子推演', () => {
  const run = runPlaythrough(SANGUO_208)
  console.log(`\n===== 核心玩法推演（建安十三年，种子 ${SEED}，上限 ${SEASONS} 季）=====`)
  console.log(run.lines.join('\n'))
  console.log(summarize(run))

  // 同一存档重复推演结果一致
  expect(runPlaythrough(SANGUO_208).lines).toEqual(run.lines)
  expect(run.state.currentTurn - 1 === SEASONS || run.state.outcome !== 'ongoing').toBe(true)
  expect(run.battles).toBeGreaterThan(0)
})
