import { ACTION_COSTS } from './actions'
import {
  autoBattle,
  autoFormation,
  canAttackTarget,
  defenderCandidates,
  finishBattle,
  isAttackable,
  openAttack,
  SITE_DEFENSE_BONUS,
  type BattleState,
} from './battle'
import { recruitWillingCaptives } from './captives'
import { scopeSitesFor } from './characters'
import { ALLIANCE_FAVOR, alliance } from './diplomacy'
import { granaryOf } from './granary'
import { estimateOf } from './intelligence'
import {
  attackGrainCost,
  harvestGrain,
  hasActedThisTurn,
  isFactionDestroyed,
  readyOfficers,
  recruit,
  recruitGrainCost,
  troopLimit,
} from './military'
import type {
  BattleReport,
  Character,
  FactionId,
  GameState,
  Site,
  SiteId,
  SiteType,
} from './model'
import { createRandom } from './random'
import { favorBetween, relationBetween } from './relations'
import { seekTalent } from './seekTalent'

/**
 * 其他势力的自主行动。每季按最小行为集出手，顺序为寻访 → 外交 → 征粮 → 进攻 → 征兵：
 * 先补一名新人，再看要不要结盟，粮仓见底则派人征粮，
 * 然后用有余力的武将进攻，最后把剩下的行动力用于征兵；营中「愿降」的俘虏在出手之初先行归附。
 * 进攻只打已宣战的势力——全图没有无主战略点，也没有中立可攻的目标。
 * 行为只走规则层既有动作，随机取自随存档落盘的模拟流，固定种子下可复现。
 * 他方守成：不自行向中立势力宣战，点火改由玩家的宣战；对别人只知大概——
 * 进攻所据的对方实力都是估计值（见 intelligence），判断因此不是定数。
 */

/** 进攻前要求我方投入兵力高于守方估计的倍数；取 1 即「有优势就动手」。 */
const ATTACK_MARGIN = 1
/** 战略点的相对价值，用于在多个可胜目标中择优。 */
const SITE_VALUE: Record<SiteType, number> = { metropolis: 4, city: 3, town: 2, pass: 2, field: 1 }
/** 一支出征编成至多三人。 */
const PARTY_SIZE = 3

function sitesOf(state: GameState, factionId: FactionId): Site[] {
  return state.geography.sites.filter((site) => site.owner === factionId)
}

/** 就某目标排出出征者：活动范围及于目标、有兵、未行动、未驻守的部属，按名册次序取至多三人。 */
function attackParty(state: GameState, targetId: string, factionId: FactionId): Character[] {
  if (!isAttackable(state, targetId, factionId)) {
    return []
  }

  return state.characters
    .filter(
      (character) =>
        character.status === 'serving' &&
        character.factionId === factionId &&
        character.stationedSiteId === null &&
        character.troops > 0 &&
        !character.isMonarch &&
        !hasActedThisTurn(state, character.id) &&
        canAttackTarget(state, character, targetId, factionId),
    )
    .slice(0, PARTY_SIZE)
}

/** 守方的估计兵力：该点可出战的守将之和，再按据点补正放大。 */
function defenceEstimate(state: GameState, site: Site): number {
  if (site.owner === null) {
    return 0
  }
  const troops = defenderCandidates(state, site.id, site.owner).reduce(
    (total, character) => total + character.troops,
    0,
  )

  return troops * (1 + SITE_DEFENSE_BONUS[site.type])
}

/** 在该势力的自有战略点寻访一次；成功则返回真。 */
function seekOnce(state: GameState, factionId: FactionId): boolean {
  if (state.actionPoints[factionId] < ACTION_COSTS.seekTalent) {
    return false
  }

  const random = createRandom(state.randomState)
  for (const site of sitesOf(state, factionId)) {
    const result = seekTalent(state, random, site.id, factionId)
    if (result.ok) {
      state.randomState = random.getState()
      return true
    }
  }

  return false
}

