import { affinityToward } from './affinity'
import { isServing } from './characters'
import { EVENT_DEFINITIONS } from './eventsSanguo'
import { isFactionDestroyed } from './military'
import type {
  ActionRecord,
  EventCondition,
  EventDefinition,
  EventEffect,
  Faction,
  GameDate,
  GameState,
  Season,
} from './model'
import { createRandom, type Random } from './random'
import { adjustFavor, favorBetween, relationBetween, setRelation } from './relations'

/**
 * 事件系统（最小可用）：数据驱动，效果只落在既有属性与状态上。
 * 每季结算前求值一次：筛出满足条件的事件，按权重抽一件施加，写入行动历史。
 * 新增事件只需增加数据（见 eventsSanguo），条件与效果是固定词表——要加新机制才需改代码。
 */

/** 季节的次序，供日期比较。 */
const SEASON_ORDER: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']

const SEASON_COUNT = SEASON_ORDER.length

/** 把日期折算成一个可比较的序数；年号文本不参与比较（当前只有一个年号）。 */
function dateOrder(date: GameDate): number {
  return date.year * SEASON_COUNT + SEASON_ORDER.indexOf(date.season)
}

function factionOf(state: GameState, factionId: string): Faction | undefined {
  return state.factions.find((faction) => faction.id === factionId)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** 一项条件是否成立。 */
function matches(state: GameState, condition: EventCondition): boolean {
  switch (condition.kind) {
    case 'date': {
      const now = dateOrder(state.currentDate)
      if (condition.from !== undefined && now < dateOrder(condition.from)) {
        return false
      }
      if (condition.to !== undefined && now > dateOrder(condition.to)) {
        return false
      }
      return true
    }
    case 'factionAlive':
      return factionOf(state, condition.factionId) !== undefined && !isFactionDestroyed(state, condition.factionId)
    case 'relation':
      return relationBetween(state, condition.factions[0], condition.factions[1]) === condition.is
    case 'favor': {
      const favor = favorBetween(state, condition.factions[0], condition.factions[1])
      if (condition.below !== undefined && favor >= condition.below) {
        return false
      }
      if (condition.above !== undefined && favor <= condition.above) {
        return false
      }
      return true
    }
    case 'resource': {
      const faction = factionOf(state, condition.factionId)
      if (faction === undefined) {
        return false
      }
      if (condition.grainBelow !== undefined && faction.grain >= condition.grainBelow) {
        return false
      }
      if (condition.moneyBelow !== undefined && faction.money >= condition.moneyBelow) {
        return false
      }
      return true
    }
  }
}

/** 施加一条效果；目标不存在时静默略过。 */
function applyEffect(state: GameState, effect: EventEffect): void {
  switch (effect.kind) {
    case 'setRelation':
      setRelation(state, effect.factions[0], effect.factions[1], effect.to)
      return
    case 'adjustFavor':
      adjustFavor(state, effect.factions[0], effect.factions[1], effect.delta)
      return
    case 'adjustGrain': {
      const faction = factionOf(state, effect.factionId)
      if (faction !== undefined) {
        faction.grain = Math.max(0, faction.grain + effect.delta)
      }
      return
    }
    case 'adjustMoney': {
      const faction = factionOf(state, effect.factionId)
      if (faction !== undefined) {
        faction.money = Math.max(0, faction.money + effect.delta)
      }
      return
    }
    case 'adjustLoyalty': {
      // 与挫折同一口径：君主的忠诚无意义，在野与退场者也不计。
      const character = state.characters.find((item) => item.id === effect.characterId)
      if (character !== undefined && isServing(character) && !character.isMonarch) {
        character.loyalty = clamp(character.loyalty + effect.delta, 0, 100)
      }
      return
    }
    case 'adjustAffinity': {
      const character = state.characters.find((item) => item.id === effect.characterId)
      if (character !== undefined) {
        const current = affinityToward(character, effect.factionId)
        character.affinities[effect.factionId] = clamp(current + effect.delta, 0, 100)
      }
      return
    }
  }
}

/** 在候选中按权重抽一件；权重总和为零时返回 null。 */
function pickWeighted(candidates: readonly EventDefinition[], random: Random): EventDefinition | null {
  const total = candidates.reduce((sum, definition) => sum + definition.weight, 0)
  if (total <= 0) {
    return null
  }

  let roll = random.next() * total
  for (const definition of candidates) {
    roll -= definition.weight
    if (roll < 0) {
      return definition
    }
  }

  return candidates[candidates.length - 1] ?? null
}

/**
 * 本季的事件：筛出条件全满足、权重为正且未曾触发过（一次性事件）的候选，按权重抽一件施加，
 * 写一条不属任何势力的行动记录；无候选则不动状态、不消耗随机数。
 * 缺省取事件数据（eventsSanguo），可传入一份定义以便测试与将来按剧本挂载。
 */
export function fireEvents(
  state: GameState,
  definitions: readonly EventDefinition[] = EVENT_DEFINITIONS,
): ActionRecord | null {
  const candidates = definitions.filter(
    (definition) =>
      !(definition.once === true && state.firedEvents.includes(definition.id)) &&
      definition.weight > 0 &&
      definition.conditions.every((condition) => matches(state, condition)),
  )
  if (candidates.length === 0) {
    return null
  }

  const random = createRandom(state.randomState)
  const chosen = pickWeighted(candidates, random)
  if (chosen === null) {
    return null
  }
  state.randomState = random.getState()

  for (const effect of chosen.effects) {
    applyEffect(state, effect)
  }
  if (chosen.once === true) {
    state.firedEvents.push(chosen.id)
  }

  const record: ActionRecord = {
    kind: 'event',
    factionId: null,
    date: { ...state.currentDate },
    targetId: chosen.id,
    outcome: chosen.text,
  }
  state.history.push(record)

  return record
}
