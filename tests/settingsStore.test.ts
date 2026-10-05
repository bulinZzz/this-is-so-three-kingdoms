import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SETTINGS_KEY, SettingsStore } from '../src/app/settingsStore'
import { MemoryStorage } from './memoryStorage'

describe('SettingsStore', () => {
  it('没有存储内容时使用默认设置', () => {
    const store = new SettingsStore(new MemoryStorage())

    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(store.get().showStrategicLinks).toBe(false)
    expect(store.get().developerMode).toBe(false)
  })

  it('开发者模式可独立开关并持久化', () => {
    const storage = new MemoryStorage()
    const store = new SettingsStore(storage)

    store.update({ developerMode: true })

    expect(store.get().developerMode).toBe(true)
    expect(store.get().showStrategicLinks).toBe(false)
    expect(new SettingsStore(storage).get().developerMode).toBe(true)
  })

  it('更新后写入存储并可再次读回', () => {
    const storage = new MemoryStorage()
    const store = new SettingsStore(storage)

    store.update({ showStrategicLinks: true })

    expect(store.get().showStrategicLinks).toBe(true)
    expect(new SettingsStore(storage).get().showStrategicLinks).toBe(true)
  })

  it('写入的键位与存档键位不同', () => {
    const storage = new MemoryStorage()

    new SettingsStore(storage).update({ showStrategicLinks: true })

    expect(storage.getItem(SETTINGS_KEY)).not.toBeNull()
  })

  it('存储内容损坏时回落到默认设置', () => {
    const storage = new MemoryStorage()
    storage.setItem(SETTINGS_KEY, '{ 不是合法 JSON')

    expect(new SettingsStore(storage).get()).toEqual(DEFAULT_SETTINGS)
  })

  it('存储内容缺字段时回落到默认设置', () => {
    const storage = new MemoryStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({}))

    expect(new SettingsStore(storage).get()).toEqual(DEFAULT_SETTINGS)
  })

  it('存储内容字段类型不符时回落到默认设置', () => {
    const storage = new MemoryStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ showStrategicLinks: 'yes' }))

    expect(new SettingsStore(storage).get()).toEqual(DEFAULT_SETTINGS)
  })

  it('更新后通知订阅者', () => {
    const store = new SettingsStore(new MemoryStorage())
    const seen: boolean[] = []
    store.subscribe((settings) => seen.push(settings.showStrategicLinks))

    store.update({ showStrategicLinks: true })
    store.update({ showStrategicLinks: false })

    expect(seen).toEqual([true, false])
  })
})
