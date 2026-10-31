import type { ActionKind, ActionRecord, BattleReport, CharacterId, FactionId, GameState } from './model'

/** 每季的行动力预算。 */
export const ACTION_POINTS_PER_TURN = 10

/**
 * 各项行动的行动力消耗，集中定义。
 * 进攻与求和最贵：一季的预算无法在同一季内走完「宣战—进攻—求和」。
 * 征兵次之；征粮与经营再次。
 */
export const ACTION_COSTS: Record<ActionKind, number> = {
  seekTalent: 3,
  visit: 2,
  hire: 0,
  recruit: 3,
  harvestGrain: 2,
  relief: 1,
  build: 2,
  attack: 4,
  declareWar: 2,
  makePeace: 6,
  dismiss: 1,
  station: 1,
  reward: 2,
  strengthen: 2,
  disband: 0,
  persuade: 2,
  executeCaptive: 0,
  releaseCaptive: 0,
}

/** 该势力当季剩余行动力是否够执行某项行动。 */
export function canAfford(state: GameState, factionId: FactionId, kind: ActionKind): boolean {
  return (state.actionPoints[factionId] ?? 0) >= ACTION_COSTS[kind]
}

/** 扣除该势力的行动力；不足时不改动状态并返回 false。省略消耗时取该行动的标准消耗。 */
export function spendActionPoints(
  state: GameState,
  factionId: FactionId,
  kind: ActionKind,
  cost = ACTION_COSTS[kind],
): boolean {
  const remaining = state.actionPoints[factionId] ?? 0
  if (remaining < cost) {
    return false
  }

  state.actionPoints[factionId] = remaining - cost

  return true
}

/** 行动的规则实现：前置条件与执行本身。 */
export interface ActionRequest {
  kind: ActionKind
  /** 发起行动的势力，缺省为玩家势力。 */
  factionId?: FactionId
  /** 行动力消耗，缺省取该行动的标准消耗；一次处理多名武将是按其人数累加。 */
  cost?: number
  /** 前置条件校验，不满足时返回原因；满足时返回 null。 */
  precondition?: (state: GameState) => string | null
  /** 执行规则，此时行动力已扣除；返回行动的目标与结果。 */
  execute: (state: GameState) => ActionOutcome
}

/** 招聘判定成功、等待玩家确认付款时带回的信息。 */
export interface PendingHire {
  characterId: CharacterId
  cost: number
}

/** 行动的产出，用于写入本季记录。 */
export interface ActionOutcome {
  targetId?: string | null
  outcome: string
  /** 进攻的战报，写入记录供界面展示。 */
  battle?: BattleReport
  /** 招聘判定已过但尚未付款；界面据此询问玩家，确认后再走 `hire`。 */
  pendingHire?: PendingHire
}

/** 行动的结局：成功时带回写入本季记录的条目，失败时带回原因。 */
export type ActionResult =
  | { ok: true; record: ActionRecord; pendingHire?: PendingHire }
  | { ok: false; reason: string }

/**
 * 统一的行动流程：校验前置条件 → 校验行动力 → 扣除 → 执行规则 → 记录。
 * 前置条件或行动力不满足时整体拒绝，状态不变。
 */
export function runAction(state: GameState, request: ActionRequest): ActionResult {
  const factionId = request.factionId ?? state.playerFaction
  const blocked = request.precondition?.(state) ?? null
  if (blocked !== null) {
    return { ok: false, reason: blocked }
  }

  if (!spendActionPoints(state, factionId, request.kind, request.cost)) {
    return { ok: false, reason: '行动力不足' }
  }

  const { targetId = null, outcome, battle, pendingHire } = request.execute(state)
  const record: ActionRecord = {
    kind: request.kind,
    factionId,
    date: { ...state.currentDate },
    targetId,
    outcome,
  }
  if (battle !== undefined) {
    record.battle = battle
  }
  state.history.push(record)

  if (pendingHire === undefined) {
    return { ok: true, record }
  }

  return { ok: true, record, pendingHire }
}
