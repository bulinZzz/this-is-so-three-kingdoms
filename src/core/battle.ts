import { ACTION_COSTS, spendActionPoints, type ActionResult } from './actions'
import { attitudeOf, becomeWild, releaseCaptives, takeCaptive } from './captives'
import { isServing, scopeSitesFor } from './characters'
import { damageOnCapture, DEVELOPMENT_LABELS } from './development'
import { resolveProvinceOwners } from './geography'
import { LOSS_EXP, WIN_EXP } from './growth'
import { LOYALTY_LOSS, loseLoyalty, maybeDefect } from './loyalty'
import {
  attackGrainCost,
  hasActedThisTurn,
  isFactionDestroyed,
  markActed,
  officerBlockedReason,
  readyOfficers,
} from './military'
import type {
  ActionRecord,
  ArmType,
  BattleReport,
  BattleReportSide,
  CaptiveReport,
  Character,
  CharacterId,
  DevelopmentKind,
  FactionId,
  GameState,
  Site,
  SiteId,
  SiteType,
} from './model'
import { createRandom, type Random } from './random'
import { areHostile } from './relations'

/**
 * 战斗：双方各排六个阵位（前三后三），开战后按机动依次行动，双方合计二十五次为限。
 * 每次行动由玩家或规则层为当前行动的一队下指令，行动当场结算，便于界面逐次演出。
 * 规则见《战斗系统》。本模块只管一场战斗的推演与结算，不依赖画面；
 * 随机源随战斗状态携带，结束后写回对局，固定种子下同一场战斗可复现。
 */

/** 双方合计的行动次数上限。 */
export const BATTLE_ACTIONS = 25
/** 士气满值与下限。 */
export const MORALE_FULL = 100
export const MORALE_FLOOR = 40
/** 每方的阵位：前三后三。 */
export const FRONT_SIZE = 3
export const BACK_SIZE = 3
export const SLOT_COUNT = FRONT_SIZE + BACK_SIZE
/** 一队退场时本方的士气损失。 */
const MORALE_LOSS_PER_EXIT = 5
/** 主动攻击的自损比例。 */
const ATTACK_SELF_LOSS = 0.05
/** 防御指令的减伤。 */
const DEFEND_DAMAGE_SCALE = 0.7
/** 弓箭手对伤害的倍率。 */
const ARCHER_DAMAGE_SCALE = 0.7
/** 伤害与减伤的兵力系数；二十五次行动的节奏下，一击须有明显分量。 */
const DAMAGE_TROOP_FACTOR = 0.6
const REDUCTION_TROOP_FACTOR = 0.15
/** 武力对伤害、智谋对减伤的点数系数。 */
const MIGHT_SCALE = 0.003
const INTELLECT_SCALE = 0.003
/** 伤害与减伤各自的随机幅度。 */
const DAMAGE_VARIANCE = 0.1
/** 战损折算：按战损比例扣减七成。 */
const CASUALTY_CONVERSION = 0.7
/** 守方败退后的去向：撤回、战死、被俘。 */
const DEFENDER_FLEE_CHANCE = 0.75
const DEFENDER_DIE_CHANCE = 0.1
/** 守方自选武将的上阵人数；驻将另计。 */
export const DEFENDER_SELECTION = 5
/** 攻方上阵人数。 */
export const ATTACKER_SELECTION = 5

/** 兵种参数：机动决定行动顺序，攻防决定伤害与减伤，射程决定可打的排。 */
export interface ArmStats {
  label: string
  mobility: number
  attack: number
  defense: number
  ranged: boolean
}

export const ARM_STATS: Record<ArmType, ArmStats> = {
  infantry: { label: '步兵', mobility: 8, attack: 1, defense: 1, ranged: false },
  archer: { label: '弓箭手', mobility: 10, attack: 0.85, defense: 0.8, ranged: true },
  cavalry: { label: '骑兵', mobility: 12, attack: 1.3, defense: 0.6, ranged: false },
}

/** 战略点的防守补正：守方全员整场享有。 */
export const SITE_DEFENSE_BONUS: Record<SiteType, number> = {
  field: 0,
  town: 0.1,
  city: 0.2,
  pass: 0.25,
  metropolis: 0.3,
}

/** 开发者模式下强制一场战斗的胜负，取攻方视角。 */
export type ForcedOutcome = 'win' | 'lose'

/** 一队在战场的哪一侧。 */
export type BattleSide = 'attacker' | 'defender'

/** 一队本次行动的指令：攻击或防御。 */
export type BattleOrderKind = 'attack' | 'defend'

export interface BattleOrder {
  characterId: CharacterId
  kind: BattleOrderKind
  /** 攻击的目标；省略时取射程内兵力最少的一队。 */
  targetId?: CharacterId
}

/** 参战的一队：武力、智谋与兵种随武将，战兵是这一场的血量。 */
export interface BattleUnit {
  characterId: CharacterId
  name: string
  side: BattleSide
  armType: ArmType
  /** 开战时的兵力，战损折算以此为基准。 */
  troops: number
  /** 当前战兵；扣至零即退场。 */
  battleTroops: number
  might: number
  intellect: number
  /** 阵位：0–2 为前排，3–5 为后排。 */
  slot: number
  /** 是否为该点的驻将：驻将不占自选名额、战后不因防守转为已行动。 */
  stationed: boolean
  /** 防御生效的轮次；与本轮相同则受击减伤。 */
  defendingRound: number | null
  exited: boolean
}

