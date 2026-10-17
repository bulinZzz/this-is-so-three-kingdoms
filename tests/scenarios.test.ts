import { describe, expect, it } from 'vitest'
import { validateCharacters } from '../src/core/characters'
import { createInitialState } from '../src/core/createInitialState'
import { validateGeography } from '../src/core/geography'
import { troopLimit } from '../src/core/military'
import { SCENARIOS, SANGUO_208, SANGUO_208_NEW, SANGUO_ACCEPTANCE } from '../src/core/scenarios'
import { endTurn } from '../src/core/turn'

const FACTION_IDS = SANGUO_ACCEPTANCE.factions.map((faction) => faction.id)
const GEOGRAPHY = SANGUO_ACCEPTANCE.geography ?? { provinces: [], sites: [] }
const CHARACTERS = SANGUO_ACCEPTANCE.characters ?? []

describe('验收开局', () => {
  it('地理与人物数据自洽', () => {
    expect(validateGeography(GEOGRAPHY, FACTION_IDS)).toEqual([])
    expect(validateCharacters(CHARACTERS, FACTION_IDS, GEOGRAPHY)).toEqual([])
  })

  it('规模缩小：三家势力、两个州、十个战略点', () => {
    expect(SANGUO_ACCEPTANCE.factions).toHaveLength(3)
    expect(GEOGRAPHY.provinces).toHaveLength(2)
    expect(GEOGRAPHY.sites).toHaveLength(10)
  })

  it('每家势力各有且只有一名君主', () => {
    for (const factionId of FACTION_IDS) {
      const monarchs = CHARACTERS.filter(
        (character) => character.factionId === factionId && character.isMonarch,
      )

      expect(monarchs).toHaveLength(1)
    }
  })

  it('有可供寻访的在野人才', () => {
    const wild = CHARACTERS.filter((character) => character.status === 'wild')

    expect(wild.length).toBeGreaterThan(0)
    expect(wild.every((character) => character.tier !== null)).toBe(true)
  })
})

