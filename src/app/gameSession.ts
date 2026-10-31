import type { ActionResult } from '../core/actions'
import {
  aiFeastBeforeBattle,
  autoAction,
  cancelAttack as runCancelAttack,
  deployDefenders,
  feastBattle as runFeastBattle,
  finishBattle,
  openAttack,
  refundFeast as runRefundFeast,
  resolveAction,
  type BattleActionEvent,
  type BattleDeployment,
  type BattleOpenResult,
  type BattleOrder,
  type BattleSide,
  type BattleState,
  type ForcedOutcome,
} from '../core/battle'
import { executeCaptive as runExecuteCaptive, persuade as runPersuade, releaseCaptive as runReleaseCaptive } from '../core/captives'
import { createInitialState } from '../core/createInitialState'
import { build as runBuild } from '../core/construction'
import {
  alliance as runAlliance,
  declareWar as runDeclareWar,
  demand as runDemand,
  gift as runGift,
  makePeace as runMakePeace,
} from '../core/diplomacy'
import { LocalSaveStore } from '../core/localSaveStore'
import { relief as runRelief } from '../core/economy'
import { strengthen as runStrengthen } from '../core/growth'
import { assignStation as runAssignStation, harvestGrain as runHarvestGrain, recruit as runRecruit } from '../core/military'
import type { AbilityKind, CharacterId, DevelopmentKind, FactionId, GameState, Scenario, SiteId } from '../core/model'
import { disband as runDisband, dismiss as runDismiss, reward as runReward } from '../core/personnel'
import { createRandom, type Random } from '../core/random'
import { AUTO_SAVE_KEY, slotKey, type SaveStore, type SaveSummary } from '../core/saveStore'
import { seekTalent as runSeekTalent, visit as runVisit } from '../core/seekTalent'
import {
  beginTurn,
  endTurn as resolveEndTurn,
  type FactionTurnSignal,
  type TurnRun,
} from '../core/turn'
import { settleOutcome } from '../core/victory'

export type StateListener = (state: GameState) => void

export interface GameSessionOptions {
  /** 固定抽卡随机源的种子，仅供测试；不指定时按回合播种。 */
  drawSeed?: number
}

/**
 * 抽卡随机源按回合播种：同一回合里无论刷新还是读档，抽到的人都一样、判定也一样，
 * 不能靠 S/L 重掷；要再争取只能花行动力拜访。
 */
function drawSeedFor(state: GameState): number {
  const text = `${state.currentDate.era}|${state.currentDate.year}|${state.currentDate.season}|${state.currentTurn}|${state.playerFaction}`
  let hash = 2166136261

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) || 1
}

/** 持有当前对局的唯一 GameState，负责回合推进、行动、回合开始的自动存档与手动槽位。 */
export class GameSession {
  private state: GameState
  private readonly listeners = new Set<StateListener>()
  /** 固定抽卡的种子，仅供测试；为空时按回合播种。 */
  private readonly drawSeedOverride: number | null
  /** 玩家发起抽取所用的随机源，按回合播种、不随存档保存。 */
  private drawRandom: Random
  /** 本回合分步推进的句柄；界面逐次应战时持有，跑完即清空。 */
  private turnRun: TurnRun | null = null
  /** 上一次自动存档是否写入失败，供界面在回合结束时如实提示。 */
  private autoSaveFailed = false

  constructor(
    private readonly saveStore: SaveStore = new LocalSaveStore(),
    options: GameSessionOptions = {},
  ) {
    this.state = this.saveStore.load(AUTO_SAVE_KEY) ?? createInitialState()
    this.drawSeedOverride = options.drawSeed ?? null
    this.drawRandom = this.createDrawRandom()
  }

  getState(): GameState {
    return this.state
  }

  /** 上一次自动存档是否失败；界面据此把「已自动保存」换成失败提示。 */
  isAutoSaveFailed(): boolean {
    return this.autoSaveFailed
  }

  /** 用指定剧本重开一局：重置对局并写入自动存档，覆盖当前进度；手动槽位不受影响。种子仅供测试复现。 */
  newGame(scenario: Scenario, seed?: number): void {
    this.state = createInitialState({ scenario, seed })
    this.drawRandom = this.createDrawRandom()
    this.saveAuto()
    this.notify()
  }

  /** 结束本回合：其他势力行动，随后结算并进入下一回合，写入自动存档。 */
  endTurn(): void {
    this.turnRun = null
    resolveEndTurn(this.state)
    this.saveAuto()
    this.drawRandom = this.createDrawRandom()
    this.notify()
  }

  /**
   * 结束回合（分步）：他方来攻我方时暂停，交回待应战的信号；本回合跑完则返回 null。
   * 界面据信号逐次应战——先收到「待应战」，再以守方的迎战编成与出马者作答，随即收到这一战的战报。
   */
  endTurnStaged(): FactionTurnSignal | null {
    this.turnRun = beginTurn(this.state)
    return this.advanceTurnStep(null)
  }