/** 一方在战场上的状态：一条共用的士气与全部参战队。 */
export interface BattleSideState {
  factionId: FactionId | null
  morale: number
  units: BattleUnit[]
}

/** 一场进行中的战斗。 */
export interface BattleState {
  siteId: SiteId
  siteName: string
  siteType: SiteType
  attacker: BattleSideState
  defender: BattleSideState
  /** 当前轮次，从 1 起；每队依次行动一次为一轮。 */
  round: number
  /** 双方已行动的次数。 */
  actionsUsed: number
  /** 行动次数上限。 */
  actionLimit: number
  /** 本轮尚未行动的单位，队首即当前行动者。 */
  queue: CharacterId[]
  finished: boolean
  /** 守方是否无人可守，不战而下。 */
  undefended: boolean
  /** 是否由攻方得胜；战斗结束后才作数。 */
  attackerWins: boolean
  /** 本场战斗的随机流，结束后写回对局。 */
  randomState: number
  /** 开发者模式指定的胜负，取攻方视角。 */
  forcedOutcome: ForcedOutcome | null
}

/** 一次行动的结算结果，供界面演出与测试核对。 */
export interface BattleActionEvent {
  actorId: CharacterId
  actorName: string
  side: BattleSide
  kind: BattleOrderKind
  targetId: CharacterId | null
  targetName: string | null
  /** 对目标造成的战兵损失。 */
  damage: number
  /** 主动攻击的自损。 */
  selfLoss: number
  /** 行动后的剩余战兵。 */
  actorTroops: number
  targetTroops: number | null
  /** 本次行动后退场的队伍。 */
  exited: { characterId: CharacterId; name: string; side: BattleSide }[]
  /** 行动所属的轮次与累计次数。 */
  round: number
  actionsUsed: number
  finished: boolean
  attackerWins: boolean
}

/** 布阵：一名参战者占哪个阵位。 */
export interface BattleDeployment {
  characterId: CharacterId
  slot: number
}

/** 开战的结果：成功时带回战斗状态，失败时带回原因。 */
export type BattleOpenResult = { ok: true; battle: BattleState } | { ok: false; reason: string }

/** 阵位属于前排还是后排。 */
export function rowOfSlot(slot: number): 0 | 1 {
  return slot < FRONT_SIZE ? 0 : 1
}

/** 势力名；查不到时退回标识。 */
function factionName(state: GameState, factionId: FactionId | null): string {
  return state.factions.find((faction) => faction.id === factionId)?.name ?? factionId ?? ''
}

/** 某战略点的守方势力；全图尽归势力，故即其归属。 */
export function defenderFactionAt(_state: GameState, target: Site): FactionId | null {
  return target.owner
}

/** 某战略点的驻将；无人驻守时为 null。 */
export function stationedAt(state: GameState, siteId: SiteId): Character | null {
  return (
    state.characters.find(
      (character) =>
        isServing(character) &&
        character.stationedSiteId === siteId &&
        character.factionId !== null,
    ) ?? null
  )
}

/**
 * 某战略点可选的守将：该点驻将（有兵时自动上阵）与名册中未驻守、有兵、未行动的武将。
 * 已行动的武将不能防守；兵为零的驻将不上阵。缺省按该点的归属势力取人。
 */
export function defenderCandidates(
  state: GameState,
  siteId: SiteId,
  factionId: FactionId = state.playerFaction,
): Character[] {
  const site = state.geography.sites.find((item) => item.id === siteId)
  if (site === undefined || site.owner !== factionId) {
    return []
  }

  const stationed = stationedAt(state, siteId)
  const stationedUnit = stationed !== null && stationed.troops > 0 ? [stationed] : []
  const others = readyOfficers(state, factionId).filter(
    (character) =>
      character.troops > 0 &&
      character.stationedSiteId === null &&
      scopeSitesFor(state, character).includes(siteId),
  )

  return [...stationedUnit, ...others]
}

/** 自动布阵：按传入次序依次填入六个阵位。 */
export function autoDeployment(ids: readonly CharacterId[]): BattleDeployment[] {
  return ids
    .slice(0, SLOT_COUNT)
    .map((characterId, index) => ({ characterId, slot: index }))
}

/**
 * 按兵种排出默认阵形：近战先上前排，弓箭手排到后排；同类仍按传入次序。
 * 后排的近战被自家前排挡住，自动布阵不能把人白白晾在后排。
 */
export function autoFormation(
  characters: readonly { id: CharacterId; armType: ArmType }[],
): BattleDeployment[] {
  const ordered = [...characters].sort(
    (a, b) => Number(a.armType === 'archer') - Number(b.armType === 'archer'),
  )

  return autoDeployment(ordered.map((character) => character.id))
}

/**
 * 开战前把一个队挪到另一个阵位；那里已有队伍时两者互换。
 * 须保持前排至少一队；合规则返回 null，不合规时恢复原位并返回原因。
 */
export function setUnitSlot(
  battle: BattleState,
  characterId: CharacterId,
  slot: number,
): string | null {
  if (battle.finished) {
    return '战斗已结束'
  }
  if (battle.actionsUsed > 0 || battle.round > 1) {
    return '开战后不能再变阵'
  }
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) {
    return '阵位超出范围'
  }

  const unit = findUnit(battle, characterId)
  if (unit === undefined) {
    return '该武将不在阵中'
  }
  if (unit.exited) {
    return '该队已退场'
  }
  if (unit.slot === slot) {
    return null
  }

  const side = battle[unit.side]
  const occupant = side.units.find((item) => item.slot === slot)
  const previous = unit.slot
  if (occupant !== undefined) {
    occupant.slot = previous
  }
  unit.slot = slot

  if (side.units.filter((item) => !item.exited && rowOfSlot(item.slot) === 0).length < 1) {
    if (occupant !== undefined) {
      occupant.slot = slot
    }
    unit.slot = previous
    return '前排至少一队'
  }

  return null
}

