import { describe, expect, it } from 'vitest'
import { GameSession } from '../src/app/gameSession'
import { ACTION_COSTS } from '../src/core/actions'
import { stationedDefendersAt } from '../src/core/battle'
import { validateCharacters } from '../src/core/characters'
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
    politics: 50,
    age: 40,
    personality: 'open',
    affinities: { liubei: 100 },
    loyalty: 0,
    isMonarch: false,
    stationedSiteId: null,
    troops: 0,
    tier,
  }
}

/** 一个州三个战略点：玩家占一角，攻下敌战略点即可成为该州归属势力。 */
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
        politics: 50,
        age: 40,
        personality: 'steady',
        affinities: { liubei: 90 },
        loyalty: 90,
        isMonarch: false,
        stationedSiteId: 'a',
        troops: 20000,
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
        politics: 50,
        age: 40,
        personality: 'steady',
        affinities: { caocao: 90 },
        loyalty: 90,
        isMonarch: false,
        stationedSiteId: 'b',
        troops: 500,
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
    // 一季 10 点：寻访与征兵之后，正好剩下一次进攻的行动力。
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_COSTS.attack)

    session.endTurn()

    expect(session.attack({ commander: 'guanyu' }, 'chibi').ok).toBe(true)

    expect(siteOwner(state, 'chibi')).toBe('liubei')
    expect(characterOf(state, 'guanyu').stationedSiteId).toBe('chibi')
    // 他方本季也会行动并写入历史，只核对玩家自己的行动序列。
    expect(
      state.history
        .filter((record) => record.factionId === state.playerFaction)
        .map((record) => record.kind),
    ).toEqual(['seekTalent', 'recruit', 'attack'])
    expect(state.currentTurn).toBe(2)
  })

  it('固定种子下整条循环可复现', () => {
    const run = () => {
      const session = createSession(7)
      session.seekTalent('jiangxia')
      session.recruit('guanyu')
      session.endTurn()
      session.attack({ commander: 'guanyu' }, 'chibi')
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
      reloaded.attack({ commander: 'guanyu' }, 'chibi')
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
    expect(session.attack({ commander: 'attacker' }, 'b').ok).toBe(true)
    expect(state.geography.provinces.find((province) => province.id === 'p')?.owner).toBe('liubei')

    // 二级池随之开放，继续寻访可寻得二级客。
    session.endTurn()
    expect(session.seekTalent('a').ok).toBe(true)
    expect(characterOf(state, 'second-1').status).toBe('serving')
  })
})

/**
 * 迭代 7 全链的无画面验证：寻访（含加入意愿）→ 征兵 → 进攻（含单挑与阵亡）→ 占领（含守将被俘）
 * → 劝降 → 结束回合（含忠诚下降与叛离）。两季走完，全程只跑规则层与装配层。
 * 单挑阵亡与被俘都是概率结果，先在固定种子里筛出一个必然走通的分支，再据此断言。
 */

