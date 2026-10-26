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
 * 战斗：双方各排六个阵位（前三后三），开战后各自沿行动条累积，先满者先行，
 * 双方合计二十五次为限。每次行动由玩家或规则层为当前行动的一队下指令，
 * 行动当场结算，便于界面逐次演出。
 * 规则见《战斗系统》。本模块只管一场战斗的推演与结算，不依赖画面；
 * 随机源随战斗状态携带，结束后写回对局，固定种子下同一场战斗可复现。
 */

/** 双方合计的行动次数上限。 */
export const BATTLE_ACTIONS = 25
/** 行动条满值；一队累计到此值即行动一次，余量留到下一次。 */
export const ACTION_THRESHOLD = 100
/** 待机后的行动条进度：不耗行动次数，条子回落到此值。 */
export const WAIT_PROGRESS = 60
/** 出击后的行动条进度。 */
export const SORTIE_PROGRESS = 30
/** 士气满值与下限。 */
export const MORALE_FULL = 100
export const MORALE_FLOOR = 40
/** 每方的阵位：前三后三。 */
export const FRONT_SIZE = 3
export const BACK_SIZE = 3
export const SLOT_COUNT = FRONT_SIZE + BACK_SIZE
/** 一队退场时本方的士气损失。 */
const MORALE_LOSS_PER_EXIT = 5
/** 主动攻击的自损比例；弓兵不在此列。 */
const ATTACK_SELF_LOSS = 0.05
/** 攻击防御中的步兵时，攻击方自损的缩放；初值取半，随实测调整。 */
const DEFEND_SELF_LOSS_SCALE = 0.5
/** 防御指令的减伤。 */
const DEFEND_DAMAGE_SCALE = 0.7
/** 弓箭手对伤害的倍率。 */
const ARCHER_DAMAGE_SCALE = 0.7
/** 伤害与减伤的兵力系数；二十五次行动的节奏下，一击须有明显分量。 */
const DAMAGE_TROOP_FACTOR = 0.6
const REDUCTION_TROOP_FACTOR = 0.15
/** 武力对伤害、统率对减伤的点数系数。 */
const MIGHT_SCALE = 0.003
const COMMAND_DEFENSE_SCALE = 0.003
/** 伤害与减伤各自的随机幅度。 */
const DAMAGE_VARIANCE = 0.1
/** 每次行动后重掷的速度扰动幅度：行动条上多一分错落，又不至于抹平兵种差异。 */
const PACE_VARIANCE = 0.1
/** 战损折算：按战损比例扣减七成。 */
const CASUALTY_CONVERSION = 0.7
/** 守方败退后的去向：撤回、战死、被俘。 */
const DEFENDER_FLEE_CHANCE = 0.75
const DEFENDER_DIE_CHANCE = 0.1
/** 守方自选武将的上阵人数；驻将另计。 */
export const DEFENDER_SELECTION = 5
/** 攻方上阵人数。 */
export const ATTACKER_SELECTION = 5

/** 兵种参数：机动决定行动条增速，攻防决定伤害与减伤，射程决定可打的排。 */
export interface ArmStats {
  label: string
  mobility: number
  attack: number
  defense: number
  ranged: boolean
  /** 出手时的自损系数：近战会受到反伤，弓兵隔空放箭，不在此列。 */
  counterLoss: number
}

