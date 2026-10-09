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
  DuelReport,
  FactionId,
  GameState,
  Personality,
  Site,
  SiteId,
} from './model'
import { createRandom, type Random } from './random'
import { areAllied } from './relations'

/** 一场战斗的士气：双方开战默认满值，由单挑增减。 */
export const MORALE_FULL = 100
/** 士气的上限：单挑的士气收益最高推到这里，免得士气系数被推过头。 */
const MORALE_MAX = 120

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
export const GARRISON_SIZE = 3
/** 单挑的士气增减。 */
const DUEL_MORALE_DELTA = 10
/** 单挑判定时叠加在武力上的随机幅度：幅度够大，武力小差不再是必败，冷门时有发生。 */
const DUEL_RANDOM_SPAN = 40
/** 单挑致败者阵亡的概率（暂定，待实测调整）。 */
const DUEL_DEATH_CHANCE = 0.1
/** 单挑致阵亡时，胜方的士气增幅大于寻常单挑。 */
const DUEL_FATAL_MORALE_DELTA = 20

/** 把一场战斗的士气夹在 0 到上限之间。 */
function clampBattleMorale(morale: number): number {
  return Math.max(0, Math.min(MORALE_MAX, morale))
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

/** 驻守某战略点的守军全员（可能多于迎战人数），供守方自选迎战编成时列出候选。 */
export function stationedDefendersAt(state: GameState, siteId: SiteId): Character[] {
  const site = state.geography.sites.find((item) => item.id === siteId)

  return site === undefined ? [] : defendersAt(state, site)
}

/** 守军的迎战编成：至多三名武将，与攻方同构。 */
export interface Garrison {
  /** 迎战的三名武将，按兵力由多到少；无守军时为空。 */
  members: Character[]
  /** 迎战兵力的战力要素；兵力为三人之和，已行动者只计半数。 */
  side: BattleSide
}

/**
 * 某战略点的迎战守军：默认从守军中取兵力最多的三人作为迎战编成；给了 `defenders` 就按此编成
 * （守方在防御演出里自选，至多三人）。其中统率最高者为主将、智谋最高者为军师。
 * 败军退守会让一处战略点的守军越堆越多，只三人迎战才不会让最后一城无止境地变强；
 * 与攻方同为至多三人，双方兵力增长的口径才对等。无主或无人驻守时兵力为零。
 */
export function garrisonAt(
  state: GameState,
  siteId: SiteId,
  defenders?: readonly CharacterId[],
): Garrison {
  const pool = stationedDefendersAt(state, siteId)
  const candidates =
    defenders === undefined ? pool : pool.filter((member) => defenders.includes(member.id))
  const members = [...candidates].sort((a, b) => b.troops - a.troops).slice(0, GARRISON_SIZE)

  if (members.length === 0) {
    return { members, side: { troops: 0, intellect: 0, morale: MORALE_FULL } }
  }

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
      morale: MORALE_FULL,
    },
  }
}

/** 该战略点守军的主将：统率最高者；无守军时为 null。 */
export function garrisonCommanderAt(
  state: GameState,
  siteId: SiteId,
  defenders?: readonly CharacterId[],
): Character | null {
  return pickByCommand(garrisonAt(state, siteId, defenders).members)
}

/** 单挑时代表守军应战的人：守军编成中统率最高的非君主；无人可应时为 null。 */
export function duelAnswererAt(
  state: GameState,
  siteId: SiteId,
  defenders?: readonly CharacterId[],
): Character | null {
  return pickByCommand(
    garrisonAt(state, siteId, defenders).members.filter((member) => !member.isMonarch),
  )
}

/** 守方提出单挑时，攻方代表应战的人：编成中统率最高的非君主；无人可应时为 null。 */
export function attackAnswerer(state: GameState, party: AttackParty): Character | null {
  const members = partyIds(party)
    .map((id) => state.characters.find((item) => item.id === id))
    .filter(
      (item): item is Character =>
        item !== undefined && item.status === 'serving' && !item.isMonarch,
    )

  return pickByCommand(members)
}

