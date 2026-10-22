import { CHARACTERS_SANGUO } from './charactersSanguo'
import { CHARACTERS_SANGUO_NEW } from './charactersSanguoNew'
import { GEOGRAPHY_SANGUO } from './geographySanguo'
import { GEOGRAPHY_SANGUO_NEW } from './geographySanguoNew'
import type { Character, FactionId, Geography, Scenario, SiteId } from './model'

export const SANGUO_208: Scenario = {
  id: 'sanguo-208',
  name: '建安十三年',
  startDate: { era: '建安', year: 13, season: 'autumn' },
  playerFaction: 'liubei',
  factions: [
    { id: 'caocao', name: '曹操', color: '#3d6ea8', grain: 20000, money: 20000 },
    { id: 'liubei', name: '刘备', color: '#3f7a5a', grain: 6000, money: 3000 },
    { id: 'sunquan', name: '孙权', color: '#b0413e', grain: 12000, money: 10000 },
    { id: 'liuzhang', name: '刘璋', color: '#7d5ba6', grain: 14000, money: 9000 },
    { id: 'mateng', name: '马腾', color: '#c05a2e', grain: 6000, money: 3000 },
    { id: 'hansui', name: '韩遂', color: '#7a8a3c', grain: 6000, money: 3000 },
    { id: 'gongsunkang', name: '公孙康', color: '#2f8f8f', grain: 5000, money: 3000 },
    { id: 'shixie', name: '士燮', color: '#a84f78', grain: 6000, money: 3500 },
    { id: 'zhanglu', name: '张鲁', color: '#c8a03c', grain: 7000, money: 5000 },
    { id: 'yuanshi', name: '袁氏', color: '#8a5a2b', grain: 16000, money: 12000 },
  ],
  // 开局无战事：只保留孙刘同盟，其余势力对一律中立，战火由玩家的宣战点燃。
  relations: [{ factions: ['liubei', 'sunquan'], kind: 'ally', favor: 70 }],
  geography: GEOGRAPHY_SANGUO,
  characters: CHARACTERS_SANGUO,
}

/**
 * 「建安十三年（新）」：从头重做的版图，同一个时刻与秋季开局，逐点搭建。
 * 势力沿用旧版但去袁氏、并韩遂、另立荆南一家（袁氏已亡，河北与中原尽归曹操；韩遂与马腾合为一家、奉马腾为主），
 * 关系沿用旧版，地理与人物逐个补入；两版并存，新图建齐后再撤旧图。
 */
export const SANGUO_208_NEW: Scenario = {
  id: 'sanguo-208-new',
  name: '建安十三年（新）',
  startDate: { era: '建安', year: 13, season: 'autumn' },
  playerFaction: 'liubei',
  factions: [
    // 袁氏已亡：官渡之后河北与中原尽入曹操，新版图不立袁氏一家。
    // 韩遂与马腾合为一家、奉马腾为主，陇右的金城随韩遂并入马腾，故新版图亦不立韩遂一家。
    ...SANGUO_208.factions
      .filter((faction) => faction.id !== 'yuanshi' && faction.id !== 'hansui')
      .map((faction) => ({ ...faction })),
    // 荆南四郡自成一家，不并入曹操；刘备南下取四郡时北军不会来救（见地理数据说明）。
    { id: 'jingnan', name: '荆南', color: '#6b7a8f', grain: 8000, money: 5000 },
    // 南中自成一家的「南蛮」：孟获称王，据三江城，兵力与刘璋同档（见地理与人物数据说明）。
    { id: 'nanman', name: '南蛮', color: '#9c6b32', grain: 10000, money: 6000 },
  ],
  // 开局无战事：孙刘同盟沿用旧版，其余势力对一律中立，战火由玩家的宣战点燃。
  relations: (SANGUO_208.relations ?? []).map((relation) => ({
    ...relation,
    factions: [...relation.factions] as [FactionId, FactionId],
  })),
  geography: GEOGRAPHY_SANGUO_NEW,
  characters: CHARACTERS_SANGUO_NEW,
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

/** 验收开局各战略点的归属；未列出的为无主（含野地）。 */
const ACCEPTANCE_SITE_OWNERS: Record<string, FactionId | null> = {
  jiangxia: 'liubei',
  xiangyang: 'caocao',
  fancheng: 'caocao',
  jiangling: 'caocao',
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
    { id: 'liubei', name: '刘备', color: '#3f7a5a', grain: 4000, money: 2000 },
    { id: 'caocao', name: '曹操', color: '#3d6ea8', grain: 12000, money: 8000 },
    { id: 'sunquan', name: '孙权', color: '#b0413e', grain: 8000, money: 5000 },
  ],
  relations: [
    { factions: ['liubei', 'sunquan'], kind: 'ally', favor: 70 },
    { factions: ['liubei', 'caocao'], kind: 'hostile', favor: 25 },
    { factions: ['caocao', 'sunquan'], kind: 'hostile', favor: 25 },
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
    officerAt('xuchu', 'caocao', 'jiangling', 3000),
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
export const SCENARIOS: readonly Scenario[] = [SANGUO_208, SANGUO_208_NEW, SANGUO_ACCEPTANCE]