describe('建安十三年（新）', () => {
  const GEOGRAPHY_NEW = SANGUO_208_NEW.geography ?? { provinces: [], sites: [] }
  const CHARACTERS_NEW = SANGUO_208_NEW.characters ?? []
  const FACTION_IDS_NEW = SANGUO_208_NEW.factions.map((faction) => faction.id)

  it('地理与人物数据自洽', () => {
    expect(validateGeography(GEOGRAPHY_NEW, FACTION_IDS_NEW)).toEqual([])
    expect(validateCharacters(CHARACTERS_NEW, FACTION_IDS_NEW, GEOGRAPHY_NEW)).toEqual([])
  })

  it('野地无归属，不入任何势力的版图', () => {
    const fields = GEOGRAPHY_NEW.sites.filter((site) => site.type === 'field')

    expect(fields.length).toBeGreaterThan(0)
    expect(fields.every((site) => site.owner === null)).toBe(true)
  })

  it('荆南四郡自成一家的「荆南」，与曹操无涉', () => {
    const counties = ['wuling', 'changsha', 'lingling', 'guiyang']

    for (const id of counties) {
      const site = GEOGRAPHY_NEW.sites.find((item) => item.id === id)

      expect(site?.owner, `${id} 应归荆南`).toBe('jingnan')
    }

    const jing = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'jing')
    expect(jing?.owner).toBe('jingnan')
  })

  it('公安进出荆南不止武陵一处，武陵不再独占门户', () => {
    const gongan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'gongan')
    const jingnanGates = (gongan?.neighbors ?? []).filter(
      (neighborId) =>
        GEOGRAPHY_NEW.sites.find((site) => site.id === neighborId)?.owner === 'jingnan',
    )

    expect(jingnanGates).toEqual(['wuling', 'changsha'])
  })

  it('赤壁是无主野地，连通江陵、公安、长沙、柴桑四家', () => {
    const chibi = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chibi')

    expect(chibi?.type).toBe('field')
    expect(chibi?.owner).toBeNull()
    expect(chibi?.neighbors).toEqual(['gongan', 'jiangling', 'chaisang', 'changsha'])
  })

  it('柴桑属孙权，扬州随之归孙权', () => {
    const chaisang = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chaisang')
    expect(chaisang?.owner).toBe('sunquan')

    const yang = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'yang')
    expect(yang?.owner).toBe('sunquan')
  })

  it('合肥属曹操、京口与建业属孙权，两地由无主的濡须口串起而非直连', () => {
    const hefei = GEOGRAPHY_NEW.sites.find((site) => site.id === 'hefei')
    const jingkou = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jingkou')
    const jianye = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jianye')
    const ruxukou = GEOGRAPHY_NEW.sites.find((site) => site.id === 'ruxukou')

    expect(hefei?.owner).toBe('caocao')
    expect(jingkou?.owner).toBe('sunquan')
    expect(jianye?.owner).toBe('sunquan')
    expect(ruxukou?.type).toBe('field')
    expect(ruxukou?.owner).toBeNull()

    expect(hefei?.neighbors).toEqual(['ruxukou'])
    expect(ruxukou?.neighbors).toEqual(['hefei', 'jianye'])
    expect(jianye?.neighbors).toEqual(['jingkou', 'ruxukou'])
    expect(jingkou?.neighbors).toEqual(['jianye'])
  })

  it('关中的槐里归马腾、长安与潼关归曹操，三点自成一隅', () => {
    const huaili = GEOGRAPHY_NEW.sites.find((site) => site.id === 'huaili')
    const changan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'changan')
    const tongguan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'tongguan')

    expect(huaili?.owner).toBe('mateng')
    expect(changan?.owner).toBe('caocao')
    expect(tongguan?.owner).toBe('caocao')
    expect(huaili?.neighbors).toEqual(['changan'])
    expect(changan?.neighbors).toEqual(['huaili', 'tongguan'])
    expect(tongguan?.neighbors).toEqual(['changan'])

    const sili = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'sili')
    expect(sili?.owner).toBe('caocao')
  })

  it('南郑与阳平关归张鲁、葭萌关归刘璋，三点自成一隅', () => {
    const nanzheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'nanzheng')
    const yangpingguan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'yangpingguan')
    const jiamengguan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jiamengguan')

    expect(nanzheng?.owner).toBe('zhanglu')
    expect(yangpingguan?.owner).toBe('zhanglu')
    expect(jiamengguan?.owner).toBe('liuzhang')
    expect(nanzheng?.neighbors).toEqual(['yangpingguan'])
    expect(yangpingguan?.neighbors).toEqual(['jiamengguan', 'nanzheng'])
    expect(jiamengguan?.neighbors).toEqual(['yangpingguan'])

    const liang = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'liang')
    const yi = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'yi')
    expect(liang?.owner).toBe('zhanglu')
    expect(yi?.owner).toBe('liuzhang')

    const atNanzheng = CHARACTERS_NEW.find((character) => character.stationedSiteId === 'nanzheng')
    const atYangpingguan = CHARACTERS_NEW.find(
      (character) => character.stationedSiteId === 'yangpingguan',
    )
    expect(atNanzheng?.name).toBe('张鲁')
    expect(atYangpingguan?.name).toBe('张卫')
  })

  it('每位在仕武将的兵力不超过带兵上限', () => {
    const serving = CHARACTERS_NEW.filter((character) => character.status === 'serving')

    for (const character of serving) {
      expect(character.troops, `${character.name} 兵力超限`).toBeLessThanOrEqual(troopLimit(character))
    }
  })

  it('刘备取荆南时北军不会来援：曹操与荆南既非敌对，也不与荆南相邻', () => {
    const hostile = (SANGUO_208_NEW.relations ?? []).some(
      (relation) =>
        relation.kind === 'hostile' &&
        relation.factions.includes('caocao') &&
        relation.factions.includes('jingnan'),
    )
    expect(hostile).toBe(false)

    const caocaoSites = GEOGRAPHY_NEW.sites
      .filter((site) => site.owner === 'caocao')
      .flatMap((site) => site.neighbors)
    const bordersJingnan = caocaoSites.some(
      (neighborId) =>
        GEOGRAPHY_NEW.sites.find((site) => site.id === neighborId)?.owner === 'jingnan',
    )
    expect(bordersJingnan).toBe(false)
  })

  it('开局无战事：不设敌对关系，首季走完他方行动也不至覆灭', () => {
    expect((SANGUO_208_NEW.relations ?? []).every((relation) => relation.kind !== 'hostile')).toBe(true)

    const state = createInitialState({ scenario: SANGUO_208_NEW, seed: 208 })
    endTurn(state)

    expect(state.outcome).toBe('ongoing')
  })
})

describe('剧本清单', () => {
  it('包含正式剧本与验收开局，标识唯一', () => {
    const ids = SCENARIOS.map((scenario) => scenario.id)

    expect(ids).toContain(SANGUO_208.id)
    expect(ids).toContain(SANGUO_ACCEPTANCE.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
