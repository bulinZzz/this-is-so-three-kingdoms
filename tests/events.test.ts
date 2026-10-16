import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import { fireEvents } from '../src/core/events'
import type { EventDefinition, GameState } from '../src/core/model'
import { favorBetween, relationBetween } from '../src/core/relations'
import { SANGUO_208 } from '../src/core/scenarios'

/** 便于注入自定义事件的开局：事件全在测试里现给，验证「加事件只加数据」。 */
function newState(seed = 208): GameState {
  return createInitialState({ scenario: SANGUO_208, seed })
}

function guanyu(state: GameState) {
  return state.characters.find((character) => character.id === 'guanyu')!
}

describe('事件条件', () => {
  it('日期条件按年号纪年与季节比较', () => {
    const state = newState()
    state.currentDate = { era: '建安', year: 14, season: 'spring' }
    const event: EventDefinition = {
      id: 'later',
      text: '后来之事',
      weight: 1,
      conditions: [{ kind: 'date', from: { era: '建安', year: 14, season: 'summer' } }],
      effects: [],
    }

    expect(fireEvents(state, [event])).toBeNull()

    state.currentDate = { era: '建安', year: 14, season: 'autumn' }
    expect(fireEvents(state, [event])?.targetId).toBe('later')
  })

  it('区间条件两端都算在内', () => {
    const state = newState()
    state.currentDate = { era: '建安', year: 15, season: 'winter' }
    const event: EventDefinition = {
      id: 'window',
      text: '一时之事',
      weight: 1,
      conditions: [
        {
          kind: 'date',
          from: { era: '建安', year: 14, season: 'winter' },
          to: { era: '建安', year: 15, season: 'winter' },
        },
      ],
      effects: [],
    }

    expect(fireEvents(state, [event])?.targetId).toBe('window')
  })

  it('势力存续按是否存在与是否覆灭判断', () => {
    const state = newState()
    const alive: EventDefinition = {
      id: 'alive',
      text: '曹操尚在',
      weight: 1,
      conditions: [{ kind: 'factionAlive', factionId: 'caocao' }],
      effects: [],
    }
    const gone: EventDefinition = {
      id: 'gone',
      text: '无人知晓',
      weight: 1,
      conditions: [{ kind: 'factionAlive', factionId: 'nobody' }],
      effects: [],
    }

    expect(fireEvents(state, [alive])?.targetId).toBe('alive')
    expect(fireEvents(state, [gone])).toBeNull()
  })

  it('资源条件按阈值判断', () => {
    const state = newState()
    const poor: EventDefinition = {
      id: 'poor',
      text: '粮尽',
      weight: 1,
      conditions: [{ kind: 'resource', factionId: 'liubei', grainBelow: 7000 }],
      effects: [],
    }
    const rich: EventDefinition = {
      id: 'rich',
      text: '仓廪实',
      weight: 1,
      conditions: [{ kind: 'resource', factionId: 'liubei', grainBelow: 5000 }],
      effects: [],
    }

    expect(fireEvents(state, [poor])?.targetId).toBe('poor')
    expect(fireEvents(state, [rich])).toBeNull()
  })
})

describe('事件效果', () => {
  it('把指定势力之间转为敌对，并留下不属任何势力的记录', () => {
    const state = newState()
    state.relations = []
    const event: EventDefinition = {
      id: 'ignite',
      text: '曹操与孙权结怨',
      weight: 1,
      conditions: [{ kind: 'relation', factions: ['caocao', 'sunquan'], is: 'neutral' }],
      effects: [{ kind: 'setRelation', factions: ['caocao', 'sunquan'], to: 'hostile' }],
    }

    const record = fireEvents(state, [event])

    expect(relationBetween(state, 'caocao', 'sunquan')).toBe('hostile')
    expect(record?.kind).toBe('event')
    expect(record?.factionId).toBeNull()
    expect(record?.outcome).toBe('曹操与孙权结怨')
    expect(state.history).toHaveLength(1)
  })

  it('好感、粮食与金钱按增量改动', () => {
    const state = newState()
    const event: EventDefinition = {
      id: 'shift',
      text: '礼尚往来',
      weight: 1,
      conditions: [],
      effects: [
        { kind: 'adjustFavor', factions: ['liubei', 'sunquan'], delta: -20 },
        { kind: 'adjustGrain', factionId: 'liubei', delta: -1000 },
        { kind: 'adjustMoney', factionId: 'liubei', delta: 500 },
      ],
    }

    fireEvents(state, [event])

    expect(favorBetween(state, 'liubei', 'sunquan')).toBe(50)
    expect(state.factions.find((faction) => faction.id === 'liubei')?.grain).toBe(5000)
    expect(state.factions.find((faction) => faction.id === 'liubei')?.money).toBe(3500)
  })

  it('忠诚与偏好改动，君主不计忠诚', () => {
    const state = newState()
    const event: EventDefinition = {
      id: 'chill',
      text: '众心浮动',
      weight: 1,
      conditions: [],
      effects: [
        { kind: 'adjustLoyalty', characterId: 'guanyu', delta: -20 },
        { kind: 'adjustAffinity', characterId: 'guanyu', factionId: 'caocao', delta: -25 },
        { kind: 'adjustLoyalty', characterId: 'caocao', delta: -20 },
      ],
    }

    fireEvents(state, [event])

    expect(guanyu(state).loyalty).toBe(78)
    expect(guanyu(state).affinities.caocao).toBe(45)
    expect(state.characters.find((character) => character.id === 'caocao')?.loyalty).toBe(100)
  })
})

describe('事件的抽取与记录', () => {
  it('权重为零的事件不被选中；无候选则不动状态', () => {
    const state = newState()
    const before = state.randomState
    const zero: EventDefinition = { id: 'zero', text: '', weight: 0, conditions: [], effects: [] }
    const missed: EventDefinition = {
      id: 'missed',
      text: '',
      weight: 1,
      conditions: [{ kind: 'relation', factions: ['liubei', 'sunquan'], is: 'hostile' }],
      effects: [],
    }

    expect(fireEvents(state, [zero, missed])).toBeNull()
    expect(state.history).toHaveLength(0)
    expect(state.randomState).toBe(before)
  })

  it('固定种子下抽取结果一致', () => {
    const events: EventDefinition[] = [
      { id: 'a', text: '甲', weight: 1, conditions: [], effects: [] },
      { id: 'b', text: '乙', weight: 3, conditions: [], effects: [] },
    ]

    const first = fireEvents(newState(7), events)
    const second = fireEvents(newState(7), events)

    expect(first?.targetId).toBe(second?.targetId)
  })

  it('一次性事件触发后不再触发', () => {
    const state = newState()
    const event: EventDefinition = {
      id: 'once',
      text: '仅此一回',
      weight: 1,
      once: true,
      conditions: [],
      effects: [],
    }

    expect(fireEvents(state, [event])?.targetId).toBe('once')
    expect(state.firedEvents).toContain('once')
    expect(fireEvents(state, [event])).toBeNull()
    expect(state.history).toHaveLength(1)
  })
})
