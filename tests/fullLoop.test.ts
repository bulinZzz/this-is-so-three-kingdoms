import { describe, expect, it } from 'vitest'
import { GameSession } from '../src/app/gameSession'
import { ACTION_COSTS } from '../src/core/actions'
import { autoDeployment } from '../src/core/battle'
import { validateCharacters } from '../src/core/characters'
import { createInitialState } from '../src/core/createInitialState'
import { troopUpkeep } from '../src/core/economy'
import { LocalSaveStore } from '../src/core/localSaveStore'
import {
  attackGrainCost,
  factionTroops,
  RECRUIT_POPULATION_SHARE,
  sitePopulationCap,
} from '../src/core/military'
import type { Character, GameState, Scenario } from '../src/core/model'
import { AUTO_SAVE_KEY } from '../src/core/saveStore'
import { MemoryStorage } from './memoryStorage'

/**
 * 完整循环的无画面验证：寻访 → 征兵 → 进攻 → 占领 → 结束回合，含州归属与卡池联动、
 * 忠诚与叛离、粮草收支与人口增长。全程只跑规则层与装配层，不启动画面。
 */

/** 预置一份固定世界种子的自动存档，使随机状态也确定；关羽补足兵力，一季之内足以攻下荆南的城。 */
function seededStore(): LocalSaveStore {
  const store = new LocalSaveStore(new MemoryStorage())
  const state = createInitialState({ seed: 208 })
  const guanyu = state.characters.find((character) => character.id === 'guanyu')
  if (guanyu === undefined) {
    throw new Error('武将不存在：guanyu')
  }
  guanyu.troops = 12000
  store.save(AUTO_SAVE_KEY, state)

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

/** 以自动阵形出征并打完这一战；开战被拒时返回 false。 */
function attackSite(session: GameSession, targetSiteId: string, memberIds: string[]): boolean {
  const opened = session.attack(targetSiteId, autoDeployment(memberIds))
  if (!opened.ok) {
    return false
  }
  session.finishAttack(opened.battle)

  return true
}

/** 一个州三个战略点：玩家占一角，攻下敌战略点即可成为该州归属势力。 */
function loopScenario(): Scenario {
  return {
    id: 'full-loop',
    name: '整链测试',
    startDate: { era: '建安', year: 13, season: 'autumn' },
    playerFaction: 'liubei',
    factions: [
      { id: 'liubei', name: '刘备', color: '#3f7a5a', money: 0, grain: 10000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', money: 0, grain: 10000 },
    ],
    relations: [{ factions: ['liubei', 'caocao'], kind: 'hostile', favor: 25 }],
    geography: {
      provinces: [{ id: 'p', name: '州', owner: 'caocao' }],
      sites: [
        { id: 'a', name: '甲城', type: 'city', population: 50000, provinceId: 'p', owner: 'liubei', neighbors: ['b'] },
        { id: 'b', name: '乙城', type: 'city', population: 50000, provinceId: 'p', owner: 'caocao', neighbors: ['a', 'c'] },
        { id: 'c', name: '丙城', type: 'city', population: 50000, provinceId: 'p', owner: 'caocao', neighbors: ['b'] },
      ],
    },
    characters: [
      {
        id: 'attacker',
        name: '攻将',
        status: 'serving',
        factionId: 'liubei',
        provinceId: 'p',
        scope: ['a'],
        might: 90,
        command: 90,
        intellect: 60,
        politics: 50,
        age: 40,
        personality: 'steady',
        affinities: { liubei: 90 },
        loyalty: 90,
        isMonarch: false,
        armType: 'infantry',
        stationedSiteId: null,
        troops: 20000,
        tier: null,
      },
      {
        id: 'defender',
        name: '守将',
        status: 'serving',
        factionId: 'caocao',
        provinceId: 'p',
        scope: ['b'],
        might: 60,
        command: 60,
        intellect: 50,
        politics: 50,
        age: 40,
        personality: 'steady',
        affinities: { caocao: 90 },
        loyalty: 90,
        isMonarch: false,
        armType: 'infantry',
        stationedSiteId: 'b',
        troops: 500,
        tier: null,
      },
      wild('basic-1', '基础客', 'basic'),
      wild('second-1', '二级客', 'second'),
    ],
  }
}

function wild(id: string, name: string, tier: 'basic' | 'second'): Character {
  return {
    id,
    name,
    status: 'wild',
    factionId: null,
    provinceId: 'p',
    scope: ['a'],
    might: 50,
    command: 50,
    intellect: 50,
    politics: 50,
    age: 40,
    personality: 'open',
    affinities: { liubei: 100 },
    loyalty: 0,
    isMonarch: false,
    armType: 'infantry',
    stationedSiteId: null,
    troops: 0,
    tier,
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

    expect(session.seekTalent('gongan').ok).toBe(true)
    expect(session.recruit('gongan', 'guanyu').ok).toBe(true)
    // 一季 10 点：寻访与征兵之后，正好剩下一次进攻的行动力。
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_COSTS.attack)

    session.endTurn()

    // 长沙是荆南的大城，与公安相邻；他方本季也会行动并写入历史，只核对玩家自己的行动序列。
    expect(session.declareWar('jingnan').ok).toBe(true)
    expect(attackSite(session, 'changsha', ['guanyu'])).toBe(true)

    expect(siteOwner(state, 'changsha')).toBe('liubei')
    // 攻下城池不自动留驻，驻将须在占领后另行指派。
    expect(characterOf(state, 'guanyu').stationedSiteId).toBeNull()
    expect(session.stationAfterCapture('changsha', 'guanyu')).toContain('留驻')
    expect(characterOf(state, 'guanyu').stationedSiteId).toBe('changsha')
    expect(
      state.history
        .filter((record) => record.factionId === state.playerFaction)
        .map((record) => record.kind),
    ).toEqual(['seekTalent', 'recruit', 'declareWar', 'attack'])
    expect(state.currentTurn).toBe(2)
  })

  it('固定种子下整条循环可复现', () => {
    const run = () => {
      const session = createSession(7)
      session.seekTalent('gongan')
      session.recruit('gongan', 'guanyu')
      session.endTurn()
      session.declareWar('jingnan')
      attackSite(session, 'changsha', ['guanyu'])
      session.endTurn()
      session.seekTalent('changsha')

      return session.getState()
    }

    expect(run()).toEqual(run())
  })

  it('同一存档重复推演结果一致', () => {
    const store = seededStore()
    const session = new GameSession(store, { drawSeed: 9 })
    session.seekTalent('gongan')
    session.recruit('gongan', 'guanyu')
    session.saveToSlot(1)

    const advance = () => {
      const reloaded = new GameSession(store, { drawSeed: 9 })
      expect(reloaded.loadSlot(1)).toBe(true)
      reloaded.endTurn()
      reloaded.declareWar('jingnan')
      attackSite(reloaded, 'changsha', ['guanyu'])
      reloaded.seekTalent('changsha')

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
    expect(attackSite(session, 'b', ['attacker'])).toBe(true)
    expect(state.geography.provinces.find((province) => province.id === 'p')?.owner).toBe('liubei')

    // 二级池随之开放，继续寻访可寻得二级客。
    expect(session.seekTalent('a').ok).toBe(true)
    expect(characterOf(state, 'second-1').status).toBe('serving')
  })
})

