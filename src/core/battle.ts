import { runAction, type ActionResult } from './actions'
import { absorbCaptives, attitudeOf, takeCaptive } from './captives'
import { resolveProvinceOwners } from './geography'
import { LOYALTY_LOSS, loseLoyalty, maybeDefect, wildTierFor } from './loyalty'
import {
  hasActedThisTurn,
  isFactionDestroyed,
  markActed,
  officerBlockedReason,
  stationAdjacentTo,
} from './military'
import type {
  BattleReport,
  CaptiveReport,
  Character,
  CharacterId,
  FactionId,
  GameState,
  Site,
  SiteId,
} from './model'
import { createRandom, type Random } from './random'
import { areAllied } from './relations'

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
/** 败方与胜方的伤亡率。败方不宜过重：一次攻城失利若打残主力，整局会一蹶不振。 */
const LOSER_CASUALTY_RATE = 0.3
const WINNER_CASUALTY_RATE = 0.2
/** 已行动的守军在防守时只计的兵力比例。 */
const ACTED_DEFENDER_RATIO = 0.5
/** 迎战守军的至多人数，与攻方编成同宽。 */
const GARRISON_SIZE = 3
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

/** 某战略点上该战略点归属势力的守军。 */
function defendersAt(state: GameState, site: Site): Character[] {
  return state.characters.filter(
    (character) =>
      character.status === 'serving' &&
      character.factionId === site.owner &&
      character.stationedSiteId === site.id,
  )
}

/** 守军的迎战编成：至多三名武将，与攻方同构。 */
export interface Garrison {
  /** 迎战的三名武将，按兵力由多到少；无守军时为空。 */
  members: Character[]
  /** 迎战兵力的战力要素；兵力为三人之和，已行动者只计半数。 */
  side: BattleSide
}

/**
 * 某战略点的迎战守军：从守军中取兵力最多的三人，其中统率最高者为主将、智谋最高者为军师。
 * 败军退守会让一处战略点的守军越堆越多，只三人迎战才不会让最后一城无止境地变强；
 * 与攻方同为至多三人，双方兵力增长的口径才对等。无主或无人驻守时兵力为零。
 */
export function garrisonAt(state: GameState, siteId: SiteId): Garrison {
  const site = state.geography.sites.find((item) => item.id === siteId)
  const members =
    site === undefined
      ? []
      : defendersAt(state, site)
          .sort((a, b) => b.troops - a.troops)
          .slice(0, GARRISON_SIZE)

  if (members.length === 0) {
    return { members, side: { troops: 0, intellect: 0, morale: MORALE_FULL } }
  }

  const commander = members.reduce((best, item) => (item.command > best.command ? item : best))
  const strategist = members.reduce((best, item) => (item.intellect > best.intellect ? item : best))

  return {
    members,
    side: {
      troops: members.reduce(
        (total, member) =>
          total + member.troops * (hasActedThisTurn(state, member.id) ? ACTED_DEFENDER_RATIO : 1),
        0,
      ),
      intellect: strategist.intellect,
      morale: commander.morale,
    },
  }
}

/** 守军失守后的初次去向：被俘者再由招降判定细分。 */
type InitialFate = 'flee' | 'die' | 'capture'

/** 去向权重：多数逃亡，少数被俘，战死最少。具体行为留待迭代 7 细化。 */
const FLEE_CHANCE = 0.75
const DIE_CHANCE = 0.1

/** 按权重抽取一种初次去向。 */
function rollFate(random: Random): InitialFate {
  const roll = random.next()
  if (roll < FLEE_CHANCE) {
    return 'flee'
  }

  return roll < FLEE_CHANCE + DIE_CHANCE ? 'die' : 'capture'
}

/** 逃亡的去处：优先相邻的自有战略点；本势力在别处还有城池时也可远走，都没有则无处可逃。 */
function fleeRefuges(state: GameState, defender: Character, target: Site): Site[] {
  const friendly = state.geography.sites.filter(
    (site) => site.id !== target.id && site.owner === defender.factionId,
  )
  const adjacent = friendly.filter((site) => target.neighbors.includes(site.id))

  return adjacent.length > 0 ? adjacent : friendly
}

