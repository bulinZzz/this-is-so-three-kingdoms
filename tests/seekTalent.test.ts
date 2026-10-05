import { describe, expect, it } from 'vitest'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { CHARACTER_LIMIT, countServing } from '../src/core/characters'
import { createInitialState } from '../src/core/createInitialState'
import type { Character, GameState } from '../src/core/model'
import { createRandom } from '../src/core/random'
import { seekTalent } from '../src/core/seekTalent'

function servingOf(state: GameState): Character[] {
  return state.characters.filter(
    (character) => character.status === 'serving' && character.factionId === state.playerFaction,
  )
}

describe('seekTalent', () => {
  it('从玩家占地所在州招募一人入仕，并扣行动力、写记录', () => {
    const state = createInitialState({ seed: 208 })
    const before = servingOf(state).length

    const result = seekTalent(state, createRandom(1))

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.record.kind).toBe('seekTalent')
    expect(result.record.targetId).toBe('jing')
    expect(servingOf(state)).toHaveLength(before + 1)
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.seekTalent)
    expect(state.history).toEqual([result.record])
  })

  it('只招募玩家占地所在州的在野之人', () => {
    const state = createInitialState({ seed: 208 })
    const before = new Set(servingOf(state).map((character) => character.id))

    const result = seekTalent(state, createRandom(7))

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    const recruited = servingOf(state).find((character) => !before.has(character.id))
    expect(recruited?.provinceId).toBe('jing')
  })

  it('相同的抽卡源得到相同结果', () => {
    const run = () => {
      const state = createInitialState({ seed: 208 })
      const result = seekTalent(state, createRandom(99))

      return result.ok ? result.record.outcome : null
    }

    expect(run()).toBe(run())
  })

  it('连续寻访推进抽卡源，不复现上一结果', () => {
    const state = createInitialState({ seed: 208 })
    const random = createRandom(99)

    const first = seekTalent(state, random)
    const second = seekTalent(state, random)

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) {
      return
    }

    expect(second.record.outcome).not.toBe(first.record.outcome)
  })

  it('麾下满员时拒绝，不扣行动力也不写记录', () => {
    const state = createInitialState({ seed: 208 })
    let index = 0
    while (countServing(state.characters, state.playerFaction) < CHARACTER_LIMIT) {
      state.characters.push({
        id: `extra-${index}`,
        name: '补员',
        status: 'serving',
        factionId: state.playerFaction,
        provinceId: 'jing',
        might: 50,
        command: 50,
        intellect: 50,
        factionAffinity: null,
        loyalty: 0,
        isMonarch: false,
        stationedSiteId: 'jiangxia',
      })
      index += 1
    }

    const result = seekTalent(state, createRandom(1))

    expect(result).toEqual({ ok: false, reason: '麾下已满' })
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN)
    expect(state.history).toEqual([])
  })

  it('该州没有在野之人时拒绝，不扣行动力也不写记录', () => {
    const state = createInitialState({ seed: 208 })
    state.characters = state.characters.filter((character) => character.provinceId !== 'jing')

    const result = seekTalent(state, createRandom(1))

    expect(result).toEqual({ ok: false, reason: '此处已无可寻之人' })
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN)
    expect(state.history).toEqual([])
  })
})