/** 甲、乙、丙三城同在一州；州二只有玩家的丁城，供一名州二的在野者专属。 */
function j7Scenario(): Scenario {
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
    tier: null,
    ...over,
  })

  return {
    id: 'iteration7-loop',
    name: '迭代 7 全链',
    startDate: { era: '建安', year: 13, season: 'autumn' },
    playerFaction: 'liubei',
    factions: [
      { id: 'liubei', name: '刘备', color: '#3f7a5a', grain: 100000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', grain: 100000 },
    ],
    geography: {
      provinces: [
        { id: 'p1', name: '州一', owner: null },
        { id: 'p2', name: '州二', owner: 'liubei' },
      ],
      sites: [
        { id: 'a', name: '甲城', type: 'city', provinceId: 'p1', owner: 'liubei', neighbors: ['b', 'c'] },
        { id: 'b', name: '乙城', type: 'city', provinceId: 'p1', owner: 'caocao', neighbors: ['a', 'c'] },
        { id: 'c', name: '丙城', type: 'city', provinceId: 'p1', owner: 'caocao', neighbors: ['a', 'b'] },
        { id: 'd', name: '丁城', type: 'city', provinceId: 'p2', owner: 'liubei', neighbors: ['a'] },
      ],
    },
    characters: [
      // 我方主力：兵力碾压乙城，可在单挑中取胜并攻下城池。
      serving({
        id: 'veteran',
        name: '宿将',
        factionId: 'liubei',
        stationedSiteId: 'a',
        troops: 8000,
        might: 100,
        command: 90,
        loyalty: 95,
        affinities: { liubei: 95 },
      }),
      // 我方边缘人：忠诚已低，一旦出战失利便离走。
      serving({
        id: 'turncoat',
        name: '离心将',
        factionId: 'liubei',
        stationedSiteId: 'a',
        troops: 800,
        might: 30,
        command: 40,
        loyalty: 15,
        affinities: { liubei: 60 },
      }),
      // 专供征兵：征兵会占用本季行动，故不与进攻、出击共用一人。
      serving({
        id: 'rookie',
        name: '新兵',
        factionId: 'liubei',
        stationedSiteId: 'a',
        troops: 100,
        command: 50,
      }),
      // 乙城守军：统率最高者出战单挑，另一人若被俘则极愿归附。
      serving({
        id: 'duelist',
        name: '守将甲',
        factionId: 'caocao',
        stationedSiteId: 'b',
        troops: 200,
        command: 80,
        affinities: { caocao: 90 },
      }),
      serving({
        id: 'capturable',
        name: '守将乙',
        factionId: 'caocao',
        stationedSiteId: 'b',
        troops: 100,
        command: 40,
        personality: 'open',
        loyalty: 0,
        affinities: { liubei: 100 },
      }),
      // 丙城守军：兵力压倒，离心将必败；武力低而性情谨慎，不会主动单挑而把离心将打死。
      serving({
        id: 'bulwark',
        name: '坚城守',
        factionId: 'caocao',
        stationedSiteId: 'c',
        troops: 12000,
        command: 95,
        might: 10,
        personality: 'cautious',
        affinities: { caocao: 90 },
      }),
      // 州二的在野者：性格骄矜、对己方无好感，须经拜访才肯出仕。
      {
        id: 'aloof',
        name: '傲士',
        status: 'wild',
        factionId: null,
        provinceId: 'p2',
        might: 50,
        command: 50,
        intellect: 50,
        politics: 50,
        age: 30,
        personality: 'proud',
        affinities: { liubei: 0 },
        loyalty: 0,
        isMonarch: false,
        stationedSiteId: null,
        troops: 0,
        tier: 'second',
      },
    ],
  }
}

function createJ7Session(scenarioSeed: number, drawSeed: number): GameSession {
  const store = new LocalSaveStore(new MemoryStorage())
  store.save(AUTO_SAVE_KEY, createInitialState({ scenario: j7Scenario(), seed: scenarioSeed }))

  return new GameSession(store, { drawSeed })
}

/**
 * 走完整条链：第一季寻访未果而记下接触、征兵、进攻乙城（单挑致阵亡、守将被俘）；
 * 第二季拜访在野者使其入仕、劝降营中俘虏、派离心将进攻丙城败北而叛离。
 */
function runJ7Chain(session: GameSession): GameState {
  const state = session.getState()

  session.seekTalent('d')
  session.recruit('rookie')
  session.attack({ commander: 'veteran', challenger: 'veteran' }, 'b')
  session.endTurn()

  session.visit('aloof')
  session.persuade('capturable')
  session.attack({ commander: 'turncoat' }, 'c')
  session.endTurn()

  return state
}

interface J7Seeds {
  scenarioSeed: number
  drawSeed: number
}

let cachedJ7Seeds: J7Seeds | null = null

/** 在固定种子里筛出一条必然走通的分支：寻访被拒、单挑致阵亡、守将被俘、拜访得手、离心将叛离。 */
function j7Seeds(): J7Seeds {
  if (cachedJ7Seeds !== null) {
    return cachedJ7Seeds
  }

  for (let drawSeed = 1; drawSeed <= 40; drawSeed += 1) {
    for (let scenarioSeed = 1; scenarioSeed <= 60; scenarioSeed += 1) {
      const session = createJ7Session(scenarioSeed, drawSeed)
      const state = session.getState()

      // 第一季：寻访被拒（人仍在野）、征兵、进攻乙城——单挑致阵亡、守将被俘、攻方得城。
      const seek = session.seekTalent('d')
      const recruit = session.recruit('rookie')
      const attack = session.attack({ commander: 'veteran', challenger: 'veteran' }, 'b')

      if (!seek.ok || !recruit.ok || !attack.ok) {
        continue
      }
      const report = attack.record.battle
      if (report?.duel == null || report.duel.fallen === '' || report.captives.length === 0) {
        continue
      }
      if (siteOwner(state, 'b') !== 'liubei' || characterOf(state, 'aloof').status !== 'wild') {
        continue
      }

      // 第二季：拜访使在野者入仕、派离心将进攻丙城败北而叛离。
      session.endTurn()
      const visit = session.visit('aloof')
      if (!visit.ok || characterOf(state, 'aloof').status !== 'serving') {
        continue
      }

      const loss = session.attack({ commander: 'turncoat' }, 'c')
      if (!loss.ok || siteOwner(state, 'c') !== 'caocao') {
        continue
      }
      if (characterOf(state, 'turncoat').status !== 'wild') {
        continue
      }

      cachedJ7Seeds = { scenarioSeed, drawSeed }
      return cachedJ7Seeds
    }
  }

  throw new Error('未找到满足迭代 7 全链条件的固定种子')
}

