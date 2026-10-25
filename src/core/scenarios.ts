import { CHARACTERS_SANGUO } from './charactersSanguo'
import { GEOGRAPHY_ACCEPTANCE } from './geographyAcceptance'
import { GEOGRAPHY_SANGUO } from './geographySanguo'
import type { Character, FactionId, Scenario, SiteId } from './model'

/**
 * 建安十三年，秋季开局。
 *
 * 袁氏已亡：官渡之后河北与中原尽入曹操，故不立袁氏一家；
 * 韩遂与马腾合为一家、奉马腾为主，金城随韩遂并入马腾，故亦不立韩遂一家。
 * 荆南四郡自成一家的「荆南」，与曹操无涉，刘备南下取四郡时北军不会来救；
 * 南中另有「南蛮」，孟获称王，据三江城。
 */
export const SANGUO_208: Scenario = {
  id: 'sanguo-208',
  name: '建安十三年',
  startDate: { era: '建安', year: 13, season: 'autumn' },
  playerFaction: 'liubei',
  // 按历史地位排列：中原的曹操、江东的孙权与寄居荆州的刘备居前，其后是益州刘璋、
  // 汉中张鲁、凉州马腾，再及荆南、交州士燮、辽东公孙康，南蛮处最末。
  // 曹、孙、刘三家沿用旧色，其余各家按相邻色相重新分档，避免近色相撞。
  factions: [
    { id: 'caocao', name: '曹操', color: '#3d6ea8', grain: 20000, money: 20000 },
    { id: 'sunquan', name: '孙权', color: '#b0413e', grain: 12000, money: 10000 },
    { id: 'liubei', name: '刘备', color: '#3f7a5a', grain: 6000, money: 3000 },
    { id: 'liuzhang', name: '刘璋', color: '#8160a3', grain: 14000, money: 9000 },
    { id: 'zhanglu', name: '张鲁', color: '#c2a342', grain: 7000, money: 5000 },
    { id: 'mateng', name: '马腾', color: '#c26a33', grain: 6000, money: 3000 },
    { id: 'jingnan', name: '荆南', color: '#5b7689', grain: 8000, money: 5000 },
    { id: 'shixie', name: '士燮', color: '#a55077', grain: 6000, money: 3500 },
    { id: 'gongsunkang', name: '公孙康', color: '#2f8a82', grain: 5000, money: 3000 },
    { id: 'nanman', name: '南蛮', color: '#7d5630', grain: 10000, money: 6000 },
  ],
  // 开局无战事：只保留孙刘同盟，其余势力对一律中立，战火由玩家的宣战点燃。
  relations: [{ factions: ['liubei', 'sunquan'], kind: 'ally', favor: 70 }],
  geography: GEOGRAPHY_SANGUO,
  characters: CHARACTERS_SANGUO,
}

/**
 * 取真实武将并覆写其开局处境；所在州随驻地所属州，能力数值沿用既定数据。
 * `stationed` 为假时只列入名册、不驻守，使每处战略点至多一名驻将。
 */
function officerAt(
  id: string,
  factionId: FactionId,
  siteId: SiteId,
  troops: number,
  stationed = true,
): Character {
  const base = CHARACTERS_SANGUO.find((character) => character.id === id)
  const site = GEOGRAPHY_ACCEPTANCE.sites.find((item) => item.id === siteId)
  if (base === undefined || site === undefined) {
    throw new Error(`验收开局数据缺失：${id} / ${siteId}`)
  }

  return {
    ...base,
    status: 'serving',
    factionId,
    provinceId: site.provinceId,
    scope: [siteId],
    stationedSiteId: stationed ? siteId : null,
    troops,
    tier: null,
  }
}

/** 取真实武将为验收开局的在野人才，所在州沿用其原属，供寻访。 */
function wildInAcceptance(id: string): Character {
  const base = CHARACTERS_SANGUO.find((character) => character.id === id)
  if (base === undefined) {
    throw new Error(`人物数据中不存在：${id}`)
  }

  const provinceSites = GEOGRAPHY_ACCEPTANCE.sites
    .filter((site) => site.provinceId === base.provinceId)
    .map((site) => site.id)

  return {
    ...base,
    status: 'wild',
    factionId: null,
    stationedSiteId: null,
    troops: 0,
    tier: base.tier ?? 'basic',
    scope: provinceSites.length > 0 ? provinceSites : base.scope,
  }
}

/**
 * 固定测试开局：荆扬一隅。
 * 三家势力、两个州、十个战略点，资源从简，用于从玩家视角连续游玩十到二十季、
 * 验收核心循环；地理取自专用的测试夹具，人物取自正式剧本，只是规模缩小，便于反复开局。
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
  geography: GEOGRAPHY_ACCEPTANCE,
  characters: [
    officerAt('liubei', 'liubei', 'jiangxia', 5000),
    officerAt('guanyu', 'liubei', 'jiangxia', 8000, false),
    officerAt('zhangfei', 'liubei', 'jiangxia', 6000, false),
    officerAt('zhaoyun', 'liubei', 'jiangxia', 4000, false),
    officerAt('zhugeliang', 'liubei', 'jiangxia', 2000, false),
    officerAt('caocao', 'caocao', 'xiangyang', 10000),
    officerAt('manchong', 'caocao', 'xiangyang', 3000, false),
    officerAt('caoren', 'caocao', 'fancheng', 6000),
    officerAt('wenpin', 'caocao', 'jiangling', 4000),
    officerAt('xuchu', 'caocao', 'jiangling', 3000, false),
    officerAt('sunquan', 'sunquan', 'chaisang', 10000),
    officerAt('zhouyu', 'sunquan', 'chaisang', 8000, false),
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
