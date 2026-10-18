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

  it('合肥属曹操、建业与京口属孙权，两地由孙权所据的濡须口关隘串起而非直连', () => {
    const hefei = GEOGRAPHY_NEW.sites.find((site) => site.id === 'hefei')
    const jingkou = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jingkou')
    const jianye = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jianye')
    const ruxukou = GEOGRAPHY_NEW.sites.find((site) => site.id === 'ruxukou')

    expect(hefei?.owner).toBe('caocao')
    expect(jingkou?.owner).toBe('sunquan')
    expect(jianye?.owner).toBe('sunquan')
    expect(ruxukou?.type).toBe('pass')
    expect(ruxukou?.population).toBe(20000)
    expect(ruxukou?.owner).toBe('sunquan')

    expect(hefei?.neighbors).toEqual(['ruxukou'])
    expect(ruxukou?.neighbors).toEqual(['hefei', 'jianye'])
    expect(jianye?.neighbors).toEqual(['jingkou', 'ruxukou'])
    expect(jingkou?.neighbors).toEqual(['jianye'])
  })

  it('关中的槐里归马腾、长安与潼关归曹操，潼关东通洛阳入中原', () => {
    const huaili = GEOGRAPHY_NEW.sites.find((site) => site.id === 'huaili')
    const changan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'changan')
    const tongguan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'tongguan')

    expect(huaili?.owner).toBe('mateng')
    expect(changan?.owner).toBe('caocao')
    expect(tongguan?.owner).toBe('caocao')
    expect(huaili?.neighbors).toEqual(['changan'])
    expect(changan?.neighbors).toEqual(['huaili', 'tongguan'])
    expect(tongguan?.neighbors).toEqual(['changan', 'luoyang'])

    const sili = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'sili')
    expect(sili?.owner).toBe('caocao')
  })

  it('中原与河北的洛阳、虎牢关、陈留、许都与邺尽归曹操，袁氏一家撤去', () => {
    const luoyang = GEOGRAPHY_NEW.sites.find((site) => site.id === 'luoyang')
    const hulao = GEOGRAPHY_NEW.sites.find((site) => site.id === 'hulao')
    const chenliu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chenliu')
    const xudu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'xudu')
    const ye = GEOGRAPHY_NEW.sites.find((site) => site.id === 'ye')

    expect(luoyang?.owner).toBe('caocao')
    expect(hulao?.owner).toBe('caocao')
    expect(chenliu?.owner).toBe('caocao')
    expect(xudu?.owner).toBe('caocao')
    expect(ye?.owner).toBe('caocao')

    expect(luoyang?.type).toBe('town')
    expect(hulao?.type).toBe('pass')
    expect(xudu?.type).toBe('metropolis')
    expect(ye?.type).toBe('metropolis')

    // 洛阳—虎牢关—许都/陈留串成中原一线，邺经陈留南下。
    expect(luoyang?.neighbors).toEqual(['hulao', 'tongguan'])
    expect(hulao?.neighbors).toEqual(['luoyang', 'xudu', 'chenliu'])
    expect(chenliu?.neighbors).toEqual(['xudu', 'hulao', 'ye'])
    expect(xudu?.neighbors).toEqual(['chenliu', 'hulao'])
    expect(ye?.neighbors).toEqual(['chenliu'])

    // 冀、兖、豫三州随点归曹操。
    for (const provinceId of ['ji', 'yan', 'yu']) {
      expect(
        GEOGRAPHY_NEW.provinces.find((province) => province.id === provinceId)?.owner,
        `${provinceId} 应归曹操`,
      ).toBe('caocao')
    }

    // 袁氏已撤出新图。
    expect(FACTION_IDS_NEW).not.toContain('yuanshi')
  })

  it('南郑与阳平关归张鲁，葭萌关是汉中南入益州的关口', () => {
    const nanzheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'nanzheng')
    const yangpingguan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'yangpingguan')
    const jiamengguan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jiamengguan')
    const dingjunshan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'dingjunshan')

    expect(nanzheng?.owner).toBe('zhanglu')
    expect(yangpingguan?.owner).toBe('zhanglu')
    expect(jiamengguan?.owner).toBe('liuzhang')
    expect(nanzheng?.neighbors).toEqual(['dingjunshan', 'yangpingguan'])
    expect(yangpingguan?.neighbors).toEqual(['jiamengguan', 'nanzheng'])
    expect(jiamengguan?.neighbors).toEqual(['yangpingguan', 'dingjunshan', 'fucheng'])

    // 定军山在汉中腹地，是无归属的野地；阳平关险不可拔，定军山则通南缘的葭萌关，是绕开关隘、北上取汉中的一路。
    expect(dingjunshan?.type).toBe('field')
    expect(dingjunshan?.owner).toBeNull()
    expect(dingjunshan?.neighbors).toEqual(['nanzheng', 'jiamengguan'])

    const liang = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'liang')
    expect(liang?.owner).toBe('zhanglu')

    const atNanzheng = CHARACTERS_NEW.filter((character) => character.stationedSiteId === 'nanzheng')
    const atYangpingguan = CHARACTERS_NEW.find(
      (character) => character.stationedSiteId === 'yangpingguan',
    )
    expect(atNanzheng.map((character) => character.name).sort()).toEqual(['张鲁', '阎圃'].sort())
    expect(atYangpingguan?.name).toBe('张卫')
  })

  it('涪城、绵竹、雒城与成都归刘璋，涪城—绵竹—雒城—成都串成一线，各置守将', () => {
    const fucheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'fucheng')
    const mianzhu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'mianzhu')
    const luocheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'luocheng')
    const chengdu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chengdu')

    expect(chengdu?.type).toBe('metropolis')
    expect(mianzhu?.type).toBe('city')
    expect(fucheng?.owner).toBe('liuzhang')
    expect(mianzhu?.owner).toBe('liuzhang')
    expect(luocheng?.owner).toBe('liuzhang')
    expect(chengdu?.owner).toBe('liuzhang')

    // 绵竹当涪城与雒城之间的大道；成都—绵竹因雒城落于两点直径圆内，为强制边。
    expect(fucheng?.neighbors).toEqual(['mianzhu', 'luocheng', 'jiamengguan', 'jiangzhou'])
    expect(mianzhu?.neighbors).toEqual(['luocheng', 'fucheng', 'chengdu'])
    expect(luocheng?.neighbors).toEqual(['chengdu', 'mianzhu', 'fucheng', 'jiangzhou'])
    expect(chengdu?.neighbors).toEqual(['luocheng', 'mianzhu'])

    const yi = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'yi')
    expect(yi?.owner).toBe('liuzhang')

    const stationedNames = (siteId: string) =>
      CHARACTERS_NEW.filter((character) => character.stationedSiteId === siteId).map(
        (character) => character.name,
      )
    expect(stationedNames('fucheng').sort()).toEqual(['杨怀', '高沛'].sort())
    expect(stationedNames('mianzhu').sort()).toEqual(['费观', '李严', '董和'].sort())
    expect(stationedNames('luocheng').sort()).toEqual(['刘循', '张任', '吴懿', '吴兰', '雷铜'].sort())
    expect(stationedNames('chengdu').sort()).toEqual(['刘璋', '黄权', '刘巴'].sort())

    // 刘璋此前无主，如今据成都立为益州之主。
    const liuzhang = CHARACTERS_NEW.find((character) => character.id === 'liuzhang')
    expect(liuzhang?.isMonarch).toBe(true)
    expect(liuzhang?.factionId).toBe('liuzhang')
  })

  it('江州与白帝城归刘璋，涪城—江州—白帝城—夷陵串成入蜀门户', () => {
    const fucheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'fucheng')
    const jiangzhou = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jiangzhou')
    const baidicheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'baidicheng')
    const yiling = GEOGRAPHY_NEW.sites.find((site) => site.id === 'yiling')

    expect(jiangzhou?.owner).toBe('liuzhang')
    expect(baidicheng?.owner).toBe('liuzhang')
    expect(jiangzhou?.neighbors).toEqual(['luocheng', 'fucheng', 'baidicheng'])
    expect(baidicheng?.neighbors).toEqual(['yiling', 'jiangzhou'])
    expect(yiling?.neighbors).toContain('baidicheng')

    // 与涪城—江州重复的成都—江州走廊、横断巴山的白帝城—南郑，暂不相通
    const chengdu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chengdu')
    const luocheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'luocheng')
    const nanzheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'nanzheng')
    expect(fucheng?.neighbors).toContain('jiangzhou')
    expect(luocheng?.neighbors).toContain('jiangzhou')
    expect(chengdu?.neighbors).not.toContain('jiangzhou')
    expect(nanzheng?.neighbors).not.toContain('baidicheng')

    const stationed = CHARACTERS_NEW.filter((character) =>
      ['jiangzhou', 'baidicheng'].includes(character.stationedSiteId ?? ''),
    )
    expect(stationed.map((character) => character.name).sort()).toEqual(
      ['严颜'].sort(),
    )
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
