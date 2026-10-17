import { describe, expect, it } from 'vitest'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../src/core/actions'
import {
  aiDuelChallenger,
  assignAfterCapture,
  attack,
  attackCandidates,
  battleOutlook,
  battlePower,
  defenseOutlook,
  duel,
  duelAnswererAt,
  duelHeadline,
  defenderFactionAt,
  garrisonAt,
  garrisonCommanderAt,
  isAttackable,
  MORALE_FULL,
  partySide,
  stationedDefendersAt,
} from '../src/core/battle'
import { takeCaptive } from '../src/core/captives'
import { createInitialState } from '../src/core/createInitialState'
import { declareWar } from '../src/core/diplomacy'
import { attackGrainCost, hasActedThisTurn, isTransferTarget, markActed, transfer } from '../src/core/military'
import type { BattleReport, Character, GameState, Scenario } from '../src/core/model'
import type { Random } from '../src/core/random'
import { beginTurn, endTurn } from '../src/core/turn'
import { SANGUO_ACCEPTANCE } from '../src/core/scenarios'

function characterOf(state: GameState, id: string) {
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

/** 两个战略点、两家势力的最小对局，便于精确控制攻守兵力与能力。 */
function scene(options: {
  attackerTroops: number
  defenderTroops: number
  secondAttackerTroops?: number
  attackerIntellect?: number
  defenderIntellect?: number
  twoWay?: boolean
  seed?: number
  defenderIsMonarch?: boolean
}): GameState {
  const scenario: Scenario = {
    id: 'battle-test',
    name: '战斗测试',
    startDate: { era: '建安', year: 13, season: 'autumn' },
    playerFaction: 'liubei',
    factions: [
      { id: 'liubei', name: '刘备', color: '#3f7a5a', money: 0, grain: 100000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', money: 0, grain: 100000 },
    ],
    relations: [{ factions: ['liubei', 'caocao'], kind: 'hostile', favor: 25 }],
    geography: {
      provinces: [{ id: 'jing', name: '荆州', owner: null }],
      sites: [
        { id: 'a', name: '甲', type: 'city', population: 50000, provinceId: 'jing', owner: 'liubei', neighbors: ['b'] },
        { id: 'b', name: '乙', type: 'city', population: 50000, provinceId: 'jing', owner: 'caocao', neighbors: ['a'] },
      ],
    },
    characters: [
      {
        id: 'attacker',
        name: '攻将',
        status: 'serving',
        factionId: 'liubei',
        provinceId: 'jing',
        might: 80,
        command: 80,
        intellect: options.attackerIntellect ?? 50,
        politics: 50,
        age: 40,
        personality: 'steady',
        affinities: { liubei: 90 },
        loyalty: 90,
        isMonarch: false,
        stationedSiteId: 'a',
        troops: options.attackerTroops,
        tier: null,
      },
      {
        id: 'attacker2',
        name: '副将',
        status: 'serving',
        factionId: 'liubei',
        provinceId: 'jing',
        might: 80,
        command: 80,
        intellect: 50,
        politics: 50,
        age: 40,
        personality: 'steady',
        affinities: { liubei: 90 },
        loyalty: 90,
        isMonarch: false,
        stationedSiteId: 'a',
        troops: options.secondAttackerTroops ?? 0,
        tier: null,
      },
      {
        id: 'defender',
        name: '守将',
        status: 'serving',
        factionId: 'caocao',
        provinceId: 'jing',
        might: 80,
        command: 80,
        intellect: options.defenderIntellect ?? 50,
        politics: 50,
        age: 40,
        personality: 'steady',
        affinities: { caocao: 90 },
        loyalty: 90,
        isMonarch: options.defenderIsMonarch ?? false,
        stationedSiteId: 'b',
        troops: options.defenderTroops,
        tier: null,
      },
    ],
  }

  return createInitialState({ scenario, seed: options.seed ?? 208 })
}

/** 建安十三年开局并向曹操宣战：进攻他方领地须先宣战，交战机制的验证都以此为起点。 */
function warState(seed = 208): GameState {
  const state = createInitialState({ seed })
  declareWar(state, 'caocao')

  return state
}

describe('战力计算', () => {
  const side = { troops: 1000, intellect: 50, morale: MORALE_FULL }

  it('守方按其据点类型获得防守补正：野地无险可依，关隘与都会最坚', () => {
    expect(battlePower(side, { defendingAt: 'field' })).toBeCloseTo(battlePower(side))
    expect(battlePower(side, { defendingAt: 'town' })).toBeCloseTo(battlePower(side) * 1.1)
    expect(battlePower(side, { defendingAt: 'city' })).toBeCloseTo(battlePower(side) * 1.2)
    expect(battlePower(side, { defendingAt: 'pass' })).toBeCloseTo(battlePower(side) * 1.3)
    expect(battlePower(side, { defendingAt: 'metropolis' })).toBeCloseTo(battlePower(side) * 1.3)
  })

  it('智谋或士气越高，战力越强', () => {
    expect(battlePower({ ...side, intellect: 100 })).toBeGreaterThan(battlePower(side))
    expect(battlePower({ ...side, morale: 50 })).toBeLessThan(battlePower(side))
  })

  it('士气为 0 时战力减到一半', () => {
    expect(battlePower({ ...side, morale: 0 })).toBeCloseTo(battlePower(side) / 2)
  })
})

describe('守军迎战编成', () => {
  it('无主战略点有凭险自守的守军，名号与兵力俱备', () => {
    const state = createInitialState({ seed: 208 })
    const guard = siteOf(state, 'changsha').guard

    expect(guard?.name).toContain('·')
    expect(garrisonAt(state, 'changsha').side.troops).toBeGreaterThan(0)
  })

  it('至多三人迎战，取兵力最多的三名，主将取其中统率最高者', () => {
    const state = createInitialState({ seed: 208 })
    const garrison = garrisonAt(state, 'jiangxia')

    // 江夏统兵最多的三人：关羽 8000、张飞 6000、刘备 5000。
    expect(garrison.members.map((item) => item.name)).toEqual(['关羽', '张飞', '刘备'])
    expect(garrison.side.troops).toBe(19000)
  })

  it('已行动的守军只计半数兵力', () => {
    const state = createInitialState({ seed: 208 })

    expect(garrisonAt(state, 'xiangyang').side.troops).toBe(3000)

    markActed(state, 'caimao')

    expect(garrisonAt(state, 'xiangyang').side.troops).toBe(1500)
  })
})

describe('无主战略点守军', () => {
  it('弱旅攻不下、强旅可下，得胜后守军清空', () => {
    // 兵力不足以撼动守军：出阵也占不下来。
    const weak = createInitialState({ seed: 208 })
    characterOf(weak, 'guanyu').troops = 100
    const weakResult = attack(weak, { commander: 'guanyu' }, 'changsha')

    expect(weakResult.ok).toBe(true)
    if (weakResult.ok) {
      expect(weakResult.record.battle?.attackerWins).toBe(false)
    }
    expect(siteOf(weak, 'changsha').owner).toBeNull()
    expect(siteOf(weak, 'changsha').guard).toBeDefined()

    // 单支主力足可取胜：占领后守军清空、归属改为攻方。
    const strong = createInitialState({ seed: 208 })
    const strongResult = attack(strong, { commander: 'guanyu' }, 'changsha')

    expect(strongResult.ok).toBe(true)
    if (strongResult.ok) {
      expect(strongResult.record.battle?.attackerWins).toBe(true)
    }
    expect(siteOf(strong, 'changsha').owner).toBe('liubei')
    expect(siteOf(strong, 'changsha').guard).toBeUndefined()
  })

  it('强度随类型与人口变化：关隘的民兵少于都会', () => {
    const state = createInitialState({ seed: 208 })

    // 潼关（关隘，人口二万）与宛（都会，人口十二万）都无守将驻守，就地成军。
    const passGuard = garrisonAt(state, 'tongguan').side.troops
    const metropolisGuard = garrisonAt(state, 'wancheng').side.troops

    expect(passGuard).toBeGreaterThan(0)
    expect(metropolisGuard).toBeGreaterThan(passGuard)
  })

  it('固定种子下同一场对无主点的战斗可复现', () => {
    const fight = () => {
      const state = createInitialState({ seed: 208 })
      const result = attack(state, { commander: 'guanyu' }, 'changsha')

      return {
        ok: result.ok,
        troops: characterOf(state, 'guanyu').troops,
        randomState: state.randomState,
        owner: siteOf(state, 'changsha').owner,
        guard: siteOf(state, 'changsha').guard,
      }
    }

    expect(fight()).toEqual(fight())
  })
})

describe('进攻', () => {
  it('无主战略点须交战方能占领，攻方得胜后入驻', () => {
    const state = createInitialState({ seed: 208 })

    const result = attack(state, { commander: 'guanyu' }, 'changsha')

    expect(result.ok).toBe(true)
    expect(siteOf(state, 'changsha').owner).toBe('liubei')
    expect(characterOf(state, 'guanyu').stationedSiteId).toBe('changsha')
    // 交战有损耗，不再是「不战而下」的零伤亡。
    expect(characterOf(state, 'guanyu').troops).toBeLessThan(8000)
    expect(hasActedThisTurn(state, 'guanyu')).toBe(true)
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.attack)
  })

  it('未宣战不能进攻中立势力，宣战后方可', () => {
    const state = createInitialState({ seed: 208 })

    // 建安十三年开局刘备与曹操中立：襄阳打不得。
    expect(isAttackable(state, 'xiangyang')).toBe(false)
    expect(attack(state, { commander: 'guanyu' }, 'xiangyang')).toEqual({
      ok: false,
      reason: '与对方非敌对，须先宣战',
    })

    declareWar(state, 'caocao')

    expect(isAttackable(state, 'xiangyang')).toBe(true)
    expect(attack(state, { commander: 'guanyu' }, 'xiangyang').ok).toBe(true)
    expect(siteOf(state, 'xiangyang').owner).toBe('liubei')
  })

  it('攻占有主战略点，守军或撤往相邻的自有战略点，或战死退场', () => {
    const state = warState()

    const result = attack(state, { commander: 'guanyu' }, 'xiangyang')

    expect(result.ok).toBe(true)
    expect(siteOf(state, 'xiangyang').owner).toBe('liubei')
    expect(characterOf(state, 'guanyu').stationedSiteId).toBe('xiangyang')

    const caimao = characterOf(state, 'caimao')
    if (caimao.status === 'serving') {
      expect(['fancheng', 'jiangling']).toContain(caimao.stationedSiteId)
    } else {
      expect(caimao.status).toBe('retired')
      expect(caimao.stationedSiteId).toBeNull()
      expect(caimao.troops).toBe(0)
    }
  })

  it('战略点失守后，守将的去向写入行动记录', () => {
    const state = warState()

    const result = attack(state, { commander: 'guanyu' }, 'xiangyang')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.record.outcome).toContain('攻占 襄阳')
      expect(result.record.outcome).toContain('守将')
    }
  })

  it('攻占无主点后守军清空，去向写入记录', () => {
    const state = createInitialState({ seed: 208 })
    const guardName = siteOf(state, 'changsha').guard?.name ?? ''

    const result = attack(state, { commander: 'guanyu' }, 'changsha')

    expect(result.ok).toBe(true)
    expect(siteOf(state, 'changsha').guard).toBeUndefined()
    if (result.ok) {
      expect(result.record.outcome).toContain('守军')
      expect(result.record.outcome).toContain(guardName)
    }
  })

  it('固定种子下同一场战斗结果稳定', () => {
    const fight = () => {
      const state = scene({ attackerTroops: 10000, defenderTroops: 6000 })
      const result = attack(state, { commander: 'attacker' }, 'b')

      return {
        ok: result.ok,
        attackerTroops: characterOf(state, 'attacker').troops,
        defenderTroops: characterOf(state, 'defender').troops,
        randomState: state.randomState,
        outcome: siteOf(state, 'b').owner,
      }
    }

    expect(fight()).toEqual(fight())
  })

  it('败则退回原驻地并受损，战略点归属不变', () => {
    const state = scene({ attackerTroops: 1000, defenderTroops: 10000 })

    attack(state, { commander: 'attacker' }, 'b')

    expect(characterOf(state, 'attacker').stationedSiteId).toBe('a')
    expect(characterOf(state, 'attacker').troops).toBeLessThan(1000)
    expect(siteOf(state, 'b').owner).toBe('caocao')
  })

  it('本势力再无城池可投时，守军或流落为在野、或被俘、或战死', () => {
    const statuses = new Set<string>()

    for (let seed = 1; seed <= 20; seed += 1) {
      const state = scene({ attackerTroops: 20000, defenderTroops: 1000, seed })
      attack(state, { commander: 'attacker' }, 'b')
      statuses.add(characterOf(state, 'defender').status)
    }

    expect(statuses.has('wild')).toBe(true)
    expect(statuses.has('captured') || statuses.has('retired')).toBe(true)
  })

  it('势力覆灭时君主不再必逃亡，与其他守军一样判骰', () => {
    const statuses = new Set<string>()

    for (let seed = 1; seed <= 20; seed += 1) {
      const state = scene({
        attackerTroops: 20000,
        defenderTroops: 1000,
        seed,
        defenderIsMonarch: true,
      })
      attack(state, { commander: 'attacker' }, 'b')
      statuses.add(characterOf(state, 'defender').status)
    }

    expect(statuses.has('wild')).toBe(true)
    expect(statuses.has('captured') || statuses.has('retired')).toBe(true)
  })

  it('君主必定逃亡，不会战死或被俘', () => {
    const state = createInitialState({ scenario: SANGUO_ACCEPTANCE, seed: 208 })
    characterOf(state, 'guanyu').troops = 60000

    attack(state, { commander: 'guanyu' }, 'xiangyang')

    const caocao = characterOf(state, 'caocao')
    expect(caocao.status).toBe('serving')
    expect(['fancheng', 'jiangling']).toContain(caocao.stationedSiteId)
  })

  it('有退路时也不是必然逃亡，仍可能战死或被俘', () => {
    const statuses = new Set<string>()

    for (let seed = 1; seed <= 20; seed += 1) {
      const state = warState(seed)
      attack(state, { commander: 'guanyu' }, 'xiangyang')
      statuses.add(characterOf(state, 'caimao').status)
    }

    expect(statuses.has('serving')).toBe(true)
    expect(statuses.size).toBeGreaterThan(1)
  })

  it('编成中的兵力合计，单将打不动、加副将可得手', () => {
    // 兵力取到单将即便掷到上限也打不动、两将即便掷到下限也稳赢，免得结论依赖随机。
    const solo = scene({ attackerTroops: 5800, defenderTroops: 6000 })
    attack(solo, { commander: 'attacker' }, 'b')
    expect(siteOf(solo, 'b').owner).toBe('caocao')

    const joint = scene({ attackerTroops: 5800, defenderTroops: 6000, secondAttackerTroops: 6000 })
    const result = attack(joint, { commander: 'attacker', deputy: 'attacker2' }, 'b')

    expect(result.ok).toBe(true)
    expect(siteOf(joint, 'b').owner).toBe('liubei')
    expect(characterOf(joint, 'attacker').stationedSiteId).toBe('b')
    expect(characterOf(joint, 'attacker2').stationedSiteId).toBe('b')
    expect(hasActedThisTurn(joint, 'attacker')).toBe(true)
    expect(hasActedThisTurn(joint, 'attacker2')).toBe(true)
  })

  it('兵力为三人之和，智谋取三人中最高，士气为战斗默认满值', () => {
    const state = createInitialState({ seed: 208 })

    // 关羽智谋 75、张飞 40，取最高 75；带军师诸葛亮时取其本色 100。
    expect(partySide(state, { commander: 'guanyu', deputy: 'zhangfei' })).toEqual({
      troops: 14000,
      intellect: 75,
      morale: MORALE_FULL,
    })
    expect(
      partySide(state, { commander: 'guanyu', deputy: 'zhangfei', strategist: 'zhugeliang' }),
    ).toEqual({ troops: 16000, intellect: 100, morale: MORALE_FULL })
  })

  it('编成不合规时拒绝', () => {
    const state = warState()

    expect(attack(state, { commander: '' }, 'changsha')).toEqual({ ok: false, reason: '必须指定主将' })
    expect(attack(state, { commander: 'caimao' }, 'changsha')).toEqual({
      ok: false,
      reason: '该武将不在此势力',
    })
    expect(attack(state, { commander: 'guanyu', deputy: 'guanyu' }, 'changsha')).toEqual({
      ok: false,
      reason: '主将、副将与军师不能是同一人',
    })

    expect(attack(state, { commander: 'guanyu' }, 'changsha').ok).toBe(true)
    expect(attack(state, { commander: 'guanyu', deputy: 'zhangfei' }, 'xiangyang')).toEqual({
      ok: false,
      reason: '关羽 本回合已行动',
    })
  })

  it('与自有领地接壤的他方或无主战略点都可作为进攻目标', () => {
    const state = createInitialState({ seed: 208 })

    expect(isAttackable(state, 'changsha')).toBe(true)
    expect(isAttackable(state, 'jiangxia')).toBe(false)
    expect(isAttackable(state, 'xudu')).toBe(false)

    markActed(state, 'guanyu')

    expect(isAttackable(state, 'changsha')).toBe(true)
  })

  it('候选部属含本季已行动者，由界面标出不可选', () => {
    const state = createInitialState({ seed: 208 })

    expect(attackCandidates(state, 'changsha').map((item) => item.id)).toContain('guanyu')
    expect(attackCandidates(state, 'jiangxia')).toEqual([])

    markActed(state, 'guanyu')

    expect(attackCandidates(state, 'changsha').map((item) => item.id)).toContain('guanyu')
  })

  it('同一武将每回合只能进攻一次', () => {
    const state = warState()

    expect(attack(state, { commander: 'guanyu' }, 'changsha').ok).toBe(true)
    expect(attack(state, { commander: 'guanyu' }, 'xiangyang')).toEqual({
      ok: false,
      reason: '关羽 本回合已行动',
    })
  })

  it('出征按投入兵力耗粮，粮草不足则不能出征', () => {
    const state = scene({ attackerTroops: 10000, defenderTroops: 0 })
    const faction = state.factions.find((item) => item.id === 'liubei')
    if (faction === undefined) {
      throw new Error('势力不存在：liubei')
    }
    const before = faction.grain

    expect(attack(state, { commander: 'attacker' }, 'b').ok).toBe(true)
    expect(faction.grain).toBe(before - attackGrainCost(10000))
  })

  it('粮草不足时拒绝出征，不扣行动力', () => {
    const state = scene({ attackerTroops: 10000, defenderTroops: 0 })
    const faction = state.factions.find((item) => item.id === 'liubei')
    if (faction === undefined) {
      throw new Error('势力不存在：liubei')
    }
    faction.grain = attackGrainCost(10000) - 1

    expect(attack(state, { commander: 'attacker' }, 'b')).toEqual({
      ok: false,
      reason: '粮草不足，不能出征',
    })
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN)
  })

  it('进攻不改变地理结构', () => {
    const state = createInitialState({ seed: 208 })
    const before = state.geography.sites.map((site) => ({ id: site.id, neighbors: [...site.neighbors] }))

    attack(state, { commander: 'guanyu' }, 'changsha')

    const after = state.geography.sites.map((site) => ({ id: site.id, neighbors: [...site.neighbors] }))
    expect(after).toEqual(before)
  })
})

