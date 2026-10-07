import type { ActionKind, ActionRecord, BattleReport, FactionId, GameState } from './model'

/** 每季的行动力预算。 */
export const ACTION_POINTS_PER_TURN = 10

/**
 * 各项行动的行动力消耗，集中定义。
 * 初值供迭代 5 按实测调整：进攻最贵；寻访与征兵次之；征粮与拜访再次；调动最轻。
 * 一季 10 点，寻访 + 进攻 + 征兵正好 10，即「三件事」为一个满季。
 */
export const ACTION_COSTS: Record<ActionKind, number> = {
  seekTalent: 3,
  visit: 2,
  recruit: 3,
  harvestGrain: 2,
  transfer: 1,
  attack: 4,
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

/** 行动的产出，用于写入本季记录。 */
export interface ActionOutcome {
  targetId?: string | null
  outcome: string
  /** 进攻的战报，写入记录供界面展示。 */
  battle?: BattleReport
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
  const factionId = request.factionId ?? state.playerFaction
  const blocked = request.precondition?.(state) ?? null
  if (blocked !== null) {
    return { ok: false, reason: blocked }
  }

  if (!spendActionPoints(state, factionId, request.kind, request.cost)) {
    return { ok: false, reason: '行动力不足' }
  }

  const { targetId = null, outcome, battle } = request.execute(state)
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

  return { ok: true, record }
}
