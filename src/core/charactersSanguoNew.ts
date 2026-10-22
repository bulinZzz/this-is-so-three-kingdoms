import type { Character } from './model'

/**
 * 「建安十三年（新）」的人物数据，正在逐个添加。
 * 眼下是赤壁战后荆州一隅的四家人马：刘备一行驻公安，曹操诸将守江陵、襄阳、樊城与夷陵，
 * 荆南四郡由刘度、赵范、金旋、韩玄四位太守各守其郡，同属「荆南」，江东则周瑜守柴桑。
 * 扬州另有淮南与江东的前线：张辽、李典、乐进守合肥，孙权自据建业，太史慈守京口。
 * 关中另有一处：钟繇守长安，马腾率马超、马岱、庞德据槐里；陇右的韩遂已与马腾合为一家、奉马腾为主，驻金城。
 * 汉中另有一处：张鲁据南郑，阎圃同在城中，其弟张卫守阳平关。
 * 益州另有刘璋一家：刘璋据成都，黄权、刘巴同在；北出涪城有杨怀、高沛，绵竹有费观、李严、董和，雒城有刘循、张任、吴懿、吴兰、雷铜，巴郡江州有严颜。
 * 南中另有「南蛮」一家：孟获称王而自据泸水，三江城有祝融夫人、带来洞主与木鹿大王，秃龙洞有朵思大王、孟优，桃花渡有兀突骨。
 * 在仕者必须有隶属势力与驻地；城池与关隘的驻地须为本方所有，野地无归属，任何势力都可驻守。
 * 势力至多一名君主，也可以没有；孙权据建业、马腾据槐里、张鲁据南郑、刘璋据成都、孟获据泸水，各自为君主，曹操与荆南则无君主。
 * 兵力按势力强弱分层，由弱至强依次是刘备、荆南、刘璋与南蛮、张鲁与马腾、孙权、曹操，后一层明显强于前一层；
 * 张鲁与马腾各自立家、势力相当，同在独立势力一层；各家武将的兵力均不超过统率所定的带兵上限。
 */
