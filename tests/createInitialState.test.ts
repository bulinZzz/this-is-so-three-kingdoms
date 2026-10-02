import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import type { Scenario } from '../src/core/model'
import { SANGUO_207 } from '../src/core/scenarios'

describe('createInitialState', () => {
  it('按开局剧本建立初始状态', () => {
    const state = createInitialState()

    expect(state.currentDate).toEqual({ era: '建安', year: 12, season: 'autumn' })
    expect(state.currentTurn).toBe(1)
    expect(state.factions.map((faction) => faction.name)).toEqual(['曹操', '刘备', '孙权'])
    expect(state.factions.some((faction) => faction.id === state.playerFaction)).toBe(true)
  })

  it('剧本从建安十二年秋开局', () => {
    expect(SANGUO_207.startDate).toEqual({ era: '建安', year: 12, season: 'autumn' })
  })

  it('势力 id 不重复', () => {
    const ids = createInitialState().factions.map((faction) => faction.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('状态不与剧本数据共享可变对象', () => {
    const state = createInitialState()
    state.factions[0].name = '改动'
    state.currentDate.season = 'winter'

    const fresh = createInitialState()

    expect(fresh.factions[0].name).toBe('曹操')
    expect(fresh.currentDate.season).toBe('autumn')
  })

  it('剧本没有地理数据时开局地理为空', () => {
    const scenario: Scenario = {
      id: 'bare',
      name: '无地理数据',
      startDate: { era: '建安', year: 20, season: 'spring' },
      playerFaction: 'liubei',
      factions: SANGUO_207.factions,
    }

    expect(createInitialState({ scenario }).geography).toEqual({ provinces: [], sites: [] })
  })

  it('地理数据来自剧本，且不与剧本共享可变对象', () => {
    const scenario: Scenario = {
      ...SANGUO_207,
      geography: {
        provinces: [{ id: 'jing', name: '荆州' }],
        sites: [
          {
            id: 'xinye',
            name: '新野',
            type: 'city',
            provinceId: 'jing',
            owner: 'liubei',
            neighbors: [],
          },
        ],
      },
    }

    const state = createInitialState({ scenario })
    state.geography.provinces[0].name = '改动'
    state.geography.sites[0].neighbors.push('wancheng')

    expect(scenario.geography?.provinces[0].name).toBe('荆州')
    expect(scenario.geography?.sites[0].neighbors).toEqual([])
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
