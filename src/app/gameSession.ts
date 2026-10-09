import type { ActionResult } from '../core/actions'
import { attack as runAttack, type AttackParty, type DefenseChoice } from '../core/battle'
import { executeCaptive as runExecuteCaptive, persuade as runPersuade, releaseCaptive as runReleaseCaptive } from '../core/captives'
import { createInitialState } from '../core/createInitialState'
import { LocalSaveStore } from '../core/localSaveStore'
import { harvestGrain as runHarvestGrain, recruit as runRecruit, transfer as runTransfer } from '../core/military'
import type { CharacterId, GameState, Scenario, SiteId } from '../core/model'
import { createRandom, type Random } from '../core/random'
import { AUTO_SAVE_KEY, slotKey, type SaveStore, type SaveSummary } from '../core/saveStore'
import { seekTalent as runSeekTalent, visit as runVisit } from '../core/seekTalent'
import {
  beginTurn,
  endTurn as resolveEndTurn,
  type FactionTurnSignal,
  type TurnRun,
} from '../core/turn'

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

  /** 用指定剧本重开一局：重置对局并写入自动存档，覆盖当前进度；手动槽位不受影响。 */
  newGame(scenario: Scenario): void {
    this.state = createInitialState({ scenario })
    this.drawRandom = this.createDrawRandom()
    this.saveStore.save(AUTO_SAVE_KEY, this.state)
    this.notify()
  }

  /** 结束本回合：其他势力行动，随后结算并进入下一回合，写入自动存档。 */
  endTurn(): void {
    this.turnRun = null
    resolveEndTurn(this.state)
    this.saveStore.save(AUTO_SAVE_KEY, this.state)
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

  /** 就上一次来犯作出决定：迎战编成与出马者；null 表示按默认编成、不单挑。 */
  answerDefense(decision: DefenseChoice | null): FactionTurnSignal | null {
    return this.advanceTurnStep(decision)
  }

  /** 演出看完后继续推进本回合：取下一场来犯，或跑完本回合。 */
  continueTurn(): FactionTurnSignal | null {
    return this.advanceTurnStep(null)
  }

  /** 继续推进本回合；跑完则清空推进器、按新回合播种抽卡源并写入自动存档。 */
  private advanceTurnStep(decision: DefenseChoice | null): FactionTurnSignal | null {
    if (this.turnRun === null) {
      return null
    }

    const signal = this.turnRun.advance(decision)
    if (signal === null) {
      this.turnRun = null
      this.drawRandom = this.createDrawRandom()
      this.saveStore.save(AUTO_SAVE_KEY, this.state)
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

  /** 在武将驻地征兵；成功后通知界面。 */
  recruit(characterId: CharacterId): ActionResult {
    return this.apply(runRecruit(this.state, characterId))
  }

  /** 派部属征粮；成功后通知界面。 */
  harvestGrain(characterId: CharacterId): ActionResult {
    return this.apply(runHarvestGrain(this.state, characterId))
  }

  /** 把一批部属调到相邻的自有战略点；成功后通知界面。 */
  transfer(characterIds: readonly CharacterId[], targetSiteId: SiteId): ActionResult {
    return this.apply(runTransfer(this.state, characterIds, targetSiteId))
  }

  /** 派主将、副将与军师合攻相邻的他方或无主战略点；成功后通知界面，地图随领土变化刷新。 */
  attack(party: AttackParty, targetSiteId: SiteId): ActionResult {
    return this.apply(runAttack(this.state, party, targetSiteId))
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

  /** 读取自动存档；没有可用存档时返回 false，当前对局保持不变。 */
  loadAutoSave(): boolean {
    return this.applySave(AUTO_SAVE_KEY)
  }

  saveToSlot(slot: number): void {
    this.saveStore.save(slotKey(slot), this.state)
    this.notify()
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

  /** 行动成功后通知界面；失败时不改动对局。 */
  private apply(result: ActionResult): ActionResult {
    if (result.ok) {
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

  private createDrawRandom(): Random {
    return createRandom(this.drawSeedOverride ?? drawSeedFor(this.state))
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}
