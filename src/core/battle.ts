import { runAction, type ActionResult } from './actions'
import { resolveProvinceOwners } from './geography'
import { hasActedThisTurn, markActed, officerBlockedReason } from './military'
import type { Character, CharacterId, GameState, Site, SiteId } from './model'
import { createRandom, type Random } from './random'

/** 士气满值。 */
export const MORALE_FULL = 100

// 以下战力参数均为暂定，待核心玩法验证后调整，最终数值记入《游戏机制》。
/** 每点智谋带来的战力系数增量。 */
const INTELLECT_POWER_PER_POINT = 0.005
/** 士气为 0 时的战力系数；士气满值时系数为 1。 */
const MORALE_POWER_FLOOR = 0.5
/** 防守方战力补正。 */
const DEFENSE_BONUS = 1.2
/** 战力随机波动幅度，双方各在 1±此值 之间。 */
const POWER_VARIANCE = 0.1
/** 败方与胜方的伤亡率。 */
const LOSER_CASUALTY_RATE = 0.6
const WINNER_CASUALTY_RATE = 0.2
/** 已行动的守军在防守时只计的兵力比例。 */
const ACTED_DEFENDER_RATIO = 0.5
/** 单挑的士气增减。 */
const DUEL_MORALE_DELTA = 10
/** 单挑判定时叠加在武力上的随机幅度。 */
const DUEL_RANDOM_SPAN = 20

function clampMorale(morale: number): number {
  return Math.max(0, Math.min(MORALE_FULL, morale))
}

/** 智谋换算得到的战力系数。 */
function intellectFactor(intellect: number): number {
  return 1 + intellect * INTELLECT_POWER_PER_POINT
}

/** 士气换算得到的战力系数。 */
function moraleFactor(morale: number): number {
  return MORALE_POWER_FLOOR + (1 - MORALE_POWER_FLOOR) * (morale / MORALE_FULL)
}

/** 一次战力随机波动。 */
function variance(random: Random): number {
  return 1 - POWER_VARIANCE + random.next() * 2 * POWER_VARIANCE
}

/** 参战一方的战力要素。 */
export interface BattleSide {
  troops: number
  intellect: number
  morale: number
}

/** 一方的战力（不含随机波动）：兵力 × 智谋加成 × 士气系数，防守方再乘防守补正。 */
export function battlePower(side: BattleSide, options: { defending?: boolean } = {}): number {
  const base = side.troops * intellectFactor(side.intellect) * moraleFactor(side.morale)

  return options.defending === true ? base * DEFENSE_BONUS : base
}

/** 一次伤亡结算后的兵力。 */
function applyLoss(troops: number, rate: number): number {
  return Math.max(0, Math.round(troops * (1 - rate)))
}

/** 某据点上该据点归属势力的守军。 */
function defendersAt(state: GameState, site: Site): Character[] {
  return state.characters.filter(
    (character) =>
      character.status === 'serving' &&
      character.factionId === site.owner &&
      character.stationedSiteId === site.id,
  )
}

/** 某据点守军的有效兵力：已行动的守将只计半数。无主据点没有守军。 */
export function effectiveDefenderTroops(state: GameState, siteId: SiteId): number {
  const site = state.geography.sites.find((item) => item.id === siteId)
  if (site === undefined) {
    return 0
  }

  return defendersAt(state, site).reduce(
    (total, character) =>
      total +
      character.troops * (hasActedThisTurn(state, character.id) ? ACTED_DEFENDER_RATIO : 1),
    0,
  )
}

/** 据点失守后，原守军撤往相邻的自有据点；无路可退者被俘。 */
function retreatOrCapture(
  state: GameState,
  defenders: readonly Character[],
  target: Site,
  random: Random,
): void {
  for (const defender of defenders) {
    const refuges = state.geography.sites.filter(
      (site) =>
        site.id !== target.id &&
        site.owner === defender.factionId &&
        target.neighbors.includes(site.id),
    )

    if (refuges.length === 0) {
      defender.status = 'captured'
      defender.factionId = null
      defender.stationedSiteId = null
      defender.troops = 0
      continue
    }

    const refuge = refuges[Math.floor(random.next() * refuges.length)]
    defender.stationedSiteId = refuge.id
  }
}

/**
 * 进攻相邻的一个他方或无主据点，自动结算。
 * 攻方战力取投入兵力 × 智谋加成 × 士气系数，守方再乘防守补正；
 * 胜则据点归攻方、部队前移进驻，败则退回原驻地并受损。随机数取自随存档落盘的模拟流。
 */