/**
 * 忠诚与叛离：败仗使参战者忠诚下降，低于阈值者在受挫时弃势力而去、转为在野。
 * 兵力对比固定，胜负与叛离都不依赖随机。
 */
function loyaltyScenario(): Scenario {
  const serving = (
    over: Partial<Character> &
      Pick<Character, 'id' | 'name' | 'factionId' | 'stationedSiteId' | 'troops'>,
  ): Character => ({
    status: 'serving',
    provinceId: 'p1',
    might: 50,
    command: 50,
    intellect: 50,
    politics: 50,
    age: 40,
    personality: 'steady',
    affinities: {},
    loyalty: 90,
    isMonarch: false,
    armType: 'infantry',
    tier: null,
    scope: [over.stationedSiteId ?? 'a'],
    ...over,
  })

  return {
    id: 'loyalty-loop',
    name: '忠诚全链',
    startDate: { era: '建安', year: 13, season: 'autumn' },
    playerFaction: 'liubei',
    factions: [
      { id: 'liubei', name: '刘备', color: '#3f7a5a', money: 0, grain: 100000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', money: 0, grain: 100000 },
    ],
    relations: [{ factions: ['liubei', 'caocao'], kind: 'hostile', favor: 25 }],
    geography: {
      provinces: [{ id: 'p1', name: '州一', owner: null }],
      sites: [
        { id: 'a', name: '甲城', type: 'city', population: 50000, provinceId: 'p1', owner: 'liubei', neighbors: ['b', 'c'] },
        { id: 'b', name: '乙城', type: 'city', population: 50000, provinceId: 'p1', owner: 'caocao', neighbors: ['a', 'c'] },
        { id: 'c', name: '丙城', type: 'city', population: 50000, provinceId: 'p1', owner: 'caocao', neighbors: ['a', 'b'] },
      ],
    },
    characters: [
      serving({ id: 'veteran', name: '宿将', factionId: 'liubei', stationedSiteId: null, troops: 20000, might: 100, command: 90, loyalty: 95, affinities: { liubei: 95 } }),
      // 忠诚已低，一败即走。
      serving({ id: 'turncoat', name: '离心将', factionId: 'liubei', stationedSiteId: null, troops: 800, might: 30, command: 40, loyalty: 15, affinities: { liubei: 60 } }),
      serving({ id: 'duelist', name: '守将甲', factionId: 'caocao', stationedSiteId: 'b', troops: 200, command: 80, affinities: { caocao: 90 } }),
      // 丙城守军兵力压倒，离心将必败。
      serving({ id: 'bulwark', name: '坚城守', factionId: 'caocao', stationedSiteId: 'c', troops: 12000, command: 95, affinities: { caocao: 90 } }),
    ],
  }
}

function createLoyaltySession(seed: number): GameSession {
  const store = new LocalSaveStore(new MemoryStorage())
  store.save(AUTO_SAVE_KEY, createInitialState({ scenario: loyaltyScenario(), seed }))

  return new GameSession(store, { drawSeed: seed })
}

describe('忠诚与叛离（无画面）', () => {
  it('败北使参战者忠诚下降，离心者随即弃势力而去；得胜者不降', () => {
    const session = createLoyaltySession(208)
    const state = session.getState()

    expect(attackSite(session, 'b', ['veteran'])).toBe(true)
    expect(siteOwner(state, 'b')).toBe('liubei')
    expect(characterOf(state, 'veteran').loyalty).toBe(95)

    expect(attackSite(session, 'c', ['turncoat'])).toBe(true)
    expect(siteOwner(state, 'c')).toBe('caocao')
    expect(characterOf(state, 'turncoat').status).toBe('wild')
    expect(characterOf(state, 'turncoat').factionId).toBeNull()
    expect(characterOf(state, 'turncoat').troops).toBe(0)
    expect(
      state.history.some((record) => record.kind === 'defect' && record.factionId === 'liubei'),
    ).toBe(true)
  })

  it('退场者不再参与任何名单与结算，人物数据仍自洽', () => {
    const session = createLoyaltySession(208)
    const state = session.getState()

    attackSite(session, 'b', ['veteran'])
    attackSite(session, 'c', ['turncoat'])
    session.endTurn()

    expect(
      validateCharacters(
        state.characters,
        state.factions.map((faction) => faction.id),
        state.geography,
      ),
    ).toEqual([])
  })
})

/**
 * 粮草收支：征粮 → 征兵受丁口所限 → 出征耗粮 → 结束回合结算军粮与人口。
 */

/** 甲、乙两城相邻；甲城人口 2 万（丁口 400），乙城由曹操一名弱将驻守。 */
function economyScenario(): Scenario {
  const serving = (
    over: Partial<Character> &
      Pick<Character, 'id' | 'name' | 'factionId' | 'stationedSiteId' | 'troops'>,
  ): Character => ({
    status: 'serving',
    provinceId: 'p1',
    might: 50,
    command: 50,
    intellect: 50,
    politics: 50,
    age: 40,
    personality: 'steady',
    affinities: {},
    loyalty: 90,
    isMonarch: false,
    armType: 'infantry',
    tier: null,
    scope: [over.stationedSiteId ?? 'a'],
    ...over,
  })

  return {
    id: 'economy-loop',
    name: '粮草全链',
    startDate: { era: '建安', year: 13, season: 'autumn' },
    playerFaction: 'liubei',
    factions: [
      { id: 'liubei', name: '刘备', color: '#3f7a5a', money: 0, grain: 5000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', money: 0, grain: 5000 },
    ],
    relations: [{ factions: ['liubei', 'caocao'], kind: 'hostile', favor: 25 }],
    geography: {
      provinces: [{ id: 'p1', name: '州一', owner: null }],
      sites: [
        { id: 'a', name: '甲城', type: 'city', population: 20000, provinceId: 'p1', owner: 'liubei', neighbors: ['b'] },
        { id: 'b', name: '乙城', type: 'city', population: 10000, provinceId: 'p1', owner: 'caocao', neighbors: ['a'] },
      ],
    },
    characters: [
      // 征粮靠内政、征兵靠统率、出征靠兵力——三件事各是不同的人，一季正好排满。
      serving({ id: 'farmer', name: '屯田', factionId: 'liubei', stationedSiteId: null, troops: 500, command: 40, politics: 80 }),
      serving({ id: 'recruiter', name: '招兵', factionId: 'liubei', stationedSiteId: 'a', troops: 1000, command: 90, politics: 30 }),
      serving({ id: 'warrior', name: '战将', factionId: 'liubei', stationedSiteId: null, troops: 12000, command: 80, might: 90 }),
      serving({ id: 'defender', name: '守将', factionId: 'caocao', stationedSiteId: 'b', troops: 300, command: 60 }),
    ],
  }
}

function createEconomySession(seed: number): GameSession {
  const store = new LocalSaveStore(new MemoryStorage())
  store.save(AUTO_SAVE_KEY, createInitialState({ scenario: economyScenario(), seed }))

  return new GameSession(store, { drawSeed: seed })
}

function siteOf(state: GameState, id: string) {
  const site = state.geography.sites.find((item) => item.id === id)
  if (site === undefined) {
    throw new Error(`战略点不存在：${id}`)
  }
  return site
}

function playerGrain(state: GameState): number {
  const faction = state.factions.find((item) => item.id === state.playerFaction)
  if (faction === undefined) {
    throw new Error(`势力不存在：${state.playerFaction}`)
  }
  return faction.grain
}

/** 走完第一季：征粮 → 征兵 → 出征乙城 → 结束回合。 */
function runEconomyChain(session: GameSession): GameState {
  const state = session.getState()

  session.harvestGrain('a', 'farmer')
  session.recruit('a', 'recruiter')
  attackSite(session, 'b', ['warrior'])
  session.endTurn()

  return state
}

describe('粮草收支（无画面）', () => {
  it('征粮 → 征兵受丁口所限 → 出征耗粮并占领 → 结束回合结算收支与人口', () => {
    const session = createEconomySession(208)
    const state = session.getState()

    // 征粮：粮食入库，屯田占用本季行动。
    const grainBefore = playerGrain(state)
    expect(session.harvestGrain('a', 'farmer').ok).toBe(true)
    expect(playerGrain(state)).toBeGreaterThan(grainBefore)

    // 征兵：产量本为统率 × 10，但甲城丁口只有 400，兵力按丁口截断，人口相应减少。
    const recruiter = characterOf(state, 'recruiter')
    const troopsBefore = recruiter.troops
    const cap = sitePopulationCap(siteOf(state, 'a'))
    expect(cap).toBe(Math.floor(20000 * RECRUIT_POPULATION_SHARE))
    expect(session.recruit('a', 'recruiter').ok).toBe(true)
    expect(recruiter.troops - troopsBefore).toBe(cap)
    expect(siteOf(state, 'a').population).toBe(20000 - cap)

    // 出征：按投入兵力耗粮，交战并攻下乙城。
    const beforeAttack = playerGrain(state)
    const warrior = characterOf(state, 'warrior')
    const troopsBeforeAttack = warrior.troops
    expect(attackSite(session, 'b', ['warrior'])).toBe(true)
    expect(playerGrain(state)).toBe(beforeAttack - attackGrainCost(troopsBeforeAttack))
    expect(siteOwner(state, 'b')).toBe('liubei')

    // 结束回合：存粮运回不敷军粮，粮食随之下降；人口缓增。
    const populationBefore = siteOf(state, 'a').population
    const beforeSettle = playerGrain(state)

    session.endTurn()

    expect(troopUpkeep(state, 'liubei')).toBeGreaterThan(0)
    expect(playerGrain(state)).toBeLessThan(beforeSettle)
    expect(playerGrain(state)).toBeGreaterThanOrEqual(0)
    expect(siteOf(state, 'a').population).toBeGreaterThan(populationBefore)
  })

  it('粮尽时粮仓归零，但部队一兵不减', () => {
    const session = createEconomySession(208)
    const state = session.getState()
    // 断掉粮源：人口与存粮皆为零，本季既运不回粮，也付不出军粮。
    for (const site of state.geography.sites) {
      site.population = 0
      site.granary = 0
    }
    const faction = state.factions.find((item) => item.id === 'liubei')
    if (faction === undefined) {
      throw new Error('势力不存在：liubei')
    }
    faction.grain = 0
    const troopsBefore = factionTroops(state, 'liubei')

    session.endTurn()

    expect(troopsBefore).toBeGreaterThan(0)
    expect(
      state.history.some((record) => record.kind === 'disband' && record.factionId === 'liubei'),
    ).toBe(false)
    expect(factionTroops(state, 'liubei')).toBe(troopsBefore)
    expect(playerGrain(state)).toBe(0)
  })

  it('固定种子下整条链可复现', () => {
    const first = runEconomyChain(createEconomySession(208))
    const second = runEconomyChain(createEconomySession(208))

    expect(first.history).toEqual(second.history)
    expect(first.geography.sites.map((site) => site.population)).toEqual(
      second.geography.sites.map((site) => site.population),
    )
    expect(first.factions.map((faction) => faction.grain)).toEqual(
      second.factions.map((faction) => faction.grain),
    )
    expect(first.characters.map((character) => character.troops)).toEqual(
      second.characters.map((character) => character.troops),
    )
  })
})
