import { describe, expect, it } from 'vitest'
import { GameSession } from '../src/app/gameSession'
import { ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { LocalSaveStore } from '../src/core/localSaveStore'
import { MemoryStorage } from './memoryStorage'

function createSession(drawSeed: number): GameSession {
  return new GameSession(new LocalSaveStore(new MemoryStorage()), { drawSeed })
}

describe('行动力与寻访流程（无画面）', () => {
  it('一季内寻访至行动力耗尽，结束回合后恢复预算并清空记录', () => {
    const session = createSession(3)
    const startTurn = session.getState().currentTurn

    for (let i = 0; i < ACTION_POINTS_PER_TURN; i += 1) {
      expect(session.seekTalent().ok).toBe(true)
    }

    expect(session.getState().actionPoints).toBe(0)
    expect(session.getState().actionLog).toHaveLength(ACTION_POINTS_PER_TURN)

    expect(session.seekTalent()).toEqual({ ok: false, reason: '行动力不足' })

    session.endTurn()

    expect(session.getState().currentTurn).toBe(startTurn + 1)
    expect(session.getState().actionPoints).toBe(ACTION_POINTS_PER_TURN)
    expect(session.getState().actionLog).toEqual([])
  })

  it('寻访只消耗抽卡流，模拟流的随机状态保持不变', () => {
    const session = createSession(5)
    const before = session.getState().randomState

    session.seekTalent()
    session.seekTalent()

    expect(session.getState().randomState).toBe(before)
  })

  it('相同种子与抽卡源下，寻访序列可复现', () => {
    const run = () => {
      const session = createSession(11)
      const outcomes: string[] = []

      for (let i = 0; i < 3; i += 1) {
        const result = session.seekTalent()
        outcomes.push(result.ok ? result.record.outcome : result.reason)
      }

      return outcomes
    }

    expect(run()).toEqual(run())
  })

  it('整条流程存读档往返一致', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const session = new GameSession(store, { drawSeed: 2 })
    session.seekTalent()
    session.endTurn()
    session.seekTalent()
    session.saveToSlot(2)

    const reloaded = new GameSession(store, { drawSeed: 99 })

    expect(reloaded.loadSlot(2)).toBe(true)
    expect(reloaded.getState()).toEqual(session.getState())
  })
})
