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
import { createInitialState } from '../src/core/createInitialState'
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
import type { Character, FactionId, GameState, Season, Site, SiteId, SiteType } from '../src/core/model'
import { createRandom } from '../src/core/random'
import { SANGUO_ACCEPTANCE } from '../src/core/scenarios'
import { seekTalent } from '../src/core/seekTalent'
import { advanceTurn } from '../src/core/turn'

/**
 * 迭代 5 的核心玩法推演：用无画面的规则层把「荆扬一隅」跑满若干季，
 * 输出逐季日志与汇总，供调数值后复跑对照。运行方式见 npm run acceptance。
 *
 * 推演用一个规则驱动的「玩家」代理，策略如下：
 *   寻访（前期攒人）→ 进攻（安全边际内挑价值最高者）→ 征兵（交给统率最高者）→ 征粮（交给内政最高者）
 *   → 调兵（朝最弱目标集结）。
 * 它不代表最优打法，只用来观察数值松紧与局势走向；判断「好不好玩」仍要看实玩。
 */

/** 推演参数：换种子或季数改这里。 */
const SEED = 208
/** 寻访所用抽卡流的种子，与模拟流互不干扰。 */
const DRAW_SEED = 5
/** 季数上限；敌方全部覆灭时会提前收尾。 */
const SEASONS = 40
/**
 * 进攻前要求我方战力高于守方的倍数。
 * 取 1 即「有优势就动手」：更保守的线会让代理在坚城前永远不敢开战，一路攒到上限也打不完。
 */
const SAFE_MARGIN = 1
/** 战略点的相对价值，用于在多个安全目标中择优。 */
const SITE_VALUE: Record<SiteType, number> = { city: 3, pass: 2, field: 1 }
const SEASON_LABELS: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }
/** 势力在简报里的单字标记，未列出的用势力名。 */
const FACTION_MARKS: Record<FactionId, string> = { liubei: '刘', caocao: '曹', sunquan: '孙' }

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
  /** 各势力覆灭于第几季。 */
  destroyedAt: Map<FactionId, number>
}

/** 跑一局固定种子的推演，返回逐季日志与最终状态。 */
function runPlaythrough(): Playthrough {
  const state = createInitialState({ scenario: SANGUO_ACCEPTANCE, seed: SEED })
  const drawRandom = createRandom(DRAW_SEED)
  const lines: string[] = []
  let battles = 0
  let wins = 0
  let apSpent = 0
  let apBudget = 0
  let seekExhausted = false
  const destroyedAt = new Map<FactionId, number>()

  for (let season = 0; season < SEASONS; season += 1) {
    const before = state.actionPoints
    apBudget += before
    const actions: string[] = []
    let attacked = 0
    const player = state.playerFaction

    if (
      !seekExhausted &&
      state.actionPoints >= ACTION_COSTS.seekTalent &&
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
      if (state.actionPoints < ACTION_COSTS.attack) {
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
    if (attacked === 0 && state.actionPoints >= ACTION_COSTS.transfer) {
      const primary = pickPrimaryTarget(state)
      const affordable = Math.min(
        MAX_TRANSFER_PARTY,
        Math.floor(state.actionPoints / ACTION_COSTS.transfer),
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
      state.actionPoints < ACTION_COSTS.recruit
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

    // 余下的行动力全交给征粮，直到用尽或无人可派，免得日志里的行动力使用率虚低。
    while (state.actionPoints >= ACTION_COSTS.harvestGrain) {
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

    apSpent += before - state.actionPoints
    const faction = state.factions.find((item) => item.id === player)
    lines.push(
      `第 ${state.currentTurn} 季　${dateLabel(state)}　行动力 ${before}→${state.actionPoints}　` +
        `兵力 ${factionTroops(state, player)}　粮 ${faction?.grain ?? 0}　${factionLine(state)}`,
    )
    lines.push(`　　${actions.length === 0 ? '（无行动）' : actions.join('；')}`)

    for (const other of state.factions) {
      if (other.id !== player && isFactionDestroyed(state, other.id) && !destroyedAt.has(other.id)) {
        destroyedAt.set(other.id, state.currentTurn)
      }
    }

    // 敌方尽灭就收工，不必把上限跑满。
    if (
      state.factions.every((other) => other.id === player || isFactionDestroyed(state, other.id))
    ) {
      break
    }

    advanceTurn(state)
  }

  lines.push(`　　终局版图　${territoryLine(state)}`)

  return { state, lines, battles, wins, apSpent, apBudget, destroyedAt }
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
    `行动力 ${run.apSpent}/${run.apBudget}（${Math.round((run.apSpent / run.apBudget) * 100)}%）` +
      `　战斗 ${run.battles} 场、夺取 ${run.wins} 场`,
    `覆灭势力：${destroyed.join('、') || '无'}`,
    `在野武将 ${wild} 名　退场武将 ${retired} 名`,
    `终局兵力 ${factionTroops(state, player)}　终局粮 ${state.factions.find((item) => item.id === player)?.grain ?? 0}`,
    `终局版图　${territoryLine(state)}`,
  ].join('\n')
}

test('荆扬一隅固定种子推演', () => {
  const run = runPlaythrough()
  console.log(`\n===== 核心玩法推演（荆扬一隅，种子 ${SEED}，上限 ${SEASONS} 季）=====`)
  console.log(run.lines.join('\n'))
  console.log(summarize(run))

  // 同一存档重复推演结果一致
  expect(runPlaythrough().lines).toEqual(run.lines)
  expect(run.battles).toBeGreaterThan(0)
})