describe('野地', () => {
  /**
   * 己方城池甲与一片相邻的无归属野地丙的最小对局。
   * 野地并入行军图：可驻军、可作调动与进攻的目标，但不入任何势力的版图。
   * `garrison` 指定野地驻军属于哪一方，取 null 表示无人驻守。
   */
  function fieldScene(garrison: 'caocao' | 'liubei' | null): GameState {
    const holder: Character | null =
      garrison === null
        ? null
        : {
            id: 'holder',
            name: '野地守将',
            status: 'serving',
            factionId: garrison,
            provinceId: 'jing',
            might: 70,
            command: 70,
            intellect: 50,
            politics: 50,
            age: 40,
            personality: 'steady',
            affinities: garrison === 'caocao' ? { caocao: 90 } : { liubei: 90 },
            loyalty: 90,
            isMonarch: false,
            stationedSiteId: 'f',
            troops: 1000,
            tier: null,
          }

    const scenario: Scenario = {
      id: 'field-test',
      name: '野地测试',
      startDate: { era: '建安', year: 13, season: 'autumn' },
      playerFaction: 'liubei',
      factions: [
        { id: 'liubei', name: '刘备', color: '#3f7a5a', money: 0, grain: 100000 },
        { id: 'caocao', name: '曹操', color: '#3d6ea8', money: 0, grain: 100000 },
      ],
      relations: [{ factions: ['liubei', 'caocao'], kind: 'hostile', favor: 25 }],
      geography: {
        provinces: [{ id: 'jing', name: '荆州', owner: null }],
        sites: [
          { id: 'a', name: '甲', type: 'city', population: 50000, provinceId: 'jing', owner: 'liubei', neighbors: ['f'] },
          { id: 'f', name: '野地', type: 'field', population: 0, provinceId: 'jing', owner: null, neighbors: ['a'] },
          // 曹操得有一处据点，否则名下无地会被判为已离场，敌对关系随之失效。
          { id: 'b', name: '乙', type: 'city', population: 50000, provinceId: 'jing', owner: 'caocao', neighbors: [] },
        ],
      },
      characters: [
        {
          id: 'attacker',
          name: '攻将',
          status: 'serving',
          factionId: 'liubei',
          provinceId: 'jing',
          might: 80,
          command: 80,
          intellect: 50,
          politics: 50,
          age: 40,
          personality: 'steady',
          affinities: { liubei: 90 },
          loyalty: 90,
          isMonarch: false,
          stationedSiteId: 'a',
          troops: 10000,
          tier: null,
        },
        ...(holder === null ? [] : [holder]),
      ],
    }

    return createInitialState({ scenario, seed: 208 })
  }

  it('守方势力取自归属：城池看归属，野地看驻军', () => {
    const empty = fieldScene(null)
    const held = fieldScene('caocao')

    expect(defenderFactionAt(empty, siteOf(empty, 'a'))).toBe('liubei')
    expect(defenderFactionAt(empty, siteOf(empty, 'f'))).toBe(null)
    expect(defenderFactionAt(held, siteOf(held, 'f'))).toBe('caocao')
  })

  it('空野地无仗可打，却可作调动目标', () => {
    const state = fieldScene(null)

    expect(isAttackable(state, 'f')).toBe(false)
    expect(isTransferTarget(state, 'f')).toBe(true)
  })

  it('野地驻有他方人马时可进攻，但不能直接调动', () => {
    const state = fieldScene('caocao')

    expect(isAttackable(state, 'f')).toBe(true)
    expect(isTransferTarget(state, 'f')).toBe(false)
    expect(transfer(state, ['attacker'], 'f')).toEqual({
      ok: false,
      reason: '目标不是自有战略点，也不是可进驻的野地',
    })
  })

  it('野地驻有己方人马时不可进攻，却可派兵增援', () => {
    const state = fieldScene('liubei')

    expect(isAttackable(state, 'f')).toBe(false)
    expect(isTransferTarget(state, 'f')).toBe(true)
    expect(transfer(state, ['attacker'], 'f').ok).toBe(true)
    expect(characterOf(state, 'attacker').stationedSiteId).toBe('f')
  })

  it('攻下野地只逐走守军：归属不变，胜方仍旧进驻', () => {
    const state = fieldScene('caocao')
    const result = attack(state, { commander: 'attacker' }, 'f')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.record.outcome).toContain('击破 野地 守军')
      expect(result.record.battle?.attackerWins).toBe(true)
    }
    expect(siteOf(state, 'f').owner).toBe(null)
    expect(characterOf(state, 'attacker').stationedSiteId).toBe('f')
  })
})