/** 各性格主动单挑的倾向：正数表示武力略逊也敢挑，负数表示要明显占优才挑。 */
const DUEL_AGGRESSION: Record<Personality, number> = {
  brave: 12,
  proud: 8,
  open: 2,
  steady: 0,
  scheming: -6,
  cautious: -10,
}

/** 主动单挑的骰子幅度：倾向之外再摇摆这么多，同样的力量对比有时挑、有时不挑。 */
const DUEL_ROLL_SPAN = 7

/**
 * 他方是否提出单挑：从候选里取武力最高的在仕非君主，按「武力差 + 性格倾向 + 骰子」判断。
 * 攻守通用——攻方先由调用方问过，攻方不提时守方再按此判断；只挑一次。
 */
export function aiDuelChallenger(
  candidates: readonly Character[],
  answerer: Character | null,
  random: Random,
): CharacterId | null {
  const dueler = candidates
    .filter((member) => member.status === 'serving' && !member.isMonarch)
    .reduce<Character | null>(
      (best, member) => (best === null || member.might > best.might ? member : best),
      null,
    )

  if (dueler === null || answerer === null) {
    return null
  }

  const margin =
    dueler.might -
    answerer.might +
    DUEL_AGGRESSION[dueler.personality] +
    (Math.floor(random.next() * DUEL_ROLL_SPAN) - Math.floor(DUEL_ROLL_SPAN / 2))

  return margin >= 0 ? dueler.id : null
}

/** 他方进攻时是否提出单挑：由主将或副将中武力最高者出马。 */
export function aiAttackChallenger(
  state: GameState,
  party: AttackParty,
  targetSiteId: SiteId,
  random: Random,
): CharacterId | null {
  const candidates = [party.commander, party.deputy ?? null]
    .map((id) => (id === null ? undefined : state.characters.find((item) => item.id === id)))
    .filter((item): item is Character => item !== undefined)

  return aiDuelChallenger(candidates, duelAnswererAt(state, targetSiteId), random)
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
  /** 提出单挑者，须是主将或副将；不设则不挑。 */
  challenger?: CharacterId | null
}

/** 守方对一次来犯的决定：迎战编成与是否提出单挑。 */
export interface DefenseChoice {
  /** 迎战编成（至多三人）；不给则取兵力最多的三名，已行动者兵力按半计。 */
  defenders?: readonly CharacterId[]
  /** 守方提出单挑的出马者，须在迎战编成之中；不单挑时为 null。 */
  challenger: CharacterId | null
}

/** 编成中的全部武将标识。 */
function partyIds(party: AttackParty): CharacterId[] {
  return [party.commander, party.deputy ?? null, party.strategist ?? null].filter(
    (id): id is CharacterId => id !== null,
  )
}

/** 取统率最高者；空数组返回 null。 */
function pickByCommand(members: readonly Character[]): Character | null {
  return members.reduce<Character | null>(
    (best, item) => (best === null || item.command > best.command ? item : best),
    null,
  )
}

/**
 * 一支编成的战力要素：兵力为主将、副将与军师之和，智谋取三人中最高者——与守军的口径一致，
 * 不因没指定军师而吃亏。士气是战斗属性，双方开战默认满值，由单挑增减，故此处取满值。
 * 单挑致阵亡者已退场，不再计入。
 */
export function partySide(state: GameState, party: AttackParty): BattleSide {
  const members = partyIds(party)
    .map((id) => state.characters.find((item) => item.id === id))
    .filter((item): item is Character => item !== undefined && item.status === 'serving')

  return {
    troops: members.reduce((total, member) => total + member.troops, 0),
    intellect: members.reduce((best, member) => Math.max(best, member.intellect), 0),
    morale: MORALE_FULL,
  }
}