/** 势力名；查不到时退回标识。 */
function factionName(state: GameState, factionId: FactionId | null): string {
  return state.factions.find((faction) => faction.id === factionId)?.name ?? factionId ?? ''
}

/** 退场：脱离势力与驻地，兵力归零。 */
function retire(character: Character): void {
  character.status = 'retired'
  character.factionId = null
  character.stationedSiteId = null
  character.troops = 0
}

/**
 * 战略点失守后结算每名守军的去向：逃亡、战死、被俘三者按权重判定，任何战略点都一样，
 * 势力覆灭的那一战也不例外；君主只在本势力尚未覆灭时必定逃亡。
 * 逃亡者撤往自有的战略点；本势力再无城池可投（此战即覆灭）时，流落为在野，将来可以复起。
 * 被俘者按其对俘获方的偏好与自身忠诚判定：归附则入仕俘获方、驻守刚夺下的战略点，不屈则退场；
 * 君主不事二主，必不屈。返回去向说明与俘虏结局，前者写入行动记录，后者供战报展示。
 */
function resolveDefenders(
  state: GameState,
  defenders: readonly Character[],
  target: Site,
  captorId: FactionId,
  random: Random,
): { fates: string[]; captives: CaptiveReport[] } {
  const fates: string[] = []
  const captives: CaptiveReport[] = []
  const captorName = factionName(state, captorId)

  for (const defender of defenders) {
    const refuges = fleeRefuges(state, defender, target)
    const doomed = refuges.length === 0
    const fate: InitialFate = defender.isMonarch && !doomed ? 'flee' : rollFate(random)

    if (fate === 'flee') {
      if (!doomed) {
        const refuge = refuges[Math.floor(random.next() * refuges.length)]
        defender.stationedSiteId = refuge.id
        // 失守受挫：忠诚下降；低到阈值以下者就此离走，不再只是换个驻地。
        loseLoyalty(defender, LOYALTY_LOSS.siteLost)
        fates.push(maybeDefect(state, defender, '失守') ?? `${defender.name} 撤往${refuge.name}`)
        continue
      }

      // 势力已覆灭，逃亡者流落为在野，若干年后还可以被寻访、复起。
      defender.status = 'wild'
      defender.factionId = null
      defender.stationedSiteId = null
      defender.troops = 0
      defender.loyalty = 0
      // 回归在野者的卡池层级按能力给。
      defender.tier = wildTierFor(defender)
      fates.push(`${defender.name} 流落为在野`)
      continue
    }

    if (fate === 'die') {
      retire(defender)
      fates.push(`${defender.name} 战死`)
      continue
    }

    // 被俘：一律进俘获方的俘虏营，能否归附由此后的劝降决定。
    const record = takeCaptive(state, defender, captorId)
    fates.push(`${defender.name} 被俘，入${captorName}营`)
    captives.push({
      name: defender.name,
      formerFaction: factionName(state, record.formerFactionId),
      attitude: attitudeOf(record.will),
    })
  }

  return { fates, captives }
}

/** 该战略点是否为指定势力可进攻的目标：非自有、非同同盟，且至少有一个自有战略点与它相邻。缺省按玩家势力评判。 */
export function isAttackable(
  state: GameState,
  targetSiteId: SiteId,
  factionId: FactionId = state.playerFaction,
): boolean {
  const target = state.geography.sites.find((site) => site.id === targetSiteId)
  if (target === undefined || target.owner === factionId) {
    return false
  }
  if (target.owner !== null && areAllied(state, factionId, target.owner)) {
    return false
  }

  return state.geography.sites.some(
    (site) => site.owner === factionId && site.neighbors.includes(target.id),
  )
}

/**
 * 进攻某战略点的候选部属：驻守在与目标相邻的自有战略点的人。
 * 已行动或无兵者也在列，由界面标注为不可选。缺省按玩家势力取候选。
 */