export const CHARACTERS_SANGUO_NEW: Character[] = [
  // 刘备（荆州，据公安；开局最弱，须先经营）
  { id: 'liubei', name: '刘备', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 73, command: 75, intellect: 76, politics: 80, age: 47, personality: 'open', affinities: { liubei: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'gongan', troops: 2000, tier: null },
  { id: 'guanyu', name: '关羽', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 97, command: 95, intellect: 75, politics: 45, age: 46, personality: 'proud', affinities: { liubei: 96, caocao: 70, sunquan: 30 }, loyalty: 98, isMonarch: false, stationedSiteId: 'gongan', troops: 1000, tier: null },
  { id: 'zhangfei', name: '张飞', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 98, command: 85, intellect: 40, politics: 30, age: 42, personality: 'brave', affinities: { liubei: 95 }, loyalty: 96, isMonarch: false, stationedSiteId: 'gongan', troops: 1000, tier: null },
  { id: 'zhaoyun', name: '赵云', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 96, command: 91, intellect: 76, politics: 50, age: 40, personality: 'steady', affinities: { liubei: 90 }, loyalty: 97, isMonarch: false, stationedSiteId: 'gongan', troops: 1000, tier: null },
  { id: 'zhugeliang', name: '诸葛亮', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 38, command: 92, intellect: 100, politics: 95, age: 27, personality: 'cautious', affinities: { liubei: 92 }, loyalty: 100, isMonarch: false, stationedSiteId: 'gongan', troops: 1000, tier: null },

  // 曹操（荆州，守江陵）
  { id: 'caoren', name: '曹仁', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 89, command: 90, intellect: 68, politics: 70, age: 40, personality: 'steady', affinities: { caocao: 94 }, loyalty: 94, isMonarch: false, stationedSiteId: 'jiangling', troops: 13000, tier: null },
  { id: 'niujin', name: '牛金', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 80, command: 78, intellect: 45, politics: 40, age: 36, personality: 'brave', affinities: { caocao: 80 }, loyalty: 85, isMonarch: false, stationedSiteId: 'jiangling', troops: 11500, tier: null },
  { id: 'caochun', name: '曹纯', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 85, command: 84, intellect: 66, politics: 60, age: 38, personality: 'brave', affinities: { caocao: 90 }, loyalty: 90, isMonarch: false, stationedSiteId: 'jiangling', troops: 11500, tier: null },

  // 曹操（荆州，夏侯惇守襄阳、满宠守樊城、曹洪守夷陵）
  { id: 'xiahoudun', name: '夏侯惇', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 90, command: 88, intellect: 55, politics: 60, age: 51, personality: 'brave', affinities: { caocao: 95 }, loyalty: 95, isMonarch: false, stationedSiteId: 'xiangyang', troops: 13000, tier: null },
  { id: 'manchong', name: '满宠', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 68, command: 82, intellect: 80, politics: 82, age: 42, personality: 'steady', affinities: { caocao: 88 }, loyalty: 88, isMonarch: false, stationedSiteId: 'fancheng', troops: 11500, tier: null },
  { id: 'caohong', name: '曹洪', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 86, command: 78, intellect: 50, politics: 55, age: 39, personality: 'brave', affinities: { caocao: 90 }, loyalty: 92, isMonarch: false, stationedSiteId: 'yiling', troops: 11500, tier: null },

  // 曹操（扬州，张辽、李典、乐进守合肥）
  { id: 'zhangliao', name: '张辽', status: 'serving', factionId: 'caocao', provinceId: 'yang', might: 92, command: 93, intellect: 78, politics: 65, age: 39, personality: 'steady', affinities: { caocao: 88, liubei: 65 }, loyalty: 85, isMonarch: false, stationedSiteId: 'hefei', troops: 13500, tier: null },
  { id: 'lidian', name: '李典', status: 'serving', factionId: 'caocao', provinceId: 'yang', might: 78, command: 80, intellect: 72, politics: 70, age: 34, personality: 'steady', affinities: { caocao: 85 }, loyalty: 88, isMonarch: false, stationedSiteId: 'hefei', troops: 11500, tier: null },
  { id: 'yuejin', name: '乐进', status: 'serving', factionId: 'caocao', provinceId: 'yang', might: 88, command: 82, intellect: 55, politics: 50, age: 48, personality: 'brave', affinities: { caocao: 88 }, loyalty: 90, isMonarch: false, stationedSiteId: 'hefei', troops: 11500, tier: null },

  // 曹操（司隶，钟繇守长安）
  { id: 'zhongyao', name: '钟繇', status: 'serving', factionId: 'caocao', provinceId: 'sili', might: 45, command: 62, intellect: 86, politics: 92, age: 58, personality: 'cautious', affinities: { caocao: 92 }, loyalty: 92, isMonarch: false, stationedSiteId: 'changan', troops: 9000, tier: null },

  // 马腾（司隶，据槐里，四将同驻；与张鲁同处独立势力一层）
  { id: 'mateng', name: '马腾', status: 'serving', factionId: 'mateng', provinceId: 'sili', might: 84, command: 80, intellect: 58, politics: 62, age: 52, personality: 'brave', affinities: { mateng: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'huaili', troops: 7000, tier: null },
  { id: 'machao', name: '马超', status: 'serving', factionId: 'mateng', provinceId: 'sili', might: 97, command: 90, intellect: 55, politics: 40, age: 32, personality: 'brave', affinities: { mateng: 95, caocao: 45 }, loyalty: 88, isMonarch: false, stationedSiteId: 'huaili', troops: 10000, tier: null },
  { id: 'madai', name: '马岱', status: 'serving', factionId: 'mateng', provinceId: 'sili', might: 82, command: 78, intellect: 62, politics: 45, age: 25, personality: 'steady', affinities: { mateng: 82 }, loyalty: 88, isMonarch: false, stationedSiteId: 'huaili', troops: 6000, tier: null },
  { id: 'pangde', name: '庞德', status: 'serving', factionId: 'mateng', provinceId: 'sili', might: 94, command: 85, intellect: 62, politics: 45, age: 38, personality: 'steady', affinities: { mateng: 88, caocao: 72 }, loyalty: 82, isMonarch: false, stationedSiteId: 'huaili', troops: 7000, tier: null },
  // 韩遂本是陇右之雄，与马腾久有嫌隙，眼下合为一家、奉马腾为主，自守金城；忠诚偏低，正是这份旧怨的写照。
  { id: 'hansui', name: '韩遂', status: 'serving', factionId: 'mateng', provinceId: 'liang', might: 74, command: 78, intellect: 76, politics: 66, age: 58, personality: 'scheming', affinities: { mateng: 58 }, loyalty: 70, isMonarch: false, stationedSiteId: 'jincheng', troops: 6000, tier: null },

  // 张鲁（凉州，据南郑，弟张卫守阳平关；与马腾同处独立势力一层）
  { id: 'zhanglu', name: '张鲁', status: 'serving', factionId: 'zhanglu', provinceId: 'liang', might: 60, command: 70, intellect: 72, politics: 70, age: 38, personality: 'cautious', affinities: { zhanglu: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'nanzheng', troops: 10000, tier: null },
  { id: 'zhangwei', name: '张卫', status: 'serving', factionId: 'zhanglu', provinceId: 'liang', might: 72, command: 74, intellect: 48, politics: 42, age: 34, personality: 'brave', affinities: { zhanglu: 88 }, loyalty: 88, isMonarch: false, stationedSiteId: 'yangpingguan', troops: 11000, tier: null },
  { id: 'yanpu', name: '阎圃', status: 'serving', factionId: 'zhanglu', provinceId: 'liang', might: 32, command: 58, intellect: 78, politics: 76, age: 46, personality: 'cautious', affinities: { zhanglu: 85 }, loyalty: 85, isMonarch: false, stationedSiteId: 'nanzheng', troops: 8000, tier: null },

  // 孙权（扬州，周瑜守柴桑，孙权据建业、太史慈守京口；除曹操外最强）
  { id: 'zhouyu', name: '周瑜', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 78, command: 94, intellect: 92, politics: 85, age: 33, personality: 'proud', affinities: { sunquan: 95 }, loyalty: 95, isMonarch: false, stationedSiteId: 'chaisang', troops: 14000, tier: null },
  { id: 'sunquan', name: '孙权', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 70, command: 82, intellect: 80, politics: 88, age: 26, personality: 'cautious', affinities: { sunquan: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'jianye', troops: 12000, tier: null },
  { id: 'taishici', name: '太史慈', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 90, command: 84, intellect: 70, politics: 60, age: 42, personality: 'brave', affinities: { sunquan: 70 }, loyalty: 88, isMonarch: false, stationedSiteId: 'jingkou', troops: 12000, tier: null },

  // 荆南（荆州，四郡各守其郡；无君主，合成一家，刘备南下所取的第一块）
  // 长沙
  { id: 'hanxuan', name: '韩玄', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 55, command: 62, intellect: 52, politics: 60, age: 50, personality: 'cautious', affinities: {}, loyalty: 75, isMonarch: false, stationedSiteId: 'changsha', troops: 2000, tier: null },
  { id: 'huangzhong', name: '黄忠', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 93, command: 88, intellect: 62, politics: 45, age: 60, personality: 'brave', affinities: { liubei: 85 }, loyalty: 55, isMonarch: false, stationedSiteId: 'changsha', troops: 1500, tier: null },
  { id: 'weiyan', name: '魏延', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 90, command: 86, intellect: 72, politics: 40, age: 34, personality: 'proud', affinities: { liubei: 80 }, loyalty: 50, isMonarch: false, stationedSiteId: 'changsha', troops: 1500, tier: null },
  // 零陵
  { id: 'liudu', name: '刘度', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 45, command: 62, intellect: 55, politics: 66, age: 50, personality: 'steady', affinities: {}, loyalty: 85, isMonarch: false, stationedSiteId: 'lingling', troops: 1500, tier: null },
  { id: 'liuxian', name: '刘贤', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 58, command: 55, intellect: 45, politics: 42, age: 26, personality: 'brave', affinities: {}, loyalty: 85, isMonarch: false, stationedSiteId: 'lingling', troops: 1000, tier: null },
  { id: 'xingdaorong', name: '邢道荣', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 78, command: 60, intellect: 35, politics: 30, age: 36, personality: 'brave', affinities: {}, loyalty: 80, isMonarch: false, stationedSiteId: 'lingling', troops: 1000, tier: null },
  // 桂阳
  { id: 'zhaofan', name: '赵范', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 48, command: 60, intellect: 62, politics: 68, age: 42, personality: 'scheming', affinities: {}, loyalty: 78, isMonarch: false, stationedSiteId: 'guiyang', troops: 1500, tier: null },
  { id: 'chenying', name: '陈应', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 70, command: 58, intellect: 42, politics: 35, age: 33, personality: 'brave', affinities: {}, loyalty: 80, isMonarch: false, stationedSiteId: 'guiyang', troops: 1000, tier: null },
  { id: 'baolong', name: '鲍隆', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 72, command: 56, intellect: 40, politics: 32, age: 35, personality: 'brave', affinities: {}, loyalty: 80, isMonarch: false, stationedSiteId: 'guiyang', troops: 1000, tier: null },
  // 武陵
  { id: 'jinxuan', name: '金旋', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 68, command: 70, intellect: 58, politics: 62, age: 45, personality: 'steady', affinities: {}, loyalty: 85, isMonarch: false, stationedSiteId: 'wuling', troops: 2000, tier: null },
  { id: 'gongzhi', name: '巩志', status: 'serving', factionId: 'jingnan', provinceId: 'jing', might: 55, command: 62, intellect: 72, politics: 70, age: 35, personality: 'cautious', affinities: { liubei: 65 }, loyalty: 60, isMonarch: false, stationedSiteId: 'wuling', troops: 1000, tier: null },

  // 刘璋（益州，据成都；涪城、绵竹、雒城、江州各置守将；刘备南下所取的第二块，兵多而不精）
  // 涪城
  { id: 'yanghuai', name: '杨怀', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 72, command: 68, intellect: 50, politics: 45, age: 42, personality: 'brave', affinities: { liuzhang: 80 }, loyalty: 82, isMonarch: false, stationedSiteId: 'fucheng', troops: 1000, tier: null },
  { id: 'gaopei', name: '高沛', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 74, command: 70, intellect: 48, politics: 42, age: 40, personality: 'brave', affinities: { liuzhang: 80 }, loyalty: 82, isMonarch: false, stationedSiteId: 'fucheng', troops: 1000, tier: null },
  // 绵竹
  { id: 'feiguan', name: '费观', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 60, command: 68, intellect: 55, politics: 62, age: 40, personality: 'steady', affinities: { liuzhang: 85 }, loyalty: 80, isMonarch: false, stationedSiteId: 'mianzhu', troops: 1000, tier: null },
  { id: 'liyan', name: '李严', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 80, command: 82, intellect: 78, politics: 80, age: 38, personality: 'scheming', affinities: { liuzhang: 78, liubei: 58 }, loyalty: 72, isMonarch: false, stationedSiteId: 'mianzhu', troops: 2000, tier: null },
  { id: 'donghe', name: '董和', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 40, command: 62, intellect: 80, politics: 84, age: 46, personality: 'cautious', affinities: { liuzhang: 88 }, loyalty: 88, isMonarch: false, stationedSiteId: 'mianzhu', troops: 1000, tier: null },
  // 雒城
  { id: 'liuxun', name: '刘循', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 65, command: 72, intellect: 55, politics: 50, age: 30, personality: 'steady', affinities: { liuzhang: 90 }, loyalty: 95, isMonarch: false, stationedSiteId: 'luocheng', troops: 1500, tier: null },
  { id: 'zhangren', name: '张任', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 88, command: 86, intellect: 72, politics: 55, age: 40, personality: 'proud', affinities: { liuzhang: 88 }, loyalty: 95, isMonarch: false, stationedSiteId: 'luocheng', troops: 3000, tier: null },
  { id: 'wuyi', name: '吴懿', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 78, command: 76, intellect: 60, politics: 58, age: 38, personality: 'steady', affinities: { liuzhang: 75, liubei: 60 }, loyalty: 70, isMonarch: false, stationedSiteId: 'luocheng', troops: 1500, tier: null },
  { id: 'wulan', name: '吴兰', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 74, command: 68, intellect: 45, politics: 40, age: 35, personality: 'brave', affinities: { liuzhang: 75 }, loyalty: 75, isMonarch: false, stationedSiteId: 'luocheng', troops: 1000, tier: null },
  { id: 'leitong', name: '雷铜', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 76, command: 66, intellect: 42, politics: 38, age: 36, personality: 'brave', affinities: { liuzhang: 75 }, loyalty: 75, isMonarch: false, stationedSiteId: 'luocheng', troops: 1000, tier: null },
  // 江州
  { id: 'yanyan', name: '严颜', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 84, command: 80, intellect: 62, politics: 60, age: 58, personality: 'brave', affinities: { liuzhang: 85, liubei: 60 }, loyalty: 85, isMonarch: false, stationedSiteId: 'jiangzhou', troops: 2500, tier: null },
  // 成都
  { id: 'liuzhang', name: '刘璋', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 42, command: 66, intellect: 56, politics: 64, age: 48, personality: 'cautious', affinities: { liuzhang: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'chengdu', troops: 4000, tier: null },
  { id: 'huangquan', name: '黄权', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 70, command: 76, intellect: 82, politics: 78, age: 38, personality: 'steady', affinities: { liuzhang: 88 }, loyalty: 90, isMonarch: false, stationedSiteId: 'chengdu', troops: 2000, tier: null },
  { id: 'liuba', name: '刘巴', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 30, command: 55, intellect: 85, politics: 88, age: 40, personality: 'proud', affinities: { liuzhang: 80 }, loyalty: 80, isMonarch: false, stationedSiteId: 'chengdu', troops: 500, tier: null },

  // 南蛮（南中，据三江城；孟获称王，部族诸部分守各处，兵数与刘璋同档）
  // 泸水（孟获自据，蜀军南渡之处）
  { id: 'menghuo', name: '孟获', status: 'serving', factionId: 'nanman', provinceId: 'yi', might: 85, command: 85, intellect: 60, politics: 55, age: 45, personality: 'brave', affinities: { nanman: 100 }, loyalty: 100, isMonarch: true, stationedSiteId: 'lushui', troops: 5500, tier: null },
  { id: 'dongtuna', name: '董荼那', status: 'serving', factionId: 'nanman', provinceId: 'yi', might: 70, command: 62, intellect: 48, politics: 45, age: 40, personality: 'steady', affinities: { nanman: 85 }, loyalty: 82, isMonarch: false, stationedSiteId: 'lushui', troops: 1500, tier: null },
  { id: 'ahuinan', name: '阿会喃', status: 'serving', factionId: 'nanman', provinceId: 'yi', might: 68, command: 60, intellect: 45, politics: 42, age: 38, personality: 'brave', affinities: { nanman: 85 }, loyalty: 82, isMonarch: false, stationedSiteId: 'lushui', troops: 1500, tier: null },
  // 秃龙洞
  { id: 'duosi', name: '朵思大王', status: 'serving', factionId: 'nanman', provinceId: 'yi', might: 76, command: 66, intellect: 62, politics: 50, age: 50, personality: 'scheming', affinities: { nanman: 78 }, loyalty: 76, isMonarch: false, stationedSiteId: 'tulongdong', troops: 2500, tier: null },
  { id: 'mengyou', name: '孟优', status: 'serving', factionId: 'nanman', provinceId: 'yi', might: 72, command: 58, intellect: 45, politics: 40, age: 40, personality: 'brave', affinities: { nanman: 92 }, loyalty: 92, isMonarch: false, stationedSiteId: 'tulongdong', troops: 2000, tier: null },
  // 三江城
  { id: 'zhurong', name: '祝融夫人', status: 'serving', factionId: 'nanman', provinceId: 'yi', might: 82, command: 78, intellect: 62, politics: 50, age: 33, personality: 'proud', affinities: { nanman: 95 }, loyalty: 95, isMonarch: false, stationedSiteId: 'sancheng', troops: 3000, tier: null },
  { id: 'dailai', name: '带来洞主', status: 'serving', factionId: 'nanman', provinceId: 'yi', might: 70, command: 60, intellect: 52, politics: 48, age: 42, personality: 'steady', affinities: { nanman: 80 }, loyalty: 78, isMonarch: false, stationedSiteId: 'sancheng', troops: 2000, tier: null },
  { id: 'mulu', name: '木鹿大王', status: 'serving', factionId: 'nanman', provinceId: 'yi', might: 74, command: 66, intellect: 50, politics: 40, age: 48, personality: 'brave', affinities: { nanman: 78 }, loyalty: 76, isMonarch: false, stationedSiteId: 'sancheng', troops: 2000, tier: null },
  // 桃花渡（乌戈国主兀突骨）
  { id: 'wutugu', name: '兀突骨', status: 'serving', factionId: 'nanman', provinceId: 'yi', might: 88, command: 72, intellect: 30, politics: 25, age: 40, personality: 'brave', affinities: { nanman: 80 }, loyalty: 72, isMonarch: false, stationedSiteId: 'taohuadu', troops: 3000, tier: null },
]