/**
 * 交战中的单挑：一方出马、另一方应战，先于战力结算，胜负只反映为双方士气的增减。
 * 攻方提出时，出马者取编成中的主将或副将，守军以迎战编成中统率最高的非君主应战；
 * 守方提出时，出马者取迎战编成中的一员，攻方以编成中统率最高的非君主应战。
 * 君主不参与单挑；应战方无人可应（如只剩君主）时按拒战处理。未发起单挑时返回 null。
 */
function resolveDuel(
  state: GameState,
  party: AttackParty,
  members: readonly Character[],
  target: Site,
  random: Random,
  defenderChallengerId: CharacterId | null,
  defenders: readonly CharacterId[] | undefined,
): DuelReport | null {
  const garrison = garrisonAt(state, target.id, defenders)

  // 攻方先提：出马者由调用方给定（玩家或他方的决策）。
  const attackerChallengerId = party.challenger ?? null
  if (attackerChallengerId !== null) {
    const challenger = members.find((member) => member.id === attackerChallengerId)
    return challenger === undefined || garrison.members.length === 0
      ? null
      : settleDuelAs('attacker', challenger, duelAnswererAt(state, target.id, defenders), random)
  }

  // 攻方不提，守方再提：守方是玩家时按界面的决定，是他人时按策略判断。单挑只发生一次。
  const defenderId =
    target.owner === state.playerFaction
      ? defenderChallengerId
      : aiDuelChallenger(garrison.members, attackAnswerer(state, party), random)
  if (defenderId === null || defenderId === undefined) {
    return null
  }

  const challenger = garrison.members.find((member) => member.id === defenderId)

  return challenger === undefined
    ? null
    : settleDuelAs('defender', challenger, attackAnswerer(state, party), random)
}

/** 一方出马、另一方应战（应战者为 null 即拒战），把结果折成 `DuelReport`。 */
function settleDuelAs(
  challengerSide: 'attacker' | 'defender',
  challenger: Character,
  answerer: Character | null,
  random: Random,
): DuelReport {
  if (answerer === null) {
    // 应战方无人可应（如只剩君主），按拒战处理：应战方这一方士气下降。
    return {
      challengerSide,
      challenger: challenger.name,
      challengerId: challenger.id,
      answerer: '',
      answererId: null,
      refused: true,
      challengerWon: null,
      fallen: '',
      challengerMoraleDelta: 0,
      answererMoraleDelta: -DUEL_MORALE_DELTA,
    }
  }

  const result = settleDuel(challenger, answerer, random)
  const delta = result.fatal ? DUEL_FATAL_MORALE_DELTA : DUEL_MORALE_DELTA
  const challengerWon = result.winnerId === challenger.id
  const loser = result.loserId === challenger.id ? challenger : answerer

  return {
    challengerSide,
    challenger: challenger.name,
    challengerId: challenger.id,
    answerer: answerer.name,
    answererId: answerer.id,
    refused: false,
    challengerWon,
    fallen: result.fatal ? loser.name : '',
    challengerMoraleDelta: challengerWon ? delta : -delta,
    answererMoraleDelta: challengerWon ? -delta : delta,
  }
}

/** 交战前景的定性判断，供战斗界面展示：不给精确数值，只让玩家对胜负有个大概的感觉。 */
export type BattleOutlook = '不战而下' | '我军大优' | '我军占优' | '势均力敌' | '我军不利' | '我军大劣'

/** 判定阈值（暂定）：攻方战力与守方战力之比。 */
const OUTLOOK_FLOORS: readonly { min: number; outlook: BattleOutlook }[] = [
  { min: 2, outlook: '我军大优' },
  { min: 1.25, outlook: '我军占优' },
  { min: 0.8, outlook: '势均力敌' },
  { min: 0.5, outlook: '我军不利' },
  { min: 0, outlook: '我军大劣' },
]

/**
 * 就一支编成对目标战略点的交战前景：双方战力取期望值（不含随机浮动），守方含防守补正。
 * 只作定性判断，不给具体数值——精确到数字反而会把人推成求解器。
 */
