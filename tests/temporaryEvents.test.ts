import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import { relationBetween } from '../src/core/relations'
import { SANGUO_208 } from '../src/core/scenarios'
import {
  resolveTemporaryEvents,
  TEMPORARY_JINGNAN_NANJUN_EVENT_ID,
  temporaryEventById,
} from '../src/core/temporaryEvents'
import { advanceTurn } from '../src/core/turn'

const JINGNAN_SITES = ['lingling', 'wuling', 'guiyang', 'changsha'] as const

function siteOf(state: ReturnType<typeof createInitialState>, id: string) {
  const site = state.geography.sites.find((item) => item.id === id)
  if (site === undefined) {
    throw new Error(`战略点不存在：${id}`)
  }
  return site
}

describe('临时事件：南郡风云', () => {
  it('刘备拿下荆南四郡且荆南覆灭后，接管夷陵、秭归并与曹孙保持中立', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })
    for (const siteId of JINGNAN_SITES) {
      siteOf(state, siteId).owner = 'liubei'
    }

    const notice = resolveTemporaryEvents(state)

    expect(notice?.id).toBe(TEMPORARY_JINGNAN_NANJUN_EVENT_ID)
    expect(notice?.title).toBe('南郡风云')
    expect(notice?.text).toContain('夷陵、秭归')
    expect(temporaryEventById(TEMPORARY_JINGNAN_NANJUN_EVENT_ID)).toBe(notice)

    expect(siteOf(state, 'yiling').owner).toBe('liubei')
    expect(siteOf(state, 'zigui').owner).toBe('liubei')
    expect(state.characters.find((item) => item.id === 'caohong')?.stationedSiteId).toBeNull()
    expect(state.characters.find((item) => item.id === 'caohong')?.factionId).toBe('caocao')

    expect(relationBetween(state, 'liubei', 'caocao')).toBe('neutral')
    expect(relationBetween(state, 'liubei', 'sunquan')).toBe('neutral')

    expect(state.firedEvents).toContain(TEMPORARY_JINGNAN_NANJUN_EVENT_ID)
    expect(state.history.at(-1)).toMatchObject({
      kind: 'event',
      factionId: null,
      targetId: TEMPORARY_JINGNAN_NANJUN_EVENT_ID,
    })

    // 一次性事件：再次结算不重复触发。
    expect(resolveTemporaryEvents(state)).toBeNull()
    expect(state.firedEvents.filter((id) => id === TEMPORARY_JINGNAN_NANJUN_EVENT_ID)).toHaveLength(1)
  })

  it('荆南覆灭的当回合不结算，下一回合开始时才接管夷陵、秭归', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })
    for (const siteId of JINGNAN_SITES) {
      siteOf(state, siteId).owner = 'liubei'
    }

    expect(siteOf(state, 'yiling').owner).toBe('caocao')

    advanceTurn(state)

    expect(siteOf(state, 'yiling').owner).toBe('liubei')
    expect(siteOf(state, 'zigui').owner).toBe('liubei')
    expect(state.history.at(-1)).toMatchObject({
      kind: 'event',
      targetId: TEMPORARY_JINGNAN_NANJUN_EVENT_ID,
      date: { season: 'winter' },
    })
  })

  it('未拿下全部荆南四郡时不触发', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })
    for (const siteId of JINGNAN_SITES.slice(0, 3)) {
      siteOf(state, siteId).owner = 'liubei'
    }

    expect(resolveTemporaryEvents(state)).toBeNull()
    expect(siteOf(state, 'yiling').owner).toBe('caocao')
  })

  it('荆南尚未覆灭时不触发', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })
    for (const siteId of JINGNAN_SITES) {
      siteOf(state, siteId).owner = 'liubei'
    }
    siteOf(state, 'changsha').owner = 'jingnan'

    expect(resolveTemporaryEvents(state)).toBeNull()
  })

  it('玩家不是刘备时不触发', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })
    state.playerFaction = 'caocao'
    for (const siteId of JINGNAN_SITES) {
      siteOf(state, siteId).owner = 'liubei'
    }

    expect(resolveTemporaryEvents(state)).toBeNull()
  })
})