/** 他方来攻我方时交回界面的请求：由玩家布阵并指挥这一战。 */
export interface DefenseRequest {
  /** 来犯的势力。 */
  attackerId: FactionId
  /** 被攻打的我方战略点。 */
  targetSiteId: SiteId
  /** 已排好攻方阵形的战斗，守方尚未布阵。 */
  battle: BattleState
}

/**
 * 他方行动推进中交回界面的信号：先给出待布阵的来犯，玩家打完后给出这一战的战报。
 * 用生成器表达，界面据此逐次推进；无界面时一路按自动布阵推演。
 */
export type FactionTurnSignal =
  | { kind: 'defense'; request: DefenseRequest }
  | { kind: 'battle'; report: BattleReport | null; outcome: string }

/**
 * 进攻一次：在可胜的目标中择价值最高、守备最弱者出手；无目标可打则不作声。
 * 只对已宣战的势力用兵。目标是我方战略点时暂停，先让界面排出守将并打完这一战。
 */
function* attackOnce(
  state: GameState,
  factionId: FactionId,
): Generator<FactionTurnSignal, void, BattleState | null> {
  if (state.actionPoints[factionId] < ACTION_COSTS.attack) {
    return
  }

  const grain = state.factions.find((item) => item.id === factionId)?.grain ?? 0
  const random = createRandom(state.randomState)
  const plans = state.geography.sites
    .filter((site) => isAttackable(state, site.id, factionId))
    .map((site) => {
      const members = attackParty(state, site.id, factionId)
      if (members.length === 0) {
        return null
      }
      const troops = members.reduce((total, member) => total + member.troops, 0)
      return {
        site,
        members,
        troops,
        cost: attackGrainCost(troops),
        // 守军的实力无从确知：按估计值来比，我方也就有判断失误的余地。
        defence: estimateOf(defenceEstimate(state, site), random),
      }
    })
    .filter((plan): plan is NonNullable<typeof plan> => plan !== null)
    .filter((plan) => plan.troops > plan.defence * ATTACK_MARGIN)
    // 出征用粮由前置条件把关；此处先滤掉出不起兵的，免得挑中一个打不成的目标。
    .filter((plan) => plan.cost <= grain)
    .sort((a, b) => {
      const value = SITE_VALUE[b.site.type] - SITE_VALUE[a.site.type]
      return value !== 0 ? value : a.defence - b.defence
    })

  const plan = plans[0]
  if (plan === undefined) {
    state.randomState = random.getState()
    return
  }
  state.randomState = random.getState()

  const playerDefends = plan.site.owner === state.playerFaction
  const opened = openAttack(
    state,
    plan.site.id,
    autoFormation(plan.members),
    factionId,
    // 玩家守土时留给他布阵；无人可守则开战即已不战而下。
    { autoDefender: !playerDefends },
  )
  if (!opened.ok) {
    return
  }

  let battle = opened.battle
  // 玩家守土时一律交回界面：即使无人可守、开战即已不战而下，也让界面把失守呈现出来。
  if (playerDefends) {
    const answer = yield {
      kind: 'defense',
      request: { attackerId: factionId, targetSiteId: plan.site.id, battle },
    }
    battle = answer ?? battle
  }
  if (!battle.finished) {
    autoBattle(battle)
  }

  const result = finishBattle(state, battle)
  yield {
    kind: 'battle',
    report: result.ok ? result.record.battle ?? null : null,
    outcome: result.ok ? result.record.outcome : result.reason,
  }
}

/**
 * 外交一步：只与中立势力往来——同盟与敌对不改动。
 * 好感高且行动力够则提议结盟，否则静默；他方不自行宣战，点火改由玩家的宣战。
 */
