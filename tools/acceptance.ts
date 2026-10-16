import { expect, test } from 'vitest'
import { ACTION_COSTS } from '../src/core/actions'
import {
  attack,
  attackCandidates,
  battlePower,
  garrisonAt,
  isAttackable,
  partySide,
  type AttackParty,
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
  factionTroops,
  harvestGrain,
  hasActedThisTurn,
  isFactionDestroyed,
  MAX_TRANSFER_PARTY,
  recruit,
  recruitGrainCost,
  stationAdjacentTo,
  transfer,
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
 *   寻访（前期攒人）→ 进攻（安全边际内挑价值最高者）→ 征兵（交给统率最高者）
 *   → 拜访（寻访到头后登门争取已认得路的人）→ 经营与外交（每季至多一项：
 *   缺粮则向可开口的弱者索取、忠诚不足六十则赏赐、否则建农田 / 市集 / 民居）
 *   → 征粮（交给内政最高者，自驻地存粮取用）→ 调兵（朝最弱目标集结）。
 * 兵只从征兵来、粮落在战略点上：兵力完全靠征兵积累，粮要派人去取，两者都由代理逐季操持。
 * 外交只做索取与宣战：荆扬一隅里同盟与敌对都是开局定局，赠礼、停战与结盟无处可施；
 * 建安十三年开局无战事，代理先收拾无主之地，再无主可打才向一位邻邦宣战，把战火点燃。
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
 * 取 1 即「有优势就动手」：更保守的线会让代理在坚城前永远不敢开战，一路攒到上限也打不完。
 */
const SAFE_MARGIN = 1
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
  hansui: '韩',
  gongsunkang: '公',
  shixie: '士',
  zhanglu: '张',
}

function siteOf(state: GameState, siteId: SiteId): Site {
  const site = state.geography.sites.find((item) => item.id === siteId)
  if (site === undefined) {
    throw new Error(`战略点不存在：${siteId}`)
  }
  return site
}

/** 守方战力（不含随机浮动），直接取接战守军的战力要素。 */
function defenderPowerOf(state: GameState, siteId: SiteId): number {
  return battlePower(garrisonAt(state, siteId).side, { defending: true })
}

/** 就该目标排出的最小可用编成：主将取统率最高，兵力不足时依次加副将、军师。 */
function bestParty(state: GameState, targetId: SiteId, margin: number): AttackParty | null {
  const pool = attackCandidates(state, targetId).filter(
    (item) => !hasActedThisTurn(state, item.id) && item.troops > 0,
  )
  if (pool.length === 0) {
    return null
  }

  const byCommand = (a: Character, b: Character): number => b.command - a.command
  const byIntellect = (a: Character, b: Character): number => b.intellect - a.intellect
  const sorted = [...pool].sort(byCommand)
  const commander = sorted[0]
  const rest = sorted.slice(1)
  const strategist = [...rest].sort(byIntellect)[0] ?? null
  const deputy = rest.find((item) => item.id !== strategist?.id) ?? null

  const options: AttackParty[] = [{ commander: commander.id }]
  if (deputy !== null) options.push({ commander: commander.id, deputy: deputy.id })
  if (strategist !== null) options.push({ commander: commander.id, strategist: strategist.id })
  if (deputy !== null && strategist !== null) {
    options.push({ commander: commander.id, deputy: deputy.id, strategist: strategist.id })
  }

  const defence = defenderPowerOf(state, targetId)
  for (const party of options) {
    if (battlePower(partySide(state, party)) > defence * margin) {
      return party
    }
  }

  return null
}