describe('占领后的分派驻守', () => {
  /** 两将取胜进驻乙城：一个可留驻新点、一个可回原驻地。 */
  function captured(): GameState {
    const state = scene({ attackerTroops: 20000, defenderTroops: 1000, secondAttackerTroops: 20000 })
    const result = attack(state, { commander: 'attacker', deputy: 'attacker2' }, 'b')

    expect(result.ok).toBe(true)
    return state
  }

  it('凡未指定者一律留驻新点，返回空摘要', () => {
    const state = captured()

    expect(characterOf(state, 'attacker').stationedSiteId).toBe('b')
    expect(characterOf(state, 'attacker2').stationedSiteId).toBe('b')

    expect(assignAfterCapture(state, 'b', [])).toBe('')
    expect(characterOf(state, 'attacker').stationedSiteId).toBe('b')
    expect(characterOf(state, 'attacker2').stationedSiteId).toBe('b')
  })

  it('指定者回原驻地、其余留驻，且不耗行动力、已行动状态不变', () => {
    const state = captured()
    const apBefore = state.actionPoints[state.playerFaction]

    const summary = assignAfterCapture(state, 'b', [{ characterId: 'attacker2', siteId: 'a' }])

    expect(summary).toBe('副将 回驻 甲')
    expect(characterOf(state, 'attacker2').stationedSiteId).toBe('a')
    expect(characterOf(state, 'attacker').stationedSiteId).toBe('b')
    expect(state.actionPoints[state.playerFaction]).toBe(apBefore)
    expect(hasActedThisTurn(state, 'attacker2')).toBe(true)
  })

  it('目标点不存在或非己方所有时忽略该条', () => {
    const state = captured()

    const summary = assignAfterCapture(state, 'b', [{ characterId: 'attacker2', siteId: 'nope' }])

    expect(summary).toBe('')
    expect(characterOf(state, 'attacker2').stationedSiteId).toBe('b')
  })
})

