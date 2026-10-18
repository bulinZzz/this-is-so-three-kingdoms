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

    // 曹操据江陵、襄阳、樊城、宛与夷陵五点，多于荆南四郡，荆州归曹操。
    const jing = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'jing')
    expect(jing?.owner).toBe('caocao')
  })

  it('公安进出荆南不止武陵一处，武陵不再独占门户', () => {
    const gongan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'gongan')
    const jingnanGates = (gongan?.neighbors ?? []).filter(
      (neighborId) =>
        GEOGRAPHY_NEW.sites.find((site) => site.id === neighborId)?.owner === 'jingnan',
    )

    expect(jingnanGates).toEqual(['wuling', 'changsha'])
  })

  it('赤壁是无主野地，连通江陵、公安、长沙、柴桑四家，江北的江夏又与之相接', () => {
    const chibi = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chibi')

    expect(chibi?.type).toBe('field')
    expect(chibi?.owner).toBeNull()
    expect(chibi?.neighbors).toEqual(['jiangxia', 'gongan', 'jiangling', 'chaisang', 'changsha'])
  })

  it('樊城与襄阳隔汉水相望，宛在北为二城北上中原的门户', () => {
    const fancheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'fancheng')
    const xiangyang = GEOGRAPHY_NEW.sites.find((site) => site.id === 'xiangyang')
    const wancheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'wancheng')

    expect(fancheng?.type).toBe('city')
    expect(fancheng?.owner).toBe('caocao')
    expect(fancheng?.neighbors).toEqual(['xiangyang', 'wancheng'])
    expect(xiangyang?.neighbors).toEqual(['fancheng', 'yiling', 'jiangling'])

    // 宛为南阳郡治，南接樊城，北通洛阳与许都，中原与荆州由是相通。
    expect(wancheng?.type).toBe('metropolis')
    expect(wancheng?.owner).toBe('caocao')
    expect(wancheng?.neighbors).toEqual(['fancheng', 'xudu', 'luoyang'])

    const atFancheng = CHARACTERS_NEW.filter((character) => character.stationedSiteId === 'fancheng')
    expect(atFancheng.map((character) => character.name)).toEqual(['满宠'])
  })

  it('柴桑属孙权，扬州随之归孙权', () => {
    const chaisang = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chaisang')
    expect(chaisang?.owner).toBe('sunquan')

    const yang = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'yang')
    expect(yang?.owner).toBe('sunquan')
  })

  it('江夏是长江中游的无主据点，东接柴桑、西临赤壁', () => {
    const jiangxia = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jiangxia')

    expect(jiangxia?.type).toBe('city')
    expect(jiangxia?.owner).toBeNull()
    expect(jiangxia?.neighbors).toEqual(['chibi', 'chaisang'])

    // 柴桑由是与江夏相接，江陵则只通公安、夷陵、赤壁与襄阳（赤壁一线的两侧另见上）。
    const chaisang = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chaisang')
    const jiangling = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jiangling')
    expect(chaisang?.neighbors).toEqual(['jiangxia', 'chibi'])
    expect(jiangling?.neighbors).toEqual(['gongan', 'yiling', 'chibi', 'xiangyang'])
  })

  it('金城在陇右归马腾、由韩遂驻守，只通关中的槐里；马腾与韩遂合为一家', () => {
    const jincheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jincheng')

    expect(jincheng?.type).toBe('city')
    expect(jincheng?.owner).toBe('mateng')
    expect(jincheng?.population).toBe(80000)
    expect(jincheng?.provinceId).toBe('liang')
    expect(jincheng?.neighbors).toEqual(['huaili'])

    // 新版图不再另立韩遂一家：韩遂归马腾麾下、驻金城，马腾仍是这一家唯一的君主。
    expect(FACTION_IDS_NEW).not.toContain('hansui')
    const hansui = CHARACTERS_NEW.find((character) => character.id === 'hansui')
    expect(hansui?.factionId).toBe('mateng')
    expect(hansui?.stationedSiteId).toBe('jincheng')
    expect(hansui?.isMonarch).toBe(false)

    const matengMonarchs = CHARACTERS_NEW.filter(
      (character) => character.factionId === 'mateng' && character.isMonarch,
    )
    expect(matengMonarchs.map((character) => character.name)).toEqual(['马腾'])
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

    expect(hefei?.neighbors).toEqual(['ruxukou', 'shouchun'])
    expect(ruxukou?.neighbors).toEqual(['hefei', 'jianye'])
    expect(jianye?.neighbors).toEqual(['jingkou', 'ruxukou'])
    // 京口除与建业相连外，隔江又有广陵一处渡口（见下）。
    expect(jingkou?.neighbors).toEqual(['guangling', 'jianye'])
  })

  it('淮南的寿春与广陵皆归曹操，寿春只通广陵，广陵隔江连京口', () => {
    const shouchun = GEOGRAPHY_NEW.sites.find((site) => site.id === 'shouchun')
    const guangling = GEOGRAPHY_NEW.sites.find((site) => site.id === 'guangling')

    expect(shouchun?.type).toBe('city')
    expect(shouchun?.owner).toBe('caocao')
    expect(shouchun?.neighbors).toEqual(['hefei', 'guangling'])

    // 广陵在江北、隔江与京口相望，是江东出入江北的渡口，眼下只连寿春与京口。
    expect(guangling?.type).toBe('city')
    expect(guangling?.owner).toBe('caocao')
    expect(guangling?.neighbors).toEqual(['jingkou', 'shouchun'])

    // 广陵落在徐州界内，归曹操后徐州暂由曹操所据。
    const xu = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'xu')
    expect(xu?.owner).toBe('caocao')
  })

  it('关中的槐里归马腾、长安与潼关归曹操，潼关东通洛阳入中原', () => {
    const huaili = GEOGRAPHY_NEW.sites.find((site) => site.id === 'huaili')
    const changan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'changan')
    const tongguan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'tongguan')

    expect(huaili?.owner).toBe('mateng')
    expect(changan?.owner).toBe('caocao')
    expect(tongguan?.owner).toBe('caocao')
    // 槐里东接长安，又西通陇右的金城（见下）。
    expect(huaili?.neighbors).toEqual(['changan', 'jincheng'])
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
    expect(luoyang?.neighbors).toEqual(['hulao', 'wancheng', 'tongguan'])
    expect(hulao?.neighbors).toEqual(['luoyang', 'xudu', 'chenliu'])
    expect(chenliu?.neighbors).toEqual(['xudu', 'hulao', 'ye'])
    expect(xudu?.neighbors).toEqual(['chenliu', 'hulao', 'wancheng'])
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
    expect(nanzheng?.neighbors).toEqual(['dingjunshan', 'yangpingguan', 'shangyong'])
    expect(yangpingguan?.neighbors).toEqual(['jiamengguan', 'nanzheng'])
    expect(jiamengguan?.neighbors).toEqual(['yangpingguan', 'dingjunshan', 'fucheng'])

    // 上庸是汉中郡东三县之一，随汉中归张鲁；当汉水上游，东经秭归入巴东、西接南郑，不直通襄阳、也不接白帝城与关中。
    const shangyong = GEOGRAPHY_NEW.sites.find((site) => site.id === 'shangyong')
    expect(shangyong?.type).toBe('town')
    expect(shangyong?.owner).toBe('zhanglu')
    expect(shangyong?.neighbors).toEqual(['zigui', 'nanzheng'])
    expect(shangyong?.neighbors).not.toContain('xiangyang')
    expect(shangyong?.neighbors).not.toContain('baidicheng')
    expect(shangyong?.neighbors).not.toContain('changan')
    expect(shangyong?.neighbors).not.toContain('tongguan')

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

  it('江州与白帝城归刘璋，涪城—江州—白帝城—秭归—夷陵串成入蜀门户', () => {
    const fucheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'fucheng')
    const jiangzhou = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jiangzhou')
    const baidicheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'baidicheng')
    const zigui = GEOGRAPHY_NEW.sites.find((site) => site.id === 'zigui')
    const yiling = GEOGRAPHY_NEW.sites.find((site) => site.id === 'yiling')

    expect(jiangzhou?.owner).toBe('liuzhang')
    expect(baidicheng?.owner).toBe('liuzhang')
    expect(jiangzhou?.neighbors).toEqual(['luocheng', 'fucheng', 'baidicheng'])
    expect(baidicheng?.neighbors).toEqual(['zigui', 'jiangzhou'])

    // 秭归当巫峡之口，是无归属的县城，夹在夷陵与白帝城之间；夷陵不再直通白帝城。
    expect(zigui?.type).toBe('town')
    expect(zigui?.owner).toBeNull()
    expect(zigui?.neighbors).toEqual(['yiling', 'baidicheng', 'shangyong'])
    // 夷陵是曹操在荆州的前哨小城，由曹洪驻守；与武陵不通，曹操不与荆南贴邻。
    expect(yiling?.type).toBe('town')
    expect(yiling?.owner).toBe('caocao')
    expect(yiling?.neighbors).toContain('zigui')
    expect(yiling?.neighbors).not.toContain('baidicheng')
    expect(yiling?.neighbors).not.toContain('wuling')

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
