import { describe, expect, it } from 'vitest'
import { GameSession } from '../src/app/gameSession'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { createInitialState } from '../src/core/createInitialState'
import { LocalSaveStore } from '../src/core/localSaveStore'
import { RECRUIT_TROOPS_PER_COMMAND, recruitGrainCost } from '../src/core/military'
import { SANGUO_ACCEPTANCE } from '../src/core/scenarios'
import { AUTO_SAVE_KEY } from '../src/core/saveStore'
import { MemoryStorage } from './memoryStorage'

function servingCount(session: GameSession): number {
  const state = session.getState()

  return state.characters.filter(
    (character) => character.status === 'serving' && character.factionId === state.playerFaction,
  ).length
}

function createSession(): { store: LocalSaveStore; session: GameSession } {
  const store = new LocalSaveStore(new MemoryStorage())

  return { store, session: new GameSession(store) }
}

describe('GameSession', () => {
  it('没有自动存档时以新开局开始', () => {
    const { session } = createSession()

    expect(session.getState().currentTurn).toBe(1)
    expect(session.getState().currentDate).toEqual({ era: '建安', year: 13, season: 'autumn' })
  })

  it('启动时从自动存档继续', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const saved = createInitialState({ seed: 208 })
    saved.currentTurn = 7
    store.save(AUTO_SAVE_KEY, saved)

    expect(new GameSession(store).getState().currentTurn).toBe(7)
  })

  it('按剧本重开一局，重置对局、清空历史并覆盖自动存档', () => {
    const { store, session } = createSession()
    session.endTurn()

    session.newGame(SANGUO_ACCEPTANCE)

    const state = session.getState()
    expect(state.currentTurn).toBe(1)
    expect(state.history).toEqual([])
    expect(state.factions.map((faction) => faction.id)).toEqual(['liubei', 'caocao', 'sunquan'])
    expect(state.geography.sites).toHaveLength(10)
    expect(store.load(AUTO_SAVE_KEY)?.geography.sites).toHaveLength(10)
  })

  it('结束回合推进时间并写入自动存档', () => {
    const { store, session } = createSession()

    session.endTurn()

    expect(session.getState().currentDate).toEqual({ era: '建安', year: 13, season: 'winter' })
    expect(store.load(AUTO_SAVE_KEY)?.currentDate).toEqual({ era: '建安', year: 13, season: 'winter' })
  })

  it('结束回合后通知订阅者', () => {
    const { session } = createSession()
    const seen: number[] = []
    session.subscribe((state) => seen.push(state.currentTurn))

    session.endTurn()
    session.endTurn()

    expect(seen).toEqual([2, 3])
  })

  it('没有自动存档时读取失败，当前对局不变', () => {
    const { session } = createSession()

    expect(session.loadAutoSave()).toBe(false)
    expect(session.getState().currentTurn).toBe(1)
  })

  it('读取自动存档后回到存档所在回合', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const session = new GameSession(store)
    session.endTurn()
    session.endTurn()

    store.save(AUTO_SAVE_KEY, createInitialState({ seed: 208 }))

    expect(session.loadAutoSave()).toBe(true)
    expect(session.getState().currentTurn).toBe(1)
  })

  it('保存到槽位后可读回该槽位的回合', () => {
    const { session } = createSession()
    session.endTurn()
    session.saveToSlot(3)
    session.endTurn()
    session.endTurn()

    expect(session.loadSlot(3)).toBe(true)
    expect(session.getState().currentTurn).toBe(2)
  })

  it('槽位之间互不影响', () => {
    const { session } = createSession()
    session.saveToSlot(1)
    session.endTurn()
    session.saveToSlot(2)

    expect(session.readSlot(1)?.turn).toBe(1)
    expect(session.readSlot(2)?.turn).toBe(2)
  })

  it('自动存档没有内容时没有摘要', () => {
    const { session } = createSession()

    expect(session.readAutoSave()).toBeNull()
  })

  it('自动存档的摘要在结束回合后更新', () => {
    const { session } = createSession()
    session.endTurn()

    expect(session.readAutoSave()).toEqual({
      date: { era: '建安', year: 13, season: 'winter' },
      turn: 2,
    })
  })

  it('空槽位没有摘要', () => {
    const { session } = createSession()

    expect(session.readSlot(1)).toBeNull()
  })

  it('读取空槽位失败，当前对局不变', () => {
    const { session } = createSession()
    session.endTurn()

    expect(session.loadSlot(5)).toBe(false)
    expect(session.getState().currentTurn).toBe(2)
  })

  it('寻访成功后扣行动力并招募武将，但不在行动时写自动存档', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const session = new GameSession(store, { drawSeed: 1 })
    const before = servingCount(session)

    const result = session.seekTalent('jiangxia')

    expect(result.ok).toBe(true)
    expect(session.getState().actionPoints).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.seekTalent)
    expect(servingCount(session)).toBe(before + 1)
    expect(store.load(AUTO_SAVE_KEY)).toBeNull()
  })

  it('寻访成功后通知订阅者', () => {
    const { session } = createSession()
    const seen: number[] = []
    session.subscribe((state) => seen.push(state.history.length))

    session.seekTalent('jiangxia')

    expect(seen).toEqual([1])
  })

  it('行动力不足时寻访失败，状态不变', () => {
    const { session } = createSession()
    session.getState().actionPoints = 0

    const result = session.seekTalent('jiangxia')

    expect(result).toEqual({ ok: false, reason: '行动力不足' })
    expect(session.getState().history).toEqual([])
  })

  it('读档不回退抽卡源，再次寻访得到不同的人', () => {
    const store = new LocalSaveStore(new MemoryStorage())
    const session = new GameSession(store, { drawSeed: 1 })
    session.saveToSlot(1)

    const first = session.seekTalent('jiangxia')
    session.loadSlot(1)
    const second = session.seekTalent('jiangxia')

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) {
      return
    }

    expect(second.record.outcome).not.toBe(first.record.outcome)
  })
})