export function battleOutlook(
  state: GameState,
  party: AttackParty,
  targetSiteId: SiteId,
  defenders?: readonly CharacterId[],
): BattleOutlook {
  const garrison = garrisonAt(state, targetSiteId, defenders)
  const defenderPower = battlePower(garrison.side, { defending: true })
  if (defenderPower <= 0) {
    return '不战而下'
  }

  const ratio = battlePower(partySide(state, party)) / defenderPower

  return OUTLOOK_FLOORS.find((band) => ratio >= band.min)?.outlook ?? '我军大劣'
}

/** 守方视角的交战前景，供防御演出展示。 */
export type DefenseOutlook = '守军无将' | '敌军大优' | '敌军占优' | '势均力敌' | '我军占优' | '我军大优'

const DEFENSE_LABELS: Record<BattleOutlook, DefenseOutlook> = {
  不战而下: '守军无将',
  我军大优: '敌军大优',
  我军占优: '敌军占优',
  势均力敌: '势均力敌',
  我军不利: '我军占优',
  我军大劣: '我军大优',
}

/** 就一次来犯看我方（守方）的前景：把攻方视角的判断翻到守方一侧来说。 */
export function defenseOutlook(
  state: GameState,
  party: AttackParty,
  targetSiteId: SiteId,
  defenders?: readonly CharacterId[],
): DefenseOutlook {
  if (garrisonAt(state, targetSiteId, defenders).members.length === 0) {
    return '守军无将'
  }

  return DEFENSE_LABELS[battleOutlook(state, party, targetSiteId, defenders)]
}

/**
 * 进攻不可发起的原因；可以发起时返回 null。供 `attack` 与界面共用，界面据此在进入战斗前拦下。
 */
