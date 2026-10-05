import { describe, expect, it } from 'vitest'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { attack, battlePower, duel, effectiveDefenderTroops, MORALE_FULL } from '../src/core/battle'
import { createInitialState } from '../src/core/createInitialState'
import { hasActedThisTurn, markActed } from '../src/core/military'
import type { GameState, Scenario } from '../src/core/model'

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
    throw new Error(`据点不存在：${id}`)
  }
  return site
}

/** 两个据点、两家势力的最小对局，便于精确控制攻守兵力与能力。 */
function scene(options: {
  attackerTroops: number
  defenderTroops: number
  attackerIntellect?: number
  defenderIntellect?: number
  twoWay?: boolean
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
        factionAffinity: 'liubei',
        loyalty: 90,
        isMonarch: false,
        stationedSiteId: 'a',
        troops: options.attackerTroops,
        morale: MORALE_FULL,
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
        factionAffinity: 'caocao',
        loyalty: 90,
        isMonarch: false,
        stationedSiteId: 'b',
        troops: options.defenderTroops,
        morale: MORALE_FULL,
      },
    ],
  }

  return createInitialState({ scenario, seed: 208 })
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

describe('守军兵力', () => {
  it('无主据点没有守军', () => {
    expect(effectiveDefenderTroops(createInitialState({ seed: 208 }), 'chibi')).toBe(0)
  })

  it('已行动的守军只计半数', () => {
    const state = createInitialState({ seed: 208 })

    expect(effectiveDefenderTroops(state, 'xiangyang')).toBe(3000)

    markActed(state, 'caimao')

    expect(effectiveDefenderTroops(state, 'xiangyang')).toBe(1500)
  })
})

describe('进攻', () => {
  it('无主据点直接占领，攻方无损、部队前移', () => {
    const state = createInitialState({ seed: 208 })

    const result = attack(state, 'guanyu', 'chibi')

    expect(result.ok).toBe(true)
    expect(siteOf(state, 'chibi').owner).toBe('liubei')
    expect(characterOf(state, 'guanyu').stationedSiteId).toBe('chibi')
    expect(characterOf(state, 'guanyu').troops).toBe(8000)
    expect(hasActedThisTurn(state, 'guanyu')).toBe(true)
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.attack)
  })

  it('攻占有主据点，守将撤往相邻的自有据点', () => {
    const state = createInitialState({ seed: 208 })

    const result = attack(state, 'guanyu', 'xiangyang')

    expect(result.ok).toBe(true)
    expect(siteOf(state, 'xiangyang').owner).toBe('liubei')
    expect(characterOf(state, 'guanyu').stationedSiteId).toBe('xiangyang')

    const caimao = characterOf(state, 'caimao')
    expect(caimao.status).toBe('serving')
    expect(['fancheng', 'changbanpo']).toContain(caimao.stationedSiteId)
  })

  it('固定种子下同一场战斗结果稳定', () => {
    const fight = () => {
      const state = scene({ attackerTroops: 10000, defenderTroops: 6000 })
      const result = attack(state, 'attacker', 'b')

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

  it('败则退回原驻地并受损，据点归属不变', () => {
    const state = scene({ attackerTroops: 1000, defenderTroops: 10000 })

    attack(state, 'attacker', 'b')

    expect(characterOf(state, 'attacker').stationedSiteId).toBe('a')
    expect(characterOf(state, 'attacker').troops).toBeLessThan(1000)
    expect(siteOf(state, 'b').owner).toBe('caocao')
  })

  it('守将无路可退时被俘', () => {
    const state = scene({ attackerTroops: 20000, defenderTroops: 1000 })

    attack(state, 'attacker', 'b')

    const defender = characterOf(state, 'defender')
    expect(defender.status).toBe('captured')
    expect(defender.stationedSiteId).toBeNull()
    expect(defender.troops).toBe(0)
  })

  it('同一武将每回合只能进攻一次', () => {
    const state = createInitialState({ seed: 208 })

    expect(attack(state, 'guanyu', 'chibi').ok).toBe(true)
    expect(attack(state, 'guanyu', 'chaisang')).toEqual({
      ok: false,
      reason: '该武将本回合已行动',
    })
  })

  it('进攻不改变地理结构', () => {
    const state = createInitialState({ seed: 208 })
    const before = state.geography.sites.map((site) => ({ id: site.id, neighbors: [...site.neighbors] }))

    attack(state, 'guanyu', 'chibi')

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