describe('单挑', () => {
  it('对方拒战则作罢，胜负无从谈起', () => {
    const state = createInitialState({ seed: 208 })
    const result = duel(state, 'guanyu', 'caimao', false)

    expect(result.refused).toBe(true)
    expect(result.winnerId).toBeNull()
    expect(result.outcome).toContain('拒战')
  })

  it('应战则分胜负', () => {
    const state = createInitialState({ seed: 208 })
    const result = duel(state, 'guanyu', 'caimao', true)

    expect(result.refused).toBe(false)
    expect(['guanyu', 'caimao']).toContain(result.winnerId)
  })
})

describe('交战前景', () => {
  it('按攻守战力之比给出定性判断', () => {
    const outlook = (attackerTroops: number, defenderTroops: number): string =>
      battleOutlook(scene({ attackerTroops, defenderTroops }), { commander: 'attacker' }, 'b')

    expect(outlook(8000, 1000)).toBe('我军大优')
    expect(outlook(1500, 1000)).toBe('我军占优')
    expect(outlook(1000, 1000)).toBe('势均力敌')
    expect(outlook(900, 1000)).toBe('我军不利')
    expect(outlook(500, 5000)).toBe('我军大劣')
  })

  it('无守军时为不战而下', () => {
    const state = scene({ attackerTroops: 5000, defenderTroops: 0 })

    expect(battleOutlook(state, { commander: 'attacker' }, 'b')).toBe('不战而下')
  })
})

