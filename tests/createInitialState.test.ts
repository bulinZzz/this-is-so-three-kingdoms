import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'

describe('createInitialState', () => {
  it('按开局剧本建立初始状态', () => {
    const state = createInitialState()

    expect(state.currentDate).toEqual({ year: 208, month: 1 })
    expect(state.currentTurn).toBe(1)
    expect(state.factions.map((faction) => faction.name)).toEqual(['曹操', '刘备', '孙权'])
    expect(state.factions.some((faction) => faction.id === state.playerFaction)).toBe(true)
  })

  it('势力 id 不重复', () => {
    const ids = createInitialState().factions.map((faction) => faction.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('状态不与剧本数据共享可变对象', () => {
    const state = createInitialState()
    state.factions[0].name = '改动'
    state.currentDate.month = 12

    const fresh = createInitialState()

    expect(fresh.factions[0].name).toBe('曹操')
    expect(fresh.currentDate.month).toBe(1)
  })

  it('初始随机状态由种子决定', () => {
    expect(createInitialState({ seed: 208 }).randomState).toBe(
      createInitialState({ seed: 208 }).randomState,
    )
    expect(createInitialState({ seed: 208 }).randomState).not.toBe(
      createInitialState({ seed: 209 }).randomState,
    )
  })

  it('初始随机状态为无符号 32 位整数', () => {
    const { randomState } = createInitialState()

    expect(Number.isInteger(randomState)).toBe(true)
    expect(randomState).toBeGreaterThanOrEqual(0)
    expect(randomState).toBeLessThanOrEqual(0xffffffff)
  })
})
