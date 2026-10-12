import { describe, expect, it } from 'vitest'
import { GameSession } from '../src/app/gameSession'
import { createInitialState } from '../src/core/createInitialState'
import { granaryOf } from '../src/core/granary'
import { BATTLES_PER_BOOST, boostCredits, strengthen } from '../src/core/growth'
import { factionTroops } from '../src/core/military'
import type { Character, GameState, Scenario } from '../src/core/model'
import { LocalSaveStore } from '../src/core/localSaveStore'
import { AUTO_SAVE_KEY } from '../src/core/saveStore'
import { MemoryStorage } from './memoryStorage'

/**
 * 迭代 10 全链的无画面验证：征粮（取自驻地存粮）→ 征兵（受丁口与粮所限）→ 出征 → 战斗（累计出战）
 * → 强化（出战额度换能力）→ 结束回合（存粮增加、运回入库、缺粮不减员）。全程只跑规则层与装配层。
 */

function serving(
  over: Partial<Character> &
    Pick<Character, 'id' | 'name' | 'factionId' | 'stationedSiteId' | 'troops'>,
): Character {
  return {
    status: 'serving',
    provinceId: 'p1',
    might: 60,
    command: 60,
    intellect: 50,
    politics: 60,
    age: 40,
    personality: 'steady',
    affinities: {},
    loyalty: 90,
    isMonarch: false,
    tier: null,
    ...over,
  }
}

