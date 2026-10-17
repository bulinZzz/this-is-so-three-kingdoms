import type { Character } from './model'

/**
 * 「建安十三年（新）」的人物数据，正在逐个添加。
 * 眼下是赤壁战后荆州一隅的四家人马：刘备一行驻公安，曹操诸将守江陵、襄阳与夷陵，
 * 荆南四郡由刘度、赵范、金旋、韩玄四位太守各守其郡，同属「荆南」，江东则周瑜守柴桑。
 * 扬州另有淮南与江东的前线：张辽、李典、乐进守合肥，孙权自据京口，太史慈副之。
 * 在仕者必须有隶属势力与驻地；城池与关隘的驻地须为本方所有，野地无归属，任何势力都可驻守。
 * 势力至多一名君主，也可以没有；孙权据京口，自为君主，曹操与荆南则无君主。
 */
export const CHARACTERS_SANGUO_NEW: Character[] = [
  // 刘备（荆州，据公安）
  { id: 'liubei', name: '刘备', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 73, command: 75, intellect: 76, politics: 80, age: 47, personality: 'open', affinities: { liubei: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'gongan', troops: 2000, tier: null },
  { id: 'guanyu', name: '关羽', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 97, command: 95, intellect: 75, politics: 45, age: 46, personality: 'proud', affinities: { liubei: 96, caocao: 70, sunquan: 30 }, loyalty: 98, isMonarch: false, stationedSiteId: 'gongan', troops: 1000, tier: null },
  { id: 'zhangfei', name: '张飞', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 98, command: 85, intellect: 40, politics: 30, age: 42, personality: 'brave', affinities: { liubei: 95 }, loyalty: 96, isMonarch: false, stationedSiteId: 'gongan', troops: 1000, tier: null },
  { id: 'zhaoyun', name: '赵云', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 96, command: 91, intellect: 76, politics: 50, age: 40, personality: 'steady', affinities: { liubei: 90 }, loyalty: 97, isMonarch: false, stationedSiteId: 'gongan', troops: 1000, tier: null },
  { id: 'zhugeliang', name: '诸葛亮', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 38, command: 92, intellect: 100, politics: 95, age: 27, personality: 'cautious', affinities: { liubei: 92 }, loyalty: 100, isMonarch: false, stationedSiteId: 'gongan', troops: 1000, tier: null },

  // 曹操（荆州，守江陵）
  { id: 'caoren', name: '曹仁', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 89, command: 90, intellect: 68, politics: 70, age: 40, personality: 'steady', affinities: { caocao: 94 }, loyalty: 94, isMonarch: false, stationedSiteId: 'jiangling', troops: 10000, tier: null },
  { id: 'niujin', name: '牛金', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 80, command: 78, intellect: 45, politics: 40, age: 36, personality: 'brave', affinities: { caocao: 80 }, loyalty: 85, isMonarch: false, stationedSiteId: 'jiangling', troops: 3000, tier: null },
  { id: 'caochun', name: '曹纯', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 85, command: 84, intellect: 66, politics: 60, age: 38, personality: 'brave', affinities: { caocao: 90 }, loyalty: 90, isMonarch: false, stationedSiteId: 'jiangling', troops: 3000, tier: null },

  // 曹操（荆州，夏侯惇守襄阳、曹洪守夷陵）
  { id: 'xiahoudun', name: '夏侯惇', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 90, command: 88, intellect: 55, politics: 60, age: 51, personality: 'brave', affinities: { caocao: 95 }, loyalty: 95, isMonarch: false, stationedSiteId: 'xiangyang', troops: 10000, tier: null },
  { id: 'caohong', name: '曹洪', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 86, command: 78, intellect: 50, politics: 55, age: 39, personality: 'brave', affinities: { caocao: 90 }, loyalty: 92, isMonarch: false, stationedSiteId: 'yiling', troops: 3000, tier: null },

  // 曹操（扬州，张辽、李典、乐进守合肥）
  { id: 'zhangliao', name: '张辽', status: 'serving', factionId: 'caocao', provinceId: 'yang', might: 92, command: 93, intellect: 78, politics: 65, age: 39, personality: 'steady', affinities: { caocao: 88, liubei: 65 }, loyalty: 85, isMonarch: false, stationedSiteId: 'hefei', troops: 10000, tier: null },
  { id: 'lidian', name: '李典', status: 'serving', factionId: 'caocao', provinceId: 'yang', might: 78, command: 80, intellect: 72, politics: 70, age: 34, personality: 'steady', affinities: { caocao: 85 }, loyalty: 88, isMonarch: false, stationedSiteId: 'hefei', troops: 5000, tier: null },
  { id: 'yuejin', name: '乐进', status: 'serving', factionId: 'caocao', provinceId: 'yang', might: 88, command: 82, intellect: 55, politics: 50, age: 48, personality: 'brave', affinities: { caocao: 88 }, loyalty: 90, isMonarch: false, stationedSiteId: 'hefei', troops: 5000, tier: null },

  // 孙权（扬州，周瑜守柴桑，孙权与太史慈据京口）
  { id: 'zhouyu', name: '周瑜', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 78, command: 94, intellect: 92, politics: 85, age: 33, personality: 'proud', affinities: { sunquan: 95 }, loyalty: 95, isMonarch: false, stationedSiteId: 'chaisang', troops: 10000, tier: null },
  { id: 'sunquan', name: '孙权', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 70, command: 82, intellect: 80, politics: 88, age: 26, personality: 'cautious', affinities: { sunquan: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'jingkou', troops: 15000, tier: null },
  { id: 'taishici', name: '太史慈', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 90, command: 84, intellect: 70, politics: 60, age: 42, personality: 'brave', affinities: { sunquan: 70 }, loyalty: 88, isMonarch: false, stationedSiteId: 'jingkou', troops: 5000, tier: null },

  // 荆南（荆州，四郡各守其郡；无君主，合成一家）
  // 长沙
  { id: 'hanxuan', name: '韩玄', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 55, command: 62, intellect: 52, politics: 60, age: 50, personality: 'cautious', affinities: {}, loyalty: 75, isMonarch: false, stationedSiteId: 'changsha', troops: 3000, tier: null },
  { id: 'huangzhong', name: '黄忠', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 93, command: 88, intellect: 62, politics: 45, age: 60, personality: 'brave', affinities: { liubei: 85 }, loyalty: 55, isMonarch: false, stationedSiteId: 'changsha', troops: 1000, tier: null },
  { id: 'weiyan', name: '魏延', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 90, command: 86, intellect: 72, politics: 40, age: 34, personality: 'proud', affinities: { liubei: 80 }, loyalty: 50, isMonarch: false, stationedSiteId: 'changsha', troops: 1000, tier: null },
  // 零陵
  { id: 'liudu', name: '刘度', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 45, command: 62, intellect: 55, politics: 66, age: 50, personality: 'steady', affinities: {}, loyalty: 85, isMonarch: false, stationedSiteId: 'lingling', troops: 2000, tier: null },
  { id: 'liuxian', name: '刘贤', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 58, command: 55, intellect: 45, politics: 42, age: 26, personality: 'brave', affinities: {}, loyalty: 85, isMonarch: false, stationedSiteId: 'lingling', troops: 1000, tier: null },
  { id: 'xingdaorong', name: '邢道荣', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 78, command: 60, intellect: 35, politics: 30, age: 36, personality: 'brave', affinities: {}, loyalty: 80, isMonarch: false, stationedSiteId: 'lingling', troops: 1000, tier: null },
  // 桂阳
  { id: 'zhaofan', name: '赵范', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 48, command: 60, intellect: 62, politics: 68, age: 42, personality: 'scheming', affinities: {}, loyalty: 78, isMonarch: false, stationedSiteId: 'guiyang', troops: 3000, tier: null },
  { id: 'chenying', name: '陈应', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 70, command: 58, intellect: 42, politics: 35, age: 33, personality: 'brave', affinities: {}, loyalty: 80, isMonarch: false, stationedSiteId: 'guiyang', troops: 1000, tier: null },
  { id: 'baolong', name: '鲍隆', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 72, command: 56, intellect: 40, politics: 32, age: 35, personality: 'brave', affinities: {}, loyalty: 80, isMonarch: false, stationedSiteId: 'guiyang', troops: 1000, tier: null },
  // 武陵
  { id: 'jinxuan', name: '金旋', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 68, command: 70, intellect: 58, politics: 62, age: 45, personality: 'steady', affinities: {}, loyalty: 85, isMonarch: false, stationedSiteId: 'wuling', troops: 3000, tier: null },
  { id: 'gongzhi', name: '巩志', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 55, command: 62, intellect: 72, politics: 70, age: 35, personality: 'cautious', affinities: { liubei: 65 }, loyalty: 60, isMonarch: false, stationedSiteId: 'wuling', troops: 2000, tier: null },
]
