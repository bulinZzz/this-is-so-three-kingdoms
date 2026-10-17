import type { Character } from './model'

/**
 * 建安十三年（208 年）的人物数据，按所在州分布，供寻访抽取。
 * 十家势力的部属各按本州落位、驻守自有战略点并统率一支部队；未出仕者按在野列入各州，供寻访。
 * 袁氏是唯一的无君主势力：袁绍已死，三子相争，故不设君主，只列部属。
 * 在野者标注寻访卡池层级：荆襄名士置于基础池，保证刘备据江夏时可在荆州寻得；名将置于高层。
 * 势力倾向记各将对各势力的偏好（0–100，50 为中性），只记非中性者；忠诚与性格另按人给定，与偏好无关。
 * 能力与兵力取自演义印象，年龄按史书推算，具体平衡待核心玩法验证后再调。
 * 生年无明文者依人物关系估定：凡人物之间的次序（如刘关张的结义之序）在数据里必须立得住，
 * 不为某家推算让路。
 *
 * 迭代 10 起，四项能力按本色取值，成长另设更高的上限（见 growth），只靠出战积累。
 */
const RAW_CHARACTERS: Character[] = [
  // 刘备（荆州）
  { id: 'liubei', name: '刘备', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 73, command: 75, intellect: 76, politics: 80, age: 47, personality: 'open', affinities: { liubei: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'jiangxia', troops: 5000, tier: null },
  { id: 'guanyu', name: '关羽', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 97, command: 95, intellect: 75, politics: 45, age: 46, personality: 'proud', affinities: { liubei: 96, caocao: 70, sunquan: 30 }, loyalty: 98, isMonarch: false, stationedSiteId: 'jiangxia', troops: 8000, tier: null },
  { id: 'zhangfei', name: '张飞', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 98, command: 85, intellect: 40, politics: 30, age: 42, personality: 'brave', affinities: { liubei: 95 }, loyalty: 96, isMonarch: false, stationedSiteId: 'jiangxia', troops: 6000, tier: null },
  { id: 'zhaoyun', name: '赵云', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 96, command: 91, intellect: 76, politics: 50, age: 40, personality: 'steady', affinities: { liubei: 90 }, loyalty: 97, isMonarch: false, stationedSiteId: 'jiangxia', troops: 4000, tier: null },
  { id: 'zhugeliang', name: '诸葛亮', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 38, command: 92, intellect: 100, politics: 95, age: 27, personality: 'cautious', affinities: { liubei: 92 }, loyalty: 100, isMonarch: false, stationedSiteId: 'jiangxia', troops: 2000, tier: null },
  { id: 'mizhu', name: '糜竺', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 30, command: 45, intellect: 72, politics: 78, age: 43, personality: 'steady', affinities: { liubei: 85 }, loyalty: 90, isMonarch: false, stationedSiteId: 'jiangxia', troops: 1000, tier: null },
  { id: 'jianyong', name: '简雍', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 25, command: 40, intellect: 70, politics: 72, age: 48, personality: 'open', affinities: { liubei: 82 }, loyalty: 88, isMonarch: false, stationedSiteId: 'jiangxia', troops: 800, tier: null },
  { id: 'sunqian', name: '孙乾', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 28, command: 42, intellect: 71, politics: 74, age: 43, personality: 'steady', affinities: { liubei: 80 }, loyalty: 87, isMonarch: false, stationedSiteId: 'jiangxia', troops: 800, tier: null },
  { id: 'chendao', name: '陈到', status: 'serving', factionId: 'liubei', provinceId: 'jing', might: 85, command: 80, intellect: 60, politics: 45, age: 28, personality: 'brave', affinities: { liubei: 88 }, loyalty: 92, isMonarch: false, stationedSiteId: 'jiangxia', troops: 2000, tier: null },

  // 曹操（豫州）
  { id: 'caocao', name: '曹操', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 72, command: 96, intellect: 91, politics: 92, age: 53, personality: 'scheming', affinities: { caocao: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'xudu', troops: 20000, tier: null },
  // 曹操（司隶）
  { id: 'xiahoudun', name: '夏侯惇', status: 'serving', factionId: 'caocao', provinceId: 'sili', might: 90, command: 88, intellect: 55, politics: 60, age: 51, personality: 'brave', affinities: { caocao: 95 }, loyalty: 95, isMonarch: false, stationedSiteId: 'luoyang', troops: 8000, tier: null },
  { id: 'xiahouyuan', name: '夏侯渊', status: 'serving', factionId: 'caocao', provinceId: 'sili', might: 91, command: 90, intellect: 60, politics: 55, age: 51, personality: 'brave', affinities: { caocao: 92 }, loyalty: 93, isMonarch: false, stationedSiteId: 'hulao', troops: 8000, tier: null },
  { id: 'jiaxu', name: '贾诩', status: 'serving', factionId: 'caocao', provinceId: 'sili', might: 45, command: 70, intellect: 97, politics: 85, age: 61, personality: 'scheming', affinities: { caocao: 65 }, loyalty: 82, isMonarch: false, stationedSiteId: 'hulao', troops: 2000, tier: null },
  // 曹操（豫州）
  { id: 'xunyu', name: '荀彧', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 30, command: 60, intellect: 96, politics: 96, age: 45, personality: 'steady', affinities: { caocao: 80 }, loyalty: 88, isMonarch: false, stationedSiteId: 'xudu', troops: 1000, tier: null },
  { id: 'xunyou', name: '荀攸', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 32, command: 62, intellect: 94, politics: 90, age: 51, personality: 'cautious', affinities: { caocao: 85 }, loyalty: 87, isMonarch: false, stationedSiteId: 'xudu', troops: 1000, tier: null },
  { id: 'guojia', name: '郭嘉', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 30, command: 65, intellect: 98, politics: 88, age: 38, personality: 'open', affinities: { caocao: 88 }, loyalty: 86, isMonarch: false, stationedSiteId: 'xudu', troops: 1000, tier: null },
  { id: 'caoren', name: '曹仁', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 89, command: 90, intellect: 68, politics: 70, age: 40, personality: 'steady', affinities: { caocao: 94 }, loyalty: 94, isMonarch: false, stationedSiteId: 'xiaopei', troops: 6000, tier: null },
  { id: 'caohong', name: '曹洪', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 86, command: 78, intellect: 50, politics: 55, age: 39, personality: 'brave', affinities: { caocao: 90 }, loyalty: 92, isMonarch: false, stationedSiteId: 'xiaopei', troops: 4000, tier: null },
  { id: 'xuchu', name: '许褚', status: 'serving', factionId: 'caocao', provinceId: 'yu', might: 96, command: 68, intellect: 30, politics: 25, age: 38, personality: 'brave', affinities: { caocao: 93 }, loyalty: 95, isMonarch: false, stationedSiteId: 'xiaopei', troops: 3000, tier: null },
  // 曹操（兖州）
  { id: 'chengyu', name: '程昱', status: 'serving', factionId: 'caocao', provinceId: 'yan', might: 45, command: 74, intellect: 92, politics: 88, age: 67, personality: 'scheming', affinities: { caocao: 86 }, loyalty: 85, isMonarch: false, stationedSiteId: 'chenliu', troops: 2000, tier: null },
  { id: 'yujin', name: '于禁', status: 'serving', factionId: 'caocao', provinceId: 'yan', might: 82, command: 87, intellect: 62, politics: 68, age: 40, personality: 'cautious', affinities: { caocao: 84 }, loyalty: 84, isMonarch: false, stationedSiteId: 'puyang', troops: 5000, tier: null },
  { id: 'yuejin', name: '乐进', status: 'serving', factionId: 'caocao', provinceId: 'yan', might: 88, command: 82, intellect: 55, politics: 50, age: 48, personality: 'brave', affinities: { caocao: 88 }, loyalty: 90, isMonarch: false, stationedSiteId: 'baima', troops: 5000, tier: null },
  { id: 'lidian', name: '李典', status: 'serving', factionId: 'caocao', provinceId: 'yan', might: 78, command: 80, intellect: 72, politics: 70, age: 34, personality: 'steady', affinities: { caocao: 85 }, loyalty: 88, isMonarch: false, stationedSiteId: 'chenliu', troops: 3000, tier: null },
  // 曹操（徐州）
  { id: 'zhangliao', name: '张辽', status: 'serving', factionId: 'caocao', provinceId: 'xu', might: 92, command: 93, intellect: 78, politics: 65, age: 39, personality: 'steady', affinities: { caocao: 88, liubei: 65 }, loyalty: 85, isMonarch: false, stationedSiteId: 'xiapi', troops: 7000, tier: null },
  { id: 'xuhuang', name: '徐晃', status: 'serving', factionId: 'caocao', provinceId: 'xu', might: 91, command: 89, intellect: 70, politics: 60, age: 39, personality: 'steady', affinities: { caocao: 86 }, loyalty: 86, isMonarch: false, stationedSiteId: 'pengcheng', troops: 6000, tier: null },
  // 曹操（官渡降将，随河北易主移驻兖州）
  { id: 'zhanghe', name: '张郃', status: 'serving', factionId: 'caocao', provinceId: 'yan', might: 88, command: 90, intellect: 76, politics: 68, age: 41, personality: 'cautious', affinities: { caocao: 70 }, loyalty: 80, isMonarch: false, stationedSiteId: 'baima', troops: 6000, tier: null },
  { id: 'gaolan', name: '高览', status: 'serving', factionId: 'caocao', provinceId: 'yan', might: 85, command: 80, intellect: 62, politics: 45, age: 38, personality: 'steady', affinities: { caocao: 68 }, loyalty: 78, isMonarch: false, stationedSiteId: 'puyang', troops: 4000, tier: null },
  { id: 'caochun', name: '曹纯', status: 'serving', factionId: 'caocao', provinceId: 'yan', might: 85, command: 84, intellect: 66, politics: 60, age: 38, personality: 'brave', affinities: { caocao: 90 }, loyalty: 90, isMonarch: false, stationedSiteId: 'chenliu', troops: 4000, tier: null },
  // 曹操（荆州）
  { id: 'wenpin', name: '文聘', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 82, command: 84, intellect: 68, politics: 66, age: 38, personality: 'steady', affinities: { caocao: 72 }, loyalty: 82, isMonarch: false, stationedSiteId: 'jiangling', troops: 4000, tier: null },
  { id: 'caimao', name: '蔡瑁', status: 'serving', factionId: 'caocao', provinceId: 'jing', might: 65, command: 70, intellect: 66, politics: 60, age: 43, personality: 'scheming', affinities: { caocao: 30 }, loyalty: 70, isMonarch: false, stationedSiteId: 'xiangyang', troops: 3000, tier: null },

  // 袁氏（河北、幽、并、青；官渡之后袁绍已死，三子相争，无君主）
  { id: 'yuanshang', name: '袁尚', status: 'serving', factionId: 'yuanshi', provinceId: 'ji', might: 72, command: 76, intellect: 64, politics: 62, age: 26, personality: 'cautious', affinities: { yuanshi: 92 }, loyalty: 92, isMonarch: false, stationedSiteId: 'ye', troops: 8000, tier: null },
  { id: 'shenpei', name: '审配', status: 'serving', factionId: 'yuanshi', provinceId: 'ji', might: 62, command: 78, intellect: 84, politics: 78, age: 46, personality: 'steady', affinities: { yuanshi: 94 }, loyalty: 95, isMonarch: false, stationedSiteId: 'ye', troops: 6000, tier: null },
  { id: 'yuantan', name: '袁谭', status: 'serving', factionId: 'yuanshi', provinceId: 'ji', might: 74, command: 72, intellect: 58, politics: 55, age: 30, personality: 'brave', affinities: { yuanshi: 90 }, loyalty: 88, isMonarch: false, stationedSiteId: 'nanpi', troops: 9000, tier: null },
  { id: 'guotu', name: '郭图', status: 'serving', factionId: 'yuanshi', provinceId: 'ji', might: 40, command: 55, intellect: 80, politics: 76, age: 45, personality: 'scheming', affinities: { yuanshi: 86 }, loyalty: 80, isMonarch: false, stationedSiteId: 'nanpi', troops: 2000, tier: null },
  { id: 'yuanxi', name: '袁熙', status: 'serving', factionId: 'yuanshi', provinceId: 'you', might: 68, command: 70, intellect: 60, politics: 58, age: 27, personality: 'steady', affinities: { yuanshi: 88 }, loyalty: 85, isMonarch: false, stationedSiteId: 'jicheng', troops: 7000, tier: null },
  { id: 'gaogan', name: '高干', status: 'serving', factionId: 'yuanshi', provinceId: 'bing', might: 76, command: 78, intellect: 66, politics: 62, age: 35, personality: 'brave', affinities: { yuanshi: 86 }, loyalty: 82, isMonarch: false, stationedSiteId: 'jinyang', troops: 7000, tier: null },
  { id: 'xinping', name: '辛评', status: 'serving', factionId: 'yuanshi', provinceId: 'qing', might: 45, command: 60, intellect: 78, politics: 74, age: 44, personality: 'open', affinities: { yuanshi: 84 }, loyalty: 82, isMonarch: false, stationedSiteId: 'linzi', troops: 2000, tier: null },

  // 孙权（扬州）
  { id: 'sunquan', name: '孙权', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 70, command: 82, intellect: 80, politics: 88, age: 26, personality: 'cautious', affinities: { sunquan: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'jianye', troops: 15000, tier: null },
  { id: 'zhouyu', name: '周瑜', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 78, command: 94, intellect: 92, politics: 85, age: 33, personality: 'proud', affinities: { sunquan: 95 }, loyalty: 95, isMonarch: false, stationedSiteId: 'chaisang', troops: 8000, tier: null },
  { id: 'lusu', name: '鲁肃', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 55, command: 76, intellect: 93, politics: 88, age: 36, personality: 'open', affinities: { sunquan: 88, liubei: 65 }, loyalty: 92, isMonarch: false, stationedSiteId: 'jianye', troops: 3000, tier: null },
  { id: 'zhangzhao', name: '张昭', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 30, command: 50, intellect: 90, politics: 92, age: 52, personality: 'cautious', affinities: { sunquan: 90 }, loyalty: 88, isMonarch: false, stationedSiteId: 'jianye', troops: 1000, tier: null },
  { id: 'zhanghong', name: '张纮', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 28, command: 48, intellect: 88, politics: 88, age: 56, personality: 'steady', affinities: { sunquan: 88 }, loyalty: 87, isMonarch: false, stationedSiteId: 'wu', troops: 1000, tier: null },
  { id: 'chengpu', name: '程普', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 84, command: 86, intellect: 70, politics: 65, age: 58, personality: 'brave', affinities: { sunquan: 94 }, loyalty: 94, isMonarch: false, stationedSiteId: 'wu', troops: 5000, tier: null },
  { id: 'huanggai', name: '黄盖', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 83, command: 82, intellect: 66, politics: 55, age: 63, personality: 'brave', affinities: { sunquan: 93 }, loyalty: 93, isMonarch: false, stationedSiteId: 'wu', troops: 5000, tier: null },
  { id: 'handang', name: '韩当', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 85, command: 80, intellect: 58, politics: 50, age: 56, personality: 'brave', affinities: { sunquan: 92 }, loyalty: 92, isMonarch: false, stationedSiteId: 'kuaiji', troops: 4000, tier: null },
  { id: 'taishici', name: '太史慈', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 90, command: 84, intellect: 70, politics: 60, age: 42, personality: 'brave', affinities: { sunquan: 70 }, loyalty: 88, isMonarch: false, stationedSiteId: 'yuzhang', troops: 4000, tier: null },
  { id: 'ganning', name: '甘宁', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 92, command: 82, intellect: 72, politics: 40, age: 33, personality: 'brave', affinities: { sunquan: 68 }, loyalty: 80, isMonarch: false, stationedSiteId: 'danyang', troops: 4000, tier: null },
  { id: 'lumeng', name: '吕蒙', status: 'serving', factionId: 'sunquan', provinceId: 'yang', might: 81, command: 89, intellect: 84, politics: 78, age: 30, personality: 'scheming', affinities: { sunquan: 88 }, loyalty: 90, isMonarch: false, stationedSiteId: 'poyang', troops: 5000, tier: null },

  // 刘璋（益州）
  { id: 'liuzhang', name: '刘璋', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 42, command: 55, intellect: 65, politics: 72, age: 41, personality: 'cautious', affinities: { liuzhang: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'chengdu', troops: 8000, tier: null },
  { id: 'huangquan', name: '黄权', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 55, command: 72, intellect: 85, politics: 82, age: 22, personality: 'steady', affinities: { liuzhang: 85, liubei: 62 }, loyalty: 84, isMonarch: false, stationedSiteId: 'jiangzhou', troops: 2000, tier: null },
  { id: 'liyan', name: '李严', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 72, command: 78, intellect: 80, politics: 80, age: 30, personality: 'scheming', affinities: { liuzhang: 78, liubei: 62 }, loyalty: 80, isMonarch: false, stationedSiteId: 'fucheng', troops: 2000, tier: null },
  { id: 'yanyan', name: '严颜', status: 'serving', factionId: 'liuzhang', provinceId: 'yi', might: 85, command: 82, intellect: 66, politics: 50, age: 58, personality: 'brave', affinities: { liuzhang: 82, liubei: 68 }, loyalty: 82, isMonarch: false, stationedSiteId: 'baidicheng', troops: 2000, tier: null },

  // 马腾（关中）
  { id: 'mateng', name: '马腾', status: 'serving', factionId: 'mateng', provinceId: 'sili', might: 84, command: 80, intellect: 58, politics: 62, age: 52, personality: 'brave', affinities: { mateng: 98, hansui: 58 }, loyalty: 100, isMonarch: true, stationedSiteId: 'changan', troops: 7000, tier: null },
  { id: 'machao', name: '马超', status: 'serving', factionId: 'mateng', provinceId: 'sili', might: 97, command: 90, intellect: 55, politics: 40, age: 32, personality: 'brave', affinities: { mateng: 95, caocao: 45 }, loyalty: 88, isMonarch: false, stationedSiteId: 'changan', troops: 8000, tier: null },
  { id: 'pangde', name: '庞德', status: 'serving', factionId: 'mateng', provinceId: 'sili', might: 94, command: 85, intellect: 62, politics: 45, age: 38, personality: 'steady', affinities: { mateng: 88, caocao: 72 }, loyalty: 82, isMonarch: false, stationedSiteId: 'chencang', troops: 4000, tier: null },

  // 韩遂（陇右）
  { id: 'hansui', name: '韩遂', status: 'serving', factionId: 'hansui', provinceId: 'liang', might: 74, command: 78, intellect: 76, politics: 66, age: 58, personality: 'scheming', affinities: { hansui: 98, mateng: 58 }, loyalty: 100, isMonarch: true, stationedSiteId: 'tianshui', troops: 7000, tier: null },
  { id: 'yanxing', name: '阎行', status: 'serving', factionId: 'hansui', provinceId: 'liang', might: 86, command: 78, intellect: 58, politics: 45, age: 34, personality: 'brave', affinities: { hansui: 85 }, loyalty: 82, isMonarch: false, stationedSiteId: 'tianshui', troops: 3000, tier: null },

  // 公孙康（辽东）
  { id: 'gongsunkang', name: '公孙康', status: 'serving', factionId: 'gongsunkang', provinceId: 'you', might: 62, command: 72, intellect: 66, politics: 70, age: 32, personality: 'cautious', affinities: { gongsunkang: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'xiangping', troops: 6000, tier: null },
  { id: 'gongsungong', name: '公孙恭', status: 'serving', factionId: 'gongsunkang', provinceId: 'you', might: 52, command: 62, intellect: 60, politics: 64, age: 36, personality: 'steady', affinities: { gongsunkang: 90 }, loyalty: 84, isMonarch: false, stationedSiteId: 'xiangping', troops: 2000, tier: null },

  // 张鲁（汉中）
  { id: 'zhanglu', name: '张鲁', status: 'serving', factionId: 'zhanglu', provinceId: 'liang', might: 60, command: 70, intellect: 72, politics: 70, age: 38, personality: 'cautious', affinities: { zhanglu: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'hanzhong', troops: 8000, tier: null },
  { id: 'yanpu', name: '阎圃', status: 'serving', factionId: 'zhanglu', provinceId: 'liang', might: 35, command: 58, intellect: 80, politics: 78, age: 40, personality: 'cautious', affinities: { zhanglu: 82 }, loyalty: 84, isMonarch: false, stationedSiteId: 'hanzhong', troops: 2000, tier: null },

  // 士燮（交州）
  { id: 'shixie', name: '士燮', status: 'serving', factionId: 'shixie', provinceId: 'jiao', might: 50, command: 68, intellect: 76, politics: 80, age: 71, personality: 'cautious', affinities: { shixie: 98 }, loyalty: 100, isMonarch: true, stationedSiteId: 'longbian', troops: 5000, tier: null },
  { id: 'shiyi', name: '士壹', status: 'serving', factionId: 'shixie', provinceId: 'jiao', might: 48, command: 60, intellect: 62, politics: 70, age: 56, personality: 'steady', affinities: { shixie: 90 }, loyalty: 86, isMonarch: false, stationedSiteId: 'hepu', troops: 2000, tier: null },

  // 在野（荆州）——荆襄名士置于基础池
  { id: 'huangzhong', name: '黄忠', status: 'wild', factionId: null, provinceId: 'jing', might: 93, command: 88, intellect: 62, politics: 45, age: 60, personality: 'brave', affinities: { liubei: 85 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'basic' },
  { id: 'weiyan', name: '魏延', status: 'wild', factionId: null, provinceId: 'jing', might: 90, command: 86, intellect: 72, politics: 40, age: 34, personality: 'proud', affinities: { liubei: 80 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'basic' },
  { id: 'pangtong', name: '庞统', status: 'wild', factionId: null, provinceId: 'jing', might: 36, command: 80, intellect: 97, politics: 90, age: 29, personality: 'proud', affinities: { liubei: 82 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'basic' },
  { id: 'maliang', name: '马良', status: 'wild', factionId: null, provinceId: 'jing', might: 30, command: 60, intellect: 88, politics: 88, age: 21, personality: 'steady', affinities: { liubei: 85 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'basic' },
  { id: 'masu', name: '马谡', status: 'wild', factionId: null, provinceId: 'jing', might: 60, command: 68, intellect: 82, politics: 76, age: 18, personality: 'proud', affinities: { liubei: 88 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'basic' },
  { id: 'yiji', name: '伊籍', status: 'wild', factionId: null, provinceId: 'jing', might: 40, command: 55, intellect: 80, politics: 78, age: 28, personality: 'open', affinities: { liubei: 80 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'basic' },
  { id: 'huojun', name: '霍峻', status: 'wild', factionId: null, provinceId: 'jing', might: 80, command: 82, intellect: 66, politics: 60, age: 30, personality: 'steady', affinities: { liubei: 82 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'basic' },
  { id: 'xianglang', name: '向朗', status: 'wild', factionId: null, provinceId: 'jing', might: 45, command: 60, intellect: 78, politics: 80, age: 41, personality: 'steady', affinities: { liubei: 80 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'basic' },
  { id: 'liaohua', name: '廖化', status: 'wild', factionId: null, provinceId: 'jing', might: 78, command: 75, intellect: 66, politics: 55, age: 18, personality: 'steady', affinities: { liubei: 85 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'basic' },
  { id: 'liuba', name: '刘巴', status: 'wild', factionId: null, provinceId: 'jing', might: 25, command: 55, intellect: 86, politics: 90, age: 24, personality: 'cautious', affinities: { liubei: 62 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'basic' },
  // 在野（司隶）
  { id: 'simayi', name: '司马懿', status: 'wild', factionId: null, provinceId: 'sili', might: 63, command: 90, intellect: 98, politics: 92, age: 29, personality: 'scheming', affinities: { caocao: 75 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'third' },
  // 在野（凉州）
  { id: 'madai', name: '马岱', status: 'wild', factionId: null, provinceId: 'liang', might: 82, command: 78, intellect: 62, politics: 45, age: 25, personality: 'steady', affinities: { mateng: 82 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'second' },
  // 在野（益州）
  { id: 'fazheng', name: '法正', status: 'wild', factionId: null, provinceId: 'yi', might: 40, command: 70, intellect: 93, politics: 85, age: 32, personality: 'scheming', affinities: { liubei: 85 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'third' },
  { id: 'zhangsong', name: '张松', status: 'wild', factionId: null, provinceId: 'yi', might: 20, command: 40, intellect: 84, politics: 78, age: 38, personality: 'open', affinities: { liubei: 82 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'second' },
  // 在野（幽州、并州）
  { id: 'tianchou', name: '田畴', status: 'wild', factionId: null, provinceId: 'you', might: 50, command: 65, intellect: 82, politics: 80, age: 39, personality: 'steady', affinities: { caocao: 68 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'second' },
  { id: 'zhangyan', name: '张燕', status: 'wild', factionId: null, provinceId: 'bing', might: 80, command: 78, intellect: 62, politics: 55, age: 48, personality: 'brave', affinities: { caocao: 65 }, loyalty: 0, isMonarch: false, stationedSiteId: null, troops: 0, tier: 'second' },
]

/** 能力起步的上限：与本色上限同为 100，载入时不再压缩数值，只作越界时的截断。 */
const ABILITY_CEILING = 100

/** 把一项能力收在起步上限之内。 */
function softenAbility(value: number): number {
  return Math.min(value, ABILITY_CEILING)
}

/** 武将数据：四项能力载入时统一收在起步上限之内，成长的上限另记于 growth。 */
export const CHARACTERS_SANGUO: Character[] = RAW_CHARACTERS.map((character) => ({
  ...character,
  might: softenAbility(character.might),
  command: softenAbility(character.command),
  intellect: softenAbility(character.intellect),
  politics: softenAbility(character.politics),
}))