/** 甲城由玩家据守、乙城由一名弱将驻守；兵只从征兵来，故出征前须先征。 */
function j10Scenario(): Scenario {
  return {
    id: 'iteration10-loop',
    name: '迭代 10 全链',
    startDate: { era: '建安', year: 13, season: 'autumn' },
    playerFaction: 'liubei',
    factions: [
      { id: 'liubei', name: '刘备', color: '#3f7a5a', money: 0, grain: 2000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', money: 0, grain: 2000 },
    ],
    relations: [{ factions: ['liubei', 'caocao'], kind: 'hostile', favor: 25 }],
    geography: {
      provinces: [{ id: 'p1', name: '州一', owner: null }],
      sites: [
        { id: 'a', name: '甲城', type: 'city', population: 50000, provinceId: 'p1', owner: 'liubei', neighbors: ['b'] },
        { id: 'b', name: '乙城', type: 'city', population: 10000, provinceId: 'p1', owner: 'caocao', neighbors: ['a'] },
      ],
    },
    characters: [
      // 征粮靠内政与兵力，征兵靠统率，出征靠兵力——三件事各是不同的人。
      serving({ id: 'farmer', name: '屯田', factionId: 'liubei', stationedSiteId: 'a', troops: 3000, command: 40, politics: 80 }),
      serving({ id: 'recruiter', name: '招兵', factionId: 'liubei', stationedSiteId: 'a', troops: 500, command: 90, politics: 30 }),
      serving({ id: 'warrior', name: '战将', factionId: 'liubei', stationedSiteId: 'a', troops: 9000, command: 80, might: 90 }),
      serving({ id: 'defender', name: '守将', factionId: 'caocao', stationedSiteId: 'b', troops: 300, command: 60 }),
    ],
  }
}

function createJ10Session(seed: number): GameSession {
  const store = new LocalSaveStore(new MemoryStorage())
  store.save(AUTO_SAVE_KEY, createInitialState({ scenario: j10Scenario(), seed }))

  return new GameSession(store, { drawSeed: seed })
}

function characterOf(state: GameState, id: string): Character {
  const character = state.characters.find((item) => item.id === id)
  if (character === undefined) {
    throw new Error(`武将不存在：${id}`)
  }
  return character
}

function siteOf(state: GameState, id: string) {
  const site = state.geography.sites.find((item) => item.id === id)
  if (site === undefined) {
    throw new Error(`战略点不存在：${id}`)
  }
  return site
}

function playerGrain(state: GameState): number {
  return state.factions.find((item) => item.id === state.playerFaction)?.grain ?? 0
}

/** 走完一季：征粮 → 征兵 → 出征 → 结束回合。 */
function runJ10Chain(session: GameSession): GameState {
  const state = session.getState()

  session.harvestGrain('farmer')
  session.recruit('recruiter')
  session.attack({ commander: 'warrior' }, 'b')
  session.endTurn()

  return state
}

describe('迭代 10 全链（无画面）', () => {
  it('征粮自驻地存粮取、征兵与出征受粮所限、进攻累计出战、结束回合缺粮不减员', () => {
    const session = createJ10Session(208)
    const state = session.getState()
    const site = siteOf(state, 'a')
    const granaryBefore = granaryOf(site)
    const grainBefore = playerGrain(state)

    // 征粮：取量以驻地存粮为上限，并自存粮中扣除。
    expect(session.harvestGrain('farmer').ok).toBe(true)
    const gained = playerGrain(state) - grainBefore
    expect(gained).toBe(granaryBefore)
    expect(granaryOf(site)).toBe(0)

    // 征兵：从驻地抽丁，人口随之下落。
    const recruiter = characterOf(state, 'recruiter')
    const troopsBefore = recruiter.troops
    const populationBefore = site.population
    expect(session.recruit('recruiter').ok).toBe(true)
    expect(recruiter.troops).toBeGreaterThan(troopsBefore)
    expect(site.population).toBeLessThan(populationBefore)

    // 出征：参战者累计出战一次。
    const warrior = characterOf(state, 'warrior')
    expect(hitCount(warrior)).toBe(0)
    expect(session.attack({ commander: 'warrior' }, 'b').ok).toBe(true)
    expect(siteOf(state, 'b').owner).toBe('liubei')
    expect(hitCount(warrior)).toBe(1)

    // 结束回合：缺粮也不减员，行动历史里没有逃散。
    const troopsBeforeSettle = factionTroops(state, 'liubei')
    session.endTurn()
    expect(factionTroops(state, 'liubei')).toBe(troopsBeforeSettle)
    expect(state.history.some((record) => record.kind === 'disband')).toBe(false)
  })

  it('固定种子下整条链可复现', () => {
    const first = runJ10Chain(createJ10Session(208))
    const second = runJ10Chain(createJ10Session(208))

    expect(first.history).toEqual(second.history)
    expect(first.geography.sites.map((site) => granaryOf(site))).toEqual(
      second.geography.sites.map((site) => granaryOf(site)),
    )
    expect(first.characters.map((character) => character.troops)).toEqual(
      second.characters.map((character) => character.troops),
    )
  })
})

/** 出战次数的口径：武将身上的累计值，未记时为零。 */
function hitCount(character: Character): number {
  return character.battles ?? 0
}

describe('武将成长', () => {
  it('每出战若干次得一次强化额度，额度换能力且可累积、不越上限', () => {
    const state = createInitialState({ seed: 208 })
    const guanyu = characterOf(state, 'guanyu')

    expect(boostCredits(guanyu)).toBe(0)
    guanyu.battles = BATTLES_PER_BOOST
    expect(boostCredits(guanyu)).toBe(1)

    const mightBefore = guanyu.might
    expect(strengthen(state, 'guanyu', 'might').ok).toBe(true)
    expect(guanyu.might).toBe(mightBefore + 1)
    expect(boostCredits(guanyu)).toBe(0)
  })

  it('额度不足或能力已满时拒绝，且不扣行动力', () => {
    const state = createInitialState({ seed: 208 })
    const guanyu = characterOf(state, 'guanyu')
    const apBefore = state.actionPoints[state.playerFaction]

    expect(strengthen(state, 'guanyu', 'might')).toEqual({
      ok: false,
      reason: '出战累积不足，尚不能强化',
    })

    guanyu.battles = BATTLES_PER_BOOST
    guanyu.might = 100
    expect(strengthen(state, 'guanyu', 'might')).toEqual({ ok: false, reason: '武力 已达上限' })
    expect(state.actionPoints[state.playerFaction]).toBe(apBefore)
  })
})