describe('GameSession 作战接口', () => {
  it('征兵后目标武将兵力增加、势力粮食减少', () => {
    const { session } = createSession()
    const state = session.getState()
    const guanyu = state.characters.find((character) => character.id === 'guanyu')
    if (guanyu === undefined) {
      throw new Error('武将不存在：guanyu')
    }
    const grainBefore = state.factions.find((faction) => faction.id === state.playerFaction)?.grain ?? 0
    const baseline = guanyu.command * RECRUIT_TROOPS_PER_COMMAND

    const result = session.recruit('guanyu')

    expect(result.ok).toBe(true)
    expect(guanyu.troops).toBeGreaterThanOrEqual(8000 + Math.round(baseline * 0.75))
    expect(guanyu.troops).toBeLessThanOrEqual(8000 + Math.round(baseline * 1.25))
    expect(state.factions.find((faction) => faction.id === state.playerFaction)?.grain).toBe(
      grainBefore - recruitGrainCost(guanyu),
    )
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.recruit)
  })

  it('征粮后势力粮食增加、该武将本季已行动', () => {
    const { session } = createSession()
    const state = session.getState()
    const grainBefore = state.factions.find((faction) => faction.id === state.playerFaction)?.grain ?? 0

    const result = session.harvestGrain('zhugeliang')

    expect(result.ok).toBe(true)
    expect(state.factions.find((faction) => faction.id === state.playerFaction)?.grain).toBeGreaterThan(
      grainBefore,
    )
    expect(state.actedCharacterIds).toContain('zhugeliang')
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.harvestGrain)
  })

  it('调动把武将及其部队移到相邻的自有战略点', () => {
    const { session } = createSession()
    const state = session.getState()
    state.playerFaction = 'caocao'

    const result = session.transfer(['xiahoudun'], 'hulao')

    expect(result.ok).toBe(true)
    expect(
      state.characters.find((character) => character.id === 'xiahoudun')?.stationedSiteId,
    ).toBe('hulao')
  })

  it('进攻占领无主战略点后归属改变并通知界面', () => {
    const { session } = createSession()
    const state = session.getState()
    let notified = 0
    session.subscribe(() => {
      notified += 1
    })

    const result = session.attack({ commander: 'guanyu' }, 'chibi')

    expect(result.ok).toBe(true)
    expect(state.geography.sites.find((site) => site.id === 'chibi')?.owner).toBe('liubei')
    expect(notified).toBe(1)
  })

  it('行动失败时不通知界面', () => {
    const { session } = createSession()
    let notified = 0
    session.subscribe(() => {
      notified += 1
    })

    const result = session.transfer(['guanyu'], 'chibi')

    expect(result.ok).toBe(false)
    expect(notified).toBe(0)
  })
})
