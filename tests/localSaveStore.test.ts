import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import { LocalSaveStore } from '../src/core/localSaveStore'
import { SCHEMA_VERSION } from '../src/core/saveStore'
import { advanceTurn } from '../src/core/turn'
import { MemoryStorage } from './memoryStorage'

const KEY = 'test/save'

describe('LocalSaveStore', () => {
  it('没有存档时读取为空', () => {
    expect(new LocalSaveStore(new MemoryStorage()).load(KEY)).toBeNull()
  })

  it('保存后能读回同一份状态', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const state = createInitialState({ seed: 208 })
    advanceTurn(state)

    store.save(KEY, state)

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

  it('读取摘要得到年月与回合数', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const state = createInitialState({ seed: 208 })
    advanceTurn(state)

    store.save(KEY, state)

    expect(store.loadSummary(KEY)).toEqual({ date: { year: 208, month: 2 }, turn: 2 })
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
    expect(store.loadSummary(KEY)).toBeNull()
  })

  it('存档内容损坏时读取为空', () => {
    const storage = new MemoryStorage()
    storage.setItem(KEY, '{ 不是合法 JSON')

    expect(new LocalSaveStore(storage).load(KEY)).toBeNull()
  })

  it('存档不是预期结构时读取为空', () => {
    const storage = new MemoryStorage()
    storage.setItem(KEY, 'null')

    expect(new LocalSaveStore(storage).load(KEY)).toBeNull()
  })
})
