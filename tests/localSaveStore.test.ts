import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import { LocalSaveStore } from '../src/core/localSaveStore'
import { SCHEMA_VERSION } from '../src/core/saveStore'
import { advanceTurn, endTurn } from '../src/core/turn'
import {
  FailingStorage,
  MemoryStorage,
  UndeletableStorage,
  UnreadableStorage,
} from './memoryStorage'

const KEY = 'test/save'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LocalSaveStore', () => {
  it('没有存档时读取为空', () => {
    expect(new LocalSaveStore(new MemoryStorage()).load(KEY)).toBeNull()
  })

  it('没有存档与读不出来分开上报', () => {
    expect(new LocalSaveStore(new MemoryStorage()).loadResult(KEY)).toEqual({
      status: 'empty',
      state: null,
    })
  })

  it('保存后能读回同一份状态', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const state = createInitialState({ seed: 208 })
    advanceTurn(state)

    expect(store.save(KEY, state)).toBe(true)

    expect(store.load(KEY)).toEqual(state)
  })

  it('长期推进后的状态仍能通过深层校验并往返一致', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const state = createInitialState({ seed: 208 })
    for (let season = 0; season < 20; season += 1) {
      endTurn(state)
      expect(store.save(KEY, state)).toBe(true)
      expect(store.load(KEY)).toEqual(state)
    }
  })

  it('不同键位互不影响', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const first = createInitialState({ seed: 208 })
    const second = createInitialState({ seed: 208 })
    second.currentTurn = 9

    store.save('a', first)
    store.save('b', second)

    expect(store.load('a')?.currentTurn).toBe(1)
    expect(store.load('b')?.currentTurn).toBe(9)
  })

  it('存档带有模式版本号', () => {
    const storage = new MemoryStorage()

    new LocalSaveStore(storage).save(KEY, createInitialState({ seed: 208 }))

    const raw = storage.getItem(KEY)

    expect(JSON.parse(raw as string).schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('读取摘要得到年号纪年、季节与回合数', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const state = createInitialState({ seed: 208 })
    advanceTurn(state)

    store.save(KEY, state)

    expect(store.loadSummary(KEY)).toEqual({
      date: { era: '建安', year: 13, season: 'winter' },
      turn: 2,
    })
  })

  it('空键位读取摘要为空', () => {
    expect(new LocalSaveStore(new MemoryStorage()).loadSummary(KEY)).toBeNull()
  })

  it('模式版本不匹配时读取为空', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      KEY,
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION + 1,
        gameState: createInitialState({ seed: 208 }),
      }),
    )

    const store = new LocalSaveStore(storage)

    expect(store.load(KEY)).toBeNull()
    expect(store.loadResult(KEY).status).toBe('invalid')
    expect(store.loadSummary(KEY)).toBeNull()
  })

  it('存档内容损坏时读取为空', () => {
    const storage = new MemoryStorage()
    storage.setItem(KEY, '{ 不是合法 JSON')

    const store = new LocalSaveStore(storage)

    expect(store.load(KEY)).toBeNull()
    expect(store.loadResult(KEY).status).toBe('invalid')
  })

  it('存档不是预期结构时读取为空', () => {
    const storage = new MemoryStorage()
    storage.setItem(KEY, 'null')

    const store = new LocalSaveStore(storage)

    expect(store.load(KEY)).toBeNull()
    expect(store.loadResult(KEY).status).toBe('invalid')
  })

  it('存档日期结构不符时读取为空', () => {
    const storage = new MemoryStorage()
    const state = createInitialState({ seed: 208 })
    storage.setItem(
      KEY,
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        gameState: { ...state, currentDate: { year: 12, month: 1 } },
      }),
    )

    const store = new LocalSaveStore(storage)

    expect(store.load(KEY)).toBeNull()
    expect(store.loadSummary(KEY)).toBeNull()
  })

  it('存档缺少必需字段时读取为空', () => {
    // 结局字段与几处关键集合各缺一次：半损的存档不能把残局带进游戏。
    for (const missing of ['outcome', 'endedTurn', 'characters', 'history', 'geography']) {
      const storage = new MemoryStorage()
      const gameState = { ...createInitialState({ seed: 208 }) } as Record<string, unknown>
      delete gameState[missing]
      storage.setItem(KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, gameState }))

      const store = new LocalSaveStore(storage)

      expect(store.load(KEY)).toBeNull()
      expect(store.loadResult(KEY).status).toBe('invalid')
      expect(store.loadSummary(KEY)).toBeNull()
    }
  })

  it('写入异常时保存失败且不留存档', () => {
    const store = new LocalSaveStore(new FailingStorage())

    expect(store.save(KEY, createInitialState({ seed: 208 }))).toBe(false)
    expect(store.load(KEY)).toBeNull()
  })

  it('顶层结构合法但内部元素、枚举或跨对象引用损坏时一律拒绝', () => {
    const breakers: { name: string; break: (state: any) => void }[] = [
      {
        name: '战略点相邻列表含非字符串',
        break: (state) => (state.geography.sites[0].neighbors = [123]),
      },
      {
        name: '武将缺少活动范围',
        break: (state) => delete state.characters[0].scope,
      },
      {
        name: '势力粮食为 NaN',
        break: (state) => (state.factions[0].grain = Number.NaN),
      },
      {
        name: '在仕武将引用不存在的势力',
        break: (state) => {
          const serving = state.characters.find((item: any) => item.status === 'serving')
          serving.factionId = 'ghost'
        },
      },
      {
        name: '战略点引用不存在的势力',
        break: (state) => {
          const owned = state.geography.sites.find((item: any) => item.owner !== null)
          owned.owner = 'ghost'
        },
      },
      {
        name: '战略点类型枚举非法',
        break: (state) => (state.geography.sites[0].type = 'castle'),
      },
      {
        name: '势力关系指向不存在的势力',
        break: (state) =>
          state.relations.push({
            factions: ['liubei', 'ghost'],
            kind: 'neutral',
            favor: 50,
          }),
      },
      {
        name: '俘虏记录引用不存在的武将',
        break: (state) =>
          (state.captives.liubei = [
            { characterId: 'ghost', formerFactionId: null, will: 50 },
          ]),
      },
      {
        name: '行动历史日期不合法',
        break: (state) =>
          state.history.push({
            kind: 'attack',
            factionId: 'liubei',
            date: { era: '建安', year: '十三', season: 'autumn' },
            outcome: '测试',
          }),
      },
      {
        name: '邻接引用不存在的战略点',
        break: (state) => (state.geography.sites[0].neighbors = ['ghost']),
      },
      {
        name: '武将能力超过强化上限',
        break: (state) => (state.characters[0].might = 121),
      },
      {
        name: '已结束的对局缺少结束回合',
        break: (state) => {
          state.outcome = 'victory'
          state.endedTurn = null
        },
      },
      {
        name: '行动力为负数',
        break: (state) => (state.actionPoints.liubei = -1),
      },
    ]

    for (const breaker of breakers) {
      const state = createInitialState({ seed: 208 }) as any
      breaker.break(state)

      const storage = new MemoryStorage()
      storage.setItem(
        KEY,
        JSON.stringify({ schemaVersion: SCHEMA_VERSION, gameState: state }),
      )
      const store = new LocalSaveStore(storage)

      expect(store.load(KEY), breaker.name).toBeNull()
      expect(store.loadResult(KEY).status, breaker.name).toBe('invalid')
    }
  })

  it('读取异常时按存储不可用处理，不抛出', () => {
    const store = new LocalSaveStore(new UnreadableStorage())

    expect(() => store.load(KEY)).not.toThrow()
    expect(store.load(KEY)).toBeNull()
    expect(store.loadResult(KEY)).toEqual({ status: 'unavailable', state: null })
    expect(store.loadSummary(KEY)).toBeNull()
  })

  it('删除异常时返回失败，原存档仍在', () => {
    const storage = new UndeletableStorage()
    const store = new LocalSaveStore(storage)
    const state = createInitialState({ seed: 208 })
    store.save(KEY, state)

    expect(store.remove(KEY)).toBe(false)
    expect(store.load(KEY)).toEqual(state)
  })

  it('删除成功后该键位回到空存档', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    store.save(KEY, createInitialState({ seed: 208 }))

    expect(store.remove(KEY)).toBe(true)
    expect(store.load(KEY)).toBeNull()
    expect(store.loadResult(KEY).status).toBe('empty')
  })

  it('浏览器拒绝访问 localStorage 时仍可构造，读写删一律降级', () => {
    const denied = Object.defineProperty({}, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('拒绝访问')
      },
    })
    vi.stubGlobal('window', denied)

    const store = new LocalSaveStore()

    expect(store.loadResult(KEY)).toEqual({ status: 'unavailable', state: null })
    expect(store.load(KEY)).toBeNull()
    expect(store.save(KEY, createInitialState({ seed: 208 }))).toBe(false)
    expect(store.remove(KEY)).toBe(false)
  })
})
