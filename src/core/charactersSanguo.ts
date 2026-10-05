import type { Character } from './model'

/**
 * 建安十三年（208 年）的人物数据，按所在州分布，供寻访抽取。
 * 在仕者驻守各自势力的据点；不在三家之列的势力，其部属按在野处理。
 * 能力数值取自演义印象，供战斗结算使用，具体平衡待核心玩法验证后再调。
 */
export const CHARACTERS_SANGUO: Character[] = [
  // 刘备（荆州）
  { id: 'liubei', name: '刘备', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 73, command: 75, intellect: 76, factionAffinity: 'liubei', loyalty: 100, isMonarch: true, stationedSiteId: 'jiangxia' },
  { id: 'guanyu', name: '关羽', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 97, command: 95, intellect: 75, factionAffinity: 'liubei', loyalty: 98, isMonarch: false, stationedSiteId: 'jiangxia' },
  { id: 'zhangfei', name: '张飞', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 98, command: 85, intellect: 40, factionAffinity: 'liubei', loyalty: 96, isMonarch: false, stationedSiteId: 'jiangxia' },
  { id: 'zhaoyun', name: '赵云', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 96, command: 91, intellect: 76, factionAffinity: 'liubei', loyalty: 97, isMonarch: false, stationedSiteId: 'jiangxia' },
  { id: 'zhugeliang', name: '诸葛亮', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 38, command: 92, intellect: 100, factionAffinity: 'liubei', loyalty: 100, isMonarch: false, stationedSiteId: 'jiangxia' },
  { id: 'mizhu', name: '糜竺', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 30, command: 45, intellect: 72, factionAffinity: 'liubei', loyalty: 90, isMonarch: false, stationedSiteId: 'jiangxia' },
  { id: 'jianyong', name: '简雍', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 25, command: 40, intellect: 70, factionAffinity: 'liubei', loyalty: 88, isMonarch: false, stationedSiteId: 'jiangxia' },
  { id: 'sunqian', name: '孙乾', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 28, command: 42, intellect: 71, factionAffinity: 'liubei', loyalty: 87, isMonarch: false, stationedSiteId: 'jiangxia' },
  { id: 'chendao', name: '陈到', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 85, command: 80, intellect: 60, factionAffinity: 'liubei', loyalty: 92, isMonarch: false, stationedSiteId: 'jiangxia' },

  // 曹操（豫州）
  { id: 'caocao', name: '曹操', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 72, command: 96, intellect: 91, factionAffinity: 'caocao', loyalty: 100, isMonarch: true, stationedSiteId: 'xudu' },
  // 曹操（司隶）
  { id: 'xiahoudun', name: '夏侯惇', status: 'serving', factionId: 'caocao', provinceId: 'sili', might: 90, command: 88, intellect: 55, factionAffinity: 'caocao', loyalty: 95, isMonarch: false, stationedSiteId: 'luoyang' },
  { id: 'xiahouyuan', name: '夏侯渊', status: 'serving', factionId: 'caocao', provinceId: 'sili', might: 91, command: 90, intellect: 60, factionAffinity: 'caocao', loyalty: 93, isMonarch: false, stationedSiteId: 'sishui' },
  { id: 'jiaxu', name: '贾诩', status: 'serving', factionId: 'caocao', provinceId: 'sili', might: 45, command: 70, intellect: 97, factionAffinity: 'caocao', loyalty: 82, isMonarch: false, stationedSiteId: 'hulao' },
  // 曹操（豫州）
  { id: 'xunyu', name: '荀彧', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 30, command: 60, intellect: 96, factionAffinity: 'caocao', loyalty: 88, isMonarch: false, stationedSiteId: 'xudu' },
  { id: 'xunyou', name: '荀攸', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 32, command: 62, intellect: 94, factionAffinity: 'caocao', loyalty: 87, isMonarch: false, stationedSiteId: 'xudu' },
  { id: 'guojia', name: '郭嘉', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 30, command: 65, intellect: 98, factionAffinity: 'caocao', loyalty: 86, isMonarch: false, stationedSiteId: 'xudu' },
  { id: 'caoren', name: '曹仁', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 89, command: 90, intellect: 68, factionAffinity: 'caocao', loyalty: 94, isMonarch: false, stationedSiteId: 'xiaopei' },
  { id: 'caohong', name: '曹洪', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 86, command: 78, intellect: 50, factionAffinity: 'caocao', loyalty: 92, isMonarch: false, stationedSiteId: 'xiaopei' },
  { id: 'xuchu', name: '许褚', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 96, command: 68, intellect: 30, factionAffinity: 'caocao', loyalty: 95, isMonarch: false, stationedSiteId: 'xiaopei' },
  // 曹操（兖州）
  { id: 'chengyu', name: '程昱', status: 'serving', factionId: 'caocao', provinceId: 'yan', might: 45, command: 74, intellect: 92, factionAffinity: 'caocao', loyalty: 85, isMonarch: false, stationedSiteId: 'chenliu' },
  { id: 'yujin', name: '于禁', status: 'serving', factionId: 'caocao', provinceId: 'yan', might: 82, command: 87, intellect: 62, factionAffinity: 'caocao', loyalty: 84, isMonarch: false, stationedSiteId: 'puyang' },
  { id: 'yuejin', name: '乐进', status: 'serving', factionId: 'caocao', provinceId: 'yan', might: 88, command: 82, intellect: 55, factionAffinity: 'caocao', loyalty: 90, isMonarch: false, stationedSiteId: 'baima' },
  { id: 'lidian', name: '李典', status: 'serving', factionId: 'caocao', provinceId: 'yan', might: 78, command: 80, intellect: 72, factionAffinity: 'caocao', loyalty: 88, isMonarch: false, stationedSiteId: 'chenliu' },
  // 曹操（徐州）
  { id: 'zhangliao', name: '张辽', status: 'serving', factionId: 'caocao', provinceId: 'xu', might: 92, command: 93, intellect: 78, factionAffinity: 'caocao', loyalty: 85, isMonarch: false, stationedSiteId: 'xiapi' },
  { id: 'xuhuang', name: '徐晃', status: 'serving', factionId: 'caocao', provinceId: 'xu', might: 91, command: 89, intellect: 70, factionAffinity: 'caocao', loyalty: 86, isMonarch: false, stationedSiteId: 'pengcheng' },
  // 曹操（冀州）
  { id: 'zhanghe', name: '张郃', status: 'serving', factionId: 'caocao', provinceId: 'ji', might: 88, command: 90, intellect: 76, factionAffinity: 'caocao', loyalty: 80, isMonarch: false, stationedSiteId: 'ye' },
  { id: 'gaolan', name: '高览', status: 'serving', factionId: 'caocao', provinceId: 'ji', might: 85, command: 80, intellect: 62, factionAffinity: 'caocao', loyalty: 78, isMonarch: false, stationedSiteId: 'nanpi' },
  { id: 'caochun', name: '曹纯', status: 'serving', factionId: 'caocao', provinceId: 'ji', might: 85, command: 84, intellect: 66, factionAffinity: 'caocao', loyalty: 90, isMonarch: false, stationedSiteId: 'ye' },
  // 曹操（荆州）
  { id: 'wenpin', name: '文聘', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 82, command: 84, intellect: 68, factionAffinity: 'caocao', loyalty: 82, isMonarch: false, stationedSiteId: 'jiangling' },
  { id: 'caimao', name: '蔡瑁', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 65, command: 70, intellect: 66, factionAffinity: 'caocao', loyalty: 70, isMonarch: false, stationedSiteId: 'xiangyang' },

  // 孙权（扬州）
  { id: 'sunquan', name: '孙权', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 70, command: 82, intellect: 80, factionAffinity: 'sunquan', loyalty: 100, isMonarch: true, stationedSiteId: 'jianye' },
  { id: 'zhouyu', name: '周瑜', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 78, command: 94, intellect: 92, factionAffinity: 'sunquan', loyalty: 95, isMonarch: false, stationedSiteId: 'chaisang' },
  { id: 'lusu', name: '鲁肃', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 55, command: 76, intellect: 93, factionAffinity: 'sunquan', loyalty: 92, isMonarch: false, stationedSiteId: 'jianye' },
  { id: 'zhangzhao', name: '张昭', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 30, command: 50, intellect: 90, factionAffinity: 'sunquan', loyalty: 88, isMonarch: false, stationedSiteId: 'jianye' },
  { id: 'zhanghong', name: '张纮', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 28, command: 48, intellect: 88, factionAffinity: 'sunquan', loyalty: 87, isMonarch: false, stationedSiteId: 'wu' },
  { id: 'chengpu', name: '程普', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 84, command: 86, intellect: 70, factionAffinity: 'sunquan', loyalty: 94, isMonarch: false, stationedSiteId: 'wu' },
  { id: 'huanggai', name: '黄盖', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 83, command: 82, intellect: 66, factionAffinity: 'sunquan', loyalty: 93, isMonarch: false, stationedSiteId: 'wu' },
  { id: 'handang', name: '韩当', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 85, command: 80, intellect: 58, factionAffinity: 'sunquan', loyalty: 92, isMonarch: false, stationedSiteId: 'kuaiji' },
  { id: 'taishici', name: '太史慈', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 90, command: 84, intellect: 70, factionAffinity: 'sunquan', loyalty: 88, isMonarch: false, stationedSiteId: 'yuzhang' },
  { id: 'ganning', name: '甘宁', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 92, command: 82, intellect: 72, factionAffinity: 'sunquan', loyalty: 80, isMonarch: false, stationedSiteId: 'danyang' },
  { id: 'lumeng', name: '吕蒙', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 81, command: 89, intellect: 84, factionAffinity: 'sunquan', loyalty: 90, isMonarch: false, stationedSiteId: 'poyang' },

  // 在野（荆州）
  { id: 'huangzhong', name: '黄忠', status: 'wild', factionId: null, provinceId: 'jing', might: 93, command: 88, intellect: 62, factionAffinity: 'liubei', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'weiyan', name: '魏延', status: 'wild', factionId: null, provinceId: 'jing', might: 90, command: 86, intellect: 72, factionAffinity: 'liubei', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'pangtong', name: '庞统', status: 'wild', factionId: null, provinceId: 'jing', might: 36, command: 80, intellect: 97, factionAffinity: 'liubei', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'maliang', name: '马良', status: 'wild', factionId: null, provinceId: 'jing', might: 30, command: 60, intellect: 88, factionAffinity: 'liubei', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'masu', name: '马谡', status: 'wild', factionId: null, provinceId: 'jing', might: 60, command: 68, intellect: 82, factionAffinity: 'liubei', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'yiji', name: '伊籍', status: 'wild', factionId: null, provinceId: 'jing', might: 40, command: 55, intellect: 80, factionAffinity: 'liubei', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'huojun', name: '霍峻', status: 'wild', factionId: null, provinceId: 'jing', might: 80, command: 82, intellect: 66, factionAffinity: 'liubei', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'xianglang', name: '向朗', status: 'wild', factionId: null, provinceId: 'jing', might: 45, command: 60, intellect: 78, factionAffinity: 'liubei', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'liaohua', name: '廖化', status: 'wild', factionId: null, provinceId: 'jing', might: 78, command: 75, intellect: 66, factionAffinity: 'liubei', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'liuba', name: '刘巴', status: 'wild', factionId: null, provinceId: 'jing', might: 25, command: 55, intellect: 86, factionAffinity: 'liubei', loyalty: 0, isMonarch: false, stationedSiteId: null },
  // 在野（司隶）
  { id: 'simayi', name: '司马懿', status: 'wild', factionId: null, provinceId: 'sili', might: 63, command: 90, intellect: 98, factionAffinity: 'caocao', loyalty: 0, isMonarch: false, stationedSiteId: null },
  // 在野（凉州）
  { id: 'machao', name: '马超', status: 'wild', factionId: null, provinceId: 'liang', might: 97, command: 90, intellect: 55, factionAffinity: null, loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'pangde', name: '庞德', status: 'wild', factionId: null, provinceId: 'liang', might: 94, command: 85, intellect: 62, factionAffinity: 'caocao', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'madai', name: '马岱', status: 'wild', factionId: null, provinceId: 'liang', might: 82, command: 78, intellect: 62, factionAffinity: null, loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'zhanglu', name: '张鲁', status: 'wild', factionId: null, provinceId: 'liang', might: 60, command: 70, intellect: 72, factionAffinity: null, loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'yanpu', name: '阎圃', status: 'wild', factionId: null, provinceId: 'liang', might: 35, command: 58, intellect: 80, factionAffinity: null, loyalty: 0, isMonarch: false, stationedSiteId: null },
  // 在野（益州）
  { id: 'fazheng', name: '法正', status: 'wild', factionId: null, provinceId: 'yi', might: 40, command: 70, intellect: 93, factionAffinity: 'liubei', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'zhangsong', name: '张松', status: 'wild', factionId: null, provinceId: 'yi', might: 20, command: 40, intellect: 84, factionAffinity: 'liubei', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'huangquan', name: '黄权', status: 'wild', factionId: null, provinceId: 'yi', might: 55, command: 72, intellect: 85, factionAffinity: null, loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'liyan', name: '李严', status: 'wild', factionId: null, provinceId: 'yi', might: 72, command: 78, intellect: 80, factionAffinity: null, loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'yanyan', name: '严颜', status: 'wild', factionId: null, provinceId: 'yi', might: 85, command: 82, intellect: 66, factionAffinity: 'liubei', loyalty: 0, isMonarch: false, stationedSiteId: null },
  // 在野（幽州、并州、交州）
  { id: 'tianchou', name: '田畴', status: 'wild', factionId: null, provinceId: 'you', might: 50, command: 65, intellect: 82, factionAffinity: 'caocao', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'zhangyan', name: '张燕', status: 'wild', factionId: null, provinceId: 'bing', might: 80, command: 78, intellect: 62, factionAffinity: 'caocao', loyalty: 0, isMonarch: false, stationedSiteId: null },
  { id: 'shixie', name: '士燮', status: 'wild', factionId: null, provinceId: 'jiao', might: 50, command: 68, intellect: 76, factionAffinity: null, loyalty: 0, isMonarch: false, stationedSiteId: null },
]