  /** 把打完的防守战交回推进器：结算战果并取下一场来犯，或跑完本回合。 */
  finishDefense(battle: BattleState): FactionTurnSignal | null {
    return this.advanceTurnStep(battle)
  }

  /** 演出看完后继续推进本回合：取下一场来犯，或跑完本回合。 */
  continueTurn(): FactionTurnSignal | null {
    return this.advanceTurnStep(null)
  }

  /**
   * 继续推进本回合；跑完则清空推进器、按新回合播种抽卡源并写入自动存档。
   * 每步之后结算结局：玩家中途覆灭即停下，不再让余下势力出手。
   * 已结束的一局不写自动存档，留下上一回合开局的可玩存档供重来。
   */
  private advanceTurnStep(decision: BattleState | null): FactionTurnSignal | null {
    if (this.turnRun === null) {
      return null
    }

    const signal = this.turnRun.advance(decision)
    const ended = settleOutcome(this.state)
    if (signal === null) {
      this.turnRun = null
      this.drawRandom = this.createDrawRandom()
      if (!ended) {
        this.saveAuto()
      }
    } else if (ended) {
      this.turnRun = null
    }
    this.notify()

    return signal
  }

  /** 在指定自有战略点就地寻访；成功后通知界面，失败时返回原因且不改变对局。自动存档只在回合开始时写入。 */
  seekTalent(siteId: SiteId): ActionResult {
    return this.apply(runSeekTalent(this.state, this.drawRandom, siteId))
  }

  /** 再次拜访一位已接触的在野者：提升其对己方的意愿并重新判定招聘；成功后通知界面。 */
  visit(characterId: CharacterId): ActionResult {
    return this.apply(runVisit(this.state, this.drawRandom, characterId))
  }

  /** 在本方某处战略点征兵，由名册中选一名武将执行；成功后通知界面。 */
  recruit(siteId: SiteId, characterId: CharacterId): ActionResult {
    return this.apply(runRecruit(this.state, siteId, characterId))
  }

  /** 在本方某处战略点征粮，由名册中选一名武将执行；成功后通知界面。 */
  harvestGrain(siteId: SiteId, characterId: CharacterId): ActionResult {
    return this.apply(runHarvestGrain(this.state, siteId, characterId))
  }

  /** 在本方某处战略点投粮赈济，由名册中选一名武将执行；成功后通知界面。 */
  relief(siteId: SiteId, characterId: CharacterId): ActionResult {
    return this.apply(runRelief(this.state, siteId, characterId))
  }

  /** 任命或撤换某点的驻将；传 null 表示撤下现任。成功后通知界面。 */
  assignStation(siteId: SiteId, characterId: CharacterId | null): ActionResult {
    return this.apply(runAssignStation(this.state, siteId, characterId))
  }

  /** 赏赐麾下武将，花金钱提升其忠诚；成功后通知界面。 */
  reward(characterId: CharacterId): ActionResult {
    return this.apply(runReward(this.state, characterId))
  }

  /** 解任麾下武将，他转为在野；成功后通知界面。 */
  dismiss(characterId: CharacterId): ActionResult {
    return this.apply(runDismiss(this.state, characterId))
  }

  /** 用出战累积的额度强化麾下武将的某项能力；成功后通知界面。 */
  strengthen(characterId: CharacterId, kind: AbilityKind): ActionResult {
    return this.apply(runStrengthen(this.state, characterId, kind))
  }

  /** 把某武将的兵力遣散到指定数量；不耗行动力，成功后通知界面。 */
  disband(characterId: CharacterId, remaining: number): ActionResult {
    return this.apply(runDisband(this.state, characterId, remaining))
  }

  /** 在自有战略点建设一项内政（农田、市集或民居），由名册中选一名武将主持；成功后通知界面。 */
  build(siteId: SiteId, kind: DevelopmentKind, characterId: CharacterId): ActionResult {
    return this.apply(runBuild(this.state, siteId, kind, characterId))
  }

  /**
   * 开战：校验目标与出征者，扣行动力与粮草并排好我方阵形；成功后由界面逐回合指挥。
   * 守方由规则层自动布阵。
   */
  attack(targetSiteId: SiteId, deployments: readonly BattleDeployment[]): BattleOpenResult {
    const result = openAttack(this.state, targetSiteId, deployments)
    if (result.ok) {
      // 富裕的守方会在开战前犒军，界面的敌情随之反映更高的士气。
      aiFeastBeforeBattle(this.state, result.battle)
      this.notify()
    }

    return result
  }

  /** 开战前犒军：花金提振本场士气，一场至多一次；成功后通知界面。 */
  feast(battle: BattleState): { ok: true; cost: number } | { ok: false; reason: string } {
    const result = runFeastBattle(this.state, battle)
    if (result.ok) {
      this.notify()
    }

    return result
  }

  /** 为当前行动的一队下令，结算一次行动；返回演出所需的结果。 */
  battleAction(battle: BattleState, order: BattleOrder): BattleActionEvent | null {
    const event = resolveAction(battle, order)
    if (event !== null) {
      this.notify()
    }

    return event
  }