/** 参战者的人数上限：攻方五人，守方五名自选加驻将。 */
function limitOf(side: BattleSide): number {
  return side === 'attacker' ? ATTACKER_SELECTION : DEFENDER_SELECTION + 1
}

/** 校验布阵的名额与阵位；合规时返回 null。 */
function deploymentProblem(
  deployments: readonly BattleDeployment[],
  side: BattleSide,
): string | null {
  const ids = deployments.map((item) => item.characterId)
  if (new Set(ids).size !== ids.length) {
    return '同一名武将不能排两次'
  }
  if (deployments.length === 0) {
    return '至少派一队上阵'
  }
  if (deployments.length > limitOf(side)) {
    return `至多 ${limitOf(side)} 队上阵`
  }

  const slots = deployments.map((item) => item.slot)
  if (slots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT)) {
    return '阵位超出范围'
  }
  if (new Set(slots).size !== slots.length) {
    return '同一阵位不能排两队'
  }
  if (deployments.filter((item) => rowOfSlot(item.slot) === 0).length < 1) {
    return '前排至少一队'
  }

  return null
}

/** 把武将编成一队。 */
function makeUnit(
  character: Character,
  side: BattleSide,
  slot: number,
  stationed: boolean,
): BattleUnit {
  return {
    characterId: character.id,
    name: character.name,
    side,
    armType: character.armType,
    troops: character.troops,
    battleTroops: character.troops,
    might: character.might,
    intellect: character.intellect,
    slot,
    stationed,
    defendingRound: null,
    exited: false,
  }
}

/** 由布阵造出一方的参战队；人员不合法时返回 null。 */
function buildUnits(
  state: GameState,
  factionId: FactionId,
  deployments: readonly BattleDeployment[],
  side: BattleSide,
  siteId: SiteId,
): BattleUnit[] | null {
  const units: BattleUnit[] = []

  for (const deployment of deployments) {
    const character = state.characters.find((item) => item.id === deployment.characterId)
    if (
      character === undefined ||
      !isServing(character) ||
      character.factionId !== factionId ||
      character.troops <= 0
    ) {
      return null
    }
    units.push(makeUnit(character, side, deployment.slot, character.stationedSiteId === siteId))
  }

  return units
}

/**
 * 该战略点是否为指定势力可进攻的目标：目标归属他方且已宣战，并与一处自有战略点相邻。
 * 全图没有无主战略点，故不再有无主可打。缺省按玩家势力评判。
 */
export function isAttackable(
  state: GameState,
  targetSiteId: SiteId,
  factionId: FactionId = state.playerFaction,
): boolean {
  return attackBlockReason(state, targetSiteId, [], factionId, { skipParty: true }) === null
}

/**
 * 该武将能否出兵攻打目标：其活动范围内须有一处本方所有、且与目标相邻的城池。
 * 目标本身也可在范围内；跨州作战须先取下一处落脚点，再把它并入参战者的范围。
 */
export function canAttackTarget(
  state: GameState,
  character: Character,
  targetSiteId: SiteId,
  factionId: FactionId,
): boolean {
  return scopeSitesFor(state, character).some((siteId) => {
    const site = state.geography.sites.find((item) => item.id === siteId)
    return site !== undefined && site.owner === factionId && site.neighbors.includes(targetSiteId)
  })
}

/** 进攻不可发起的原因；可以发起时返回 null。供界面与开战共用。 */
export function attackBlockReason(
  state: GameState,
  targetSiteId: SiteId,
  memberIds: readonly CharacterId[],
  factionId: FactionId = state.playerFaction,
  options: { skipParty?: boolean } = {},
): string | null {
  const target = state.geography.sites.find((item) => item.id === targetSiteId)
  if (target === undefined) {
    return '目标战略点不存在'
  }
  if (target.owner === factionId) {
    return '目标已是自有战略点'
  }
  if (target.owner === null) {
    return '目标无归属，无法宣战'
  }
  if (!areHostile(state, factionId, target.owner)) {
    return '与对方非敌对，须先宣战'
  }

  const adjacent = state.geography.sites.some(
    (site) => site.owner === factionId && site.neighbors.includes(target.id),
  )
  if (!adjacent) {
    return '目标不与自有战略点相邻'
  }

  if (options.skipParty === true) {
    return null
  }

  if (memberIds.length === 0) {
    return '至少选一名武将出征'
  }
  if (memberIds.length > ATTACKER_SELECTION) {
    return `至多 ${ATTACKER_SELECTION} 名武将出征`
  }
  if (new Set(memberIds).size !== memberIds.length) {
    return '同一名武将不能重复出征'
  }

  for (const characterId of memberIds) {
    const character = state.characters.find((item) => item.id === characterId) ?? null
    const blocked = officerBlockedReason(state, character, factionId)
    if (blocked !== null) {
      return blocked
    }
    if (character === null) {
      return '武将不存在'
    }
    if (character.stationedSiteId !== null) {
      return `${character.name} 正在驻守，不能出征`
    }
    if (character.troops <= 0) {
      return `${character.name} 没有兵力`
    }
    if (!canAttackTarget(state, character, targetSiteId, factionId)) {
      return `${character.name} 的活动范围不及目标`
    }
    if (hasActedThisTurn(state, character.id)) {
      return `${character.name} 本回合已行动`
    }
  }

  const faction = state.factions.find((item) => item.id === factionId)
  if ((state.actionPoints[factionId] ?? 0) < ACTION_COSTS.attack) {
    return '行动力不足'
  }
  const troops = memberIds.reduce((total, characterId) => {
    const character = state.characters.find((item) => item.id === characterId)
    return total + (character?.troops ?? 0)
  }, 0)
  if (faction === undefined || faction.grain < attackGrainCost(troops)) {
    return '粮草不足，不能出征'
  }

  return null
}

