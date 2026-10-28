import { describe, expect, it } from 'vitest'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../src/core/actions'
import {
  ARM_STATS,
  ATTACKER_SELECTION,
  attackCandidates,
  autoDeployment,
  autoFormation,
  BATTLE_ACTIONS,
  cancelAttack,
  canSortie,
  currentActor,
  defenderCandidates,
  deployDefenders,
  FEAST_LIMIT,
  FEAST_MORALE_BONUS,
  feastBattle,
  feastCost,
  finishBattle,
  isAttackable,
  MORALE_FULL,
  openAttack,
  ordersFor,
  resolveAction,
  setUnitSlot,
  SITE_DEFENSE_BONUS,
  stationedAt,
  targetsFor,
  WAIT_PROGRESS,
  SORTIE_PROGRESS,
  type BattleState,
} from '../src/core/battle'
import { createInitialState } from '../src/core/createInitialState'
import { declareWar } from '../src/core/diplomacy'
import { attackGrainCost, hasActedThisTurn, isFactionDestroyed, markActed } from '../src/core/military'
import type {
  ArmType,
  Character,
  FactionId,
  GameState,
  Scenario,
  Site,
  SiteType,
} from '../src/core/model'

function characterOf(state: GameState, id: string): Character {
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

function officer(
  id: string,
  name: string,
  factionId: FactionId,
  troops: number,
  options: { armType?: ArmType; stationedSiteId?: string | null; loyalty?: number } = {},
): Character {
  return {
    id,
    name,
    status: 'serving',
    factionId,
    provinceId: 'jing',
    scope: [factionId === 'liubei' ? 'a' : 'b'],
    might: 80,
    command: 80,
    intellect: 50,
    politics: 50,
    age: 40,
    personality: 'steady',
    affinities: { [factionId]: 90 },
    loyalty: options.loyalty ?? 90,
    isMonarch: false,
    armType: options.armType ?? 'infantry',
    stationedSiteId: options.stationedSiteId ?? null,
    troops,
    tier: null,
  }
}

interface RosterSpec {
  id: string
  troops: number
  armType?: ArmType
}

/** 甲乙两家、一处可攻目标的最小对局：甲为玩家，乙为敌对。 */
function scene(options: {
  attackerTroops?: number
  defenderTroops?: number
  siteType?: SiteType
  defenderStationed?: boolean
  extraAttackers?: RosterSpec[]
  extraDefenders?: RosterSpec[]
  extraSites?: Site[]
  withField?: boolean
  seed?: number
} = {}): GameState {
  const attackerTroops = options.attackerTroops ?? 10000
  const defenderTroops = options.defenderTroops ?? 5000

  const sites: Site[] = [
    {
      id: 'a',
      name: '甲',
      type: 'city',
      population: 50000,
      provinceId: 'jing',
      owner: 'liubei',
      neighbors: ['b', 'f'],
    },
    {
      id: 'b',
      name: '乙',
      type: options.siteType ?? 'city',
      population: 50000,
      provinceId: 'jing',
      owner: 'caocao',
      neighbors: ['a'],
    },
  ]
  if (options.withField !== false) {
    sites.push({
      id: 'f',
      name: '野地',
      type: 'field',
      population: 0,
      provinceId: 'jing',
      owner: 'caocao',
      neighbors: ['a'],
    })
  }
  sites.push(...(options.extraSites ?? []))

  const characters: Character[] = [
    officer('attacker', '攻将', 'liubei', attackerTroops),
    officer('defender', '守将', 'caocao', defenderTroops, {
      stationedSiteId: options.defenderStationed === false ? null : 'b',
    }),
    ...(options.extraAttackers ?? []).map((spec) =>
      officer(spec.id, `攻将${spec.id}`, 'liubei', spec.troops, { armType: spec.armType }),
    ),
    ...(options.extraDefenders ?? []).map((spec) =>
      officer(spec.id, `守将${spec.id}`, 'caocao', spec.troops, { armType: spec.armType }),
    ),
  ]

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
    geography: { provinces: [{ id: 'jing', name: '荆州', owner: null }], sites },
    characters,
  }

  return createInitialState({ scenario, seed: options.seed ?? 208 })
}

/** 开一场战斗并取回战斗状态；不合法时直接让测试失败。 */
function opened(
  state: GameState,
  target = 'b',
  ids: string[] = ['attacker'],
  options: { autoDefender?: boolean } = {},
): BattleState {
  const result = openAttack(state, target, autoDeployment(ids), state.playerFaction, options)
  if (!result.ok) {
    throw new Error(result.reason)
  }

  // 多数用例以攻方的一击为起点；先钉住攻方首队，其后仍按行动条推进。
  const first = result.battle.attacker.units[0]
  if (first !== undefined && !result.battle.finished) {
    result.battle.activeUnitId = first.characterId
  }

  return result.battle
}

/** 让战斗按给定指令推进若干次行动；行动者由当前队列决定。 */
function advance(battle: BattleState, kinds: readonly ('attack' | 'defend')[] = []): void {
  for (const kind of kinds) {
    const actor = currentActor(battle)
    if (actor === null) {
      return
    }
    resolveAction(battle, { characterId: actor.characterId, kind })
  }
}

