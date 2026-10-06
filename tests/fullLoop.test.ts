import { describe, expect, it } from 'vitest'
import { GameSession } from '../src/app/gameSession'
import { createInitialState } from '../src/core/createInitialState'
import { LocalSaveStore } from '../src/core/localSaveStore'
import type { Character, GameState, Scenario } from '../src/core/model'
import { AUTO_SAVE_KEY } from '../src/core/saveStore'
import { MemoryStorage } from './memoryStorage'

/**
 * 完整循环的无画面验证：寻访 → 征兵 → 进攻 → 占领 → 结束回合，含州归属与卡池联动。
 * 全程只跑规则层与装配层，不启动画面。
 */

/** 预置一份固定世界种子的自动存档，使随机状态也确定。 */
function seededStore(): LocalSaveStore {
  const store = new LocalSaveStore(new MemoryStorage())
  store.save(AUTO_SAVE_KEY, createInitialState({ seed: 208 }))

  return store
}

function createSession(drawSeed: number): GameSession {
  return new GameSession(seededStore(), { drawSeed })
}

function siteOwner(state: GameState, siteId: string): string | null {
  return state.geography.sites.find((site) => site.id === siteId)?.owner ?? null
}

function characterOf(state: GameState, id: string): Character {
  const character = state.characters.find((item) => item.id === id)
  if (character === undefined) {
    throw new Error(`武将不存在：${id}`)
  }
  return character
}

function wild(id: string, name: string, tier: 'basic' | 'second'): Character {
  return {
    id,
    name,
    status: 'wild',
    factionId: null,
    provinceId: 'p',
    might: 50,
    command: 50,
    intellect: 50,
    factionAffinity: null,
    loyalty: 0,
    isMonarch: false,
    stationedSiteId: null,
    troops: 0,
    morale: 100,
    tier,
  }
}

/** 一个州三个据点：玩家占一角，攻下敌据点即可成为该州归属势力。 */
function loopScenario(): Scenario {
  return {
    id: 'full-loop',
    name: '整链测试',
    startDate: { era: '建安', year: 13, season: 'autumn' },
    playerFaction: 'liubei',
    factions: [
      { id: 'liubei', name: '刘备', color: '#3f7a5a', grain: 10000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', grain: 10000 },
    ],
    geography: {
      provinces: [{ id: 'p', name: '州', owner: 'caocao' }],
      sites: [
        { id: 'a', name: '甲城', type: 'city', provinceId: 'p', owner: 'liubei', neighbors: ['b'] },
        { id: 'b', name: '乙城', type: 'city', provinceId: 'p', owner: 'caocao', neighbors: ['a', 'c'] },
        { id: 'c', name: '丙城', type: 'city', provinceId: 'p', owner: 'caocao', neighbors: ['b'] },
      ],
    },
    characters: [
      {
        id: 'attacker',
        name: '攻将',
        status: 'serving',
        factionId: 'liubei',
        provinceId: 'p',
        might: 90,
        command: 90,
        intellect: 60,
        factionAffinity: 'liubei',
        loyalty: 90,
        isMonarch: false,
        stationedSiteId: 'a',
        troops: 20000,
        morale: 100,
        tier: null,
      },
      {
        id: 'defender',
        name: '守将',
        status: 'serving',
        factionId: 'caocao',
        provinceId: 'p',
        might: 60,
        command: 60,
        intellect: 50,
        factionAffinity: 'caocao',
        loyalty: 90,
        isMonarch: false,
        stationedSiteId: 'b',
        troops: 500,
        morale: 100,
        tier: null,
      },
      wild('basic-1', '基础客', 'basic'),
      wild('second-1', '二级客', 'second'),
    ],
  }
}

function createLoopSession(drawSeed: number): GameSession {
  const store = new LocalSaveStore(new MemoryStorage())
  store.save(AUTO_SAVE_KEY, createInitialState({ scenario: loopScenario(), seed: 208 }))

  return new GameSession(store, { drawSeed })
}

describe('完整循环（无画面）', () => {
  it('寻访 → 征兵 → 进攻 → 占领 走通，地图、历史与行动力同步', () => {
    const session = createSession(5)
    const state = session.getState()

    expect(session.seekTalent('jiangxia').ok).toBe(true)
    expect(session.recruit('guanyu').ok).toBe(true)
    expect(state.actionPoints).toBeLessThan(4)

    session.endTurn()

    expect(session.attack('guanyu', 'chibi').ok).toBe(true)

    expect(siteOwner(state, 'chibi')).toBe('liubei')
    expect(characterOf(state, 'guanyu').stationedSiteId).toBe('chibi')
    expect(state.history.map((record) => record.kind)).toEqual(['seekTalent', 'recruit', 'attack'])
    expect(state.currentTurn).toBe(2)
  })

  it('固定种子下整条循环可复现', () => {
    const run = () => {
      const session = createSession(7)
      session.seekTalent('jiangxia')
      session.recruit('guanyu')
      session.endTurn()
      session.attack('guanyu', 'chibi')
      session.endTurn()
      session.seekTalent('chibi')

      return session.getState()
    }

    expect(run()).toEqual(run())
  })

  it('同一存档重复推演结果一致', () => {
    const store = seededStore()
    const session = new GameSession(store, { drawSeed: 9 })
    session.seekTalent('jiangxia')
    session.recruit('guanyu')
    session.saveToSlot(1)

    const advance = () => {
      const reloaded = new GameSession(store, { drawSeed: 9 })
      expect(reloaded.loadSlot(1)).toBe(true)
      reloaded.endTurn()
      reloaded.attack('guanyu', 'chibi')
      reloaded.seekTalent('chibi')

      return reloaded.getState()
    }

    expect(advance()).toEqual(advance())
  })
})

describe('州归属与卡池联动（无画面）', () => {
  it('成为归属势力后开放二级卡池', () => {
    const session = createLoopSession(3)
    const state = session.getState()

    // 只占一角：基础池，只能寻得基础客。
    expect(session.seekTalent('a').ok).toBe(true)
    expect(characterOf(state, 'basic-1').status).toBe('serving')
    expect(characterOf(state, 'second-1').status).toBe('wild')

    // 攻下乙城，成为该州归属势力。
    expect(session.attack('attacker', 'b').ok).toBe(true)
    expect(state.geography.provinces.find((province) => province.id === 'p')?.owner).toBe('liubei')

    // 二级池随之开放，继续寻访可寻得二级客。
    session.endTurn()
    expect(session.seekTalent('a').ok).toBe(true)
    expect(characterOf(state, 'second-1').status).toBe('serving')
  })
})
