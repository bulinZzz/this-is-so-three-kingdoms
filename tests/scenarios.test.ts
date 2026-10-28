import { describe, expect, it } from 'vitest'
import { validateCharacters } from '../src/core/characters'
import { createInitialState } from '../src/core/createInitialState'
import { validateGeography } from '../src/core/geography'
import { troopLimit } from '../src/core/military'
import { SCENARIOS, SANGUO_208, SANGUO_ACCEPTANCE } from '../src/core/scenarios'
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

  it('全部战略点互达，赤壁与长坂坡不孤悬图外', () => {
    const reached = new Set<string>(['jiangxia'])
    const queue = ['jiangxia']

    while (queue.length > 0) {
      const id = queue.shift()
      if (id === undefined) {
        break
      }

      const site = GEOGRAPHY.sites.find((item) => item.id === id)
      for (const neighborId of site?.neighbors ?? []) {
        if (!reached.has(neighborId)) {
          reached.add(neighborId)
          queue.push(neighborId)
        }
      }
    }

    expect(reached.size).toBe(GEOGRAPHY.sites.length)
    expect(reached).toContain('chibi')
    expect(reached).toContain('changbanpo')
  })

  it('江夏与长沙不直连，长坂坡通襄阳', () => {
    const neighborhood = (id: string) => GEOGRAPHY.sites.find((item) => item.id === id)?.neighbors ?? []

    expect(neighborhood('jiangxia')).not.toContain('changsha')
    expect(neighborhood('changsha')).not.toContain('jiangxia')
    expect(neighborhood('changbanpo')).toContain('xiangyang')
    expect(neighborhood('xiangyang')).toContain('changbanpo')
  })
})

