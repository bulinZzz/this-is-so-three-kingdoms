import type { ActionResult } from '../core/actions'
import { attack as runAttack, type AttackParty } from '../core/battle'
import { createInitialState } from '../core/createInitialState'
import { LocalSaveStore } from '../core/localSaveStore'
import { harvestGrain as runHarvestGrain, recruit as runRecruit, transfer as runTransfer } from '../core/military'
import type { CharacterId, GameState, Scenario, SiteId } from '../core/model'
import { createRandom, createSeed, type Random } from '../core/random'
import { AUTO_SAVE_KEY, slotKey, type SaveStore, type SaveSummary } from '../core/saveStore'
import { seekTalent as runSeekTalent } from '../core/seekTalent'
import { endTurn as resolveEndTurn } from '../core/turn'

export type StateListener = (state: GameState) => void

export interface GameSessionOptions {
  /** 抽卡随机源的种子；不指定时随机播种。抽卡流不落盘，读档与刷新都不回退。 */
  drawSeed?: number
}

/** 持有当前对局的唯一 GameState，负责回合推进、行动、回合开始的自动存档与手动槽位。 */
export class GameSession {
  private state: GameState
  private readonly listeners = new Set<StateListener>()
  /** 玩家发起抽取所用的随机源，会话级、不随存档保存。 */
  private drawRandom: Random

  constructor(
    private readonly saveStore: SaveStore = new LocalSaveStore(),
    options: GameSessionOptions = {},
  ) {
    this.state = this.saveStore.load(AUTO_SAVE_KEY) ?? createInitialState()
    this.drawRandom = createRandom(options.drawSeed ?? createSeed())
  }

  getState(): GameState {
    return this.state
  }

  /** 用指定剧本重开一局：重置对局并写入自动存档，覆盖当前进度；手动槽位不受影响。 */
  newGame(scenario: Scenario): void {
    this.state = createInitialState({ scenario })
    this.drawRandom = createRandom(createSeed())
    this.saveStore.save(AUTO_SAVE_KEY, this.state)
    this.notify()
  }

  /** 结束本回合：其他势力行动，随后结算并进入下一回合，写入自动存档。 */
  endTurn(): void {
    resolveEndTurn(this.state)
    this.saveStore.save(AUTO_SAVE_KEY, this.state)
    this.notify()
  }

  /** 在指定自有战略点就地寻访；成功后通知界面，失败时返回原因且不改变对局。自动存档只在回合开始时写入。 */
  seekTalent(siteId: SiteId): ActionResult {
    return this.apply(runSeekTalent(this.state, this.drawRandom, siteId))
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
    this.notify()

    return true
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}