function diplomacyOnce(state: GameState, factionId: FactionId): void {
  for (const other of state.factions) {
    if (other.id === factionId || relationBetween(state, factionId, other.id) !== 'neutral') {
      continue
    }
    if (
      favorBetween(state, factionId, other.id) >= ALLIANCE_FAVOR &&
      alliance(state, other.id, factionId).ok
    ) {
      return
    }
  }
}

/** 把余下的行动力用于征兵，直到用尽、无人可补、粮尽或人口已枯。 */
function recruitUntilExhausted(state: GameState, factionId: FactionId): void {
  while (state.actionPoints[factionId] >= ACTION_COSTS.recruit) {
    const grain = state.factions.find((faction) => faction.id === factionId)?.grain ?? 0
    const candidates = readyOfficers(state, factionId)
      .filter(
        (character) =>
          character.troops < troopLimit(character) &&
          grain >= recruitGrainCost(character),
      )
      .sort((a, b) => b.command - a.command)

    let recruited = false
    for (const candidate of candidates) {
      const site = sitesOf(state, factionId)
        .filter(
          (item) =>
            scopeSitesFor(state, candidate).includes(item.id) &&
            item.population >= 1,
        )
        .sort((a, b) => b.population - a.population)[0]

      if (site === undefined) {
        continue
      }
      if (recruit(state, site.id, candidate.id, factionId).ok) {
        recruited = true
        break
      }
    }

    if (!recruited) {
      return
    }
  }
}

/** 粮仓低于此数，他方即派内政最高的部属征粮，先把底子垫起来再去征兵。 */
const AI_GRAIN_RESERVE = 3000

/** 缺粮时征一次粮：派内政最高、有兵的部属到存粮最多的自有战略点征收。 */
function harvestOnce(state: GameState, factionId: FactionId): void {
  const grain = state.factions.find((faction) => faction.id === factionId)?.grain ?? 0
  if (grain >= AI_GRAIN_RESERVE || state.actionPoints[factionId] < ACTION_COSTS.harvestGrain) {
    return
  }

  const sitePool = sitesOf(state, factionId).filter((item) => granaryOf(item) > 0)
  const candidate = readyOfficers(state, factionId)
    .filter(
      (character) =>
        character.troops > 0 &&
        sitePool.some((item) => scopeSitesFor(state, character).includes(item.id)),
    )
    .sort((a, b) => b.politics - a.politics)[0]
  const site =
    candidate === undefined
      ? undefined
      : sitePool
          .filter((item) => scopeSitesFor(state, candidate).includes(item.id))
          .sort((a, b) => granaryOf(b) - granaryOf(a))[0]

  if (candidate === undefined || site === undefined) {
    return
  }

  harvestGrain(state, site.id, candidate.id, factionId)
}

/** 一个势力的一季行动。 */
function* runFactionTurn(
  state: GameState,
  factionId: FactionId,
): Generator<FactionTurnSignal, void, BattleState | null> {
  // 营中已到「愿降」档的俘虏先行归附，本季即可出力。
  recruitWillingCaptives(state, factionId)
  seekOnce(state, factionId)
  diplomacyOnce(state, factionId)
  harvestOnce(state, factionId)
  yield* attackOnce(state, factionId)
  recruitUntilExhausted(state, factionId)
}

/**
 * 其他势力依次行动：玩家势力由界面在回合内操作，不在此列，已覆灭者不再出手。
 * 攻打我方时暂停并交回请求，等玩家布阵打完后再继续。
 */
export function* factionTurnStream(
  state: GameState,
): Generator<FactionTurnSignal, void, BattleState | null> {
  for (const faction of state.factions) {
    if (faction.id === state.playerFaction || isFactionDestroyed(state, faction.id)) {
      continue
    }
    yield* runFactionTurn(state, faction.id)
  }
}

/** 其他势力依次行动，无人接手时把每一次来犯一并自动推演到底。 */
export function runFactionTurns(state: GameState): void {
  const stream = factionTurnStream(state)
  let step = stream.next(null)
  while (!step.done) {
    step = stream.next(null)
  }
}