export function attackBlockReason(
  state: GameState,
  party: AttackParty,
  targetSiteId: SiteId,
  factionId: FactionId = state.playerFaction,
): string | null {
  const ids = partyIds(party)
  const members = ids
    .map((id) => state.characters.find((item) => item.id === id))
    .filter((item): item is Character => item !== undefined)
  const commander = state.characters.find((item) => item.id === party.commander) ?? null
  const target = state.geography.sites.find((item) => item.id === targetSiteId) ?? null

  if (target === null) {
    return '目标战略点不存在'
  }
  if (target.owner === factionId) {
    return '目标已是自有战略点'
  }
  if (target.owner !== null && areAllied(state, factionId, target.owner)) {
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

  const challengerId = party.challenger ?? null
  if (challengerId !== null) {
    if (challengerId !== party.commander && challengerId !== party.deputy) {
      return '单挑须由主将或副将出马'
    }
    if (members.find((member) => member.id === challengerId)?.isMonarch === true) {
      return '君主不参与单挑'
    }
  }

  for (const member of members) {
    const blocked = officerBlockedReason(state, member, factionId)
    if (blocked !== null) {
      return blocked
    }
    if (member.troops <= 0) {
      return `${member.name} 没有兵力`
    }
    if (hasActedThisTurn(state, member.id)) {
      return `${member.name} 本回合已行动`
    }
    if (!stationAdjacentTo(state, member, targetSiteId)) {
      return `${member.name} 的驻地与目标不相邻`
    }
  }

  return null
}

/**
 * 合攻相邻的一个他方或无主战略点，自动结算。
 * 主将、副将与军师的兵力合计为投入兵力，智谋加成取三人中最高者；士气是战斗属性，
 * 双方从满值起，由单挑按方增减。胜则战略点归攻方、参战部队一同前移进驻，
 * 败则各自退回原驻地并受损。随机数取自随存档落盘的模拟流。
 * 单挑可由任一方提出：`party.challenger` 是攻方出马者，`defense` 是守方的迎战编成与出马者。
 */
export function attack(
  state: GameState,
  party: AttackParty,
  targetSiteId: SiteId,
  factionId: FactionId = state.playerFaction,
  defense: DefenseChoice | null = null,
): ActionResult {
  const defenderChallenger = defense?.challenger ?? null
  const defenderSquad = defense?.defenders
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
      const blocked = attackBlockReason(current, party, targetSiteId, factionId)
      if (blocked !== null) {
        return blocked
      }

      // 守方也可提出单挑：出马者须在迎战编成之中，且君主不参与。
      if (defenderChallenger !== null) {
        const dueler = garrisonAt(current, targetSiteId, defenderSquad).members.find(
          (member) => member.id === defenderChallenger,
        )
        if (dueler === undefined) {
          return '出马者不在守军之中'
        }
        if (dueler.isMonarch) {
          return '君主不参与单挑'
        }
      }

      return null
    },
    execute: (current) => {
      if (target === null || commander === null || members.length === 0) {
        return { outcome: '进攻未生效' }
      }

      // 单挑先于交战结算：它只改本场士气与阵亡，二者随即计入战力。
      const duel = resolveDuel(
        current,
        party,
        members,
        target,
        random,
        defenderChallenger,
        defenderSquad,
      )
      // 士气看的是「哪一方」，与由谁出马无关：挑战方胜则挑战方升、应战方降。
      const challengerIsAttacker = duel?.challengerSide !== 'defender'
      const attackerMoraleDelta =
        duel === null ? 0 : challengerIsAttacker ? duel.challengerMoraleDelta : duel.answererMoraleDelta
      const defenderMoraleDelta =
        duel === null ? 0 : challengerIsAttacker ? duel.answererMoraleDelta : duel.challengerMoraleDelta

      // 单挑可能致人阵亡，此后只在场的部属参与结算。
      const fighters = members.filter((member) => member.status === 'serving')
      const generalNames = fighters.map((member) => member.name).join('、')
      const lead = fighters.find((member) => member.id === party.commander) ?? fighters[0] ?? commander

      // 士气是战斗属性：双方开战默认满值，单挑按方增减后夹在上限内。
      const side: BattleSide = {
        ...partySide(current, party),
        morale: clampBattleMorale(MORALE_FULL + attackerMoraleDelta),
      }

      const defenders = defendersAt(current, target)
      const garrison = garrisonAt(current, target.id, defenderSquad)
      const defenderSide: BattleSide = {
        ...garrison.side,
        morale: clampBattleMorale(MORALE_FULL + defenderMoraleDelta),
      }
      const defenderPower = battlePower(defenderSide, { defending: true }) * variance(random)
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
      const attackerCasualties = fighters.reduce(
        (total, member) => total + losses(member.troops, attackerLossRate),
        0,
      )
      const defenderCommander = pickByCommand(garrison.members)
      const defenderTroops = garrison.members.reduce((total, item) => total + item.troops, 0)
      const defenderCasualties = garrison.members.reduce(
        (total, item) => total + losses(item.troops, defenderLossRate),
        0,
      )
      const report: BattleReport = {
        siteName: target.name,
        undefended,
        attackerWins,
        duel,
        attacker: {
          commander: lead.name,
          officers: fighters.map((member) => member.name),
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
          for (const member of fighters) {
            member.troops = applyLoss(member.troops, attackerLossRate)
          }
          for (const defender of garrison.members) {
            defender.troops = applyLoss(defender.troops, defenderLossRate)
          }
        }
        const previousOwner = target.owner
        target.owner = factionId
        for (const member of fighters) {
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
        for (const member of fighters) {
          member.troops = applyLoss(member.troops, attackerLossRate)
        }
        for (const defender of garrison.members) {
          defender.troops = applyLoss(defender.troops, defenderLossRate)
        }
        // 败方受挫：参战者忠诚下降，低到阈值以下者就此离走（各自写一条记录）。
        for (const member of fighters) {
          loseLoyalty(member, LOYALTY_LOSS.battleLost)
          maybeDefect(current, member, '败绩')
        }
      }

      for (const member of fighters) {
        markActed(current, member.id)
      }
      current.randomState = random.getState()

      const duelLead = duel === null ? '' : `${duelHeadline(duel)}；`
      const fateNote = defenderFates.length > 0 ? `；守将 ${defenderFates.join('、')}` : ''
      const absorbNote = absorbedNotes.length > 0 ? `；${absorbedNotes.join('、')}` : ''

      return {
        targetId: target.id,
        outcome: attackerWins
          ? `${duelLead}${generalNames} 攻占 ${target.name}${fateNote}${absorbNote}`
          : `${duelLead}${generalNames} 进攻 ${target.name} 失利`,
        battle: report,
      }
    },
  })
}