/**
 * 进攻某战略点的候选部属：名册中未驻守、有兵、活动范围及于目标的武将。
 * 已行动的也在列，由界面标为不可选。缺省按玩家势力取候选。
 */
export function attackCandidates(
  state: GameState,
  targetSiteId: SiteId,
  factionId: FactionId = state.playerFaction,
): Character[] {
  if (!isAttackable(state, targetSiteId, factionId)) {
    return []
  }

  return state.characters.filter(
    (character) =>
      isServing(character) &&
      character.factionId === factionId &&
      character.stationedSiteId === null &&
      character.troops > 0 &&
      canAttackTarget(state, character, targetSiteId, factionId),
  )
}

/** 自动挑选守将：该点驻将与活动范围含此城的自选守将，按名册次序取至多六队。 */
function autoDefenders(state: GameState, siteId: SiteId, factionId: FactionId): Character[] {
  return defenderCandidates(state, siteId, factionId).slice(0, DEFENDER_SELECTION + 1)
}

/**
 * 开战：校验目标与出征者，扣行动力与粮草，排定攻方阵形；守方视选项自动布阵。
 * 守方无人可守时不战而下，战斗当场结束，攻方照付行动力与粮草。
 */
export function openAttack(
  state: GameState,
  targetSiteId: SiteId,
  deployments: readonly BattleDeployment[],
  factionId: FactionId = state.playerFaction,
  options: { autoDefender?: boolean } = {},
): BattleOpenResult {
  const memberIds = deployments.map((item) => item.characterId)
  const blocked = attackBlockReason(state, targetSiteId, memberIds, factionId)
  if (blocked !== null) {
    return { ok: false, reason: blocked }
  }
  const problem = deploymentProblem(deployments, 'attacker')
  if (problem !== null) {
    return { ok: false, reason: problem }
  }

  const target = state.geography.sites.find((item) => item.id === targetSiteId)
  if (target === undefined) {
    return { ok: false, reason: '目标战略点不存在' }
  }
  const units = buildUnits(state, factionId, deployments, 'attacker', target.id)
  if (units === null) {
    return { ok: false, reason: '出征者不合法' }
  }

  const troops = units.reduce((total, unit) => total + unit.troops, 0)
  if (!spendActionPoints(state, factionId, 'attack')) {
    return { ok: false, reason: '行动力不足' }
  }
  const faction = state.factions.find((item) => item.id === factionId)
  if (faction !== undefined) {
    faction.grain -= attackGrainCost(troops)
  }

  const defenderFaction = target.owner
  const battle: BattleState = {
    siteId: target.id,
    siteName: target.name,
    siteType: target.type,
    attacker: { factionId, morale: MORALE_FULL, units },
    defender: { factionId: defenderFaction, morale: MORALE_FULL, units: [] },
    round: 1,
    actionsUsed: 0,
    actionLimit: BATTLE_ACTIONS,
    queue: [],
    finished: false,
    undefended: false,
    attackerWins: false,
    randomState: state.randomState,
    forcedOutcome: null,
  }

  if (options.autoDefender !== false && defenderFaction !== null) {
    deployDefenders(battle, state, autoFormation(autoDefenders(state, target.id, defenderFaction)))
  } else if (
    defenderFaction === null ||
    defenderCandidates(state, target.id, defenderFaction).length === 0
  ) {
    battle.undefended = true
    battle.attackerWins = true
    battle.finished = true
  }

  return { ok: true, battle }
}

/**
 * 排定守方阵形；给空数组表示不派将迎战，守方不战而下。
 * 守将须取自该点的候选（驻将或名册中有兵、未行动的武将）；不合规时返回原因。
 */
export function deployDefenders(
  battle: BattleState,
  state: GameState,
  deployments: readonly BattleDeployment[],
): string | null {
  if (battle.finished) {
    return null
  }
  const factionId = battle.defender.factionId
  if (factionId === null) {
    battle.undefended = true
    battle.attackerWins = true
    battle.finished = true
    return null
  }

  if (deployments.length === 0) {
    battle.undefended = true
    battle.attackerWins = true
    battle.finished = true
    return null
  }

  const problem = deploymentProblem(deployments, 'defender')
  if (problem !== null) {
    return problem
  }

  const candidates = defenderCandidates(state, battle.siteId, factionId)
  const allowed = new Set(candidates.map((character) => character.id))
  for (const deployment of deployments) {
    if (!allowed.has(deployment.characterId)) {
      const character = state.characters.find((item) => item.id === deployment.characterId)
      return `${character?.name ?? '守将'} 不能在此迎战`
    }
  }

  const units = buildUnits(state, factionId, deployments, 'defender', battle.siteId)
  if (units === null) {
    return '守将不合法'
  }
  battle.defender.units = units
  battle.queue = []

  return null
}

