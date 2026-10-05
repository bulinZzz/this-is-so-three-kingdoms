import type { ActionKind, ActionRecord, FactionId, GameState } from './model'

/** 每季的行动力预算。 */
export const ACTION_POINTS_PER_TURN = 10

/** 各项行动的行动力消耗，集中定义。 */
export const ACTION_COSTS: Record<ActionKind, number> = {
  seekTalent: 4,
}

/** 当季剩余行动力是否够执行某项行动。 */
export function canAfford(state: GameState, kind: ActionKind): boolean {
  return state.actionPoints >= ACTION_COSTS[kind]
}

/** 扣除某项行动的行动力；不足时不改动状态并返回 false。 */
export function spendActionPoints(state: GameState, kind: ActionKind): boolean {
  if (!canAfford(state, kind)) {
    return false
  }

  state.actionPoints -= ACTION_COSTS[kind]

  return true
}

/** 行动的规则实现：前置条件与执行本身。 */
export interface ActionRequest {
  kind: ActionKind
  /** 发起行动的势力，缺省为玩家势力。 */
  factionId?: FactionId
  /** 前置条件校验，不满足时返回原因；满足时返回 null。 */
  precondition?: (state: GameState) => string | null
  /** 执行规则，此时行动力已扣除；返回行动的目标与结果。 */
  execute: (state: GameState) => ActionOutcome
}

/** 行动的产出，用于写入本季记录。 */
export interface ActionOutcome {
  targetId?: string | null
  outcome: string
}

/** 行动的结局：成功时带回写入本季记录的条目，失败时带回原因。 */
export type ActionResult =
  | { ok: true; record: ActionRecord }
  | { ok: false; reason: string }

/**
 * 统一的行动流程：校验前置条件 → 校验行动力 → 扣除 → 执行规则 → 记录。
 * 前置条件或行动力不满足时整体拒绝，状态不变。
 */
export function runAction(state: GameState, request: ActionRequest): ActionResult {
  const blocked = request.precondition?.(state) ?? null
  if (blocked !== null) {
    return { ok: false, reason: blocked }
  }

  if (!spendActionPoints(state, request.kind)) {
    return { ok: false, reason: '行动力不足' }
  }

  const { targetId = null, outcome } = request.execute(state)
  const record: ActionRecord = {
    kind: request.kind,
    factionId: request.factionId ?? state.playerFaction,
    date: { ...state.currentDate },
    targetId,
    outcome,
  }
  state.history.push(record)

  return { ok: true, record }
}