describe('兵种与据点补正', () => {
  it('骑兵最快、步兵次之、弓兵最慢；骑兵攻高防薄，弓手攻低防低且能及远', () => {
    expect(ARM_STATS.cavalry.mobility).toBeGreaterThan(ARM_STATS.infantry.mobility)
    expect(ARM_STATS.infantry.mobility).toBeGreaterThan(ARM_STATS.archer.mobility)
    expect(ARM_STATS.cavalry.attack).toBeGreaterThan(ARM_STATS.infantry.attack)
    expect(ARM_STATS.cavalry.defense).toBeLessThan(ARM_STATS.infantry.defense)
    expect(ARM_STATS.archer.attack).toBeLessThan(ARM_STATS.infantry.attack)
    expect(ARM_STATS.archer.ranged).toBe(true)
    expect(ARM_STATS.infantry.ranged).toBe(false)
    expect(ARM_STATS.cavalry.ranged).toBe(false)
  })

  it('据点补正按类型分档：野地无险可依，都会最坚', () => {
    expect(SITE_DEFENSE_BONUS).toEqual({ field: 0, town: 0.1, city: 0.2, pass: 0.25, metropolis: 0.3 })
  })
})

describe('布阵', () => {
  it('至少派一队、前排至少一队，同一名武将不能排两次', () => {
    const empty = scene()
    expect(openAttack(empty, 'b', [])).toEqual({ ok: false, reason: '至少选一名武将出征' })

    const noFront = scene()
    expect(openAttack(noFront, 'b', [{ characterId: 'attacker', slot: 3 }])).toEqual({
      ok: false,
      reason: '前排至少一队',
    })

    const twice = scene()
    expect(
      openAttack(twice, 'b', [
        { characterId: 'attacker', slot: 0 },
        { characterId: 'attacker', slot: 3 },
      ]),
    ).toEqual({ ok: false, reason: '同一名武将不能重复出征' })
  })

  it('每方六个阵位：攻方至多五队，同一阵位不能排两队', () => {
    const six = scene({
      extraAttackers: ['a2', 'a3', 'a4', 'a5', 'a6'].map((id) => ({ id, troops: 5000 })),
    })
    expect(
      openAttack(six, 'b', autoDeployment(['attacker', 'a2', 'a3', 'a4', 'a5', 'a6'])),
    ).toEqual({ ok: false, reason: `至多 ${ATTACKER_SELECTION} 名武将出征` })

    const five = scene({
      extraAttackers: ['a2', 'a3', 'a4', 'a5'].map((id) => ({ id, troops: 5000 })),
    })
    const fiveIds = ['attacker', 'a2', 'a3', 'a4', 'a5']
    expect(
      openAttack(
        five,
        'b',
        fiveIds.map((id) => ({ characterId: id, slot: 0 })),
      ),
    ).toEqual({ ok: false, reason: '同一阵位不能排两队' })
    expect(
      openAttack(
        scene(),
        'b',
        [{ characterId: 'attacker', slot: 6 }],
      ),
    ).toEqual({ ok: false, reason: '阵位超出范围' })
  })

  it('自动布阵按前三后三填入六个阵位', () => {
    expect(autoDeployment(['a', 'b', 'c', 'd', 'e'])).toEqual([
      { characterId: 'a', slot: 0 },
      { characterId: 'b', slot: 1 },
      { characterId: 'c', slot: 2 },
      { characterId: 'd', slot: 3 },
      { characterId: 'e', slot: 4 },
    ])
  })

  it('自动阵形按兵种分排：近战在前，弓手在后', () => {
    expect(
      autoFormation([
        { id: 'a', armType: 'cavalry' },
        { id: 'b', armType: 'archer' },
      ]),
    ).toEqual([
      { characterId: 'a', slot: 0 },
      { characterId: 'b', slot: 3 },
    ])

    // 全是弓手时，至少挪一队到前排，否则开不了战。
    expect(autoFormation([{ id: 'a', armType: 'archer' }])).toEqual([
      { characterId: 'a', slot: 0 },
    ])
  })

  it('开战前可拖动换位，但不能让前排空着；开战后不再变动', () => {
    const state = scene({
      defenderTroops: 60000,
      extraAttackers: ['a2', 'a3', 'a4', 'a5'].map((id) => ({ id, troops: 5000 })),
    })
    const battle = opened(state, 'b', ['attacker', 'a2', 'a3', 'a4', 'a5'], { autoDefender: false })
    deployDefenders(battle, state, autoDeployment(['defender']))

    // 前排 attacker、a2、a3；后排 a4、a5。前排与后排互换合法。
    expect(setUnitSlot(battle, 'a4', 0)).toBeNull()
    expect(battle.attacker.units.find((unit) => unit.characterId === 'a4')?.slot).toBe(0)

    // 只有一队时不能把它挪到后排，前排不能空着。
    const lone = opened(scene({ defenderTroops: 60000 }), 'b', ['attacker'], { autoDefender: false })
    expect(setUnitSlot(lone, 'attacker', 3)).toBe('前排至少一队')
    expect(setUnitSlot(lone, 'attacker', 0)).toBeNull()

    advance(battle, ['defend'])
    expect(setUnitSlot(battle, 'a4', 5)).toBe('开战后不能再变阵')
  })

  it('守方至多六队：五名自选加驻将', () => {
    const state = scene({
      extraDefenders: ['d2', 'd3', 'd4', 'd5', 'd6', 'd7'].map((id) => ({ id, troops: 3000 })),
    })
    const battle = opened(state, 'b', ['attacker'], { autoDefender: false })
    const seven = ['defender', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'].map((id, index) => ({
      characterId: id,
      slot: index % 6,
    }))

    expect(deployDefenders(battle, state, seven)).toBe('至多 6 队上阵')
  })

  it('守方只能从该点的候选里选人', () => {
    const state = scene()
    const battle = opened(state, 'b', ['attacker'], { autoDefender: false })

    expect(deployDefenders(battle, state, autoDeployment(['attacker']))).toBe('攻将 不能在此迎战')
    expect(deployDefenders(battle, state, autoDeployment(['defender']))).toBeNull()
    expect(battle.defender.units.map((unit) => unit.name)).toEqual(['守将'])
  })

  it('守方不派将迎战即不战而下，攻方照付行动力与粮草', () => {
    const state = scene({ defenderTroops: 5000 })
    const battle = opened(state, 'b', ['attacker'], { autoDefender: false })

    expect(deployDefenders(battle, state, [])).toBeNull()
    expect(battle.finished).toBe(true)
    expect(battle.undefended).toBe(true)
    expect(battle.attackerWins).toBe(true)
    expect(state.actionPoints.liubei).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.attack)
  })
})