/** 士气系数：士气越低，伤害与减伤越弱。 */
function moraleFactor(morale: number): number {
  return 0.5 + 0.5 * (morale / MORALE_FULL)
}

/** 一次 1±10% 的随机波动。 */
function variance(random: Random): number {
  return 1 - DAMAGE_VARIANCE + random.next() * 2 * DAMAGE_VARIANCE
}

/** 把一队移出战场，并扣本方的士气。 */
function exitUnit(unit: BattleUnit, side: BattleSideState): void {
  if (unit.exited) {
    return
  }
  unit.exited = true
  unit.battleTroops = 0
  side.morale = Math.max(MORALE_FLOOR, side.morale - MORALE_LOSS_PER_EXIT)
}

/** 一队的当前兵力。 */
function alive(unit: BattleUnit): boolean {
  return !unit.exited && unit.battleTroops > 0
}

/** 一方的在阵之队。 */
function aliveUnits(side: BattleSideState): BattleUnit[] {
  return side.units.filter(alive)
}

/** 一方视野内的全部敌队。 */
function enemyUnits(battle: BattleState, side: BattleSide): BattleUnit[] {
  return aliveUnits(side === 'attacker' ? battle.defender : battle.attacker)
}

/** 按标识找一队。 */
function findUnit(battle: BattleState, characterId: CharacterId): BattleUnit | undefined {
  return [...battle.attacker.units, ...battle.defender.units].find(
    (unit) => unit.characterId === characterId,
  )
}

/**
 * 一队可攻击的目标：近战只及敌方前排，弓箭手可及任意。
 * 近战站在自家后排、而自家前排尚有人时，被本阵挡住，够不着敌军；
 * 自家前排已空，后排的近战才成为阵线最前。敌方前排已空时，近战也及于后排。
 */
export function targetsFor(battle: BattleState, unit: BattleUnit): BattleUnit[] {
  const enemies = enemyUnits(battle, unit.side)
  if (ARM_STATS[unit.armType].ranged) {
    return enemies
  }
  if (blockedByOwnFront(battle, unit)) {
    return []
  }

  const front = enemies.filter((target) => rowOfSlot(target.slot) === 0)

  return front.length > 0 ? front : enemies
}

/** 近战在后排且自家前排仍有队伍时，被本阵挡住。 */
function blockedByOwnFront(battle: BattleState, unit: BattleUnit): boolean {
  if (ARM_STATS[unit.armType].ranged || rowOfSlot(unit.slot) === 0) {
    return false
  }

  return aliveUnits(battle[unit.side]).some((item) => rowOfSlot(item.slot) === 0)
}

/** 自动指定目标：取射程内兵力最少的一队。 */
function autoTarget(_unit: BattleUnit, targets: readonly BattleUnit[]): BattleUnit | null {
  return targets.reduce<BattleUnit | null>(
    (best, target) => (best === null || target.battleTroops < best.battleTroops ? target : best),
    null,
  )
}

/** 一队对另一队的实伤。减伤不低于伤害时这一击不造成伤害。 */
function damageOf(
  attacker: BattleUnit,
  attackerSide: BattleSideState,
  defender: BattleUnit,
  defenderSide: BattleSideState,
  siteBonus: number,
  round: number,
  random: Random,
): number {
  let damage =
    attacker.battleTroops *
    DAMAGE_TROOP_FACTOR *
    ARM_STATS[attacker.armType].attack *
    (1 + attacker.might * MIGHT_SCALE) *
    moraleFactor(attackerSide.morale) *
    variance(random)
  if (ARM_STATS[attacker.armType].ranged) {
    damage *= ARCHER_DAMAGE_SCALE
  }

  const reduction =
    defender.battleTroops *
    REDUCTION_TROOP_FACTOR *
    ARM_STATS[defender.armType].defense *
    (1 + defender.intellect * INTELLECT_SCALE) *
    moraleFactor(defenderSide.morale) *
    variance(random)

  if (reduction >= damage) {
    return 0
  }

  let actual = damage - reduction
  if (defender.defendingRound === round) {
    actual *= DEFEND_DAMAGE_SCALE
  }
  if (defender.side === 'defender') {
    actual *= 1 - siteBonus
  }

  return Math.max(0, Math.round(actual))
}

/** 防御动作覆盖的己方队伍：步兵守一排，其余兵种只守自己。 */
export function defendScope(battle: BattleState, unit: BattleUnit): BattleUnit[] {
  if (unit.armType !== 'infantry') {
    return [unit]
  }

  const row = rowOfSlot(unit.slot)

  return aliveUnits(battle[unit.side]).filter((item) => rowOfSlot(item.slot) === row)
}

/** 按机动排出本轮的先后；同值时攻方先行，再按阵位先后。 */
function buildQueue(battle: BattleState): CharacterId[] {
  return [
    ...battle.attacker.units.map((unit, index) => ({ unit, index })),
    ...battle.defender.units.map((unit, index) => ({ unit, index: index + 100 })),
  ]
    .filter((item) => alive(item.unit))
    .sort((a, b) => {
      const mobility = ARM_STATS[b.unit.armType].mobility - ARM_STATS[a.unit.armType].mobility
      if (mobility !== 0) {
        return mobility
      }
      if (a.unit.side !== b.unit.side) {
        return a.unit.side === 'attacker' ? -1 : 1
      }
      return a.index - b.index
    })
    .map((item) => item.unit.characterId)
}

