import { describe, expect, it } from 'vitest'
import { GameSession } from '../src/app/gameSession'
import { createInitialState } from '../src/core/createInitialState'
import { LocalSaveStore } from '../src/core/localSaveStore'
import { advanceTurn, resolveFactionOrder } from '../src/core/turn'
import { MemoryStorage } from './memoryStorage'

/**
 * 模块依赖关系无法从运行时观察，只能读源码来查。
 * 用 Vite 的原生能力载入原文，避免给测试引入 Node 类型依赖。
 */
const CORE_SOURCES = import.meta.glob('../src/core/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const MAP_DATA_SOURCES = import.meta.glob(
  ['../src/game/mapData.ts', '../src/game/mapLayout.ts', '../src/game/viewport.ts'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

const PHASER_DEPENDENCY = /['"]phaser['"]/

describe('规则层无画面运行', () => {
  it('推进 120 季（30 年）不出错，年号纪年、季节、回合数与势力列表保持稳定', () => {
    const state = createInitialState({ seed: 208 })
    const factionIds = state.factions.map((faction) => faction.id)
    const order = resolveFactionOrder(state)

    for (let season = 0; season < 120; season += 1) {
      advanceTurn(state)
    }

    expect(state.currentDate).toEqual({ era: '建安', year: 42, season: 'autumn' })
    expect(state.currentTurn).toBe(121)
    expect(state.factions.map((faction) => faction.id)).toEqual(factionIds)
    expect(resolveFactionOrder(state)).toEqual(order)
  })

  it('相同种子重复推进，最终状态完全一致', () => {
    const run = () => {
      const state = createInitialState({ seed: 208 })
      for (let season = 0; season < 36; season += 1) {
        advanceTurn(state)
      }

      return state
    }

    expect(run()).toEqual(run())
  })

  it('开局到存读档的完整流程无需画面即可走通', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const session = new GameSession(store)

    for (let season = 0; season < 5; season += 1) {
      session.endTurn()
    }
    session.saveToSlot(1)

    for (let season = 0; season < 3; season += 1) {
      session.endTurn()
    }
    const latestTurn = session.getState().currentTurn

    expect(session.loadSlot(1)).toBe(true)
    expect(session.getState().currentTurn).toBe(6)

    expect(new GameSession(store).getState().currentTurn).toBe(latestTurn)
  })
})

describe('解耦回归', () => {
  it('结束回合不改变地理结构', () => {
    const state = createInitialState({ seed: 208 })
    expect(state.geography.provinces.length).toBeGreaterThan(0)
    expect(state.geography.sites.length).toBeGreaterThan(0)

    const geographyRef = state.geography
    const snapshot = structuredClone(state.geography)

    for (let season = 0; season < 60; season += 1) {
      advanceTurn(state)
    }

    // 同一个对象、同样的内容：地理结构既没被替换，也没被就地改写。
    expect(state.geography).toBe(geographyRef)
    expect(state.geography).toEqual(snapshot)
  })

  it('规则层不依赖 Phaser', () => {
    const files = Object.keys(CORE_SOURCES)
    expect(files.length).toBeGreaterThan(0)

    const offenders = files.filter((file) => PHASER_DEPENDENCY.test(CORE_SOURCES[file]))
    expect(offenders).toEqual([])
  })

  it('地图的数据与布局模块不依赖 Phaser，可在无画面下测试', () => {
    const files = Object.keys(MAP_DATA_SOURCES)
    expect(files).toHaveLength(3)

    for (const file of files) {
      expect(MAP_DATA_SOURCES[file]).not.toMatch(PHASER_DEPENDENCY)
    }
  })
})