describe('开战', () => {
  it('扣四点行动力，另按投入兵力扣粮', () => {
    const state = scene({ attackerTroops: 10000 })
    opened(state, 'b', ['attacker'])

    expect(state.actionPoints.liubei).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.attack)
    expect(state.factions.find((item) => item.id === 'liubei')?.grain).toBe(
      100000 - attackGrainCost(10000),
    )
  })

  it('守方由规则层自动布阵：驻将与名册中有兵、未行动的武将齐出', () => {
    const state = scene({
      attackerTroops: 1000,
      defenderTroops: 5000,
      extraDefenders: [{ id: 'd2', troops: 3000 }],
    })
    const battle = opened(state, 'b', ['attacker'])

    expect(battle.defender.units.map((unit) => unit.name)).toEqual(['守将', '守将d2'])
    expect(battle.defender.units[0]?.stationed).toBe(true)
  })

  it('已行动的武将不能防守，兵为零的驻将也不上阵', () => {
    const state = scene({ defenderTroops: 5000, extraDefenders: [{ id: 'd2', troops: 3000 }] })
    markActed(state, 'd2')

    expect(defenderCandidates(state, 'b', 'caocao').map((item) => item.id)).toEqual(['defender'])

    characterOf(state, 'defender').troops = 0
    expect(defenderCandidates(state, 'b', 'caocao')).toEqual([])
  })

  it('守方无人可守则不战而下，城池易主', () => {
    const state = scene({ defenderTroops: 0 })
    const battle = opened(state, 'b', ['attacker'])

    expect(battle.undefended).toBe(true)
    const result = finishBattle(state, battle)

    expect(result.ok).toBe(true)
    expect(siteOf(state, 'b').owner).toBe('liubei')
    if (result.ok) {
      expect(result.record.battle?.undefended).toBe(true)
    }
  })

  it('未宣战不能进攻', () => {
    const state = scene()
    state.relations = []

    expect(attackOutcome(state, 'b')).toEqual({ ok: false, reason: '与对方非敌对，须先宣战' })
    expect(isAttackable(state, 'b')).toBe(false)

    declareWar(state, 'caocao')
    expect(isAttackable(state, 'b')).toBe(true)
  })

  it('目标须与自有战略点相邻，且不能是自有或无主之地', () => {
    const state = scene({
      extraSites: [
        { id: 'c', name: '丙', type: 'town', population: 10000, provinceId: 'jing', owner: 'caocao', neighbors: ['b'] },
        { id: 'u', name: '无主', type: 'town', population: 10000, provinceId: 'jing', owner: null, neighbors: ['a'] },
      ],
    })

    expect(attackOutcome(state, 'a')).toEqual({ ok: false, reason: '目标已是自有战略点' })
    expect(attackOutcome(state, 'u')).toEqual({ ok: false, reason: '目标无归属，无法宣战' })
    expect(attackOutcome(state, 'c')).toEqual({ ok: false, reason: '目标不与自有战略点相邻' })
  })

  it('驻将、无兵、已行动者都不能出征', () => {
    const stationed = scene()
    characterOf(stationed, 'attacker').stationedSiteId = 'a'
    expect(attackOutcome(stationed, 'b')).toEqual({ ok: false, reason: '攻将 正在驻守，不能出征' })

    const emptyHanded = scene({ attackerTroops: 0 })
    expect(attackOutcome(emptyHanded, 'b')).toEqual({ ok: false, reason: '攻将 没有兵力' })

    const spent = scene()
    markActed(spent, 'attacker')
    expect(attackOutcome(spent, 'b')).toEqual({ ok: false, reason: '攻将 本回合已行动' })
  })

  it('不属本势力的武将与空编成都拒绝', () => {
    const state = scene()
    expect(attackOutcome(state, 'b', ['defender'])).toEqual({
      ok: false,
      reason: '该武将不在此势力',
    })
    expect(attackOutcome(state, 'b', [])).toEqual({ ok: false, reason: '至少选一名武将出征' })
  })

  it('行动力不足或粮草不足都不出征', () => {
    const poor = scene({ attackerTroops: 10000 })
    poor.actionPoints.liubei = ACTION_COSTS.attack - 1
    expect(attackOutcome(poor, 'b')).toEqual({ ok: false, reason: '行动力不足' })

    const hungry = scene({ attackerTroops: 10000 })
    const faction = hungry.factions.find((item) => item.id === 'liubei')
    if (faction === undefined) {
      throw new Error('势力不存在：liubei')
    }
    faction.grain = 0
    expect(attackOutcome(hungry, 'b')).toEqual({ ok: false, reason: '粮草不足，不能出征' })
    expect(hungry.actionPoints.liubei).toBe(ACTION_POINTS_PER_TURN)
  })

  it('候选部属含未驻守、有兵的部属，已行动者也在列', () => {
    const state = scene({ extraAttackers: [{ id: 'a2', troops: 3000 }] })
    markActed(state, 'attacker')

    const ids = attackCandidates(state, 'b').map((item) => item.id)
    expect(ids).toContain('attacker')
    expect(ids).toContain('a2')
    expect(ids).not.toContain('defender')
  })
})