export function attackCandidates(
  state: GameState,
  targetSiteId: SiteId,
  factionId: FactionId = state.playerFaction,
): Character[] {
  const target = state.geography.sites.find((site) => site.id === targetSiteId)
  if (target === undefined || target.owner === factionId) {
    return []
  }
  if (target.owner !== null && areAllied(state, factionId, target.owner)) {
    return []
  }

  return state.characters.filter(
    (character) =>
      officerBlockedReason(state, character, factionId) === null &&
      stationAdjacentTo(state, character, targetSiteId),
  )
}

/** 进攻的部队编成：主将必选，副将与军师可选；军师提供智谋加成。 */
export interface AttackParty {
  commander: CharacterId
  deputy?: CharacterId | null
  strategist?: CharacterId | null
}

/** 编成中的全部武将标识。 */
function partyIds(party: AttackParty): CharacterId[] {
  return [party.commander, party.deputy ?? null, party.strategist ?? null].filter(
    (id): id is CharacterId => id !== null,
  )
}

/**
 * 一支编成的战力要素：兵力为主将、副将与军师之和，士气取主将，
 * 智谋取三人中最高者——与守军的口径一致，不因没指定军师而吃亏。
 */
export function partySide(state: GameState, party: AttackParty): BattleSide {
  const members = partyIds(party)
    .map((id) => state.characters.find((item) => item.id === id))
    .filter((item): item is Character => item !== undefined)
  const commander = state.characters.find((item) => item.id === party.commander)

  return {
    troops: members.reduce((total, member) => total + member.troops, 0),
    intellect: members.reduce((best, member) => Math.max(best, member.intellect), 0),
    morale: commander?.morale ?? MORALE_FULL,
  }
}

/**
 * 合攻相邻的一个他方或无主战略点，自动结算。
 * 主将、副将与军师的兵力合计为投入兵力，智谋加成取三人中最高者，
 * 士气取主将，守方再乘防守补正。胜则战略点归攻方、参战部队一同前移进驻，
 * 败则各自退回原驻地并受损。随机数取自随存档落盘的模拟流。
 */
