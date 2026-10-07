import { describe, expect, it } from 'vitest'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../src/core/actions'
import {
  attack,
  attackCandidates,
  battlePower,
  duel,
  garrisonAt,
  isAttackable,
  MORALE_FULL,
  partySide,
} from '../src/core/battle'
import { createInitialState } from '../src/core/createInitialState'
import { hasActedThisTurn, markActed } from '../src/core/military'
import type { GameState, Scenario } from '../src/core/model'
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
      { id: 'liubei', name: '刘备', color: '#3f7a5a', grain: 1000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', grain: 1000 },
    ],
    geography: {
      provinces: [{ id: 'jing', name: '荆州', owner: null }],
      sites: [
        { id: 'a', name: '甲', type: 'city', provinceId: 'jing', owner: 'liubei', neighbors: ['b'] },
        { id: 'b', name: '乙', type: 'city', provinceId: 'jing', owner: 'caocao', neighbors: ['a'] },
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
        factionAffinity: 'liubei',
        loyalty: 90,
        isMonarch: false,
        stationedSiteId: 'a',
        troops: options.attackerTroops,
        morale: MORALE_FULL,
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
        factionAffinity: 'liubei',
        loyalty: 90,
        isMonarch: false,
        stationedSiteId: 'a',
        troops: options.secondAttackerTroops ?? 0,
        morale: MORALE_FULL,
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
        factionAffinity: 'caocao',
        loyalty: 90,
        isMonarch: options.defenderIsMonarch ?? false,
        stationedSiteId: 'b',
        troops: options.defenderTroops,
        morale: MORALE_FULL,
        tier: null,
      },
    ],
  }

  return createInitialState({ scenario, seed: options.seed ?? 208 })
}

