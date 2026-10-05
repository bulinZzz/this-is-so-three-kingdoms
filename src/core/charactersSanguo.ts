import type { Character } from './model'

/**
 * 建安十三年（208 年）的人物数据，按所在州分布，供寻访抽取。
 * 不在三家之列的势力，其部属按在野处理。
 */
export const CHARACTERS_SANGUO: Character[] = [
  // 刘备（荆州）
  { id: 'guanyu', name: '关羽', status: 'serving', factionId: 'liubei', provinceId: 'jing' },
  { id: 'zhangfei', name: '张飞', status: 'serving', factionId: 'liubei', provinceId: 'jing' },
  { id: 'zhaoyun', name: '赵云', status: 'serving', factionId: 'liubei', provinceId: 'jing' },
  { id: 'zhugeliang', name: '诸葛亮', status: 'serving', factionId: 'liubei', provinceId: 'jing' },
  { id: 'mizhu', name: '糜竺', status: 'serving', factionId: 'liubei', provinceId: 'jing' },
  { id: 'jianyong', name: '简雍', status: 'serving', factionId: 'liubei', provinceId: 'jing' },
  { id: 'sunqian', name: '孙乾', status: 'serving', factionId: 'liubei', provinceId: 'jing' },
  { id: 'chendao', name: '陈到', status: 'serving', factionId: 'liubei', provinceId: 'jing' },

  // 曹操（司隶）
  { id: 'xiahoudun', name: '夏侯惇', status: 'serving', factionId: 'caocao', provinceId: 'sili' },
  { id: 'xiahouyuan', name: '夏侯渊', status: 'serving', factionId: 'caocao', provinceId: 'sili' },
  { id: 'jiaxu', name: '贾诩', status: 'serving', factionId: 'caocao', provinceId: 'sili' },
  // 曹操（豫州）
  { id: 'xunyu', name: '荀彧', status: 'serving', factionId: 'caocao', provinceId: 'yu' },
  { id: 'xunyou', name: '荀攸', status: 'serving', factionId: 'caocao', provinceId: 'yu' },
  { id: 'guojia', name: '郭嘉', status: 'serving', factionId: 'caocao', provinceId: 'yu' },
  { id: 'caoren', name: '曹仁', status: 'serving', factionId: 'caocao', provinceId: 'yu' },
  { id: 'caohong', name: '曹洪', status: 'serving', factionId: 'caocao', provinceId: 'yu' },
  { id: 'xuchu', name: '许褚', status: 'serving', factionId: 'caocao', provinceId: 'yu' },
  // 曹操（兖州）
  { id: 'chengyu', name: '程昱', status: 'serving', factionId: 'caocao', provinceId: 'yan' },
  { id: 'yujin', name: '于禁', status: 'serving', factionId: 'caocao', provinceId: 'yan' },
  { id: 'yuejin', name: '乐进', status: 'serving', factionId: 'caocao', provinceId: 'yan' },
  { id: 'lidian', name: '李典', status: 'serving', factionId: 'caocao', provinceId: 'yan' },
  // 曹操（徐州）
  { id: 'zhangliao', name: '张辽', status: 'serving', factionId: 'caocao', provinceId: 'xu' },
  { id: 'xuhuang', name: '徐晃', status: 'serving', factionId: 'caocao', provinceId: 'xu' },
  // 曹操（冀州）
  { id: 'zhanghe', name: '张郃', status: 'serving', factionId: 'caocao', provinceId: 'ji' },
  { id: 'gaolan', name: '高览', status: 'serving', factionId: 'caocao', provinceId: 'ji' },
  { id: 'caochun', name: '曹纯', status: 'serving', factionId: 'caocao', provinceId: 'ji' },
  // 曹操（荆州）
  { id: 'wenpin', name: '文聘', status: 'serving', factionId: 'caocao', provinceId: 'jing' },
  { id: 'caimao', name: '蔡瑁', status: 'serving', factionId: 'caocao', provinceId: 'jing' },

  // 孙权（扬州）
  { id: 'zhouyu', name: '周瑜', status: 'serving', factionId: 'sunquan', provinceId: 'yang' },
  { id: 'lusu', name: '鲁肃', status: 'serving', factionId: 'sunquan', provinceId: 'yang' },
  { id: 'zhangzhao', name: '张昭', status: 'serving', factionId: 'sunquan', provinceId: 'yang' },
  { id: 'zhanghong', name: '张纮', status: 'serving', factionId: 'sunquan', provinceId: 'yang' },
  { id: 'chengpu', name: '程普', status: 'serving', factionId: 'sunquan', provinceId: 'yang' },
  { id: 'huanggai', name: '黄盖', status: 'serving', factionId: 'sunquan', provinceId: 'yang' },
  { id: 'handang', name: '韩当', status: 'serving', factionId: 'sunquan', provinceId: 'yang' },
  { id: 'taishici', name: '太史慈', status: 'serving', factionId: 'sunquan', provinceId: 'yang' },
  { id: 'ganning', name: '甘宁', status: 'serving', factionId: 'sunquan', provinceId: 'yang' },
  { id: 'lumeng', name: '吕蒙', status: 'serving', factionId: 'sunquan', provinceId: 'yang' },

  // 在野（荆州）
  { id: 'huangzhong', name: '黄忠', status: 'wild', factionId: null, provinceId: 'jing' },
  { id: 'weiyan', name: '魏延', status: 'wild', factionId: null, provinceId: 'jing' },
  { id: 'pangtong', name: '庞统', status: 'wild', factionId: null, provinceId: 'jing' },
  { id: 'maliang', name: '马良', status: 'wild', factionId: null, provinceId: 'jing' },
  { id: 'masu', name: '马谡', status: 'wild', factionId: null, provinceId: 'jing' },
  { id: 'yiji', name: '伊籍', status: 'wild', factionId: null, provinceId: 'jing' },
  { id: 'huojun', name: '霍峻', status: 'wild', factionId: null, provinceId: 'jing' },
  { id: 'xianglang', name: '向朗', status: 'wild', factionId: null, provinceId: 'jing' },
  { id: 'liaohua', name: '廖化', status: 'wild', factionId: null, provinceId: 'jing' },
  { id: 'liuba', name: '刘巴', status: 'wild', factionId: null, provinceId: 'jing' },
  // 在野（司隶）
  { id: 'simayi', name: '司马懿', status: 'wild', factionId: null, provinceId: 'sili' },
  // 在野（凉州）
  { id: 'machao', name: '马超', status: 'wild', factionId: null, provinceId: 'liang' },
  { id: 'pangde', name: '庞德', status: 'wild', factionId: null, provinceId: 'liang' },
  { id: 'madai', name: '马岱', status: 'wild', factionId: null, provinceId: 'liang' },
  { id: 'zhanglu', name: '张鲁', status: 'wild', factionId: null, provinceId: 'liang' },
  { id: 'yanpu', name: '阎圃', status: 'wild', factionId: null, provinceId: 'liang' },
  // 在野（益州）
  { id: 'fazheng', name: '法正', status: 'wild', factionId: null, provinceId: 'yi' },
  { id: 'zhangsong', name: '张松', status: 'wild', factionId: null, provinceId: 'yi' },
  { id: 'huangquan', name: '黄权', status: 'wild', factionId: null, provinceId: 'yi' },
  { id: 'liyan', name: '李严', status: 'wild', factionId: null, provinceId: 'yi' },
  { id: 'yanyan', name: '严颜', status: 'wild', factionId: null, provinceId: 'yi' },
  // 在野（幽州、并州、交州）
  { id: 'tianchou', name: '田畴', status: 'wild', factionId: null, provinceId: 'you' },
  { id: 'zhangyan', name: '张燕', status: 'wild', factionId: null, provinceId: 'bing' },
  { id: 'shixie', name: '士燮', status: 'wild', factionId: null, provinceId: 'jiao' },
]