export function attack(
  state: GameState,
  party: AttackParty,
  targetSiteId: SiteId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const ids = partyIds(party)
  const members = ids
    .map((id) => state.characters.find((item) => item.id === id))
    .filter((item): item is Character => item !== undefined)
  const commander = state.characters.find((item) => item.id === party.commander) ?? null
  const target = state.geography.sites.find((item) => item.id === targetSiteId) ?? null
  const random = createRandom(state.randomState)

  return runAction(state, {
    kind: 'attack',
    factionId,
    precondition: (current) => {
      if (target === null) {
        return '目标战略点不存在'
      }
      if (target.owner === factionId) {
        return '目标已是自有战略点'
      }
      if (target.owner !== null && areAllied(current, factionId, target.owner)) {
        return '与对方同盟，不能进攻'
      }
      if (commander === null) {
        return '必须指定主将'
      }
      if (members.length !== ids.length) {
        return '编成中有武将不存在'
      }
      if (new Set(ids).size !== ids.length) {
        return '主将、副将与军师不能是同一人'
      }

      for (const member of members) {
        const blocked = officerBlockedReason(current, member, factionId)
        if (blocked !== null) {
          return blocked
        }
        if (member.troops <= 0) {
          return `${member.name} 没有兵力`
        }
        if (hasActedThisTurn(current, member.id)) {
          return `${member.name} 本回合已行动`
        }
        if (!stationAdjacentTo(current, member, targetSiteId)) {
          return `${member.name} 的驻地与目标不相邻`
        }
      }
      return null
    },
    execute: (current) => {
      if (target === null || commander === null || members.length === 0) {
        return { outcome: '进攻未生效' }
      }

      const side = partySide(current, party)
      const generalNames = members.map((member) => member.name).join('、')

      const defenders = defendersAt(current, target)
      const garrison = garrisonAt(current, target.id)
      const defenderPower = battlePower(garrison.side, { defending: true }) * variance(random)
      const attackerPower = battlePower(side) * variance(random)

      const attackerWins = defenderPower <= 0 || attackerPower > defenderPower
      const undefended = defenderPower <= 0

      /*
       * 伤亡率在改动兵力之前算出：战报里的伤亡不随后续的撤退、被俘而变，
       * 剩余兵力也只反映战损，不含败退无路被俘者。
       * 胜方伤亡随双方战力比缩放：碾压局几乎不流血，势均力敌才损两成；败方固定四成。
       * 战力取上一步已含随机浮动的实际值。
       */
      const winnerLossRate = (winnerPower: number, loserPower: number): number =>
        WINNER_CASUALTY_RATE * Math.min(1, loserPower / winnerPower)
      const attackerLossRate = attackerWins
        ? undefended
          ? 0
          : winnerLossRate(attackerPower, defenderPower)
        : LOSER_CASUALTY_RATE
      const defenderLossRate = attackerWins
        ? LOSER_CASUALTY_RATE
        : winnerLossRate(defenderPower, attackerPower)
      const losses = (troops: number, rate: number): number => troops - applyLoss(troops, rate)
      const attackerCasualties = members.reduce(
        (total, member) => total + losses(member.troops, attackerLossRate),
        0,
      )
      const defenderCommander = garrison.members.reduce<Character | null>(
        (best, item) => (best === null || item.command > best.command ? item : best),
        null,
      )
      const defenderTroops = garrison.members.reduce((total, item) => total + item.troops, 0)
      const defenderCasualties = garrison.members.reduce(
        (total, item) => total + losses(item.troops, defenderLossRate),
        0,
      )
      const report: BattleReport = {
        siteName: target.name,
        undefended,
        attackerWins,
        attacker: {
          commander: commander.name,
          officers: members.map((member) => member.name),
          troops: side.troops,
          power: Math.round(attackerPower),
          casualties: attackerCasualties,
          remaining: side.troops - attackerCasualties,
        },
        defender: {
          commander: defenderCommander?.name ?? '',
          officers: garrison.members.map((item) => item.name),
          troops: defenderTroops,
          power: Math.round(defenderPower),
          casualties: defenderCasualties,
          remaining: defenderTroops - defenderCasualties,
        },
        captives: [],
      }

      let defenderFates: string[] = []
      let absorbedNotes: string[] = []

      if (attackerWins) {
        if (!undefended) {
          for (const member of members) {
            member.troops = applyLoss(member.troops, attackerLossRate)
          }
          for (const defender of garrison.members) {
            defender.troops = applyLoss(defender.troops, defenderLossRate)
          }
        }
        const previousOwner = target.owner
        target.owner = factionId
        for (const member of members) {
          member.stationedSiteId = target.id
        }
        const captured = resolveDefenders(current, defenders, target, factionId, random)
        defenderFates = captured.fates
        report.captives = captured.captives
        resolveProvinceOwners(current.geography)
        // 就此打灭的一方，其营中俘虏交由攻方处置。
        if (
          previousOwner !== null &&
          previousOwner !== factionId &&
          isFactionDestroyed(current, previousOwner)
        ) {
          absorbedNotes = absorbCaptives(current, previousOwner, factionId)
        }
      } else {
        for (const member of members) {
          member.troops = applyLoss(member.troops, attackerLossRate)
        }
        for (const defender of garrison.members) {
          defender.troops = applyLoss(defender.troops, defenderLossRate)
        }
        // 败方受挫：参战者忠诚下降，低到阈值以下者就此离走（各自写一条记录）。
        for (const member of members) {
          loseLoyalty(member, LOYALTY_LOSS.battleLost)
          maybeDefect(current, member, '败绩')
        }
      }

      for (const member of members) {
        markActed(current, member.id)
      }
      current.randomState = random.getState()

      const fateNote = defenderFates.length > 0 ? `；守将 ${defenderFates.join('、')}` : ''
      const absorbNote = absorbedNotes.length > 0 ? `；${absorbedNotes.join('、')}` : ''

      return {
        targetId: target.id,
        outcome: attackerWins
          ? `${generalNames} 攻占 ${target.name}${fateNote}${absorbNote}`
          : `${generalNames} 进攻 ${target.name} 失利`,
        battle: report,
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
