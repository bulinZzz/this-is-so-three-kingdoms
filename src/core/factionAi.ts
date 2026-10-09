import { ACTION_COSTS } from './actions'
import {
  aiAttackChallenger,
  attack,
  attackCandidates,
  battlePower,
  garrisonAt,
  isAttackable,
  partySide,
  type AttackParty,
  type DefenseChoice,
} from './battle'
import { recruitWillingCaptives } from './captives'
import {
  hasActedThisTurn,
  isFactionDestroyed,
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
import { areHostile } from './relations'
import { seekTalent } from './seekTalent'

/**
 * 其他势力的自主行动。每季按最小行为集出手，顺序为寻访 → 进攻 → 征兵：
 * 先补一名新人（新人当季即可参战），再用有余力的武将进攻，最后把剩下的行动力用于征兵。
 * 行为只走规则层既有动作，随机取自随存档落盘的模拟流，固定种子下可复现。
 */

/** 进攻前要求我方战力高于守方的倍数；取 1 即「有优势就动手」。 */
const ATTACK_MARGIN = 1
/** 战略点的相对价值，用于在多个可胜目标中择优。 */
const SITE_VALUE: Record<SiteType, number> = { city: 3, pass: 2, field: 1 }
/** 一支编成至多三人，与玩家一致。 */
const PARTY_SIZE = 3

function sitesOf(state: GameState, factionId: FactionId): Site[] {
  return state.geography.sites.filter((site) => site.owner === factionId)
}

function officersOf(state: GameState, factionId: FactionId): Character[] {
  return state.characters.filter(
    (character) => character.status === 'serving' && character.factionId === factionId,
  )
}

/** 就某目标排出编成：取可及的未行动部属中兵力最多的至多三人，统率最高者为主将。 */
function attackParty(state: GameState, targetId: string, factionId: FactionId): AttackParty | null {
  const pool = attackCandidates(state, targetId, factionId).filter(
    (character) => !hasActedThisTurn(state, character.id) && character.troops > 0,
  )
  if (pool.length === 0) {
    return null
  }

  const members = [...pool].sort((a, b) => b.troops - a.troops).slice(0, PARTY_SIZE)
  const commander = members.reduce((best, item) => (item.command > best.command ? item : best))
  const others = members.filter((item) => item.id !== commander.id)
  const party: AttackParty = { commander: commander.id }
  if (others[0] !== undefined) {
    party.deputy = others[0].id
  }
  if (others[1] !== undefined) {
    party.strategist = others[1].id
  }

  return party
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

/** 他方来攻我方时交回界面的请求：由玩家决定迎战编成与是否单挑。 */
export interface DefenseRequest {
  /** 来犯的势力。 */
  attackerId: FactionId
  /** 被攻打的我方战略点。 */
  targetSiteId: SiteId
  /** 来犯的编成。 */
  party: AttackParty
}

/**
 * 他方行动推进中交回界面的信号：先给出待应战的请求，等决定后给出这一战的战报。
 * 用生成器表达，界面据此逐次推进；无界面时一路按「不单挑」放行。
 */
export type FactionTurnSignal =
  | { kind: 'defense'; request: DefenseRequest }
  | { kind: 'battle'; report: BattleReport | null; outcome: string }

/**
 * 进攻一次：在可胜的目标中择价值最高、守备最弱者出手；无目标可打则不作声。
 * 只对敌对势力或无主战略点用兵——同盟与中立都不打。
 * 目标是我方战略点时暂停，先让界面定下迎战编成与是否单挑，再把这一战的结果交回。
 */
function* attackOnce(
  state: GameState,
  factionId: FactionId,
): Generator<FactionTurnSignal, void, DefenseChoice | null> {
  if (state.actionPoints[factionId] < ACTION_COSTS.attack) {
    return
  }

  const plans = state.geography.sites
    .filter((site) => isAttackable(state, site.id, factionId))
    .filter((site) => site.owner === null || areHostile(state, factionId, site.owner))
    .map((site) => {
      const party = attackParty(state, site.id, factionId)
      if (party === null) {
        return null
      }
      return {
        site,
        party,
        power: battlePower(partySide(state, party)),
        defence: battlePower(garrisonAt(state, site.id).side, { defending: true }),
      }
    })
    .filter((plan): plan is NonNullable<typeof plan> => plan !== null)
    .filter((plan) => plan.power > plan.defence * ATTACK_MARGIN)
    .sort((a, b) => {
      const value = SITE_VALUE[b.site.type] - SITE_VALUE[a.site.type]
      return value !== 0 ? value : a.defence - b.defence
    })

  const plan = plans[0]
  if (plan === undefined) {
    return
  }

  // 他方也会主动提单挑：武力占优、性格好斗时出手，力量接近时看运气。
  const duelRandom = createRandom(state.randomState)
  const challenger = aiAttackChallenger(state, plan.party, plan.site.id, duelRandom)
  state.randomState = duelRandom.getState()
  const party = challenger === null ? plan.party : { ...plan.party, challenger }

  if (plan.site.owner !== state.playerFaction) {
    attack(state, party, plan.site.id, factionId)
    return
  }

  const decision = yield {
    kind: 'defense',
    request: { attackerId: factionId, targetSiteId: plan.site.id, party },
  }
  const result = attack(state, party, plan.site.id, factionId, decision)
  yield {
    kind: 'battle',
    report: result.ok ? result.record.battle ?? null : null,
    outcome: result.ok ? result.record.outcome : result.reason,
  }
}

/** 把余下的行动力用于征兵，直到用尽、无人可补或粮尽。 */
function recruitUntilExhausted(state: GameState, factionId: FactionId): void {
  while (state.actionPoints[factionId] >= ACTION_COSTS.recruit) {
    const grain = state.factions.find((faction) => faction.id === factionId)?.grain ?? 0
    const candidate = officersOf(state, factionId)
      .filter(
        (character) =>
          !hasActedThisTurn(state, character.id) &&
          character.troops < troopLimit(character) &&
          grain >= recruitGrainCost(character),
      )
      .sort((a, b) => b.command - a.command)[0]

    if (candidate === undefined || !recruit(state, candidate.id, factionId).ok) {
      return
    }
  }
}

/** 一个势力的一季行动。 */
function* runFactionTurn(
  state: GameState,
  factionId: FactionId,
): Generator<FactionTurnSignal, void, DefenseChoice | null> {
  // 营中已到「愿降」档的俘虏先行归附，本季即可出力。
  recruitWillingCaptives(state, factionId)
  seekOnce(state, factionId)
  yield* attackOnce(state, factionId)
  recruitUntilExhausted(state, factionId)
}

/**
 * 其他势力依次行动：玩家势力由界面在回合内操作，不在此列，已覆灭者不再出手。
 * 攻打我方时暂停并交回请求，等界面定下迎战编成与是否单挑后再继续。
 */
export function* factionTurnStream(
  state: GameState,
): Generator<FactionTurnSignal, void, DefenseChoice | null> {
  for (const faction of state.factions) {
    if (faction.id === state.playerFaction || isFactionDestroyed(state, faction.id)) {
      continue
    }
    yield* runFactionTurn(state, faction.id)
  }
}

/** 其他势力依次行动，无人接手时按「不单挑」把每一次来犯一并结算。 */
export function runFactionTurns(state: GameState): void {
  const stream = factionTurnStream(state)

  while (!stream.next(null).done) {
    // 每次都按不单挑放行，直到回合的行动跑完。
  }
}