describe('战力计算', () => {
  const side = { troops: 1000, intellect: 50, morale: MORALE_FULL }

  it('守方获得防守补正', () => {
    expect(battlePower(side, { defending: true })).toBeCloseTo(battlePower(side) * 1.2)
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
  it('无主战略点没有守军', () => {
    expect(garrisonAt(createInitialState({ seed: 208 }), 'chibi').side.troops).toBe(0)
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

describe('进攻', () => {
  it('无主战略点直接占领，攻方无损、部队前移', () => {
    const state = createInitialState({ seed: 208 })

    const result = attack(state, { commander: 'guanyu' }, 'chibi')

    expect(result.ok).toBe(true)
    expect(siteOf(state, 'chibi').owner).toBe('liubei')
    expect(characterOf(state, 'guanyu').stationedSiteId).toBe('chibi')
    expect(characterOf(state, 'guanyu').troops).toBe(8000)
    expect(hasActedThisTurn(state, 'guanyu')).toBe(true)
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.attack)
  })

  it('攻占有主战略点，守军或撤往相邻的自有战略点，或战死退场', () => {
    const state = createInitialState({ seed: 208 })

    const result = attack(state, { commander: 'guanyu' }, 'xiangyang')

    expect(result.ok).toBe(true)
    expect(siteOf(state, 'xiangyang').owner).toBe('liubei')
    expect(characterOf(state, 'guanyu').stationedSiteId).toBe('xiangyang')

    const caimao = characterOf(state, 'caimao')
    if (caimao.status === 'serving') {
      expect(['fancheng', 'changbanpo']).toContain(caimao.stationedSiteId)
    } else {
      expect(caimao.status).toBe('retired')
      expect(caimao.stationedSiteId).toBeNull()
      expect(caimao.troops).toBe(0)
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

  it('本势力再无城池可投时，守军或在野或退场', () => {
    const statuses = new Set<string>()

    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const state = scene({ attackerTroops: 20000, defenderTroops: 1000, seed })
      attack(state, { commander: 'attacker' }, 'b')
      statuses.add(characterOf(state, 'defender').status)
    }

    expect(statuses.has('wild')).toBe(true)
    expect(statuses.has('retired')).toBe(true)
  })

  it('势力覆灭时君主不再必逃亡，与其他守军一样判骰', () => {
    const statuses = new Set<string>()

    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
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
    expect(statuses.has('retired')).toBe(true)
  })

  it('君主必定逃亡，不会战死或被俘', () => {
    const state = createInitialState({ scenario: SANGUO_ACCEPTANCE, seed: 208 })
    characterOf(state, 'guanyu').troops = 60000

    attack(state, { commander: 'guanyu' }, 'xiangyang')

    const caocao = characterOf(state, 'caocao')
    expect(caocao.status).toBe('serving')
    expect(['fancheng', 'changbanpo']).toContain(caocao.stationedSiteId)
  })

  it('有退路时也不是必然逃亡，仍可能战死', () => {
    const statuses = new Set<string>()

    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const state = createInitialState({ seed })
      attack(state, { commander: 'guanyu' }, 'xiangyang')
      statuses.add(characterOf(state, 'caimao').status)
    }

    expect(statuses.has('serving')).toBe(true)
    expect(statuses.has('retired')).toBe(true)
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

  it('兵力为三人之和，智谋取三人中最高，士气取主将', () => {
    const state = createInitialState({ seed: 208 })
    characterOf(state, 'guanyu').morale = 60

    // 关羽智谋 75、张飞 40，取最高 75；带军师诸葛亮时取 100。
    expect(partySide(state, { commander: 'guanyu', deputy: 'zhangfei' })).toEqual({
      troops: 14000,
      intellect: 75,
      morale: 60,
    })
    expect(
      partySide(state, { commander: 'guanyu', deputy: 'zhangfei', strategist: 'zhugeliang' }),
    ).toEqual({ troops: 16000, intellect: 100, morale: 60 })
  })

  it('编成不合规时拒绝', () => {
    const state = createInitialState({ seed: 208 })

    expect(attack(state, { commander: '' }, 'chibi')).toEqual({ ok: false, reason: '必须指定主将' })
    expect(attack(state, { commander: 'caimao' }, 'chibi')).toEqual({
      ok: false,
      reason: '该武将不在此势力',
    })
    expect(attack(state, { commander: 'guanyu', deputy: 'guanyu' }, 'chibi')).toEqual({
      ok: false,
      reason: '主将、副将与军师不能是同一人',
    })

    expect(attack(state, { commander: 'guanyu' }, 'chibi').ok).toBe(true)
    expect(attack(state, { commander: 'guanyu', deputy: 'zhangfei' }, 'xiangyang')).toEqual({
      ok: false,
      reason: '关羽 本回合已行动',
    })
  })

  it('与自有领地接壤的他方或无主战略点都可作为进攻目标', () => {
    const state = createInitialState({ seed: 208 })

    expect(isAttackable(state, 'chibi')).toBe(true)
    expect(isAttackable(state, 'jiangxia')).toBe(false)
    expect(isAttackable(state, 'xudu')).toBe(false)

    markActed(state, 'guanyu')

    expect(isAttackable(state, 'chibi')).toBe(true)
  })

  it('候选部属含本季已行动者，由界面标出不可选', () => {
    const state = createInitialState({ seed: 208 })

    expect(attackCandidates(state, 'chibi').map((item) => item.id)).toContain('guanyu')
    expect(attackCandidates(state, 'jiangxia')).toEqual([])

    markActed(state, 'guanyu')

    expect(attackCandidates(state, 'chibi').map((item) => item.id)).toContain('guanyu')
  })

  it('同一武将每回合只能进攻一次', () => {
    const state = createInitialState({ seed: 208 })

    expect(attack(state, { commander: 'guanyu' }, 'chibi').ok).toBe(true)
    expect(attack(state, { commander: 'guanyu' }, 'xiangyang')).toEqual({
      ok: false,
      reason: '关羽 本回合已行动',
    })
  })

  it('进攻不改变地理结构', () => {
    const state = createInitialState({ seed: 208 })
    const before = state.geography.sites.map((site) => ({ id: site.id, neighbors: [...site.neighbors] }))

    attack(state, { commander: 'guanyu' }, 'chibi')

    const after = state.geography.sites.map((site) => ({ id: site.id, neighbors: [...site.neighbors] }))
    expect(after).toEqual(before)
  })
})

describe('单挑', () => {
  it('对方拒战则士气下降', () => {
    const state = createInitialState({ seed: 208 })
    characterOf(state, 'caimao').morale = 50

    const result = duel(state, 'guanyu', 'caimao', false)

    expect(result.refused).toBe(true)
    expect(result.winnerId).toBeNull()
    expect(characterOf(state, 'caimao').morale).toBe(40)
  })

  it('应战则胜者士气上升、败者下降', () => {
    const state = createInitialState({ seed: 208 })
    characterOf(state, 'guanyu').morale = 50
    characterOf(state, 'caimao').morale = 50

    const result = duel(state, 'guanyu', 'caimao', true)

    expect(result.refused).toBe(false)
    expect([40, 60]).toContain(characterOf(state, 'guanyu').morale)
    expect([40, 60]).toContain(characterOf(state, 'caimao').morale)
    expect(characterOf(state, 'guanyu').morale).not.toBe(characterOf(state, 'caimao').morale)
  })

  it('士气不会降到 0 以下', () => {
    const state = createInitialState({ seed: 208 })
    characterOf(state, 'caimao').morale = 5

    duel(state, 'guanyu', 'caimao', false)

    expect(characterOf(state, 'caimao').morale).toBe(0)
  })
})
