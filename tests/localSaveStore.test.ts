import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import { LocalSaveStore } from '../src/core/localSaveStore'
import { SCHEMA_VERSION } from '../src/core/saveStore'
import { advanceTurn } from '../src/core/turn'
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
