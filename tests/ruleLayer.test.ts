import { describe, expect, it } from 'vitest'
import { GameSession } from '../src/app/gameSession'
import { createInitialState } from '../src/core/createInitialState'
import { LocalSaveStore } from '../src/core/localSaveStore'
import { advanceTurn, resolveFactionOrder } from '../src/core/turn'
import { MemoryStorage } from './memoryStorage'

describe('规则层无画面运行', () => {
  it('推进十年不出错，年月、回合数与势力列表保持稳定', () => {
    const state = createInitialState({ seed: 208 })
    const factionIds = state.factions.map((faction) => faction.id)
    const order = resolveFactionOrder(state)

    for (let month = 0; month < 120; month += 1) {
      advanceTurn(state)
    }

    expect(state.currentDate).toEqual({ year: 218, month: 1 })
    expect(state.currentTurn).toBe(121)
    expect(state.factions.map((faction) => faction.id)).toEqual(factionIds)
    expect(resolveFactionOrder(state)).toEqual(order)
  })

  it('相同种子重复推进，最终状态完全一致', () => {
    const run = () => {
      const state = createInitialState({ seed: 208 })
      for (let month = 0; month < 36; month += 1) {
        advanceTurn(state)
      }

      return state
    }

    expect(run()).toEqual(run())
  })

  it('开局到存读档的完整流程无需画面即可走通', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const session = new GameSession(store)

    for (let month = 0; month < 5; month += 1) {
      session.endTurn()
    }
    session.saveToSlot(1)

    for (let month = 0; month < 3; month += 1) {
      session.endTurn()
    }
    const latestTurn = session.getState().currentTurn

    expect(session.loadSlot(1)).toBe(true)
    expect(session.getState().currentTurn).toBe(6)

    expect(new GameSession(store).getState().currentTurn).toBe(latestTurn)
  })
})