describe('行动条', () => {
  it('骑兵的进度先满，先于步兵出手', () => {
    const state = scene({
      attackerTroops: 5000,
      defenderTroops: 5000,
      extraAttackers: [{ id: 'a2', troops: 5000, armType: 'cavalry' }],
    })
    characterOf(state, 'attacker').armType = 'infantry'
    const battle = opened(state, 'b', ['attacker', 'a2'], { autoDefender: false })
    deployDefenders(battle, state, autoDeployment(['defender']))

    // 骑兵 13 与步兵 10 的差距大于一成扰动，先后不因随机翻转。
    expect(currentActor(battle)?.characterId).toBe('a2')
  })

  it('同一场交锋里，骑兵出手多于同场步兵', () => {
    const state = scene({
      attackerTroops: 50000,
      defenderTroops: 50000,
      extraAttackers: [{ id: 'a2', troops: 50000, armType: 'cavalry' }],
    })
    characterOf(state, 'attacker').armType = 'infantry'
    const battle = opened(state, 'b', ['attacker', 'a2'], { autoDefender: false })
    deployDefenders(battle, state, autoDeployment(['defender']))

    const counts = new Map<string, number>()
    // 骑兵待机、步兵防御，无人受伤；只比行动条上谁出手更频。
    for (let step = 0; step < 30; step += 1) {
      const actor = currentActor(battle)
      if (actor === null || battle.finished) {
        break
      }
      counts.set(actor.characterId, (counts.get(actor.characterId) ?? 0) + 1)
      const kind = actor.armType === 'cavalry' ? 'wait' : 'defend'
      resolveAction(battle, { characterId: actor.characterId, kind })
    }

    expect(counts.get('a2') ?? 0).toBeGreaterThan(counts.get('attacker') ?? 0)
  })

  it('固定种子下行动顺序可复现', () => {
    const order = (): string[] => {
      const state = scene({ attackerTroops: 5000, defenderTroops: 5000, seed: 42 })
      const battle = opened(state, 'b', ['attacker'])
      const acted: string[] = []
      while (!battle.finished) {
        const actor = currentActor(battle)
        if (actor === null) {
          break
        }
        acted.push(actor.characterId)
        resolveAction(battle, { characterId: actor.characterId, kind: 'defend' })
      }
      return acted
    }

    expect(order()).toEqual(order())
  })
})