describe('迭代 7 全链（无画面）', () => {
  it('寻访含意愿、征兵、单挑与阵亡、被俘与劝降、忠诚下降与叛离依次走通', () => {
    const { scenarioSeed, drawSeed } = j7Seeds()
    const session = createJ7Session(scenarioSeed, drawSeed)
    const state = session.getState()

    // 第一季：寻访被拒 → 人仍在野、记入接触名单。
    expect(session.seekTalent('d').ok).toBe(true)
    expect(characterOf(state, 'aloof').status).toBe('wild')
    expect(state.contactedCandidates.liubei).toEqual([{ characterId: 'aloof', siteId: 'd' }])

    // 征兵：兵力补充。
    const troopsBefore = characterOf(state, 'rookie').troops
    expect(session.recruit('rookie').ok).toBe(true)
    expect(characterOf(state, 'rookie').troops).toBeGreaterThan(troopsBefore)

    // 进攻乙城：单挑致阵亡、守将被俘、城池与州归属易手。
    const attack = session.attack({ commander: 'veteran', challenger: 'veteran' }, 'b')
    expect(attack.ok).toBe(true)
    if (!attack.ok || attack.record.battle === undefined) {
      throw new Error('未取得战报')
    }
    expect(attack.record.battle.duel?.fallen).not.toBe('')
    expect(characterOf(state, 'duelist').status).toBe('retired')
    expect(attack.record.battle.captives.map((item) => item.name)).toContain('守将乙')
    expect(siteOwner(state, 'b')).toBe('liubei')
    expect(state.geography.provinces.find((province) => province.id === 'p1')?.owner).toBe('liubei')

    session.endTurn()

    // 第二季：拜访使在野者入仕，劝降使营中俘虏归附，离心将败北而叛离。
    expect(session.visit('aloof').ok).toBe(true)
    expect(characterOf(state, 'aloof').status).toBe('serving')

    const persuade = session.persuade('capturable')
    expect(persuade.ok).toBe(true)
    expect(persuade.ok && persuade.record.outcome).toContain('归附')
    expect(characterOf(state, 'capturable').status).toBe('serving')
    expect(characterOf(state, 'capturable').factionId).toBe('liubei')
    expect(state.captives.liubei).toEqual([])

    expect(session.attack({ commander: 'turncoat' }, 'c').ok).toBe(true)
    expect(characterOf(state, 'turncoat').status).toBe('wild')
    expect(characterOf(state, 'turncoat').loyalty).toBe(0)
    expect(
      state.history.some((record) => record.kind === 'defect' && record.factionId === 'liubei'),
    ).toBe(true)

    // 结算本季：离心将的败绩与叛离随回合推进留痕。
    session.endTurn()

    expect(siteOwner(state, 'c')).toBe('caocao')
    expect(state.currentTurn).toBe(3)
  })

  it('固定种子下整条链可复现', () => {
    const { scenarioSeed, drawSeed } = j7Seeds()
    const run = () => runJ7Chain(createJ7Session(scenarioSeed, drawSeed))

    expect(run()).toEqual(run())
  })

  it('退场者不再参与任何名单与结算，人物数据仍自洽', () => {
    const { scenarioSeed, drawSeed } = j7Seeds()
    const state = runJ7Chain(createJ7Session(scenarioSeed, drawSeed))

    // 阵亡的守将已退场，不再出现在战略点守军之中。
    const fallen = characterOf(state, 'duelist')
    expect(fallen.status).toBe('retired')
    expect(stationedDefendersAt(state, 'b')).not.toContain(fallen)

    for (const character of state.characters) {
      if (character.status !== 'retired') {
        continue
      }
      expect(character.factionId).toBeNull()
      expect(character.stationedSiteId).toBeNull()
      expect(character.troops).toBe(0)
      expect(character.isMonarch).toBe(false)
    }

    expect(
      validateCharacters(
        state.characters,
        state.factions.map((faction) => faction.id),
        state.geography,
      ),
    ).toEqual([])
  })
})
