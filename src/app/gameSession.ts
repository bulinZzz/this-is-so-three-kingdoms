import { createInitialState } from '../core/createInitialState'
import { LocalSaveStore } from '../core/localSaveStore'
import type { GameState } from '../core/model'
import { AUTO_SAVE_KEY, slotKey, type SaveStore, type SaveSummary } from '../core/saveStore'
import { advanceTurn } from '../core/turn'

export type StateListener = (state: GameState) => void

/** 持有当前对局的唯一 GameState，负责回合推进、自动存档与手动槽位。 */
export class GameSession {
  private state: GameState
  private readonly listeners = new Set<StateListener>()

  constructor(private readonly saveStore: SaveStore = new LocalSaveStore()) {
    this.state = this.saveStore.load(AUTO_SAVE_KEY) ?? createInitialState()
  }

  getState(): GameState {
    return this.state
  }

  endTurn(): void {
    advanceTurn(this.state)
    this.saveStore.save(AUTO_SAVE_KEY, this.state)
    this.notify()
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