export function attack(state: GameState, attackerId: CharacterId, targetSiteId: SiteId): ActionResult {
  const attacker = state.characters.find((item) => item.id === attackerId) ?? null
  const target = state.geography.sites.find((item) => item.id === targetSiteId) ?? null
  const random = createRandom(state.randomState)

  return runAction(state, {
    kind: 'attack',
    precondition: (current) => {
      const blocked = officerBlockedReason(current, attacker)
      if (blocked !== null) {
        return blocked
      }
      if (target === null) {
        return '目标据点不存在'
      }
      if (target.owner === current.playerFaction) {
        return '目标已是自有据点'
      }

      const station = current.geography.sites.find((site) => site.id === attacker?.stationedSiteId)
      if (station === undefined || !station.neighbors.includes(targetSiteId)) {
        return '目标与驻地不相邻'
      }
      if (hasActedThisTurn(current, attackerId)) {
        return '该武将本回合已行动'
      }
      if (attacker === null || attacker.troops <= 0) {
        return '该武将没有兵力'
      }
      return null
    },
    execute: (current) => {
      if (attacker === null || target === null) {
        return { outcome: '进攻未生效' }
      }

      const defenders = defendersAt(current, target)
      const commander = defenders.reduce<Character | null>(
        (best, item) => (best === null || item.command > best.command ? item : best),
        null,
      )
      const defenderPower =
        battlePower(
          {
            troops: effectiveDefenderTroops(current, target.id),
            intellect: commander?.intellect ?? 0,
            morale: commander?.morale ?? MORALE_FULL,
          },
          { defending: true },
        ) * variance(random)
      const attackerPower =
        battlePower({
          troops: attacker.troops,
          intellect: attacker.intellect,
          morale: attacker.morale,
        }) * variance(random)

      const attackerWins = defenderPower <= 0 || attackerPower > defenderPower
      const undefended = defenderPower <= 0

      if (attackerWins) {
        if (!undefended) {
          attacker.troops = applyLoss(attacker.troops, WINNER_CASUALTY_RATE)
          for (const defender of defenders) {
            defender.troops = applyLoss(defender.troops, LOSER_CASUALTY_RATE)
          }
        }
        target.owner = current.playerFaction
        attacker.stationedSiteId = target.id
        retreatOrCapture(current, defenders, target, random)
        resolveProvinceOwners(current.geography)
      } else {
        attacker.troops = applyLoss(attacker.troops, LOSER_CASUALTY_RATE)
        for (const defender of defenders) {
          defender.troops = applyLoss(defender.troops, WINNER_CASUALTY_RATE)
        }
      }

      markActed(current, attackerId)
      current.randomState = random.getState()

      return {
        targetId: target.id,
        outcome: attackerWins ? `攻占 ${target.name}` : `进攻 ${target.name} 失利`,
      }
    },
  })
}

/** 单挑结果。 */
export interface DuelResult {
  /** 对方是否拒绝应战。 */
  refused: boolean
  /** 应战时的胜者；拒战时为 null。 */
  winnerId: CharacterId | null
  outcome: string
}

/**
 * 单挑结算：对方拒战则其士气下降；应战则按武力加随机定胜负，胜者士气上升、败者下降。
 * 致阵亡留待迭代 7。提出与应战由界面决定，规则层只做结算。
 */
export function duel(
  state: GameState,
  challengerId: CharacterId,
  defenderId: CharacterId,
  defenderAccepts: boolean,
): DuelResult {
  const challenger = state.characters.find((item) => item.id === challengerId) ?? null
  const defender = state.characters.find((item) => item.id === defenderId) ?? null

  if (challenger === null || defender === null) {
    return { refused: false, winnerId: null, outcome: '单挑无法进行' }
  }

  if (!defenderAccepts) {
    defender.morale = clampMorale(defender.morale - DUEL_MORALE_DELTA)
    return { refused: true, winnerId: null, outcome: `${defender.name} 拒战，士气下降` }
  }

  const random = createRandom(state.randomState)
  const challengerScore = challenger.might + random.next() * DUEL_RANDOM_SPAN
  const defenderScore = defender.might + random.next() * DUEL_RANDOM_SPAN
  state.randomState = random.getState()

  const winner = challengerScore >= defenderScore ? challenger : defender
  const loser = winner === challenger ? defender : challenger
  winner.morale = clampMorale(winner.morale + DUEL_MORALE_DELTA)
  loser.morale = clampMorale(loser.morale - DUEL_MORALE_DELTA)

  return { refused: false, winnerId: winner.id, outcome: `${winner.name} 单挑胜` }
}
