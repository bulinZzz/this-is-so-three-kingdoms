import { describe, expect, it } from 'vitest'
import { SelectionStore } from '../src/app/selectionStore'

describe('SelectionStore', () => {
  it('初始没有选中', () => {
    expect(new SelectionStore().get()).toBeNull()
  })

  it('选中后通知订阅者', () => {
    const store = new SelectionStore()
    const seen: (string | null)[] = []
    store.subscribe((siteId) => seen.push(siteId))

    store.select('jiangxia')

    expect(store.get()).toBe('jiangxia')
    expect(seen).toEqual(['jiangxia'])
  })

  it('重复选中同一据点不再通知', () => {
    const store = new SelectionStore()
    let count = 0
    store.subscribe(() => {
      count += 1
    })

    store.select('jiangxia')
    store.select('jiangxia')

    expect(count).toBe(1)
  })

  it('可以取消选中', () => {
    const store = new SelectionStore()
    store.select('jiangxia')

    store.select(null)

    expect(store.get()).toBeNull()
  })
})
