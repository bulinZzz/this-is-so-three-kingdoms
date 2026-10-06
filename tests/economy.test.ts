import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import { collectGrain, GRAIN_YIELD_BY_SITE_TYPE, grainYield } from '../src/core/economy'
import type { FactionId, GameState } from '../src/core/model'

function factionOf(state: GameState, id: FactionId) {
  const faction = state.factions.find((item) => item.id === id)
  if (faction === undefined) {
    throw new Error(`势力不存在：${id}`)
  }
  return faction
}

describe('每季粮产', () => {
  it('粮产为自有战略点的产量之和', () => {
    const state = createInitialState({ seed: 208 })
    const sites = state.geography.sites.filter((site) => site.owner === 'liubei')
    const expected = sites.reduce((total, site) => total + GRAIN_YIELD_BY_SITE_TYPE[site.type], 0)

    expect(sites.length).toBeGreaterThan(0)
    expect(grainYield(state, 'liubei')).toBe(expected)
  })

  it('没有自有战略点的势力粮产为零，结算后粮食不变', () => {
    const state = createInitialState({ seed: 208 })
    for (const site of state.geography.sites) {
      site.owner = null
    }

    expect(grainYield(state, 'liubei')).toBe(0)

    const before = factionOf(state, 'liubei').grain
    collectGrain(state)

    expect(factionOf(state, 'liubei').grain).toBe(before)
  })

  it('结算把粮产计入势力粮食', () => {
    const state = createInitialState({ seed: 208 })
    const before = factionOf(state, 'liubei').grain

    collectGrain(state)

    expect(factionOf(state, 'liubei').grain).toBe(before + grainYield(state, 'liubei'))
  })
})