/** 第一轮的行动队列在开战前惰性排定；之后每轮由上一轮结束时续上。 */
function prepareQueue(battle: BattleState): void {
  if (battle.queue.length === 0 && battle.actionsUsed === 0) {
    battle.queue = buildQueue(battle)
  }
}

/** 把队列头部已退场的队伍清掉，使队首就是当前行动者。 */
function pruneQueue(battle: BattleState): void {
  while (battle.queue.length > 0) {
    const unit = findUnit(battle, battle.queue[0]!)
    if (unit !== undefined && alive(unit)) {
      return
    }
    battle.queue.shift()
  }
}

/** 当前该行动的一队；战斗已结束或队列不可用时为 null。 */
export function currentActor(battle: BattleState): BattleUnit | null {
  if (battle.finished) {
    return null
  }
  prepareQueue(battle)
  pruneQueue(battle)
  const id = battle.queue[0]

  return id === undefined ? null : (findUnit(battle, id) ?? null)
}

/** 他方为当前行动的一队下指令：残队转守，其余就近攻击。 */
export function autoOrderFor(battle: BattleState, unit: BattleUnit): BattleOrder {
  if (unit.battleTroops < unit.troops * 0.2) {
    return { characterId: unit.characterId, kind: 'defend' }
  }

  const target = autoTarget(unit, targetsFor(battle, unit))

  return target === null
    ? { characterId: unit.characterId, kind: 'defend' }
    : { characterId: unit.characterId, kind: 'attack', targetId: target.characterId }
}

/** 检查战斗是否已分出结果；次数用尽而守方仍在则守方守住。 */
function evaluateEnd(battle: BattleState): void {
  const attackersAlive = aliveUnits(battle.attacker).length > 0
  const defendersAlive = aliveUnits(battle.defender).length > 0

  if (!defendersAlive) {
    battle.attackerWins = true
    battle.finished = true
    return
  }
  if (!attackersAlive) {
    battle.attackerWins = false
    battle.finished = true
    return
  }
  if (battle.actionsUsed >= battle.actionLimit) {
    battle.attackerWins = false
    battle.finished = true
  }
}

/**
 * 结算当前行动者的一次行动，返回可供界面演出的结果。
 * 指令须属于当前行动者；不合规时返回 null，战斗不推进。
 */
export function resolveAction(
  battle: BattleState,
  order: BattleOrder,
): BattleActionEvent | null {
  const actor = currentActor(battle)
  if (actor === null || order.characterId !== actor.characterId) {
    return null
  }

  const random = createRandom(battle.randomState)
  const ownSide = battle[actor.side]
  const otherSide = actor.side === 'attacker' ? battle.defender : battle.attacker
  const exitedBefore = [...battle.attacker.units, ...battle.defender.units]
    .filter((unit) => unit.exited)
    .map((unit) => unit.characterId)
  const actingRound = battle.round

  let target: BattleUnit | null = null
  let damage = 0
  let selfLoss = 0

  if (order.kind === 'attack') {
    const targets = targetsFor(battle, actor)
    target =
      (order.targetId === undefined
        ? undefined
        : targets.find((item) => item.characterId === order.targetId)) ??
      autoTarget(actor, targets)
    if (target !== null) {
      damage = damageOf(
        actor,
        ownSide,
        target,
        otherSide,
        SITE_DEFENSE_BONUS[battle.siteType],
        actingRound,
        random,
      )
      if (damage > 0) {
        target.battleTroops = Math.max(0, target.battleTroops - damage)
        if (target.battleTroops <= 0) {
          exitUnit(target, otherSide)
        }
      }

      // 真正出手才有折损；被本阵挡住、够不着敌军时不损。
      selfLoss = Math.min(actor.battleTroops, Math.round(actor.battleTroops * ATTACK_SELF_LOSS))
      actor.battleTroops = Math.max(0, actor.battleTroops - selfLoss)
      if (actor.battleTroops <= 0) {
        exitUnit(actor, ownSide)
      }
    }
  } else {
    for (const unit of defendScope(battle, actor)) {
      unit.defendingRound = actingRound
    }
  }

  battle.queue.shift()
  battle.actionsUsed += 1
  battle.randomState = random.getState()
  pruneQueue(battle)
  evaluateEnd(battle)
  if (!battle.finished && battle.queue.length === 0) {
    battle.round += 1
    battle.queue = buildQueue(battle)
  }

  const exited = [...battle.attacker.units, ...battle.defender.units]
    .filter((unit) => unit.exited && !exitedBefore.includes(unit.characterId))
    .map((unit) => ({ characterId: unit.characterId, name: unit.name, side: unit.side }))

  return {
    actorId: actor.characterId,
    actorName: actor.name,
    side: actor.side,
    kind: order.kind,
    targetId: target?.characterId ?? null,
    targetName: target?.name ?? null,
    damage,
    selfLoss,
    actorTroops: actor.battleTroops,
    targetTroops: target?.battleTroops ?? null,
    exited,
    round: actingRound,
    actionsUsed: battle.actionsUsed,
    finished: battle.finished,
    attackerWins: battle.attackerWins,
  }
}

/** 当前行动者交由规则层下令并结算；没有可行动者时为 null。 */
export function autoAction(battle: BattleState): BattleActionEvent | null {
  const actor = currentActor(battle)
  if (actor === null) {
    return null
  }

  return resolveAction(battle, autoOrderFor(battle, actor))
}

/** 按同一套规则自动推演到底，供玩家不参与的战斗与界面跳过时使用。 */
export function autoBattle(battle: BattleState): void {
  while (!battle.finished) {
    if (autoAction(battle) === null) {
      return
    }
  }
}