/** 主攻目标：可进攻的敌方战略点中守备最弱者；没有则返回 null。 */
function pickPrimaryTarget(state: GameState): Site | null {
  const targets = state.geography.sites.filter((site) => isAttackable(state, site.id))
  if (targets.length === 0) {
    return null
  }

  return targets.reduce((best, site) =>
    defenderPowerOf(state, site.id) < defenderPowerOf(state, best.id) ? site : best,
  )
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

/**
 * 从 fromId 朝 toId 走一步的落点：在自有领地范围内按跳数找最近的路。
 * 已在门口（相邻）或没有可走的自有邻地时返回 null。
 */
function stepToward(state: GameState, fromId: SiteId, toId: SiteId): SiteId | null {
  const player = state.playerFaction
  const distance = new Map<SiteId, number>([[toId, 0]])
  const queue: SiteId[] = [toId]

  while (queue.length > 0) {
    const current = queue.shift() as SiteId
    for (const neighborId of siteOf(state, current).neighbors) {
      const neighbor = siteOf(state, neighborId)
      if (distance.has(neighborId) || (neighbor.owner !== player && neighborId !== toId)) {
        continue
      }
      distance.set(neighborId, (distance.get(current) ?? 0) + 1)
      queue.push(neighborId)
    }
  }

  const from = siteOf(state, fromId)
  let best: SiteId | null = null
  let bestDistance = distance.get(fromId) ?? Number.POSITIVE_INFINITY

  for (const neighborId of from.neighbors) {
    const distanceToTarget = distance.get(neighborId)
    if (distanceToTarget !== undefined && distanceToTarget < bestDistance) {
      bestDistance = distanceToTarget
      best = neighborId
    }
  }

  return best
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

/** 就着玩家的自有领地向外看：与本方接壤、尚可一战的势力里最弱的一位；无则返回 null。 */
function warTargetOf(state: GameState): FactionId | null {
  const player = state.playerFaction
  const own = state.geography.sites.filter((site) => site.owner === player)
  const candidate = state.factions
    .filter((faction) => faction.id !== player && !areAllied(state, player, faction.id))
    .filter((faction) =>
      state.geography.sites.some(
        (site) =>
          site.owner === faction.id && own.some((base) => base.neighbors.includes(site.id)),
      ),
    )
    .sort((a, b) => factionTroops(state, a.id) - factionTroops(state, b.id))[0]

  return candidate?.id ?? null
}

/**
 * 战火由玩家的宣战点燃：开局无战事时，先收拾完无主之地，再无主可打便向一位邻邦宣战。
 * 无主之地随时可打（有守军），故不等同于开战；打尽了才需要点火。
 */
function igniteWar(state: GameState): string | null {
  const player = state.playerFaction
  if (
    state.factions.some(
      (faction) => faction.id !== player && areHostile(state, player, faction.id),
    )
  ) {
    return null
  }

  if (state.geography.sites.some((site) => site.owner === null && isAttackable(state, site.id))) {
    return null
  }

  const target = warTargetOf(state)
  if (target === null) {
    return null
  }

  const result = declareWar(state, target)
  return result.ok ? result.record.outcome : null
}

/** 跑一局固定种子的推演，返回逐季日志与最终状态。 */
function runPlaythrough(scenario: Scenario): Playthrough {
  const state = createInitialState({ scenario, seed: SEED })
  const drawRandom = createRandom(DRAW_SEED)
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
    let attacked = 0

    // 开局无战事的剧本里先宣战点火，之后各季不再重复。
    const war = igniteWar(state)
    if (war !== null) {
      actions.push(war)
    }

    if (
      !seekExhausted &&
      state.actionPoints[player] >= ACTION_COSTS.seekTalent &&
      servingCount(state, player) < 8
    ) {
      const result = seekTalent(state, drawRandom, 'jiangxia')
      if (result.ok) {
        actions.push(result.record.outcome)
      } else {
        seekExhausted = true
      }
    }

    for (let round = 0; round < 3; round += 1) {
      if (state.actionPoints[player] < ACTION_COSTS.attack) {
        break
      }

      const plans = state.geography.sites
        .filter((site) => isAttackable(state, site.id))
        .map((site) => {
          const party = bestParty(state, site.id, SAFE_MARGIN)
          return {
            site,
            party,
            power: party === null ? 0 : battlePower(partySide(state, party)),
            defence: defenderPowerOf(state, site.id),
          }
        })
        .filter((plan): plan is typeof plan & { party: AttackParty } => plan.party !== null)
        .sort((a, b) => {
          const value = SITE_VALUE[b.site.type] - SITE_VALUE[a.site.type]
          return value !== 0 ? value : a.defence - b.defence
        })

      const plan = plans[0]
      if (plan === undefined) {
        break
      }

      const result = attack(state, plan.party, plan.site.id)
      battles += 1
      attacked += 1
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

    // 打不动就先行军：没在目标门口的闲置部属，朝主攻目标挪一步（只在自有领地内走）。
    // 排在征兵与征粮之前，免得行动力被后两者吃光、主力永远凑不齐。
    if (attacked === 0 && state.actionPoints[player] >= ACTION_COSTS.transfer) {
      const primary = pickPrimaryTarget(state)
      const affordable = Math.min(
        MAX_TRANSFER_PARTY,
        Math.floor(state.actionPoints[player] / ACTION_COSTS.transfer),
      )

      const heading =
        primary === null
          ? []
          : state.characters
              .filter(
                (item) =>
                  item.status === 'serving' &&
                  item.factionId === player &&
                  !hasActedThisTurn(state, item.id) &&
                  // 已经能直接打到目标的，就地待命，不必再挪。
                  !stationAdjacentTo(state, item, primary.id),
              )
              .flatMap((item) => {
                const station = item.stationedSiteId
                if (station === null) {
                  return []
                }
                const step = stepToward(state, station, primary.id)
                return step === null ? [] : [{ item, step }]
              })
              .sort((a, b) => b.item.troops - a.item.troops)

      const destination = heading[0]?.step
      const movers = heading
        .filter((entry) => entry.step === destination)
        .slice(0, affordable)
        .map((entry) => entry.item)

      if (destination !== undefined && movers.length > 0) {
        const result = transfer(state, movers.map((item) => item.id), destination)
        if (result.ok) {
          actions.push(result.record.outcome)
        }
      }
    }

    // 一季至多征兵一次，余下的行动力交给征粮，两种行动都会跑到。
    const grainNow = state.factions.find((item) => item.id === player)?.grain ?? 0
    const recruiter =
      state.actionPoints[player] < ACTION_COSTS.recruit
        ? undefined
        : state.characters
            .filter(
              (item) =>
                item.status === 'serving' &&
                item.factionId === player &&
                !hasActedThisTurn(state, item.id) &&
                grainNow >= recruitGrainCost(item),
            )
            .sort((a, b) => b.command - a.command)[0]

    if (recruiter !== undefined) {
      const result = recruit(state, recruiter.id)
      if (result.ok) {
        actions.push(result.record.outcome)
      }
    }

    // 招人未尽时的余力用来登门：寻访到头后，仍可拜访已认得路的人，直到人满或行动力不足。
    if (servingCount(state, player) < 8 && state.actionPoints[player] >= ACTION_COSTS.visit) {
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

    // 余下的行动力全交给征粮，直到用尽或无人可派，免得日志里的行动力使用率虚低。
    while (state.actionPoints[player] >= ACTION_COSTS.harvestGrain) {
      const harvester = state.characters
        .filter(
          (item) =>
            item.status === 'serving' &&
            item.factionId === player &&
            !hasActedThisTurn(state, item.id),
        )
        .sort((a, b) => b.politics - a.politics)[0]
      if (harvester === undefined) {
        break
      }

      const result = harvestGrain(state, harvester.id)
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