describe('单挑致阵亡与君主限制', () => {
  /** 在若干固定种子里筛出一场致阵亡的单挑：阵亡是概率，须先有阵亡才谈得上退场。 */
  function findFatalDuel(): { state: GameState; fallenId: string } | null {
    for (let seed = 1; seed <= 200; seed += 1) {
      const state = scene({ attackerTroops: 100, defenderTroops: 100, seed })
      const result = duel(state, 'attacker', 'defender', true)

      if (result.fallenId !== null) {
        return { state, fallenId: result.fallenId }
      }
    }

    return null
  }

  it('应战的败者有一定概率阵亡，阵亡者就此退场', () => {
    const found = findFatalDuel()

    expect(found).not.toBeNull()
    const fallen = characterOf(found!.state, found!.fallenId)
    expect(fallen.status).toBe('retired')
    expect(fallen.factionId).toBeNull()
    expect(fallen.stationedSiteId).toBeNull()
  })

  it('君主不作为挑战方，也不作为应战方', () => {
    const state = createInitialState({ seed: 208 })

    expect(duel(state, 'caocao', 'guanyu', true)).toEqual({
      refused: false,
      winnerId: null,
      fallenId: null,
      outcome: '君主不参与单挑',
    })
    expect(duel(state, 'guanyu', 'caocao', true)).toEqual({
      refused: false,
      winnerId: null,
      fallenId: null,
      outcome: '君主不参与单挑',
    })
  })

  it('进攻可提出单挑，结果先于交战结算并记入战报', () => {
    const state = scene({ attackerTroops: 5000, defenderTroops: 1000, seed: 3 })
    const result = attack(state, { commander: 'attacker', challenger: 'attacker' }, 'b')

    expect(result.ok).toBe(true)
    if (!result.ok || result.record.battle === undefined || result.record.battle.duel === null) {
      throw new Error('未取得单挑战报')
    }
    const duel = result.record.battle.duel
    expect(duel.challenger).toBe('攻将')
    expect(result.record.outcome.startsWith(duelHeadline(duel))).toBe(true)
  })

  it('单挑须由主将或副将出马', () => {
    const state = scene({ attackerTroops: 5000, defenderTroops: 1000 })
    const result = attack(
      state,
      { commander: 'attacker', strategist: 'attacker2', challenger: 'attacker2' },
      'b',
    )

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe('单挑须由主将或副将出马')
  })

  it('守军只剩君主时无人应战，按拒战处理', () => {
    const state = scene({
      attackerTroops: 5000,
      defenderTroops: 1000,
      seed: 5,
      defenderIsMonarch: true,
    })

    const result = attack(state, { commander: 'attacker', challenger: 'attacker' }, 'b')

    if (!result.ok || result.record.battle === undefined || result.record.battle.duel === null) {
      throw new Error('未取得单挑战报')
    }
    const duel = result.record.battle.duel
    expect(duel.refused).toBe(true)
    expect(duel.answerer).toBe('')
    expect(duel.challengerMoraleDelta).toBe(0)
    expect(duel.answererMoraleDelta).toBe(-10)
  })

  it('君主不可提出单挑', () => {
    const state = createInitialState({ seed: 208 })
    const result = attack(state, { commander: 'liubei', challenger: 'liubei' }, 'changsha')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe('君主不参与单挑')
  })

  it('单挑的士气按方施加：副将获胜，我方 +10、守方 −10', () => {
    const state = scene({
      attackerTroops: 5000,
      defenderTroops: 1000,
      secondAttackerTroops: 1000,
      seed: 7,
    })
    Object.assign(characterOf(state, 'attacker2'), { might: 100 })

    const result = attack(
      state,
      { commander: 'attacker', deputy: 'attacker2', challenger: 'attacker2' },
      'b',
    )

    if (!result.ok || result.record.battle === undefined || result.record.battle.duel === null) {
      throw new Error('未取得单挑战报')
    }
    const duel = result.record.battle.duel
    // 副将出马且必胜（武力 100 对 80）：士气按方施加，与出马者是谁无关。
    expect(duel.challenger).toBe('副将')
    expect(duel.challengerSide).toBe('attacker')
    expect(duel.challengerWon).toBe(true)
    expect(duel.challengerMoraleDelta).toBe(10)
    expect(duel.answererMoraleDelta).toBe(-10)
  })

  it('守军主将与应战者取自守军，应战者不含君主', () => {
    const state = createInitialState({ seed: 208 })

    expect(garrisonCommanderAt(state, 'xiangyang')?.name).toBe('蔡瑁')
    expect(duelAnswererAt(state, 'xiangyang')?.name).toBe('蔡瑁')
    // 无主点的守军头目非君主，同样可以应战。
    expect(duelAnswererAt(state, 'changsha')?.name).toBe(siteOf(state, 'changsha').guard?.name)
  })
})