describe('交锋', () => {
  it('二十五次行动用尽而守方仍在，守方守住、攻方撤退', () => {
    const state = scene({ attackerTroops: 10000, defenderTroops: 10000 })
    const battle = opened(state, 'b', ['attacker'])

    while (!battle.finished) {
      const actor = currentActor(battle)
      if (actor === null) {
        break
      }
      resolveAction(battle, { characterId: actor.characterId, kind: 'defend' })
    }

    expect(battle.actionsUsed).toBe(BATTLE_ACTIONS)
    expect(battle.attackerWins).toBe(false)

    const result = finishBattle(state, battle)
    expect(result.ok).toBe(true)
    expect(siteOf(state, 'b').owner).toBe('caocao')
    if (result.ok) {
      expect(result.record.battle?.captives).toEqual([])
      expect(result.record.battle?.attacker.casualties).toBe(0)
    }
    expect(characterOf(state, 'attacker').loyalty).toBe(90 - 8)
  })

  it('近战只及前排，弓兵可越排打后排', () => {
    const melee = scene({
      attackerTroops: 20000,
      defenderTroops: 30000,
      extraDefenders: [
        { id: 'd2', troops: 100 },
        { id: 'd3', troops: 30000 },
        { id: 'd4', troops: 30000 },
        { id: 'd5', troops: 30000 },
      ],
    })
    const meleeBattle = opened(melee, 'b', ['attacker'], { autoDefender: false })
    deployDefenders(meleeBattle, melee, autoDeployment(['defender', 'd3', 'd4', 'd5', 'd2']))
    meleeBattle.activeUnitId = 'attacker'

    // 守方前三队在前排；守将d2 在后排，近战够不着。
    const meleeActor = currentActor(meleeBattle)
    if (meleeActor === null) {
      throw new Error('缺少行动者')
    }
    expect(targetsFor(meleeBattle, meleeActor).map((unit) => unit.name)).not.toContain('守将d2')

    resolveAction(meleeBattle, { characterId: 'attacker', kind: 'attack', targetId: 'd2' })

    const meleeBack = meleeBattle.defender.units.find((unit) => unit.name === '守将d2')
    expect(meleeBack?.battleTroops).toBe(100)
    expect(meleeBack?.exited).toBe(false)

    const ranged = scene({
      attackerTroops: 20000,
      defenderTroops: 30000,
      extraDefenders: [
        { id: 'd2', troops: 100 },
        { id: 'd3', troops: 30000 },
        { id: 'd4', troops: 30000 },
        { id: 'd5', troops: 30000 },
      ],
    })
    // 兵种在建队时读入，故须在开战前改定。
    characterOf(ranged, 'attacker').armType = 'archer'
    const archerBattle = opened(ranged, 'b', ['attacker'], { autoDefender: false })
    deployDefenders(archerBattle, ranged, autoDeployment(['defender', 'd3', 'd4', 'd5', 'd2']))
    archerBattle.activeUnitId = 'attacker'

    const archerActor = currentActor(archerBattle)
    if (archerActor === null) {
      throw new Error('缺少行动者')
    }
    expect(targetsFor(archerBattle, archerActor).map((unit) => unit.name)).toContain('守将d2')

    resolveAction(archerBattle, { characterId: 'attacker', kind: 'attack', targetId: 'd2' })

    const rangedBack = archerBattle.defender.units.find((unit) => unit.name === '守将d2')
    expect(rangedBack?.battleTroops).toBe(0)
    expect(rangedBack?.exited).toBe(true)
  })

  it('步兵防御只护自己：受击减伤，并替同排友军代伤', () => {
    const plain = scene({ attackerTroops: 20000, defenderTroops: 30000 })
    const plainBattle = opened(plain, 'b', ['attacker'])
    const plainEvent = resolveAction(plainBattle, {
      characterId: 'attacker',
      kind: 'attack',
      targetId: 'defender',
    })
    const plainLeft = plainBattle.defender.units[0]?.battleTroops ?? 0

    const guarded = scene({ attackerTroops: 20000, defenderTroops: 30000 })
    const guardedBattle = opened(guarded, 'b', ['attacker'])
    const guardedUnit = guardedBattle.defender.units[0]
    if (guardedUnit === undefined) {
      throw new Error('缺少守方')
    }
    guardedUnit.defending = true
    const guardedEvent = resolveAction(guardedBattle, {
      characterId: 'attacker',
      kind: 'attack',
      targetId: 'defender',
    })
    const guardedLeft = guardedBattle.defender.units[0]?.battleTroops ?? 0

    expect(guardedLeft).toBeGreaterThan(plainLeft)
    // 打在防御中的步兵身上，自损减半。
    expect(guardedEvent?.selfLoss).toBe(Math.round((plainEvent?.selfLoss ?? 0) / 2))

    // 前排另一名步兵防御时，攻击同排友军会由他承担。
    const state = scene({
      attackerTroops: 20000,
      defenderTroops: 30000,
      extraDefenders: [{ id: 'd2', troops: 30000 }],
    })
    const battle = opened(state, 'b', ['attacker'])
    const guard = battle.defender.units.find((unit) => unit.characterId === 'd2')
    const ally = battle.defender.units.find((unit) => unit.characterId === 'defender')
    if (guard === undefined || ally === undefined) {
      throw new Error('缺少守方')
    }
    guard.defending = true
    const allyBefore = ally.battleTroops
    const guardBefore = guard.battleTroops

    const event = resolveAction(battle, {
      characterId: 'attacker',
      kind: 'attack',
      targetId: 'defender',
    })

    expect(event?.targetName).toBe('守将d2')
    expect(event?.intendedTargetName).toBe('守将')
    expect(ally.battleTroops).toBe(allyBefore)
    expect(guard.battleTroops).toBeLessThan(guardBefore)
  })

  it('步兵防御只把自己置为防御姿态，不再整排减伤', () => {
    const state = scene({
      extraDefenders: [
        { id: 'd2', troops: 3000 },
        { id: 'd3', troops: 3000 },
      ],
    })
    const battle = opened(state, 'b', ['attacker'])
    const front = battle.defender.units.find((unit) => unit.slot === 0)
    if (front === undefined) {
      throw new Error('缺少前排')
    }

    battle.activeUnitId = front.characterId
    const beforeAction = front.battleTroops
    const event = resolveAction(battle, { characterId: front.characterId, kind: 'defend' })

    expect(event?.kind).toBe('defend')
    expect(front.defending).toBe(true)
    expect(front.battleTroops).toBe(beforeAction)
    expect(battle.actionsUsed).toBe(1)
    for (const unit of battle.defender.units) {
      if (unit.characterId !== front.characterId) {
        expect(unit.defending).toBe(false)
      }
    }
  })

  it('据点补正对守方全员生效：守城比守野地少损', () => {
    const field = scene({ attackerTroops: 20000, defenderTroops: 30000, siteType: 'field' })
    const fieldBattle = opened(field, 'b', ['attacker'])
    resolveAction(fieldBattle, { characterId: 'attacker', kind: 'attack', targetId: 'defender' })

    const city = scene({ attackerTroops: 20000, defenderTroops: 30000, siteType: 'city' })
    const cityBattle = opened(city, 'b', ['attacker'])
    resolveAction(cityBattle, { characterId: 'attacker', kind: 'attack', targetId: 'defender' })

    expect(cityBattle.defender.units[0]?.battleTroops ?? 0).toBeGreaterThan(
      fieldBattle.defender.units[0]?.battleTroops ?? 0,
    )
  })

  it('后排骑兵须先出击；弓手在后排可直接射击且无自损', () => {
    const state = scene({
      attackerTroops: 5000,
      defenderTroops: 5000,
      extraAttackers: [{ id: 'a2', troops: 5000, armType: 'cavalry' }],
    })
    const result = openAttack(
      state,
      'b',
      [
        { characterId: 'attacker', slot: 0 },
        { characterId: 'a2', slot: 3 },
      ],
      state.playerFaction,
      { autoDefender: false },
    )
    if (!result.ok) {
      throw new Error(result.reason)
    }
    const battle = result.battle
    deployDefenders(battle, state, autoDeployment(['defender']))
    battle.activeUnitId = 'a2'

    const horse = currentActor(battle)
    if (horse === null) {
      throw new Error('缺少行动者')
    }
    expect(horse.characterId).toBe('a2')
    // 正前方有存活友军时，既不能攻击，也不能出击。
    expect(ordersFor(battle, horse)).toEqual(['wait'])
    expect(canSortie(battle, horse)).toBe(false)
    expect(targetsFor(battle, horse)).toEqual([])
    expect(resolveAction(battle, { characterId: 'a2', kind: 'attack' })).toBeNull()
    expect(resolveAction(battle, { characterId: 'a2', kind: 'sortie' })).toBeNull()

    // 前排被击溃后可以出击：移入正前方，不占行动次数，条子落到三成。
    const front = battle.attacker.units.find((unit) => unit.characterId === 'attacker')
    if (front === undefined) {
      throw new Error('缺少前排')
    }
    front.battleTroops = 0
    front.exited = true
    expect(ordersFor(battle, horse)).toEqual(['sortie', 'wait'])

    horse.progress = 100
    const sortie = resolveAction(battle, { characterId: 'a2', kind: 'sortie' })
    expect(sortie?.kind).toBe('sortie')
    expect(horse.slot).toBe(0)
    expect(front.slot).toBe(3)
    expect(sortie?.actorProgress).toBe(SORTIE_PROGRESS)
    expect(battle.actionsUsed).toBe(0)

    // 换成弓手，便可在后排直接射向前排，且不承担反伤。
    const archer = scene({
      attackerTroops: 5000,
      defenderTroops: 5000,
      extraAttackers: [{ id: 'a2', troops: 5000, armType: 'archer' }],
    })
    const archerResult = openAttack(
      archer,
      'b',
      [
        { characterId: 'attacker', slot: 0 },
        { characterId: 'a2', slot: 3 },
      ],
      archer.playerFaction,
      { autoDefender: false },
    )
    if (!archerResult.ok) {
      throw new Error(archerResult.reason)
    }
    deployDefenders(archerResult.battle, archer, autoDeployment(['defender']))
    archerResult.battle.activeUnitId = 'a2'
    const bow = currentActor(archerResult.battle)
    if (bow === null) {
      throw new Error('缺少行动者')
    }
    expect(ordersFor(archerResult.battle, bow)).toEqual(['attack', 'wait'])
    expect(targetsFor(archerResult.battle, bow).map((unit) => unit.name)).toEqual(['守将'])

    const before = bow.battleTroops
    const shot = resolveAction(archerResult.battle, {
      characterId: 'a2',
      kind: 'attack',
      targetId: 'defender',
    })
    expect(shot?.damage).toBeGreaterThan(0)
    expect(shot?.selfLoss).toBe(0)
    expect(bow.battleTroops).toBe(before)
    expect(archerResult.battle.actionsUsed).toBe(1)
  })

  it('兵种指令随兵种与站位而定', () => {
    const state = scene({
      extraAttackers: [
        { id: 'cav', troops: 5000, armType: 'cavalry' },
        { id: 'bow', troops: 5000, armType: 'archer' },
        { id: 'rear-cav', troops: 5000, armType: 'cavalry' },
        { id: 'rear-inf', troops: 5000, armType: 'infantry' },
      ],
    })
    const battle = opened(state, 'b', ['attacker', 'cav', 'bow', 'rear-cav', 'rear-inf'], {
      autoDefender: false,
    })
    deployDefenders(battle, state, autoDeployment(['defender']))

    const unitOf = (id: string) => {
      const unit = battle.attacker.units.find((item) => item.characterId === id)
      if (unit === undefined) {
        throw new Error(`缺少队伍：${id}`)
      }
      return unit
    }

    expect(ordersFor(battle, unitOf('attacker'))).toEqual(['attack', 'defend', 'wait'])
    expect(ordersFor(battle, unitOf('cav'))).toEqual(['attack', 'wait'])
    expect(ordersFor(battle, unitOf('bow'))).toEqual(['attack', 'wait'])
    expect(ordersFor(battle, unitOf('rear-inf'))).toEqual(['defend', 'wait'])
    // 后排骑兵正前方是存活友军，只能待机。
    expect(unitOf('rear-cav').slot).toBeGreaterThanOrEqual(3)
    expect(ordersFor(battle, unitOf('rear-cav'))).toEqual(['wait'])

    // 正前方的友军被击溃后，后排骑兵可出击。
    const aheadSlot = unitOf('rear-cav').slot - 3
    const ahead = battle.attacker.units.find((unit) => unit.slot === aheadSlot)
    if (ahead === undefined) {
      throw new Error('缺少前排')
    }
    ahead.battleTroops = 0
    ahead.exited = true
    expect(ordersFor(battle, unitOf('rear-cav'))).toEqual(['sortie', 'wait'])
  })

  it('待机不占行动次数，行动条回落到六成', () => {
    const state = scene()
    const battle = opened(state, 'b', ['attacker'])
    const actor = currentActor(battle)
    if (actor === null) {
      throw new Error('缺少行动者')
    }

    actor.progress = 100
    const event = resolveAction(battle, { characterId: actor.characterId, kind: 'wait' })

    expect(event?.kind).toBe('wait')
    expect(event?.actorProgress).toBe(WAIT_PROGRESS)
    expect(event?.actionsUsed).toBe(0)
    expect(battle.actionsUsed).toBe(0)
  })

  it('双方都只剩后排步兵时，谁也够不着谁，守方守住', () => {
    const state = scene({
      extraAttackers: [{ id: 'rear', troops: 5000 }],
      extraDefenders: [{ id: 'd2', troops: 5000 }],
    })
    const battle = opened(state, 'b', ['attacker', 'rear'], { autoDefender: false })
    const attackerRear = battle.attacker.units.find((unit) => unit.characterId === 'rear')
    if (attackerRear === undefined) {
      throw new Error('缺少后排')
    }
    attackerRear.slot = 3
    deployDefenders(battle, state, [
      { characterId: 'defender', slot: 0 },
      { characterId: 'd2', slot: 3 },
    ])

    const attackerFront = battle.attacker.units.find((unit) => unit.slot === 0)
    const defenderFront = battle.defender.units.find((unit) => unit.slot === 0)
    if (attackerFront === undefined || defenderFront === undefined) {
      throw new Error('缺少前排')
    }
    attackerFront.battleTroops = 0
    attackerFront.exited = true
    defenderFront.battleTroops = 0
    defenderFront.exited = true

    const rear = battle.attacker.units.find((unit) => unit.characterId === 'rear')
    if (rear === undefined) {
      throw new Error('缺少后排')
    }
    battle.activeUnitId = rear.characterId
    resolveAction(battle, { characterId: rear.characterId, kind: 'wait' })

    expect(battle.finished).toBe(true)
    expect(battle.attackerWins).toBe(false)
    expect(battle.actionsUsed).toBe(0)
  })

  it('活动范围只约束他方：玩家候选不受清单限制，他方仍受限', () => {
    const state = scene({
      extraAttackers: [{ id: 'a2', troops: 5000 }],
      extraDefenders: [
        { id: 'd2', troops: 5000 },
        { id: 'd3', troops: 5000 },
      ],
    })

    // 玩家：a2 的清单只有 a，仍可从 a 出征 b，也可守 a。
    expect(attackCandidates(state, 'b').map((item) => item.id)).toContain('a2')
    characterOf(state, 'a2').scope = ['b']
    expect(defenderCandidates(state, 'a', 'liubei').map((item) => item.id)).toContain('a2')

    // 他方：d3 的清单不含 b，不能作为 b 的守将。
    characterOf(state, 'd3').scope = ['a']
    const defenders = defenderCandidates(state, 'b', 'caocao').map((item) => item.id)
    expect(defenders).toContain('d2')
    expect(defenders).not.toContain('d3')
  })

  it('一次行动产出可供演出的战果：出手者、目标、伤害与剩余战兵', () => {
    const state = scene({ attackerTroops: 20000, defenderTroops: 30000 })
    const battle = opened(state, 'b', ['attacker'])

    const event = resolveAction(battle, {
      characterId: 'attacker',
      kind: 'attack',
      targetId: 'defender',
    })

    expect(event?.actorName).toBe('攻将')
    expect(event?.targetName).toBe('守将')
    expect(event?.damage).toBeGreaterThan(0)
    expect(event?.selfLoss).toBeGreaterThan(0)
    expect(event?.actionsUsed).toBe(1)
    expect(event?.finished).toBe(false)
    expect(battle.actionsUsed).toBe(1)
  })
})