/** 一场战斗的交战前景，供界面作定性判断：不给精确数值。 */
export type BattleOutlook = '不战而下' | '我军大优' | '我军占优' | '势均力敌' | '我军不利' | '我军大劣'

const OUTLOOK_FLOORS: readonly { min: number; outlook: BattleOutlook }[] = [
  { min: 2, outlook: '我军大优' },
  { min: 1.25, outlook: '我军占优' },
  { min: 0.8, outlook: '势均力敌' },
  { min: 0.5, outlook: '我军不利' },
  { min: 0, outlook: '我军大劣' },
]

/** 就一次进攻看交战前景：双方兵力按据点补正折算后比较。 */
export function battleOutlook(
  state: GameState,
  targetSiteId: SiteId,
  memberIds: readonly CharacterId[],
  defenderIds?: readonly CharacterId[],
): BattleOutlook {
  const target = state.geography.sites.find((item) => item.id === targetSiteId)
  if (target === undefined) {
    return '我军大劣'
  }
  const defenders =
    defenderIds === undefined && target.owner !== null
      ? autoDefenders(state, target.id, target.owner).map((item) => item.id)
      : (defenderIds ?? [])
  const defenderTroops = defenders.reduce((total, id) => {
    const character = state.characters.find((item) => item.id === id)
    return total + (character?.troops ?? 0)
  }, 0)
  if (defenderTroops <= 0) {
    return '不战而下'
  }
  const attackerTroops = memberIds.reduce((total, id) => {
    const character = state.characters.find((item) => item.id === id)
    return total + (character?.troops ?? 0)
  }, 0)
  const ratio = attackerTroops / (defenderTroops * (1 + SITE_DEFENSE_BONUS[target.type]))

  return OUTLOOK_FLOORS.find((band) => ratio >= band.min)?.outlook ?? '我军大劣'
}

/** 守方视角的交战前景。 */
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
  targetSiteId: SiteId,
  attackerIds: readonly CharacterId[],
  defenderIds?: readonly CharacterId[],
): DefenseOutlook {
  return DEFENSE_LABELS[battleOutlook(state, targetSiteId, attackerIds, defenderIds)]
}

/** 退场：脱离势力与驻地，兵力归零。 */
function retire(character: Character): void {
  character.status = 'retired'
  character.factionId = null
  character.stationedSiteId = null
  character.troops = 0
}

/** 按战损比例折算实际减员，未折算的部分视为溃散归队；返回实减。 */
function applyBattleLoss(unit: BattleUnit): number {
  if (unit.troops <= 0) {
    return 0
  }
  const ratio = Math.min(1, (unit.troops - Math.max(0, unit.battleTroops)) / unit.troops)
  const lost = Math.round(unit.troops * ratio * CASUALTY_CONVERSION)

  return Math.min(unit.troops, lost)
}

/** 战报中的一方。 */
function sideReport(units: readonly BattleUnit[]): BattleReportSide {
  const troops = units.reduce((total, unit) => total + unit.troops, 0)
  const casualties = units.reduce((total, unit) => total + applyBattleLoss(unit), 0)

  return {
    commander: units[0]?.name ?? '',
    officers: units.map((unit) => unit.name),
    troops,
    casualties,
    remaining: troops - casualties,
  }
}

/** 势力覆灭时名册尽散、俘虏开释；返回去向说明。 */
function dissolveFaction(state: GameState, factionId: FactionId): string[] {
  const notes: string[] = []
  for (const character of state.characters) {
    if (character.status === 'serving' && character.factionId === factionId) {
      becomeWild(state, character)
      notes.push(`${character.name} 流落为在野`)
    }
  }

  notes.push(...releaseCaptives(state, factionId))

  return notes
}

/**
 * 结算一场已分出结果的战斗：折算战损、定守方去向、易主、记功过并写入历史。
 * 战斗未打完时先按自动指令推演到底。开发者模式可强制胜负，其余结算照常。
 */