describe('被俘与招降', () => {
  /**
   * 在若干固定种子里筛出一局守将被俘的结果：去向本就是概率，须先有被俘才谈得上招降。
   * 守军只身一人、随机序列固定，这套筛选因此可复现。
   */
  function captureOf(
    overrides: Partial<Character>,
  ): { state: GameState; report: BattleReport } | null {
    for (let seed = 1; seed <= 200; seed += 1) {
      const state = scene({ attackerTroops: 50000, defenderTroops: 100, seed })
      Object.assign(characterOf(state, 'defender'), overrides)
      const result = attack(state, { commander: 'attacker' }, 'b')

      if (result.ok && result.record.battle !== undefined && result.record.battle.captives.length > 0) {
        return { state, report: result.record.battle }
      }
    }

    return null
  }

  it('被俘者一律入营：转为 captured、脱离驻地，战报带上其态度', () => {
    const found = captureOf({ personality: 'open', loyalty: 0, affinities: { liubei: 100 } })
    expect(found).not.toBeNull()
    if (found === null) {
      return
    }

    const defender = characterOf(found.state, 'defender')
    expect(found.report.captives).toEqual([
      { name: '守将', formerFaction: '曹操', attitude: '愿降' },
    ])
    expect(defender.status).toBe('captured')
    expect(defender.factionId).toBeNull()
    expect(defender.stationedSiteId).toBeNull()
    expect(defender.troops).toBe(0)
  })

  it('忠于原势力者入营时是宁死不屈', () => {
    const found = captureOf({ personality: 'proud', loyalty: 100, affinities: { liubei: 0 } })
    expect(found).not.toBeNull()
    if (found === null) {
      return
    }

    expect(found.report.captives).toEqual([
      { name: '守将', formerFaction: '曹操', attitude: '宁死不屈' },
    ])
    expect(characterOf(found.state, 'defender').status).toBe('captured')
  })

  it('无人被俘时战报的俘虏为空', () => {
    const state = scene({ attackerTroops: 10000, defenderTroops: 6000 })

    const result = attack(state, { commander: 'attacker' }, 'b')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.record.battle?.captives).toEqual([])
    }
  })

  it('被打灭的一方，其营中俘虏一概开释为在野', () => {
    const state = scene({ attackerTroops: 20000, defenderTroops: 1000 })
    const prisoner = characterOf(state, 'attacker2')
    takeCaptive(state, prisoner, 'caocao')

    const result = attack(state, { commander: 'attacker' }, 'b')

    expect(result.ok).toBe(true)
    // 旧主虽是攻方，也不自动回来；他流落为在野。
    expect(prisoner.status).toBe('wild')
    expect(prisoner.factionId).toBeNull()
    expect(state.captives.caocao).toHaveLength(0)
    if (result.ok) {
      expect(result.record.outcome).toContain('流落为在野')
    }
  })
})