/** 单挑结果。 */
export interface DuelResult {
  /** 对方是否拒绝应战。 */
  refused: boolean
  /** 应战时的胜者；拒战或无法进行时为 null。 */
  winnerId: CharacterId | null
  /** 单挑致阵亡的败者；无阵亡时为 null。 */
  fallenId: CharacterId | null
  outcome: string
}

/** 单挑的核心判定结果：谁胜谁负、是否致阵亡；士气由调用方按方施加。 */
interface DuelOutcome {
  winnerId: CharacterId
  loserId: CharacterId
  fatal: boolean
  outcome: string
}

/**
 * 单挑的核心判定：按武力加随机定胜负，败者有小概率阵亡。不改士气，改由调用方按方施加。
 */
function settleDuel(challenger: Character, defender: Character, random: Random): DuelOutcome {
  const challengerScore = challenger.might + random.next() * DUEL_RANDOM_SPAN
  const defenderScore = defender.might + random.next() * DUEL_RANDOM_SPAN
  const winner = challengerScore >= defenderScore ? challenger : defender
  const loser = winner === challenger ? defender : challenger
  const fatal = random.next() < DUEL_DEATH_CHANCE

  if (fatal) {
    retire(loser)
    return {
      winnerId: winner.id,
      loserId: loser.id,
      fatal,
      outcome: `${winner.name} 单挑胜，阵斩 ${loser.name}`,
    }
  }

  return { winnerId: winner.id, loserId: loser.id, fatal, outcome: `${winner.name} 单挑胜 ${loser.name}` }
}

/** 单挑结果的一句话，供行动记录与历史展示；更细的演出由界面按 `DuelReport` 组织。 */
export function duelHeadline(duel: DuelReport): string {
  if (duel.refused) {
    return duel.answerer === ''
      ? `${duel.challenger} 挑战，无人应战`
      : `${duel.challenger} 挑战，${duel.answerer} 拒战`
  }

  const verdict =
    duel.challengerWon === true
      ? `${duel.challenger} 单挑胜 ${duel.answerer}`
      : `${duel.challenger} 单挑不敌 ${duel.answerer}`

  return duel.fallen === '' ? verdict : `${verdict}，阵斩 ${duel.fallen}`
}

/**
 * 单挑结算：对方拒战则作罢；应战则按武力加随机定胜负，败者有小概率阵亡。君主不参与单挑。
 * 士气是战斗属性，不在这里改动——交战双方各自按其增减（见 `resolveDuel`）。
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
    return { refused: false, winnerId: null, fallenId: null, outcome: '单挑无法进行' }
  }

  if (challenger.isMonarch || defender.isMonarch) {
    return { refused: false, winnerId: null, fallenId: null, outcome: '君主不参与单挑' }
  }

  if (!defenderAccepts) {
    return {
      refused: true,
      winnerId: null,
      fallenId: null,
      outcome: `${challenger.name} 挑战 ${defender.name}，${defender.name} 拒战`,
    }
  }

  const random = createRandom(state.randomState)
  const result = settleDuel(challenger, defender, random)
  state.randomState = random.getState()

  return {
    refused: false,
    winnerId: result.winnerId,
    fallenId: result.fatal ? result.loserId : null,
    outcome: result.outcome,
  }
}