describe('战后结算', () => {
  it('得胜即占领，战损按比例七折折算，攻方一律已行动', () => {
    const state = scene({ attackerTroops: 20000, defenderTroops: 1000 })
    const battle = opened(state, 'b', ['attacker'])
    const result = finishBattle(state, battle)

    expect(result.ok).toBe(true)
    expect(siteOf(state, 'b').owner).toBe('liubei')
    expect(hasActedThisTurn(state, 'attacker')).toBe(true)

    if (result.ok) {
      const report = result.record.battle
      if (report === undefined) {
        throw new Error('缺少战报')
      }
      expect(report.attackerWins).toBe(true)
      expect(report.attacker.troops).toBe(20000)
      expect(report.attacker.casualties).toBeGreaterThan(0)
      expect(characterOf(state, 'attacker').troops).toBe(20000 - report.attacker.casualties)
      expect(report.defender.casualties).toBeGreaterThan(0)
    }
  })

  it('全军覆没者实减七成、保留三成', () => {
    const state = scene({ attackerTroops: 10000, defenderTroops: 200000 })
    const battle = opened(state, 'b', ['attacker'])
    const result = finishBattle(state, battle)

    expect(result.ok).toBe(true)
    if (result.ok && result.record.battle !== undefined) {
      expect(result.record.battle.attackerWins).toBe(false)
      expect(result.record.battle.attacker.casualties).toBe(7000)
    }
    expect(characterOf(state, 'attacker').troops).toBe(3000)
    expect(siteOf(state, 'b').owner).toBe('caocao')
  })

  it('守方参战者按七成半撤回、一成战死、一成半被俘定去向', () => {
    const statuses = new Set<string>()

    for (let seed = 1; seed <= 60; seed += 1) {
      const state = scene({ attackerTroops: 40000, defenderTroops: 1000, seed })
      const battle = opened(state, 'b', ['attacker'])
      finishBattle(state, battle)
      statuses.add(characterOf(state, 'defender').status)
    }

    expect(statuses.has('serving')).toBe(true)
    expect(statuses.has('retired')).toBe(true)
    expect(statuses.has('captured')).toBe(true)
  })

  it('驻将失守而撤出者忠诚减十；未上阵的驻将同样撤出、忠诚减十', () => {
    let withdrawn = false
    for (let seed = 1; seed <= 30 && !withdrawn; seed += 1) {
      const state = scene({ attackerTroops: 40000, defenderTroops: 1000, seed })
      const battle = opened(state, 'b', ['attacker'])
      finishBattle(state, battle)
      if (characterOf(state, 'defender').status === 'serving') {
        expect(characterOf(state, 'defender').loyalty).toBe(90 - 10)
        withdrawn = true
      }
    }
    expect(withdrawn).toBe(true)

    // 兵为零的驻将不上阵，城破后随城撤出。
    const emptyHanded = scene({ attackerTroops: 40000, defenderTroops: 0 })
    const emptyBattle = opened(emptyHanded, 'b', ['attacker'])
    const emptyResult = finishBattle(emptyHanded, emptyBattle)

    expect(emptyResult.ok).toBe(true)
    expect(characterOf(emptyHanded, 'defender').stationedSiteId).toBeNull()
    expect(characterOf(emptyHanded, 'defender').loyalty).toBe(90 - 10)
  })

  it('守方自选武将战后已行动，驻将不受此限', () => {
    const state = scene({
      attackerTroops: 40000,
      defenderTroops: 1000,
      extraDefenders: [{ id: 'd2', troops: 1000 }],
    })
    const battle = opened(state, 'b', ['attacker'])
    finishBattle(state, battle)

    expect(hasActedThisTurn(state, 'd2')).toBe(true)
    expect(hasActedThisTurn(state, 'defender')).toBe(false)
  })

  it('守方失去最后一处据点即覆灭，名册流落为在野', () => {
    const state = scene({ attackerTroops: 40000, defenderTroops: 1000, withField: false })
    const battle = opened(state, 'b', ['attacker'])
    finishBattle(state, battle)

    expect(isFactionDestroyed(state, 'caocao')).toBe(true)
    const survivor = characterOf(state, 'defender')
    expect(['wild', 'retired', 'captured']).toContain(survivor.status)
    if (survivor.status !== 'captured') {
      expect(survivor.factionId).toBeNull()
    }
  })

  it('犒军三次、士气逐次 +5，花费逐次递增，取消进攻时全数退回', () => {
    const state = scene({ attackerTroops: 10000, defenderTroops: 3000 })
    const faction = state.factions.find((item) => item.id === 'liubei')
    if (faction === undefined) {
      throw new Error('势力不存在：liubei')
    }
    faction.money = 10000
    const battle = opened(state, 'b', ['attacker'])
    const base = feastCost(10000, 0)

    for (let count = 0; count < FEAST_LIMIT; count += 1) {
      expect(feastBattle(state, battle)).toEqual({ ok: true, cost: base * (count + 1) })
      expect(battle.attacker.morale).toBe(MORALE_FULL + FEAST_MORALE_BONUS * (count + 1))
    }
    expect(feastBattle(state, battle)).toEqual({
      ok: false,
      reason: `犒军至多 ${FEAST_LIMIT} 次`,
    })

    const spent = base * (1 + 2 + 3)
    expect(faction.money).toBe(10000 - spent)

    expect(cancelAttack(state, battle)).toBe(true)
    expect(faction.money).toBe(10000)
  })

  it('玩家麾下的守将败退后不被俘、不战死', () => {
    const state = scene({
      attackerTroops: 40000,
      defenderTroops: 1000,
      extraSites: [
        {
          id: 'c',
          name: '丙',
          type: 'city',
          population: 10000,
          provinceId: 'jing',
          owner: 'caocao',
          neighbors: ['b'],
        },
      ],
    })
    const battle = opened(state, 'b', ['attacker'], { autoDefender: false })
    expect(deployDefenders(battle, state, autoDeployment(['defender']))).toBeNull()

    // 把守方当作玩家一方来结算，验证玩家武将的去向保护。
    state.playerFaction = 'caocao'
    finishBattle(state, battle, 'win')

    const defender = characterOf(state, 'defender')
    expect(defender.status).toBe('serving')
    expect(defender.factionId).toBe('caocao')
    expect(state.captives.caocao ?? []).toHaveLength(0)
  })

  it('战报写入行动历史，归属与结果齐备', () => {
    const state = scene({ attackerTroops: 20000, defenderTroops: 1000 })
    const battle = opened(state, 'b', ['attacker'])
    finishBattle(state, battle)

    const record = state.history.at(-1)
    expect(record?.kind).toBe('attack')
    expect(record?.factionId).toBe('liubei')
    expect(record?.targetId).toBe('b')
    expect(record?.outcome).toContain('攻占 乙')
    expect(record?.battle?.siteName).toBe('乙')
  })

  it('固定种子下同一场战斗可复现', () => {
    const fight = () => {
      const state = scene({ attackerTroops: 12000, defenderTroops: 9000, seed: 91 })
      const battle = opened(state, 'b', ['attacker'])
      const result = finishBattle(state, battle)

      return {
        owner: siteOf(state, 'b').owner,
        troops: characterOf(state, 'attacker').troops,
        defender: characterOf(state, 'defender').status,
        randomState: state.randomState,
        outcome: result.ok ? result.record.outcome : result.reason,
      }
    }

    expect(fight()).toEqual(fight())
  })

  it('开发者模式可强制胜负，其余结算照常', () => {
    const state = scene({ attackerTroops: 1000, defenderTroops: 50000 })
    const battle = opened(state, 'b', ['attacker'])
    const result = finishBattle(state, battle, 'win')

    expect(result.ok).toBe(true)
    expect(siteOf(state, 'b').owner).toBe('liubei')
    expect(characterOf(state, 'attacker').troops).toBeLessThan(1000)
  })
})

describe('驻将', () => {
  it('某点的驻将可由标识查得，无人驻守时为 null', () => {
    const state = scene()

    expect(stationedAt(state, 'b')?.name).toBe('守将')
    expect(stationedAt(state, 'a')).toBeNull()
    expect(stationedAt(state, 'f')).toBeNull()
  })
})

/** 只取失败原因，方便逐条比对。 */
function attackOutcome(
  state: GameState,
  target: string,
  ids: string[] = ['attacker'],
): { ok: true } | { ok: false; reason: string } {
  const result = openAttack(state, target, autoDeployment(ids), state.playerFaction, {
    autoDefender: false,
  })

  return result.ok ? { ok: true } : { ok: false, reason: result.reason }
}