export function finishBattle(
  state: GameState,
  battle: BattleState,
  forcedOutcome: ForcedOutcome | null = null,
): ActionResult {
  if (!battle.finished) {
    autoBattle(battle)
  }

  const target = state.geography.sites.find((item) => item.id === battle.siteId)
  const attackerFaction = battle.attacker.factionId
  if (target === undefined || attackerFaction === null) {
    return { ok: false, reason: '战场已不存在' }
  }

  const attackerWins =
    forcedOutcome === 'win' ? true : forcedOutcome === 'lose' ? false : battle.attackerWins
  const undefended = battle.undefended
  const random = createRandom(battle.randomState)
  const attackerUnits = battle.attacker.units
  const defenderUnits = battle.defender.units

  // 战损按开战兵力与结束战兵的比例折算，先于去向结算；去向不再改写战报里的剩余兵力。
  for (const unit of [...attackerUnits, ...defenderUnits]) {
    const character = state.characters.find((item) => item.id === unit.characterId)
    if (character === undefined) {
      continue
    }
    character.troops = Math.max(0, character.troops - applyBattleLoss(unit))
  }

  const report: BattleReport = {
    siteName: target.name,
    undefended,
    attackerWins,
    attacker: sideReport(attackerUnits),
    defender: sideReport(defenderUnits),
    captives: [],
  }

  const attackerNames = attackerUnits.map((unit) => unit.name).join('、')
  const fates: string[] = []
  const captives: CaptiveReport[] = []
  const released: string[] = []
  const damaged: DevelopmentKind[] = []
  const notes: string[] = []

  const attackerExp = attackerWins ? WIN_EXP : LOSS_EXP
  for (const unit of attackerUnits) {
    const character = state.characters.find((item) => item.id === unit.characterId)
    if (character !== undefined) {
      character.exp = (character.exp ?? 0) + attackerExp
    }
  }
  for (const unit of defenderUnits) {
    const character = state.characters.find((item) => item.id === unit.characterId)
    if (character !== undefined) {
      character.exp = (character.exp ?? 0) + (attackerWins ? LOSS_EXP : WIN_EXP)
    }
  }

  if (attackerWins) {
    const defenderFaction = target.owner
    target.owner = attackerFaction

    // 攻下之地并入参战者的活动范围，往后可在此驻守、征兵与继续出兵。
    for (const unit of attackerUnits) {
      const character = state.characters.find((item) => item.id === unit.characterId)
      if (character !== undefined && !character.scope.includes(target.id)) {
        character.scope.push(target.id)
      }
    }

    // 原守将未及上阵（兵为零）也随城撤出，忠诚下降；上阵者由下面的去向结算处理。
    const fought = new Set(defenderUnits.map((unit) => unit.characterId))
    for (const character of state.characters) {
      if (character.stationedSiteId !== target.id) {
        continue
      }
      character.stationedSiteId = null
      if (!fought.has(character.id)) {
        loseLoyalty(character, LOYALTY_LOSS.siteLost)
        fates.push(maybeDefect(state, character, '失守') ?? `${character.name} 撤出`)
      }
    }

    for (const unit of defenderUnits) {
      const character = state.characters.find((item) => item.id === unit.characterId)
      if (character === undefined) {
        continue
      }
      const roll = random.next()
      if (roll < DEFENDER_FLEE_CHANCE) {
        character.stationedSiteId = null
        if (unit.stationed) {
          loseLoyalty(character, LOYALTY_LOSS.siteLost)
          fates.push(maybeDefect(state, character, '失守') ?? `${character.name} 撤出`)
        }
        continue
      }
      if (roll < DEFENDER_FLEE_CHANCE + DEFENDER_DIE_CHANCE) {
        retire(character)
        fates.push(`${character.name} 战死`)
        continue
      }
      const record = takeCaptive(state, character, attackerFaction)
      fates.push(`${character.name} 被俘，入${factionName(state, attackerFaction)}营`)
      captives.push({
        name: character.name,
        formerFaction: factionName(state, record.formerFactionId),
        attitude: attitudeOf(record.will),
      })
    }

    damaged.push(...damageOnCapture(target, random))
    resolveProvinceOwners(state.geography)

    if (defenderFaction !== null && isFactionDestroyed(state, defenderFaction)) {
      released.push(...dissolveFaction(state, defenderFaction))
    }
  } else {
    for (const unit of attackerUnits) {
      const character = state.characters.find((item) => item.id === unit.characterId)
      if (character === undefined) {
        continue
      }
      loseLoyalty(character, LOYALTY_LOSS.battleLost)
      const note = maybeDefect(state, character, '败绩')
      if (note !== null) {
        notes.push(note)
      }
    }
  }

  for (const unit of attackerUnits) {
    markActed(state, unit.characterId)
  }
  for (const unit of defenderUnits) {
    if (!unit.stationed) {
      markActed(state, unit.characterId)
    }
  }

  report.captives = captives
  battle.randomState = random.getState()
  state.randomState = battle.randomState

  const fateNote = fates.length > 0 ? `；守将 ${fates.join('、')}` : ''
  const releaseNote = released.length > 0 ? `；${released.join('、')}` : ''
  const damageNote =
    damaged.length > 0
      ? `；战火波及，${damaged.map((kind) => DEVELOPMENT_LABELS[kind]).join('、')} 各降一级`
      : ''
  const outcome = attackerWins
    ? undefended
      ? `${attackerNames} 不战而下，取下 ${target.name}${releaseNote}`
      : `${attackerNames} 攻占 ${target.name}${fateNote}${releaseNote}${damageNote}`
    : `${attackerNames} 进攻 ${target.name} 失利${notes.length > 0 ? `；${notes.join('、')}` : ''}`

  const record: ActionRecord = {
    kind: 'attack',
    factionId: attackerFaction,
    date: { ...state.currentDate },
    targetId: target.id,
    outcome,
    battle: report,
  }
  state.history.push(record)

  return { ok: true, record }
}

/**
 * 占领后指定一人留驻新点：从参战者中选一名仍在仕、仍属攻方的武将，不耗行动力。
 * 传 null 表示不留驻。
 */
export function stationAfterCapture(
  state: GameState,
  siteId: SiteId,
  characterId: CharacterId | null,
  factionId: FactionId = state.playerFaction,
): string {
  if (characterId === null) {
    return ''
  }
  const site = state.geography.sites.find((item) => item.id === siteId)
  const character = state.characters.find((item) => item.id === characterId)
  if (site === undefined || site.owner !== factionId) {
    return ''
  }
  if (character === undefined || !isServing(character) || character.factionId !== factionId) {
    return ''
  }
  if (character.stationedSiteId !== null) {
    return ''
  }

  for (const officer of state.characters) {
    if (officer.stationedSiteId === siteId) {
      officer.stationedSiteId = null
    }
  }
  character.stationedSiteId = siteId

  return `${character.name} 留驻 ${site.name}`
}