describe('建安十三年', () => {
  const GEOGRAPHY_NEW = SANGUO_208.geography ?? { provinces: [], sites: [] }
  const CHARACTERS_NEW = SANGUO_208.characters ?? []
  const FACTION_IDS_NEW = SANGUO_208.factions.map((faction) => faction.id)

  it('地理与人物数据自洽', () => {
    expect(validateGeography(GEOGRAPHY_NEW, FACTION_IDS_NEW)).toEqual([])
    expect(validateCharacters(CHARACTERS_NEW, FACTION_IDS_NEW, GEOGRAPHY_NEW)).toEqual([])
  })

  it('野地同样有归属，但不计入州归属的计数', () => {
    const fields = GEOGRAPHY_NEW.sites.filter((site) => site.type === 'field')

    expect(fields.length).toBeGreaterThan(0)
    expect(fields.every((site) => site.owner !== null)).toBe(true)

    // 野地人烟为零、不作据点，州归属只按城池与关隘计。
    const geography = createInitialState({ scenario: SANGUO_208, seed: 208 }).geography
    for (const province of geography.provinces) {
      const owned = geography.sites.filter(
        (site) => site.provinceId === province.id && site.owner !== null && site.type !== 'field',
      )
      if (owned.length === 0) {
        expect(province.owner).toBeNull()
      }
    }
  })

  it('荆南四郡自成一家的「荆南」，与曹操无涉', () => {
    const counties = ['wuling', 'changsha', 'lingling', 'guiyang']

    for (const id of counties) {
      const site = GEOGRAPHY_NEW.sites.find((item) => item.id === id)

      expect(site?.owner, `${id} 应归荆南`).toBe('jingnan')
    }

    // 零陵与桂阳是荆南四郡中的两座小城，零陵人烟较盛、桂阳次之。
    for (const id of ['lingling', 'guiyang']) {
      const site = GEOGRAPHY_NEW.sites.find((item) => item.id === id)

      expect(site?.type, `${id} 应为小城`).toBe('town')
    }
    expect(GEOGRAPHY_NEW.sites.find((item) => item.id === 'lingling')?.population).toBe(60000)
    expect(GEOGRAPHY_NEW.sites.find((item) => item.id === 'guiyang')?.population).toBe(50000)

    // 曹操据江陵、襄阳、樊城、宛、夷陵与秭归六点，多于荆南四郡，荆州归曹操。
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

  it('赤壁是孙权名下的野地，连通江陵、公安、长沙、柴桑四家，江北的江夏又与之相接', () => {
    const chibi = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chibi')

    expect(chibi?.type).toBe('field')
    expect(chibi?.owner).toBe('sunquan')
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

    // 宛城为南阳郡治，南接樊城，北通洛阳与许都，中原与荆州由是相通；作大城而人口十四万。
    expect(wancheng?.type).toBe('city')
    expect(wancheng?.population).toBe(140000)
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

  it('江夏属刘备，是长江中游的据点，东接柴桑、西临赤壁', () => {
    const jiangxia = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jiangxia')

    expect(jiangxia?.type).toBe('town')
    expect(jiangxia?.population).toBe(80000)
    expect(jiangxia?.owner).toBe('liubei')
    expect(jiangxia?.neighbors).toEqual(['chibi', 'chaisang'])

    // 江夏与柴桑同在长江一线；江陵则只通公安、夷陵、赤壁与襄阳（赤壁一线的两侧另见上）。
    const chaisang = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chaisang')
    const jiangling = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jiangling')
    expect(chaisang?.neighbors).toEqual(['wanxian', 'jiangxia', 'chibi', 'jianye'])
    expect(jiangling?.neighbors).toEqual(['gongan', 'yiling', 'chibi', 'xiangyang'])

    // 江夏在江北、皖城在庐江，中隔大别山，两地不直连。
    expect(jiangxia?.neighbors).not.toContain('wanxian')
  })

  it('吴是吴郡治吴县、归孙权，北连京口、南接会稽', () => {
    const wu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'wu')
    const jianye = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jianye')

    expect(wu?.name).toBe('吴')
    expect(wu?.type).toBe('city')
    expect(wu?.population).toBe(100000)
    expect(wu?.provinceId).toBe('yang')
    expect(wu?.owner).toBe('sunquan')
    expect(wu?.neighbors).toEqual(['jingkou', 'kuaiji'])

    // 吴在江东腹地，与建业并不直连。
    expect(jianye?.neighbors).not.toContain('wu')
  })

  it('会稽是江东最南的一郡、归孙权，北连吴、南出东冶通番禺', () => {
    const kuaiji = GEOGRAPHY_NEW.sites.find((site) => site.id === 'kuaiji')

    expect(kuaiji?.name).toBe('会稽')
    expect(kuaiji?.type).toBe('city')
    expect(kuaiji?.population).toBe(90000)
    expect(kuaiji?.provinceId).toBe('yang')
    expect(kuaiji?.owner).toBe('sunquan')
    // 会稽郡治山阴在吴之南，北只通吴；南下交州须经东冶转海路，与番禺并不直连。
    expect(kuaiji?.neighbors).toEqual(['wu', 'dongye'])
  })

  it('东冶是会稽郡南端的海港、归孙权，北连会稽、海路南下番禺', () => {
    const dongye = GEOGRAPHY_NEW.sites.find((site) => site.id === 'dongye')
    const kuaiji = GEOGRAPHY_NEW.sites.find((site) => site.id === 'kuaiji')

    expect(dongye?.name).toBe('东冶')
    expect(dongye?.type).toBe('town')
    expect(dongye?.population).toBe(20000)
    expect(dongye?.provinceId).toBe('yang')
    expect(dongye?.owner).toBe('sunquan')
    expect(dongye?.neighbors).toEqual(['kuaiji', 'panyu'])

    // 会稽与番禺之间隔着千里海路，须在东冶转接。
    expect(kuaiji?.neighbors).not.toContain('panyu')
  })

  it('金城在陇右归马腾、由韩遂驻守，东出天水、西接河湟的西平关；马腾与韩遂合为一家', () => {
    const jincheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jincheng')

    expect(jincheng?.type).toBe('city')
    expect(jincheng?.owner).toBe('mateng')
    expect(jincheng?.population).toBe(40000)
    expect(jincheng?.provinceId).toBe('liang')
    expect(jincheng?.neighbors).toEqual(['xipingguan', 'tianshui'])

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

  it('陇右自金城经天水、祁山连成一线，天水归马腾，东出关中须经街亭', () => {
    const tianshui = GEOGRAPHY_NEW.sites.find((site) => site.id === 'tianshui')
    const qishan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'qishan')
    const jieting = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jieting')

    expect(tianshui?.name).toBe('天水')
    expect(tianshui?.type).toBe('city')
    expect(tianshui?.population).toBe(50000)
    expect(tianshui?.provinceId).toBe('liang')
    expect(tianshui?.owner).toBe('mateng')

    // 天水郡治冀县，东连金城、南下祁山、北出街亭，是陇右一处十字路口。
    expect(tianshui?.neighbors).toEqual(['qishan', 'jieting', 'jincheng'])
    expect(qishan?.neighbors).toEqual(['wudu', 'tianshui'])
    expect(jieting?.neighbors).toEqual(['tianshui', 'chencang'])
    expect(tianshui?.neighbors).not.toContain('huaili')
    expect(tianshui?.neighbors).not.toContain('yangpingguan')

    // 南安、安定与冀县三座旧的无主郡城已撤出新图，陇右只余金城、天水与祁山。
    for (const removed of ['nanan', 'anding', 'jixian']) {
      expect(GEOGRAPHY_NEW.sites.find((site) => site.id === removed)).toBeUndefined()
    }
  })

  it('街亭是马腾名下的野地，扼关中入陇右的唯一通路', () => {
    const jieting = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jieting')

    expect(jieting?.type).toBe('field')
    expect(jieting?.population).toBe(0)
    expect(jieting?.provinceId).toBe('liang')
    expect(jieting?.owner).toBe('mateng')
    // 街亭东接陈仓、西接天水，关中入陇右只此一路，槐里不再与街亭相通；作野地而不设驻将。
    expect(jieting?.neighbors).toEqual(['tianshui', 'chencang'])
    expect(jieting?.neighbors).not.toContain('huaili')
  })

  it('陈仓是关中西出的小城、归马腾，西接街亭、东接槐里、南下汉中经陈仓道抵阳平关', () => {
    const chencang = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chencang')

    expect(chencang?.type).toBe('town')
    expect(chencang?.population).toBe(25000)
    expect(chencang?.provinceId).toBe('sili')
    expect(chencang?.owner).toBe('mateng')
    expect(chencang?.neighbors).toEqual(['huaili', 'jieting', 'yangpingguan'])
  })

  it('五丈原已撤出新图，陈仓与槐里在渭水一线直通', () => {
    expect(GEOGRAPHY_NEW.sites.find((site) => site.id === 'wuzhangyuan')).toBeUndefined()

    const chencang = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chencang')
    const huaili = GEOGRAPHY_NEW.sites.find((site) => site.id === 'huaili')

    expect(chencang?.neighbors).toContain('huaili')
    expect(huaili?.neighbors).toContain('chencang')
  })

  it('西平关是湟水谷地归马腾的关隘，只与金城相通', () => {
    const xipingguan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'xipingguan')

    expect(xipingguan?.type).toBe('pass')
    expect(xipingguan?.population).toBe(10000)
    expect(xipingguan?.provinceId).toBe('liang')
    expect(xipingguan?.owner).toBe('mateng')
    expect(xipingguan?.neighbors).toEqual(['jincheng'])
  })

  it('祁山是张鲁名下的野地，北通天水、南下武都，是陇右入汉中的西路', () => {
    const qishan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'qishan')
    const yangpingguan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'yangpingguan')

    expect(qishan?.type).toBe('field')
    expect(qishan?.population).toBe(0)
    expect(qishan?.provinceId).toBe('liang')
    expect(qishan?.owner).toBe('zhanglu')
    expect(qishan?.neighbors).toEqual(['wudu', 'tianshui'])

    // 阳平关仍是张鲁的西面门户，西通武都、循祁山道入陇右，北经陈仓道入关中。
    expect(yangpingguan?.owner).toBe('zhanglu')
    expect(yangpingguan?.neighbors).toEqual(['jiamengguan', 'nanzheng', 'wudu', 'chencang'])
  })

  it('武都归张鲁，祁山道经武都入汉中，北接祁山、东接阳平关', () => {
    const wudu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'wudu')

    expect(wudu?.name).toBe('武都')
    expect(wudu?.type).toBe('city')
    expect(wudu?.population).toBe(40000)
    expect(wudu?.provinceId).toBe('liang')
    expect(wudu?.owner).toBe('zhanglu')
    // 武都郡治下辨，北接祁山、东接阳平关。
    expect(wudu?.neighbors).toEqual(['qishan', 'yangpingguan'])

    // 阴平已撤出新图，陇南只余武都一处郡城。
    expect(GEOGRAPHY_NEW.sites.find((site) => site.id === 'yinping')).toBeUndefined()
  })

  it('合肥属曹操、建业与京口属孙权，濡须扼合肥入江东的一路，柴桑沿江直下建业', () => {
    const hefei = GEOGRAPHY_NEW.sites.find((site) => site.id === 'hefei')
    const jingkou = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jingkou')
    const jianye = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jianye')
    const ruxu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'ruxu')

    expect(hefei?.owner).toBe('caocao')
    expect(jingkou?.owner).toBe('sunquan')
    expect(jianye?.owner).toBe('sunquan')
    expect(ruxu?.name).toBe('濡须')
    expect(ruxu?.type).toBe('pass')
    expect(ruxu?.population).toBe(20000)
    expect(ruxu?.owner).toBe('sunquan')

    // 合肥另有皖城一处直连（见下），南下江东则经濡须入建业。
    expect(hefei?.neighbors).toEqual(['ruxu', 'shouchun', 'wanxian'])
    expect(ruxu?.neighbors).toEqual(['hefei', 'jianye', 'wanxian'])
    // 柴桑与建业同在长江南岸，濡须落在两点直径圆内，沿江一路由强制边写入。
    expect(jianye?.neighbors).toEqual(['jingkou', 'ruxu', 'chaisang'])
    // 京口除与建业相连外，隔江又有广陵一处渡口、东面连着吴。
    expect(jingkou?.neighbors).toEqual(['guangling', 'jianye', 'wu'])
  })

  it('皖城是庐江郡治、归曹操，东接柴桑、北连合肥与濡须', () => {
    const wanxian = GEOGRAPHY_NEW.sites.find((site) => site.id === 'wanxian')

    expect(wanxian?.name).toBe('皖城')
    expect(wanxian?.type).toBe('city')
    expect(wanxian?.population).toBe(80000)
    expect(wanxian?.provinceId).toBe('yang')
    expect(wanxian?.owner).toBe('caocao')
    expect(wanxian?.neighbors).toEqual(['chaisang', 'hefei', 'ruxu'])

    // 石亭与东兴已撤出新图，合肥与柴桑不再经石亭相通。
    for (const removed of ['shiting', 'dongxing']) {
      expect(GEOGRAPHY_NEW.sites.find((site) => site.id === removed)).toBeUndefined()
    }
    expect(GEOGRAPHY_NEW.sites.find((site) => site.id === 'hefei')?.neighbors).not.toContain(
      'chaisang',
    )
  })

  it('牛渚已撤出新图，柴桑沿江直下建业，濡须亦由建业出入', () => {
    expect(GEOGRAPHY_NEW.sites.find((site) => site.id === 'niuzhu')).toBeUndefined()

    const jianye = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jianye')
    const chaisang = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chaisang')

    // 建业北接濡须、西接柴桑，中间不再隔一处牛渚。
    expect(jianye?.neighbors).toEqual(['jingkou', 'ruxu', 'chaisang'])
    expect(chaisang?.neighbors).toContain('jianye')
  })

  it('淮南的寿春与广陵皆归曹操，寿春南通合肥、北接谯、东经下邳通彭城与广陵，广陵隔江连京口', () => {
    const shouchun = GEOGRAPHY_NEW.sites.find((site) => site.id === 'shouchun')
    const guangling = GEOGRAPHY_NEW.sites.find((site) => site.id === 'guangling')

    expect(shouchun?.type).toBe('city')
    expect(shouchun?.owner).toBe('caocao')
    // 寿春北接谯、由谯北通许都，东面经下邳接彭城与广陵；合肥在寿春之南。
    expect(shouchun?.neighbors).toEqual(['hefei', 'xiapi', 'qiao', 'guangling'])

    // 广陵在江北、隔江与京口相望，是江东出入江北的渡口；作大城而人口七万。
    expect(guangling?.type).toBe('city')
    expect(guangling?.owner).toBe('caocao')
    // 广陵东隔江接京口，西经下邳通寿春；不直通建业。
    expect(guangling?.neighbors).toEqual(['jingkou', 'shouchun', 'xiapi'])

    // 广陵落在徐州界内，归曹操后徐州暂由曹操所据。
    const xu = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'xu')
    expect(xu?.owner).toBe('caocao')
  })

  it('彭城是徐州治所、归曹操，北接谯，南下经下邳而至淮南，中原东出徐州由此', () => {
    const pengcheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'pengcheng')

    expect(pengcheng?.name).toBe('彭城')
    expect(pengcheng?.type).toBe('city')
    expect(pengcheng?.population).toBe(90000)
    expect(pengcheng?.provinceId).toBe('xu')
    expect(pengcheng?.owner).toBe('caocao')
    // 彭城北接谯，南下只经下邳；谯扼其西北，许都与陈留皆不直通彭城，寿春与广陵由下邳隔开。
    expect(pengcheng?.neighbors).toEqual(['xiapi', 'qiao'])
    expect(pengcheng?.neighbors).not.toContain('xudu')
    expect(pengcheng?.neighbors).not.toContain('chenliu')
    expect(pengcheng?.neighbors).not.toContain('shouchun')
    expect(pengcheng?.neighbors).not.toContain('guangling')
  })

  it('下邳是徐州腹地的水陆枢纽、归曹操，北接彭城、南连寿春与广陵，徐州由是贯通', () => {
    const xiapi = GEOGRAPHY_NEW.sites.find((site) => site.id === 'xiapi')

    expect(xiapi?.name).toBe('下邳')
    expect(xiapi?.type).toBe('city')
    expect(xiapi?.population).toBe(90000)
    expect(xiapi?.provinceId).toBe('xu')
    expect(xiapi?.owner).toBe('caocao')
    // 下邳北接彭城，南下寿春、东通广陵；不直连谯，也不隔江直通建业。
    expect(xiapi?.neighbors).toEqual(['pengcheng', 'shouchun', 'guangling'])
    expect(xiapi?.neighbors).not.toContain('qiao')
    expect(xiapi?.neighbors).not.toContain('jianye')
  })

  it('关中的槐里与陈仓归马腾、长安与潼关归曹操，潼关东通洛阳入中原', () => {
    const huaili = GEOGRAPHY_NEW.sites.find((site) => site.id === 'huaili')
    const chencang = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chencang')
    const changan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'changan')
    const tongguan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'tongguan')

    expect(huaili?.owner).toBe('mateng')
    expect(chencang?.owner).toBe('mateng')
    expect(changan?.owner).toBe('caocao')
    expect(tongguan?.owner).toBe('caocao')
    // 槐里东接长安、西接陈仓；槐里与陈仓同归马腾，不再是无援的孤点。
    expect(huaili?.neighbors).toEqual(['changan', 'chencang'])
    expect(huaili?.neighbors).not.toContain('jieting')
    expect(changan?.neighbors).toEqual(['huaili', 'zhiwugu', 'tongguan'])
    expect(tongguan?.neighbors).toEqual(['changan', 'luoyang'])

    const sili = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'sili')
    expect(sili?.owner).toBe('caocao')
  })

  it('子午谷是曹操名下的野地，子午道由此穿秦岭而过', () => {
    const zhiwugu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'zhiwugu')

    expect(zhiwugu?.type).toBe('field')
    expect(zhiwugu?.population).toBe(0)
    expect(zhiwugu?.provinceId).toBe('sili')
    expect(zhiwugu?.owner).toBe('caocao')
    expect(zhiwugu?.neighbors).toEqual(['changan', 'nanzheng'])
    expect(zhiwugu?.neighbors).not.toContain('huaili')
    expect(zhiwugu?.neighbors).not.toContain('chencang')
    expect(zhiwugu?.neighbors).not.toContain('baidicheng')
  })

  it('襄平是辽东公孙康所据的大城，西经柳城、右北平抵蓟，东北出玄菟', () => {
    const xiangping = GEOGRAPHY_NEW.sites.find((site) => site.id === 'xiangping')
    const xuantu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'xuantu')
    const ye = GEOGRAPHY_NEW.sites.find((site) => site.id === 'ye')
    const guangling = GEOGRAPHY_NEW.sites.find((site) => site.id === 'guangling')

    expect(xiangping?.name).toBe('襄平')
    expect(xiangping?.type).toBe('city')
    expect(xiangping?.population).toBe(50000)
    expect(xiangping?.provinceId).toBe('you')
    expect(xiangping?.owner).toBe('gongsunkang')
    // 襄平西接柳城、东北接玄菟，海上再无去路。
    expect(xiangping?.neighbors).toEqual(['xuantu', 'liucheng'])
    expect(ye?.neighbors).not.toContain('xiangping')
    expect(guangling?.neighbors).not.toContain('xiangping')

    // 玄菟是襄平东北的郡治，同属公孙康，只与襄平相通。
    expect(xuantu?.name).toBe('玄菟')
    expect(xuantu?.type).toBe('city')
    expect(xuantu?.population).toBe(40000)
    expect(xuantu?.provinceId).toBe('you')
    expect(xuantu?.owner).toBe('gongsunkang')
    expect(xuantu?.neighbors).toEqual(['xiangping'])

    // 公孙康据襄平、玄菟、柳城与右北平四点，曹操只据州治蓟，幽州归公孙康。
    const you = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'you')
    expect(you?.owner).toBe('gongsunkang')
  })

  it('柳城与右北平是襄平到蓟之间的两处中转', () => {
    const liucheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'liucheng')
    const youbeiping = GEOGRAPHY_NEW.sites.find((site) => site.id === 'youbeiping')

    expect(liucheng?.name).toBe('柳城')
    expect(liucheng?.type).toBe('town')
    expect(liucheng?.population).toBe(15000)
    expect(liucheng?.provinceId).toBe('you')
    expect(liucheng?.owner).toBe('gongsunkang')
    expect(liucheng?.neighbors).toEqual(['youbeiping', 'xiangping'])

    expect(youbeiping?.name).toBe('右北平')
    expect(youbeiping?.type).toBe('town')
    expect(youbeiping?.population).toBe(15000)
    expect(youbeiping?.provinceId).toBe('you')
    expect(youbeiping?.owner).toBe('gongsunkang')
    expect(youbeiping?.neighbors).toEqual(['liucheng', 'jicheng'])

    // 东莱与襄平到广陵的海路已撤出新图，青州不再设点。
    expect(GEOGRAPHY_NEW.sites.find((site) => site.id === 'donglai')).toBeUndefined()
    const qing = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'qing')
    expect(qing?.owner).toBeNull()
  })

  it('蓟是幽州治所、归曹操，西通邺、东接右北平', () => {
    const jicheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jicheng')

    expect(jicheng?.name).toBe('蓟')
    expect(jicheng?.type).toBe('city')
    expect(jicheng?.population).toBe(70000)
    expect(jicheng?.provinceId).toBe('you')
    expect(jicheng?.owner).toBe('caocao')
    // 蓟西通邺、东接右北平；襄平与广陵都隔着中转，并不直通。
    expect(jicheng?.neighbors).toEqual(['youbeiping', 'ye'])
  })

  it('士燮一家据交州五郡，番禺西通广信、北接桂阳，又由海路通东冶', () => {
    const panyu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'panyu')
    const guangxin = GEOGRAPHY_NEW.sites.find((site) => site.id === 'guangxin')
    const hepu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'hepu')
    const longbian = GEOGRAPHY_NEW.sites.find((site) => site.id === 'longbian')
    const jiuzhen = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jiuzhen')
    const guiyang = GEOGRAPHY_NEW.sites.find((site) => site.id === 'guiyang')

    expect(panyu?.name).toBe('番禺')
    expect(panyu?.type).toBe('city')
    expect(panyu?.population).toBe(80000)
    expect(panyu?.provinceId).toBe('jiao')
    expect(panyu?.owner).toBe('shixie')
    expect(panyu?.neighbors).toEqual(['guangxin', 'guiyang', 'dongye'])

    // 广信是苍梧郡治，东下番禺、西通合浦，是五郡之间的一站。
    expect(guangxin?.name).toBe('广信')
    expect(guangxin?.type).toBe('city')
    expect(guangxin?.population).toBe(70000)
    expect(guangxin?.provinceId).toBe('jiao')
    expect(guangxin?.owner).toBe('shixie')
    expect(guangxin?.neighbors).toEqual(['panyu', 'hepu'])

    expect(hepu?.name).toBe('合浦')
    expect(hepu?.type).toBe('city')
    expect(hepu?.population).toBe(60000)
    expect(hepu?.owner).toBe('shixie')
    expect(hepu?.neighbors).toEqual(['guangxin', 'longbian', 'jiuzhen'])

    expect(longbian?.name).toBe('龙编')
    expect(longbian?.type).toBe('city')
    expect(longbian?.owner).toBe('shixie')
    expect(longbian?.neighbors).toEqual(['jiuzhen', 'hepu'])

    expect(jiuzhen?.name).toBe('九真')
    expect(jiuzhen?.type).toBe('town')
    expect(jiuzhen?.population).toBe(30000)
    expect(jiuzhen?.owner).toBe('shixie')
    expect(jiuzhen?.neighbors).toEqual(['longbian', 'hepu'])

    // 桂阳在交州之北，荆南由此南下，玩家可不循海路、由陆路直取交州。
    expect(guiyang?.neighbors).toContain('panyu')

    // 交州归士燮。
    const jiao = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'jiao')
    expect(jiao?.owner).toBe('shixie')
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

    // 洛阳—虎牢关—许都/陈留串成中原一线，邺南接陈留、又西出蓟通辽东；白马津已撤出新图。
    expect(luoyang?.neighbors).toEqual(['hulao', 'wancheng', 'tongguan'])
    expect(hulao?.neighbors).toEqual(['luoyang', 'xudu', 'chenliu'])
    expect(chenliu?.neighbors).toEqual(['xudu', 'hulao', 'ye'])
    // 许都除中原一线外，又南接谯、由谯通淮南。
    expect(xudu?.neighbors).toEqual(['chenliu', 'hulao', 'wancheng', 'qiao'])
    expect(ye?.neighbors).toEqual(['chenliu', 'jicheng'])
    expect(GEOGRAPHY_NEW.sites.find((site) => site.id === 'baima')).toBeUndefined()

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

  it('谯是曹操本贯，在许都与寿春之间，是中原南下淮南的第一站', () => {
    const qiao = GEOGRAPHY_NEW.sites.find((site) => site.id === 'qiao')

    expect(qiao?.name).toBe('谯')
    expect(qiao?.type).toBe('city')
    expect(qiao?.population).toBe(90000)
    expect(qiao?.provinceId).toBe('yu')
    expect(qiao?.owner).toBe('caocao')
    // 谯北接许都、南接寿春，又东接徐州治所彭城；不东出陈留、也不南接江夏。
    expect(qiao?.neighbors).toEqual(['pengcheng', 'xudu', 'shouchun'])
  })

  it('南郑与阳平关归张鲁，葭萌关是汉中南入益州的关口，北面经阳平关、陈仓道通关中', () => {
    const nanzheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'nanzheng')
    const yangpingguan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'yangpingguan')
    const jiamengguan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jiamengguan')
    const dingjunshan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'dingjunshan')

    expect(nanzheng?.owner).toBe('zhanglu')
    expect(yangpingguan?.owner).toBe('zhanglu')
    expect(jiamengguan?.owner).toBe('liuzhang')
    expect(nanzheng?.neighbors).toEqual(['dingjunshan', 'yangpingguan', 'zhiwugu'])
    expect(nanzheng?.neighbors).not.toContain('chencang')
    expect(yangpingguan?.neighbors).toEqual(['jiamengguan', 'nanzheng', 'wudu', 'chencang'])
    expect(jiamengguan?.neighbors).toEqual(['yangpingguan', 'dingjunshan', 'fucheng'])

    // 上庸与汉水已撤出新图：汉中不再东出上庸，北面只余子午谷一线通关中。
    for (const removed of ['shangyong', 'hanshui']) {
      expect(GEOGRAPHY_NEW.sites.find((site) => site.id === removed)).toBeUndefined()
    }

    // 定军山在汉中腹地，归张鲁名下；阳平关险不可拔，定军山则通南缘的葭萌关，是绕开关隘、北上取汉中的一路。
    expect(dingjunshan?.type).toBe('field')
    expect(dingjunshan?.owner).toBe('zhanglu')
    expect(dingjunshan?.neighbors).toEqual(['nanzheng', 'jiamengguan'])

    const liang = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'liang')
    expect(liang?.owner).toBe('zhanglu')

    const atNanzheng = CHARACTERS_NEW.filter((character) => character.stationedSiteId === 'nanzheng')
    const atYangpingguan = CHARACTERS_NEW.find(
      (character) => character.stationedSiteId === 'yangpingguan',
    )
    // 每处至多一名驻将，阎圃在名册中候命。
    expect(atNanzheng.map((character) => character.name)).toEqual(['张鲁'])
    expect(atYangpingguan?.name).toBe('张卫')
  })

  it('剑阁与江油已撤出新图，葭萌关南出直抵涪城', () => {
    for (const removed of ['jiange', 'jiangyou']) {
      expect(GEOGRAPHY_NEW.sites.find((site) => site.id === removed)).toBeUndefined()
    }

    const jiamengguan = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jiamengguan')
    const fucheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'fucheng')

    // 葭萌关南出即至涪城，中间不再隔剑阁；阴平道随阴平一并撤去。
    expect(jiamengguan?.neighbors).toContain('fucheng')
    expect(fucheng?.neighbors).toContain('jiamengguan')
  })

  it('涪城、绵竹、雒城与成都归刘璋，涪城—绵竹—雒城—成都串成一线，各置一名主将', () => {
    const fucheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'fucheng')
    const mianzhu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'mianzhu')
    const luocheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'luocheng')
    const chengdu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chengdu')

    expect(chengdu?.type).toBe('metropolis')
    expect(mianzhu?.type).toBe('town')
    expect(luocheng?.type).toBe('city')
    // 雒城为益州腹地的大城，绵竹只是涪城与雒城之间的县城：人口与类型已解耦（见《想法记录》）。
    expect(mianzhu?.population).toBe(60000)
    expect(luocheng?.population).toBe(90000)
    expect(fucheng?.owner).toBe('liuzhang')
    expect(mianzhu?.owner).toBe('liuzhang')
    expect(luocheng?.owner).toBe('liuzhang')
    expect(chengdu?.owner).toBe('liuzhang')

    // 绵竹当涪城与雒城之间的大道；涪城北接葭萌关；成都—绵竹因雒城落于两点直径圆内，为强制边。
    expect(fucheng?.neighbors).toEqual(['mianzhu', 'luocheng', 'jiamengguan', 'jiangzhou'])
    expect(mianzhu?.neighbors).toEqual(['luocheng', 'fucheng', 'chengdu'])
    expect(luocheng?.neighbors).toEqual(['chengdu', 'mianzhu', 'fucheng', 'jiangzhou'])
    // 成都南出泸水，是自蜀中入南中的门户（见南中一线一例）。
    expect(chengdu?.neighbors).toEqual(['luocheng', 'mianzhu', 'lushui'])

    const yi = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'yi')
    expect(yi?.owner).toBe('liuzhang')

    const stationedNames = (siteId: string) =>
      CHARACTERS_NEW.filter((character) => character.stationedSiteId === siteId).map(
        (character) => character.name,
      )
    // 每处至多一名驻将，余者归入名册候命。
    expect(stationedNames('fucheng')).toEqual(['杨怀'])
    expect(stationedNames('mianzhu')).toEqual(['费观'])
    expect(stationedNames('luocheng')).toEqual(['张任'])
    expect(stationedNames('chengdu')).toEqual(['刘璋'])

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
    // 白帝城作小城而人口三万，是三峡之口的一处要地。
    expect(baidicheng?.type).toBe('town')
    expect(baidicheng?.population).toBe(30000)
    // 江州北通涪城与雒城，是巴郡与蜀中之间的门户。
    expect(jiangzhou?.neighbors).toEqual(['luocheng', 'fucheng', 'baidicheng'])
    expect(baidicheng?.neighbors).toEqual(['zigui', 'jiangzhou'])

    // 秭归当巫峡之口，随南郡归曹操，夹在夷陵与白帝城之间；夷陵不再直通白帝城。
    expect(zigui?.type).toBe('town')
    expect(zigui?.owner).toBe('caocao')
    expect(zigui?.neighbors).toEqual(['yiling', 'baidicheng'])
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

  it('南中自成都出入，成都—泸水—秃龙洞—三江城—桃花渡串成一线，合《演义》南征次第', () => {
    const lushui = GEOGRAPHY_NEW.sites.find((site) => site.id === 'lushui')
    const tulongdong = GEOGRAPHY_NEW.sites.find((site) => site.id === 'tulongdong')
    const taohuadu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'taohuadu')
    const sancheng = GEOGRAPHY_NEW.sites.find((site) => site.id === 'sancheng')

    // 三江城是南蛮唯一的城池，归孟获所立的南蛮，一城统南中诸部。
    expect(sancheng?.type).toBe('city')
    expect(sancheng?.population).toBe(120000)
    expect(sancheng?.provinceId).toBe('yi')
    expect(sancheng?.owner).toBe('nanman')

    // 泸水、秃龙洞与桃花渡归南蛮名下，野地不设驻将。
    for (const site of [lushui, tulongdong, taohuadu]) {
      expect(site?.type).toBe('field')
      expect(site?.population).toBe(0)
      expect(site?.owner).toBe('nanman')
      expect(site?.provinceId).toBe('yi')
    }

    // 成都—泸水—秃龙洞—三江城—桃花渡一条链；泸水是蜀军南渡金沙江之处，居成都之南，即为诸葛亮真实渡江的会理鱼鲊渡。
    // 成都—泸水因雒城、绵竹落于两点直径圆内、几何误判为不相邻，为强制边。
    const chengdu = GEOGRAPHY_NEW.sites.find((site) => site.id === 'chengdu')
    expect(chengdu?.neighbors).toContain('lushui')
    expect(lushui?.neighbors).toEqual(['tulongdong', 'chengdu'])
    expect(tulongdong?.neighbors).toEqual(['sancheng', 'lushui'])
    expect(sancheng?.neighbors).toEqual(['tulongdong', 'taohuadu'])
    expect(taohuadu?.neighbors).toEqual(['sancheng'])

    // 出入南中只走成都一路：江州的长距离直连边已断开。
    const jiangzhou = GEOGRAPHY_NEW.sites.find((site) => site.id === 'jiangzhou')
    expect(jiangzhou?.neighbors).not.toContain('lushui')
  })

  it('南蛮据泸水与三江城一带，兵数与刘璋同档、孟获为君主', () => {
    expect(FACTION_IDS_NEW).toContain('nanman')

    const nanman = CHARACTERS_NEW.filter((character) => character.factionId === 'nanman')
    expect(nanman).toHaveLength(12)

    // 兵力与刘璋同档：两家在仕者合计相差不远。
    const total = (list: typeof CHARACTERS_NEW) =>
      list.reduce((sum, character) => sum + character.troops, 0)
    const liuzhang = CHARACTERS_NEW.filter((character) => character.factionId === 'liuzhang')
    expect(total(nanman)).toBeGreaterThan(total(liuzhang) * 0.9)
    expect(total(nanman)).toBeLessThan(total(liuzhang) * 1.1)

    // 孟获是南蛮唯一的君主，诸王各部族分守各处。
    const monarchs = nanman.filter((character) => character.isMonarch)
    expect(monarchs.map((character) => character.name)).toEqual(['孟获'])

    // 泸水、秃龙洞、三江城与桃花渡各驻一名主将，余者在名册候命。
    const namesAt = (siteId: string) =>
      CHARACTERS_NEW.filter((character) => character.stationedSiteId === siteId).map(
        (character) => character.name,
      )
    expect(namesAt('lushui')).toEqual(['孟获'])
    expect(namesAt('tulongdong')).toEqual(['朵思大王'])
    expect(namesAt('sancheng')).toEqual(['祝融夫人'])
    expect(namesAt('taohuadu')).toEqual(['兀突骨'])

    // 南蛮入图不改益州归属：刘璋仍占点最多，益州仍归刘璋。
    const yi = GEOGRAPHY_NEW.provinces.find((province) => province.id === 'yi')
    expect(yi?.owner).toBe('liuzhang')
  })

  it('每位在仕武将的兵力不超过带兵上限', () => {
    const serving = CHARACTERS_NEW.filter((character) => character.status === 'serving')

    for (const character of serving) {
      expect(character.troops, `${character.name} 兵力超限`).toBeLessThanOrEqual(troopLimit(character))
    }
  })

  it('刘备取荆南时北军不会来援：曹操与荆南既非敌对，也不与荆南相邻', () => {
    const hostile = (SANGUO_208.relations ?? []).some(
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
    expect((SANGUO_208.relations ?? []).every((relation) => relation.kind !== 'hostile')).toBe(true)

    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })
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