  /** 由规则层替当前行动的一队下令，结算一次行动；他方行动与自动战斗共用。 */
  battleAutoAction(battle: BattleState): BattleActionEvent | null {
    const event = autoAction(battle)
    if (event !== null) {
      this.notify()
    }

    return event
  }

  /** 我方进攻打完：折算战损、定去向、易主并写入历史；成功后通知界面。 */
  finishAttack(battle: BattleState, forcedOutcome: ForcedOutcome | null = null): ActionResult {
    return this.apply(finishBattle(this.state, battle, forcedOutcome))
  }

  /** 取消尚未开打的进攻：退回行动力与粮草，通知界面。 */
  cancelAttack(battle: BattleState): boolean {
    const refunded = runCancelAttack(this.state, battle)
    if (refunded) {
      this.notify()
    }

    return refunded
  }

  /** 重新选将前撤回本场已投的犒军；退回金钱并复原士气。 */
  refundFeast(battle: BattleState, side: BattleSide): boolean {
    const refunded = runRefundFeast(this.state, battle, side)
    if (refunded) {
      this.notify()
    }

    return refunded
  }

  /** 我方守土：排定守方阵形；不合规时返回原因。 */
  deployDefense(battle: BattleState, deployments: readonly BattleDeployment[]): string | null {
    const problem = deployDefenders(battle, this.state, deployments)
    this.notify()

    return problem
  }

  /** 劝降营中的一名俘虏：花行动力使其意愿上升，到「愿降」档再劝一次即归附；成功后通知界面。 */
  persuade(characterId: CharacterId): ActionResult {
    return this.apply(runPersuade(this.state, this.drawRandom, characterId))
  }

  /** 斩杀营中的一名俘虏；成功后通知界面。 */
  executeCaptive(characterId: CharacterId): ActionResult {
    return this.apply(runExecuteCaptive(this.state, characterId))
  }

  /** 释放营中的一名俘虏，他转为在野；成功后通知界面。 */
  releaseCaptive(characterId: CharacterId): ActionResult {
    return this.apply(runReleaseCaptive(this.state, characterId))
  }

  /** 向对方宣战；成功后通知界面。 */
  declareWar(factionId: FactionId): ActionResult {
    return this.apply(runDeclareWar(this.state, factionId))
  }

  /** 与敌对方停战；成功后通知界面。 */
  makePeace(factionId: FactionId): ActionResult {
    return this.apply(runMakePeace(this.state, factionId))
  }

  /** 与中立方结盟；成功后通知界面。 */
  alliance(factionId: FactionId): ActionResult {
    return this.apply(runAlliance(this.state, factionId))
  }

  /** 向对方赠礼以提升好感；成功后通知界面。 */
  gift(factionId: FactionId): ActionResult {
    return this.apply(runGift(this.state, factionId))
  }

  /** 向对方索取粮食；成功后通知界面。 */
  demand(factionId: FactionId): ActionResult {
    return this.apply(runDemand(this.state, factionId))
  }

  /** 读取自动存档；没有可用存档时返回 false，当前对局保持不变。 */
  loadAutoSave(): boolean {
    return this.applySave(AUTO_SAVE_KEY)
  }

  /** 存入手动槽位；存储不可用时返回 false，由界面如实提示。 */
  saveToSlot(slot: number): boolean {
    const saved = this.saveStore.save(slotKey(slot), this.state)
    this.notify()

    return saved
  }

  /** 读取槽位；该槽位没有可用存档时返回 false，当前对局保持不变。 */
  loadSlot(slot: number): boolean {
    return this.applySave(slotKey(slot))
  }

  /** 读取自动存档摘要供界面展示；没有自动存档时返回 null。 */
  readAutoSave(): SaveSummary | null {
    return this.saveStore.loadSummary(AUTO_SAVE_KEY)
  }

  /** 读取槽位摘要供界面展示；空槽位返回 null。 */
  readSlot(slot: number): SaveSummary | null {
    return this.saveStore.loadSummary(slotKey(slot))
  }

  subscribe(listener: StateListener): void {
    this.listeners.add(listener)
  }

  /** 行动成功后补一次结局判定并通知界面；失败时不改动对局。 */
  private apply(result: ActionResult): ActionResult {
    if (result.ok) {
      settleOutcome(this.state)
      this.notify()
    }

    return result
  }

  private applySave(key: string): boolean {
    const saved = this.saveStore.load(key)
    if (saved === null) {
      return false
    }

    this.state = saved
    this.drawRandom = this.createDrawRandom()
    this.notify()

    return true
  }

  /** 写入自动存档并记下成败；存储不可用时对局照常，只是这一份进度没能落盘。 */
  private saveAuto(): void {
    this.autoSaveFailed = !this.saveStore.save(AUTO_SAVE_KEY, this.state)
  }

  private createDrawRandom(): Random {
    return createRandom(this.drawSeedOverride ?? drawSeedFor(this.state))
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}
