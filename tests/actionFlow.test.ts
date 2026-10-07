import { describe, expect, it } from 'vitest'
import { GameSession } from '../src/app/gameSession'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { LocalSaveStore } from '../src/core/localSaveStore'
import { MemoryStorage } from './memoryStorage'

function createSession(drawSeed: number): GameSession {
  return new GameSession(new LocalSaveStore(new MemoryStorage()), { drawSeed })
}

describe('行动力与寻访流程（无画面）', () => {
  it('一季内寻访到行动力不足以再寻访，结束回合后恢复预算，历史跨回合保留', () => {
    const session = createSession(3)
    const startTurn = session.getState().currentTurn

    let successes = 0
    while (session.seekTalent('jiangxia').ok) {
      successes += 1
    }

    expect(successes).toBe(Math.floor(ACTION_POINTS_PER_TURN / ACTION_COSTS.seekTalent))
    expect(session.getState().actionPoints[session.getState().playerFaction]).toBe(
      ACTION_POINTS_PER_TURN - successes * ACTION_COSTS.seekTalent,
    )
    expect(session.getState().history).toHaveLength(successes)

    session.endTurn()

    expect(session.getState().currentTurn).toBe(startTurn + 1)
    expect(session.getState().actionPoints[session.getState().playerFaction]).toBe(
      ACTION_POINTS_PER_TURN,
    )
    // 他方本季也会行动并写入历史，只核对玩家自己的记录跨回合保留。
    expect(
      session
        .getState()
        .history.filter((record) => record.factionId === session.getState().playerFaction),
    ).toHaveLength(successes)
  })

  it('寻访只消耗抽卡流，模拟流的随机状态保持不变', () => {
    const session = createSession(5)
    const before = session.getState().randomState

    session.seekTalent('jiangxia')
    session.seekTalent('jiangxia')

    expect(session.getState().randomState).toBe(before)
  })

  it('相同种子与抽卡源下，寻访序列可复现', () => {
    const run = () => {
      const session = createSession(11)
      const outcomes: string[] = []

      for (let i = 0; i < 2; i += 1) {
        const result = session.seekTalent('jiangxia')
        outcomes.push(result.ok ? result.record.outcome : result.reason)
      }

      return outcomes
    }

    expect(run()).toEqual(run())
  })

  it('整条流程存读档往返一致', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const session = new GameSession(store, { drawSeed: 2 })
    session.seekTalent('jiangxia')
    session.endTurn()
    session.seekTalent('jiangxia')
    session.saveToSlot(2)

    const reloaded = new GameSession(store, { drawSeed: 99 })

    expect(reloaded.loadSlot(2)).toBe(true)
    expect(reloaded.getState()).toEqual(session.getState())
  })
})