describe('防守方提出单挑', () => {
  it('守方视角的敌情与攻方视角相反', () => {
    const state = scene({ attackerTroops: 8000, defenderTroops: 1000 })

    expect(battleOutlook(state, { commander: 'attacker' }, 'b')).toBe('我军大优')
    expect(defenseOutlook(state, { commander: 'attacker' }, 'b')).toBe('敌军大优')
  })

  it('守军无人可守时，守方视角为「守军无将」', () => {
    // 有主点而无兵驻守：守方战力为零，视作无将。
    const state = scene({ attackerTroops: 8000, defenderTroops: 0 })

    expect(defenseOutlook(state, { commander: 'attacker' }, 'b')).toBe('守军无将')
  })

  it('我方守城时可提出单挑：出马者来自迎战编成，攻方以主力应战', () => {
    // 曹操来攻我方的甲城，我方以「攻将」为主将并令其出马。
    const state = scene({ attackerTroops: 100, defenderTroops: 20000, seed: 7 })

    const result = attack(state, { commander: 'defender' }, 'a', 'caocao', {
      challenger: 'attacker',
      party: { commander: 'attacker' },
    })

    if (!result.ok || result.record.battle === undefined || result.record.battle.duel === null) {
      throw new Error('未取得单挑战报')
    }
    const duel = result.record.battle.duel
    expect(duel.challengerSide).toBe('defender')
    expect(duel.challenger).toBe('攻将')
    expect(duel.answerer).toBe('守将')
  })

  it('守方指定的出马者不在迎战编成之中时拒绝', () => {
    const state = scene({ attackerTroops: 100, defenderTroops: 20000 })

    // 「守将」驻守乙城，不在甲城守军之列。
    const result = attack(state, { commander: 'defender' }, 'a', 'caocao', {
      challenger: 'defender',
      party: { commander: 'attacker' },
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe('出马者不在守军之中')
  })

  it('君主不能作为守方出马者', () => {
    const state = scene({ attackerTroops: 100, defenderTroops: 20000 })
    Object.assign(characterOf(state, 'attacker'), { isMonarch: true })

    const result = attack(state, { commander: 'defender' }, 'a', 'caocao', {
      challenger: 'attacker',
      party: { commander: 'attacker' },
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe('君主不参与单挑')
  })

  it('攻方不提时，他方守军武力占优便会主动提单挑', () => {
    const state = scene({ attackerTroops: 5000, defenderTroops: 1000, seed: 7 })
    Object.assign(characterOf(state, 'attacker'), { might: 50 })

    // 我方进攻且不提单挑，守军（武力 80 对 50）主动来挑。
    const result = attack(state, { commander: 'attacker' }, 'b')

    if (!result.ok || result.record.battle === undefined || result.record.battle.duel === null) {
      throw new Error('未取得单挑战报')
    }
    const duel = result.record.battle.duel
    expect(duel.challengerSide).toBe('defender')
    expect(duel.challenger).toBe('守将')
    expect(duel.answerer).toBe('攻将')
  })

  it('攻方已提单挑时，守方不再另提（单挑只发生一次）', () => {
    const state = scene({ attackerTroops: 5000, defenderTroops: 1000, seed: 7 })
    Object.assign(characterOf(state, 'defender'), { might: 100 })

    const result = attack(state, { commander: 'attacker', challenger: 'attacker' }, 'b')

    if (!result.ok || result.record.battle === undefined || result.record.battle.duel === null) {
      throw new Error('未取得单挑战报')
    }
    expect(result.record.battle.duel.challengerSide).toBe('attacker')
  })
})

describe('守方迎战编成', () => {
  it('编成按主将、副将与军师计兵，至多三人', () => {
    const state = createInitialState({ seed: 208 })

    // 江夏：关羽 8000、张飞 6000、刘备 5000。
    expect(garrisonAt(state, 'jiangxia', { commander: 'zhangfei' }).side.troops).toBe(6000)
    expect(
      garrisonAt(state, 'jiangxia', { commander: 'zhangfei', deputy: 'guanyu' }).side.troops,
    ).toBe(14000)
    expect(
      garrisonAt(state, 'jiangxia', { commander: 'zhangfei', deputy: 'guanyu', strategist: 'liubei' })
        .members,
    ).toHaveLength(3)
  })

  it('编成中的已行动者仍只计半数兵力', () => {
    const state = createInitialState({ seed: 208 })
    markActed(state, 'guanyu')

    expect(garrisonAt(state, 'jiangxia', { commander: 'guanyu' }).side.troops).toBe(4000)
  })

  it('编成不含本战略点的守军时，改由地方民兵就地成军', () => {
    const state = createInitialState({ seed: 208 })

    // 蔡瑁驻守襄阳，不在江夏：编成落空后由江夏的民兵顶上，不会把不相干的守将算作守军。
    const garrison = garrisonAt(state, 'jiangxia', { commander: 'caimao' })
    expect(garrison.members.map((member) => member.id)).toEqual(['guard:jiangxia'])
    expect(
      defenseOutlook(state, { commander: 'guanyu' }, 'jiangxia', { commander: 'caimao' }),
    ).not.toBe('守军无将')
  })

  it('守将取编成中的主将', () => {
    const state = createInitialState({ seed: 208 })

    expect(garrisonCommanderAt(state, 'jiangxia', { commander: 'zhangfei' })?.name).toBe('张飞')
  })

  it('这一战的防守兵力、名单与守将随编成而变', () => {
    const state = scene({ attackerTroops: 100, defenderTroops: 20000 })
    state.characters.push({
      ...characterOf(state, 'defender'),
      id: 'defender2',
      name: '守将二',
      troops: 5000,
      command: 60,
    })

    const result = attack(state, { commander: 'attacker' }, 'b', 'liubei', {
      challenger: null,
      party: { commander: 'defender2' },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.record.battle?.defender.officers).toEqual(['守将二'])
      expect(result.record.battle?.defender.troops).toBe(5000)
      expect(result.record.battle?.defender.commander).toBe('守将二')
    }
  })

  it('出马者须是迎战编成中的主将或副将，军师不可', () => {
    const state = scene({ attackerTroops: 100, defenderTroops: 20000 })
    state.characters.push(
      { ...characterOf(state, 'attacker'), id: 'guard2', name: '守将二' },
      { ...characterOf(state, 'attacker'), id: 'guard3', name: '守将三' },
    )

    // 军师「守将三」出马：与攻方同规，只许主将或副将。
    const result = attack(state, { commander: 'defender' }, 'a', 'caocao', {
      challenger: 'guard3',
      party: { commander: 'attacker', deputy: 'guard2', strategist: 'guard3' },
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe('单挑须由主将或副将出马')
  })
})

describe('他方是否提单挑', () => {
  /** 固定骰子的随机源：便于断言性格与武力差的作用。 */
  const fixedRoll = (value: number): Random => ({ next: () => value, getState: () => 0 })

  it('武力差之外，性格与骰子一起决定', () => {
    const state = scene({ attackerTroops: 100, defenderTroops: 100 })
    const foe = characterOf(state, 'attacker')
    const dueler = characterOf(state, 'defender')
    Object.assign(foe, { might: 90 })

    // 刚烈：武力 80 对 90 也敢上（80 − 90 + 12 + 0 = 2）。
    Object.assign(dueler, { might: 80, personality: 'brave' })
    expect(aiDuelChallenger([dueler], foe, fixedRoll(0.5))).toBe('defender')

    // 谨慎：武力 95 对 90 仍按兵不动（95 − 90 − 10 + 0 = −5）。
    Object.assign(dueler, { might: 95, personality: 'cautious' })
    expect(aiDuelChallenger([dueler], foe, fixedRoll(0.5))).toBeNull()

    // 沉稳：势均力敌时全看骰子（90 − 90 + 0）。
    Object.assign(dueler, { might: 90, personality: 'steady' })
    expect(aiDuelChallenger([dueler], foe, fixedRoll(0.5))).toBe('defender')
    expect(aiDuelChallenger([dueler], foe, fixedRoll(0))).toBeNull()
  })

  it('君主不参与，无人可应时也不挑', () => {
    const state = scene({ attackerTroops: 100, defenderTroops: 100 })
    const dueler = characterOf(state, 'defender')
    Object.assign(dueler, { might: 99, personality: 'brave' })

    expect(aiDuelChallenger([dueler], null, fixedRoll(0.5))).toBeNull()
    expect(aiDuelChallenger([{ ...dueler, isMonarch: true }], characterOf(state, 'attacker'), fixedRoll(0.5))).toBeNull()
  })
})

describe('回合推进中的来犯', () => {
  /** 曹操兵多，刘备兵少：他方会来攻我方的甲城。 */
  function invasionScene(seed = 7): GameState {
    return scene({ attackerTroops: 100, defenderTroops: 20000, seed })
  }

  it('他方来攻我方时，回合推进先交回应战请求', () => {
    const state = invasionScene()
    const run = beginTurn(state)

    const signal = run.advance()

    expect(signal?.kind).toBe('defense')
    if (signal?.kind !== 'defense') {
      throw new Error('未取得应战请求')
    }
    expect(signal.request.attackerId).toBe('caocao')
    expect(signal.request.targetSiteId).toBe('a')
  })

  it('守方定下编成与出马者后即结算这一战，并继续推进到回合结束', () => {
    const state = invasionScene()
    // 进攻方武力不济，不会主动提单挑，好让守方的选择说了算。
    Object.assign(characterOf(state, 'defender'), { might: 40 })
    const run = beginTurn(state)
    run.advance()

    const signal = run.advance({ challenger: 'attacker', party: { commander: 'attacker' } })

    expect(signal?.kind).toBe('battle')
    if (signal?.kind !== 'battle' || signal.report === null) {
      throw new Error('未取得战报')
    }
    expect(signal.report.duel?.challengerSide).toBe('defender')

    // 再无来犯，本回合跑完并进入下一季。
    expect(run.advance()).toBeNull()
    expect(state.currentTurn).toBe(2)
  })

  it('他方进攻且武力占优时会主动提单挑，守方不再选择', () => {
    const state = invasionScene()
    Object.assign(characterOf(state, 'defender'), { might: 100 })
    Object.assign(characterOf(state, 'attacker'), { might: 60 })

    const run = beginTurn(state)
    const request = run.advance()
    if (request?.kind !== 'defense') {
      throw new Error('未取得应战请求')
    }
    // 进攻方已提单挑，请求里带着出马者。
    expect(request.request.party.challenger).toBe('defender')

    const battle = run.advance(null)
    if (battle?.kind !== 'battle' || battle.report === null) {
      throw new Error('未取得战报')
    }
    expect(battle.report.duel?.challengerSide).toBe('attacker')
    expect(battle.report.duel?.challenger).toBe('守将')
  })

  it('无人接手时按不单挑一并结算（endTurn 的行为不变）', () => {
    const state = invasionScene()

    endTurn(state)

    expect(state.currentTurn).toBe(2)
    // 我方守军不敌，城池易手。
    expect(siteOf(state, 'a').owner).toBe('caocao')
  })
})

describe('退场者不参与结算', () => {
  it('退场的守将不在守军、迎战编成与敌方情报之中', () => {
    const state = scene({ attackerTroops: 10000, defenderTroops: 6000 })
    const defender = characterOf(state, 'defender')
    defender.status = 'retired'
    defender.factionId = null
    defender.stationedSiteId = null
    defender.troops = 0

    expect(stationedDefendersAt(state, 'b')).toEqual([])
    // 守将退场后据点空了出来，由地方民兵顶上；退场者既不算守军，也不在守军名单里。
    const garrison = garrisonAt(state, 'b')
    expect(garrison.members.map((member) => member.id)).toEqual(['guard:b'])
    expect(garrison.members.some((member) => member.id === 'defender')).toBe(false)
    expect(garrisonCommanderAt(state, 'b')?.id).toBe('guard:b')
    expect(duelAnswererAt(state, 'b')?.id).toBe('guard:b')
  })

  it('有主据点无驻将时由地方民兵据守，进攻不再零伤亡', () => {
    const state = scene({ attackerTroops: 10000, defenderTroops: 6000 })
    const defender = characterOf(state, 'defender')
    defender.status = 'retired'
    defender.factionId = null
    defender.stationedSiteId = null
    defender.troops = 0

    // 空城不再是不战而下：民兵顶上，攻方要交一场、付伤亡。
    expect(battleOutlook(state, { commander: 'attacker' }, 'b')).not.toBe('不战而下')

    const result = attack(state, { commander: 'attacker' }, 'b', 'liubei')

    expect(result.ok).toBe(true)
    expect(result.ok && result.record.battle?.undefended).toBe(false)
    expect(result.ok && (result.record.battle?.attacker.casualties ?? 0) > 0).toBe(true)
  })

  it('退场的部属不在进攻候选与编成战力之中', () => {
    const state = scene({ attackerTroops: 10000, defenderTroops: 6000 })
    const attacker = characterOf(state, 'attacker')
    attacker.status = 'retired'
    attacker.factionId = null
    attacker.stationedSiteId = null
    attacker.troops = 0

    expect(attackCandidates(state, 'b').map((item) => item.id)).not.toContain('attacker')
    expect(partySide(state, { commander: 'attacker' })).toEqual({
      troops: 0,
      intellect: 0,
      morale: MORALE_FULL,
    })
  })
})