export const ARM_STATS: Record<ArmType, ArmStats> = {
  infantry: { label: '步兵', mobility: 10, attack: 1, defense: 1, ranged: false, counterLoss: 1 },
  archer: { label: '弓箭手', mobility: 9, attack: 0.85, defense: 0.8, ranged: true, counterLoss: 0 },
  cavalry: { label: '骑兵', mobility: 13, attack: 1.3, defense: 0.6, ranged: false, counterLoss: 1 },
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

/** 一队本次行动的指令：攻击、防御、待机或出击。 */
export type BattleOrderKind = 'attack' | 'defend' | 'wait' | 'sortie'

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
  command: number
  intellect: number
  /** 阵位：0–2 为前排，3–5 为后排。 */
  slot: number
  /** 是否为该点的驻将：驻将不占自选名额、战后不因防守转为已行动。 */
  stationed: boolean
  /** 行动条进度：满 ACTION_THRESHOLD 即可行动，行动后扣去满值、余量留待下次。 */
  progress: number
  /** 本次行动后的速度扰动系数：每次行动重掷，令行动条不至于整齐划一。 */
  pace: number
  /** 是否处于防御姿态：持续到自己下次行动。 */
  defending: boolean
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
  /** 双方已行动的次数。 */
  actionsUsed: number
  /** 行动次数上限。 */
  actionLimit: number
  /** 上次推进行动条所用的 tick 数；界面据此按同一节奏把条子走完。 */
  advanceTicks: number
  /** 行动条上当前该出手的一队；由进度推得，随每次行动重新排定。 */
  activeUnitId: CharacterId | null
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
  /** 被同排防御者代伤时原本锁定的目标；无代伤为 null。 */
  intendedTargetName: string | null
  /** 对目标造成的战兵损失。 */
  damage: number
  /** 主动攻击的自损。 */
  selfLoss: number
  /** 行动后的剩余战兵。 */
  actorTroops: number
  /** 本次行动结算后、行动条继续推进之前，出手者所处的进度。 */
  actorProgress: number
  targetTroops: number | null
  /** 出击前后的阵位；非出击为 null。 */
  fromSlot: number | null
  toSlot: number | null
  /** 本次行动后退场的队伍。 */
  exited: { characterId: CharacterId; name: string; side: BattleSide }[]
  /** 累计行动次数。 */
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
      (factionId === state.playerFaction || scopeSitesFor(state, character).includes(siteId)),
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
 * 按兵种排默认阵形：近战填前排、弓箭手填后排；一侧坐满后溢到另一侧。
 * 全是弓手时也至少挪一队到前排，否则开不了战。
 */
export function autoFormation(
  characters: readonly { id: CharacterId; armType: ArmType }[],
): BattleDeployment[] {
  const front = [0, 1, 2]
  const back = [3, 4, 5]
  const deployments: BattleDeployment[] = []

  const place = (character: { id: CharacterId }, slot: number | undefined): void => {
    if (slot !== undefined) {
      deployments.push({ characterId: character.id, slot })
    }
  }

  for (const character of characters) {
    if (character.armType !== 'archer') {
      place(character, front.shift() ?? back.shift())
    }
  }
  for (const character of characters) {
    if (character.armType === 'archer') {
      place(character, back.shift() ?? front.shift())
    }
  }

  if (deployments.length > 0 && !deployments.some((item) => item.slot < FRONT_SIZE)) {
    deployments[0]!.slot = 0
  }

  return deployments
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
  if (battle.actionsUsed > 0) {
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
    command: character.command,
    intellect: character.intellect,
    slot,
    stationed,
    progress: 0,
    pace: 1,
    defending: false,
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
 * 该武将能否从活动范围出兵攻打目标：其范围内须有一处本方所有、且与目标相邻的城池。
 * 只用于他方势力；玩家麾下不受活动范围限制（见 `attackBlockReason`）。
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
    if (
      factionId !== state.playerFaction &&
      !canAttackTarget(state, character, targetSiteId, factionId)
    ) {
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
 * 进攻某战略点的候选部属：名册中未驻守、有兵的武将。
 * 玩家麾下不受活动范围限制；他方仍按各自的活动范围取人。
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
      (factionId === state.playerFaction ||
        canAttackTarget(state, character, targetSiteId, factionId)),
  )
}

/** 自动挑选守将：该点驻将与其余名册中可守的武将，按名册次序取至多六队。 */
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
    actionsUsed: 0,
    actionLimit: BATTLE_ACTIONS,
    advanceTicks: 0,
    activeUnitId: null,
    finished: false,
    undefended: false,
    attackerWins: false,
    randomState: state.randomState,
    forcedOutcome: null,
  }
  seedPace(battle, units)

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
 * 取消一场尚未开打的进攻：退回已扣的行动力与粮草，战斗作废。
 * 只在摆阵阶段可用；已经开打则不能反悔。
 */
export function cancelAttack(state: GameState, battle: BattleState): boolean {
  const factionId = battle.attacker.factionId
  if (battle.finished || battle.actionsUsed > 0 || factionId === null) {
    return false
  }
  const faction = state.factions.find((item) => item.id === factionId)
  if (faction === undefined) {
    return false
  }

  const troops = battle.attacker.units.reduce((total, unit) => total + unit.troops, 0)
  state.actionPoints[factionId] = (state.actionPoints[factionId] ?? 0) + ACTION_COSTS.attack
  faction.grain += attackGrainCost(troops)

  return true
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
  seedPace(battle, units)
  refreshActor(battle)

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
 * 一队可攻击的目标：近战只及敌方前排，弓箭手可及任意；敌方前排已空时，近战也及于后排。
 * 后排的近战够不着敌军，骑兵须先出击、步兵只能防御或待机。
 */
export function targetsFor(battle: BattleState, unit: BattleUnit): BattleUnit[] {
  const enemies = enemyUnits(battle, unit.side)
  if (ARM_STATS[unit.armType].ranged) {
    return enemies
  }
  if (rowOfSlot(unit.slot) === 1) {
    return []
  }

  const front = enemies.filter((target) => rowOfSlot(target.slot) === 0)

  return front.length > 0 ? front : enemies
}

/** 骑兵在后排且正前方无人或只剩溃兵时，才可以出击。 */
export function canSortie(battle: BattleState, unit: BattleUnit): boolean {
  if (unit.armType !== 'cavalry' || rowOfSlot(unit.slot) === 0) {
    return false
  }

  const ahead = battle[unit.side].units.find((item) => item.slot === unit.slot - FRONT_SIZE)

  return ahead === undefined || !alive(ahead)
}

/**
 * 一队此刻可选的指令：由兵种与所在排决定。
 * 骑兵前排可攻击、后排只能出击或待机；步兵前排可攻击与防御、后排只能防御或待机；
 * 弓箭手在哪一排都可攻击。待机人人可选。
 */
export function ordersFor(battle: BattleState, unit: BattleUnit): BattleOrderKind[] {
  if (unit.exited) {
    return []
  }

  const front = rowOfSlot(unit.slot) === 0
  if (unit.armType === 'archer') {
    return ['attack', 'wait']
  }
  if (unit.armType === 'cavalry') {
    return front ? ['attack', 'wait'] : canSortie(battle, unit) ? ['sortie', 'wait'] : ['wait']
  }

  return front ? ['attack', 'defend', 'wait'] : ['defend', 'wait']
}

/** 同排的防御步兵中随机取一名，替被锁定的友军承担这一击。 */
function guardFor(
  battle: BattleState,
  target: BattleUnit,
  random: Random,
): BattleUnit | null {
  const row = rowOfSlot(target.slot)
  const guards = aliveUnits(battle[target.side]).filter(
    (unit) =>
      unit.armType === 'infantry' &&
      unit.defending &&
      rowOfSlot(unit.slot) === row &&
      unit.characterId !== target.characterId,
  )
  if (guards.length === 0) {
    return null
  }

  return guards[Math.min(guards.length - 1, Math.floor(random.next() * guards.length))] ?? null
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
    (1 + defender.command * COMMAND_DEFENSE_SCALE) *
    moraleFactor(defenderSide.morale) *
    variance(random)

  if (reduction >= damage) {
    return 0
  }

  let actual = damage - reduction
  if (defender.defending) {
    actual *= DEFEND_DAMAGE_SCALE
  }
  if (defender.side === 'defender') {
    actual *= 1 - siteBonus
  }

  return Math.max(0, Math.round(actual))
}

/** 为一批刚上阵的队伍掷下第一次速度扰动。 */
function seedPace(battle: BattleState, units: readonly BattleUnit[]): void {
  const random = createRandom(battle.randomState)
  for (const unit of units) {
    unit.pace = 1 - PACE_VARIANCE + random.next() * 2 * PACE_VARIANCE
  }
  battle.randomState = random.getState()
}

/** 一队本次的实际速度：兵种机动乘上自己的扰动。 */
function paceOf(unit: BattleUnit): number {
  return ARM_STATS[unit.armType].mobility * unit.pace
}

/** 行动条已满的队伍里挑当前出手者：进度高者先行，同进度攻方在前，再按阵位。 */
function pickReady(units: readonly BattleUnit[]): BattleUnit | null {
  let best: BattleUnit | null = null

  for (const unit of units) {
    if (unit.progress + 1e-9 < ACTION_THRESHOLD) {
      continue
    }
    if (best === null || unit.progress > best.progress + 1e-9) {
      best = unit
      continue
    }
    if (Math.abs(unit.progress - best.progress) > 1e-9) {
      continue
    }
    if (unit.side !== best.side) {
      if (unit.side === 'attacker') {
        best = unit
      }
      continue
    }
    if (unit.slot < best.slot) {
      best = unit
    }
  }

  return best
}

/** 推进行动条直到有一队满值，返回该队；无人可动时为 null。 */
function nextActor(battle: BattleState): BattleUnit | null {
  const units = [...aliveUnits(battle.attacker), ...aliveUnits(battle.defender)]
  if (units.length === 0) {
    battle.advanceTicks = 0
    return null
  }

  const ready = pickReady(units)
  if (ready !== null) {
    battle.advanceTicks = 0
    return ready
  }

  let ticks = Number.POSITIVE_INFINITY
  for (const unit of units) {
    const pace = paceOf(unit)
    if (pace > 0) {
      ticks = Math.min(ticks, (ACTION_THRESHOLD - unit.progress) / pace)
    }
  }
  if (!Number.isFinite(ticks)) {
    battle.advanceTicks = 0
    return null
  }

  for (const unit of units) {
    unit.progress += paceOf(unit) * ticks
  }
  battle.advanceTicks = ticks

  return pickReady(units)
}

/** 排定下一位行动者；战斗已结束或无人可动时清空。 */
function refreshActor(battle: BattleState): void {
  const actor = battle.finished ? null : nextActor(battle)
  battle.activeUnitId = actor?.characterId ?? null
}

/** 当前该行动的一队；尚未排定或战斗结束时为 null。 */
export function currentActor(battle: BattleState): BattleUnit | null {
  if (battle.finished || battle.activeUnitId === null) {
    return null
  }

  return findUnit(battle, battle.activeUnitId) ?? null
}

/** 他方为当前行动的一队下指令：能打则打，残队转守，后骑无路则待机。 */
export function autoOrderFor(battle: BattleState, unit: BattleUnit): BattleOrder {
  const orders = ordersFor(battle, unit)
  if (orders.includes('attack')) {
    const target = autoTarget(unit, targetsFor(battle, unit))
    if (target !== null) {
      const low = unit.battleTroops < unit.troops * 0.2
      if (!(low && orders.includes('defend'))) {
        return { characterId: unit.characterId, kind: 'attack', targetId: target.characterId }
      }
    }
  }
  if (orders.includes('defend')) {
    return { characterId: unit.characterId, kind: 'defend' }
  }
  if (orders.includes('sortie')) {
    return { characterId: unit.characterId, kind: 'sortie' }
  }

  return { characterId: unit.characterId, kind: 'wait' }
}

/** 双方是否还有队伍能造成伤害；两队只剩后排步兵时，谁也打不到谁。 */
function hasAnyAttacker(battle: BattleState): boolean {
  return [...aliveUnits(battle.attacker), ...aliveUnits(battle.defender)].some((unit) => {
    const orders = ordersFor(battle, unit)
    return orders.includes('attack') || orders.includes('sortie')
  })
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
  // 双方都只剩够不着敌军的队伍时，再等也不会有人倒下，按守方守住收场。
  if (!hasAnyAttacker(battle)) {
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
  if (!ordersFor(battle, actor).includes(order.kind)) {
    return null
  }

  const random = createRandom(battle.randomState)
  const ownSide = battle[actor.side]
  const otherSide = actor.side === 'attacker' ? battle.defender : battle.attacker
  const exitedBefore = [...battle.attacker.units, ...battle.defender.units]
    .filter((unit) => unit.exited)
    .map((unit) => unit.characterId)

  let target: BattleUnit | null = null
  let intendedTargetName: string | null = null
  let damage = 0
  let selfLoss = 0
  let fromSlot: number | null = null
  let toSlot: number | null = null

  // 轮到自己时，上一回留下的防御姿态到此为止。
  actor.defending = false

  if (order.kind === 'attack') {
    const targets = targetsFor(battle, actor)
    const intended =
      (order.targetId === undefined
        ? undefined
        : targets.find((item) => item.characterId === order.targetId)) ??
      autoTarget(actor, targets)

    if (intended !== null) {
      const guard = guardFor(battle, intended, random)
      target = guard ?? intended
      intendedTargetName = guard === null ? null : intended.name
      damage = damageOf(
        actor,
        ownSide,
        target,
        otherSide,
        SITE_DEFENSE_BONUS[battle.siteType],
        random,
      )
      if (damage > 0) {
        target.battleTroops = Math.max(0, target.battleTroops - damage)
        if (target.battleTroops <= 0) {
          exitUnit(target, otherSide)
        }
      }

      // 近战出手才有折损；打在防御中的步兵身上，反伤也随之减轻。
      const counterLoss =
        ATTACK_SELF_LOSS *
        ARM_STATS[actor.armType].counterLoss *
        (target.defending ? DEFEND_SELF_LOSS_SCALE : 1)
      selfLoss = Math.min(actor.battleTroops, Math.round(actor.battleTroops * counterLoss))
      actor.battleTroops = Math.max(0, actor.battleTroops - selfLoss)
      if (actor.battleTroops <= 0) {
        exitUnit(actor, ownSide)
      }
    }
  } else if (order.kind === 'defend') {
    actor.defending = true
  } else if (order.kind === 'sortie') {
    const aheadSlot = actor.slot - FRONT_SIZE
    const ahead = ownSide.units.find((unit) => unit.slot === aheadSlot)
    if (ahead !== undefined) {
      ahead.slot = actor.slot
    }
    fromSlot = actor.slot
    actor.slot = aheadSlot
    toSlot = aheadSlot
  }

  // 待机与出击不占行动次数，只把条子回落到指定进度；攻击与防御扣满值、计一次行动。
  if (order.kind === 'wait') {
    actor.progress = WAIT_PROGRESS
  } else if (order.kind === 'sortie') {
    actor.progress = SORTIE_PROGRESS
  } else {
    actor.progress = Math.max(0, actor.progress - ACTION_THRESHOLD)
    battle.actionsUsed += 1
  }

  actor.pace = 1 - PACE_VARIANCE + random.next() * 2 * PACE_VARIANCE
  const actorProgress = actor.progress
  battle.randomState = random.getState()
  evaluateEnd(battle)
  battle.activeUnitId = null
  if (!battle.finished) {
    refreshActor(battle)
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
    intendedTargetName,
    damage,
    selfLoss,
    actorTroops: actor.battleTroops,
    actorProgress,
    targetTroops: target?.battleTroops ?? null,
    fromSlot,
    toSlot,
    exited,
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
  // 守方始终无人布阵，按不战而下处理；轮到玩家排兵时不在此列。
  if (!battle.finished && battle.defender.units.length === 0) {
    battle.undefended = true
    battle.attackerWins = true
    battle.finished = true
    battle.activeUnitId = null
    return
  }

  while (!battle.finished) {
    if (autoAction(battle) === null) {
      return
    }
  }
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

    // 攻下之地并入参战者的活动范围，往后他方在此驻守、征兵与继续出兵仍有迹可循。
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

