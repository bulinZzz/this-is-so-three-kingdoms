import { CHARACTERS_SANGUO } from './charactersSanguo'
import { GEOGRAPHY_SANGUO } from './geographySanguo'
import type { Character, FactionId, Geography, Scenario, SiteId } from './model'

export const SANGUO_208: Scenario = {
  id: 'sanguo-208',
  name: '建安十三年',
  startDate: { era: '建安', year: 13, season: 'autumn' },
  playerFaction: 'liubei',
  factions: [
    { id: 'caocao', name: '曹操', color: '#3d6ea8', grain: 20000 },
    { id: 'liubei', name: '刘备', color: '#3f7a5a', grain: 6000 },
    { id: 'sunquan', name: '孙权', color: '#b0413e', grain: 12000 },
  ],
  geography: GEOGRAPHY_SANGUO,
  characters: CHARACTERS_SANGUO,
}

/** 验收开局截取的战略点，取自正式地理数据，邻接关系随之。 */
const ACCEPTANCE_SITE_IDS: ReadonlySet<string> = new Set([
  // 荆州
  'jiangxia',
  'chibi',
  'changsha',
  'wuling',
  'xiangyang',
  'fancheng',
  'jiangling',
  'changbanpo',
  // 扬州
  'chaisang',
  'yuzhang',
])

/** 验收开局各战略点的归属；未列出的为无主。 */
const ACCEPTANCE_SITE_OWNERS: Record<string, FactionId | null> = {
  jiangxia: 'liubei',
  xiangyang: 'caocao',
  fancheng: 'caocao',
  jiangling: 'caocao',
  changbanpo: 'caocao',
  chaisang: 'sunquan',
  yuzhang: 'sunquan',
  chibi: null,
  changsha: null,
  wuling: null,
}

/** 从正式地理截取验收开局的战略点，邻接只保留截取范围内的一环。 */
function acceptanceGeography(): Geography {
  const sites = GEOGRAPHY_SANGUO.sites
    .filter((site) => ACCEPTANCE_SITE_IDS.has(site.id))
    .map((site) => ({
      ...site,
      owner: ACCEPTANCE_SITE_OWNERS[site.id] ?? null,
      neighbors: site.neighbors.filter((neighborId) => ACCEPTANCE_SITE_IDS.has(neighborId)),
    }))
  const provinceIds = new Set(sites.map((site) => site.provinceId))

  return {
    provinces: GEOGRAPHY_SANGUO.provinces.filter((province) => provinceIds.has(province.id)),
    sites,
  }
}

const ACCEPTANCE_GEOGRAPHY = acceptanceGeography()

/** 取真实武将并覆写其开局处境；所在州随驻地所属州，能力数值沿用既定数据。 */
function officerAt(id: string, factionId: FactionId, siteId: SiteId, troops: number): Character {
  const base = CHARACTERS_SANGUO.find((character) => character.id === id)
  const site = ACCEPTANCE_GEOGRAPHY.sites.find((item) => item.id === siteId)
  if (base === undefined || site === undefined) {
    throw new Error(`验收开局数据缺失：${id} / ${siteId}`)
  }

  return {
    ...base,
    status: 'serving',
    factionId,
    provinceId: site.provinceId,
    stationedSiteId: siteId,
    troops,
  }
}

/** 取真实武将为验收开局的在野人才，所在州沿用其原属，供寻访。 */
function wildInAcceptance(id: string): Character {
  const base = CHARACTERS_SANGUO.find((character) => character.id === id)
  if (base === undefined) {
    throw new Error(`人物数据中不存在：${id}`)
  }

  return {
    ...base,
    status: 'wild',
    factionId: null,
    stationedSiteId: null,
    troops: 0,
  }
}

/**
 * 迭代 5 的固定测试开局：荆扬一隅。
 * 三家势力、两个州、十个战略点，资源从简，用于从玩家视角连续游玩十到二十季、
 * 验收核心循环；地理与人物数据取自正式剧本，只是规模缩小，便于反复开局。
 */
export const SANGUO_ACCEPTANCE: Scenario = {
  id: 'sanguo-acceptance',
  name: '荆扬一隅',
  startDate: { era: '建安', year: 13, season: 'autumn' },
  playerFaction: 'liubei',
  factions: [
    { id: 'liubei', name: '刘备', color: '#3f7a5a', grain: 4000 },
    { id: 'caocao', name: '曹操', color: '#3d6ea8', grain: 12000 },
    { id: 'sunquan', name: '孙权', color: '#b0413e', grain: 8000 },
  ],
  geography: ACCEPTANCE_GEOGRAPHY,
  characters: [
    officerAt('liubei', 'liubei', 'jiangxia', 5000),
    officerAt('guanyu', 'liubei', 'jiangxia', 8000),
    officerAt('zhangfei', 'liubei', 'jiangxia', 6000),
    officerAt('zhaoyun', 'liubei', 'jiangxia', 4000),
    officerAt('zhugeliang', 'liubei', 'jiangxia', 2000),
    officerAt('caocao', 'caocao', 'xiangyang', 10000),
    officerAt('caimao', 'caocao', 'xiangyang', 3000),
    officerAt('caoren', 'caocao', 'fancheng', 6000),
    officerAt('wenpin', 'caocao', 'jiangling', 4000),
    officerAt('xuchu', 'caocao', 'changbanpo', 3000),
    officerAt('sunquan', 'sunquan', 'chaisang', 10000),
    officerAt('zhouyu', 'sunquan', 'chaisang', 8000),
    officerAt('lusu', 'sunquan', 'yuzhang', 3000),
    wildInAcceptance('huangzhong'),
    wildInAcceptance('weiyan'),
    wildInAcceptance('pangtong'),
    wildInAcceptance('maliang'),
    wildInAcceptance('liaohua'),
  ],
}

/** 可供开局选择的剧本。 */
export const SCENARIOS: readonly Scenario[] = [SANGUO_208, SANGUO_ACCEPTANCE]
