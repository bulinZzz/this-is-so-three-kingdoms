import type { Geography } from './model'

/**
 * 三国时期的地理格局。
 * 覆盖司隶、雍、豫、兖、徐、青、凉、并、冀、幽、扬、荆、益、交十四州，共 41 个战略点。
 * 邻接表示「可直接行军」，按地理推导：若两点之间存在第三个战略点，则它们不相邻。
 */
export const GEOGRAPHY_SANGUO: Geography = {
  provinces: [
    { id: 'sili', name: '司隶' },
    { id: 'yong', name: '雍州' },
    { id: 'yu', name: '豫州' },
    { id: 'yan', name: '兖州' },
    { id: 'xu', name: '徐州' },
    { id: 'qing', name: '青州' },
    { id: 'liang', name: '凉州' },
    { id: 'bing', name: '并州' },
    { id: 'ji', name: '冀州' },
    { id: 'you', name: '幽州' },
    { id: 'yang', name: '扬州' },
    { id: 'jing', name: '荆州' },
    { id: 'yi', name: '益州' },
    { id: 'jiao', name: '交州' },
  ],
  sites: [
    // 司隶
    { id: 'changan', name: '长安', type: 'city', provinceId: 'sili', owner: null, neighbors: ['luoyang', 'wancheng'] },
    { id: 'luoyang', name: '洛阳', type: 'city', provinceId: 'sili', owner: 'caocao', neighbors: ['hulao', 'bowangpo', 'changan'] },
    { id: 'sishui', name: '汜水关', type: 'pass', provinceId: 'sili', owner: 'caocao', neighbors: ['hulao', 'guandu', 'xudu'] },
    { id: 'hulao', name: '虎牢关', type: 'pass', provinceId: 'sili', owner: 'caocao', neighbors: ['sishui', 'luoyang'] },

    // 兖州
    { id: 'guandu', name: '官渡', type: 'field', provinceId: 'sili', owner: 'caocao', neighbors: ['chenliu', 'sishui', 'xudu', 'baima'] },
    { id: 'chenliu', name: '陈留', type: 'city', provinceId: 'yan', owner: 'caocao', neighbors: ['guandu', 'baima', 'qiao', 'changyi'] },
    { id: 'puyang', name: '濮阳', type: 'city', provinceId: 'yan', owner: 'caocao', neighbors: ['baima', 'ye', 'changyi', 'pingyuan'] },
    { id: 'baima', name: '白马', type: 'pass', provinceId: 'yan', owner: 'caocao', neighbors: ['puyang', 'ye', 'chenliu', 'guandu'] },
    { id: 'changyi', name: '昌邑', type: 'city', provinceId: 'yan', owner: 'caocao', neighbors: ['xiaopei', 'qiao', 'puyang', 'chenliu', 'pingyuan'] },

    // 豫州
    { id: 'xudu', name: '许都', type: 'city', provinceId: 'yu', owner: 'caocao', neighbors: ['guandu', 'sishui', 'bowangpo', 'runan'] },
    { id: 'runan', name: '汝南', type: 'city', provinceId: 'yu', owner: 'caocao', neighbors: ['bowangpo', 'xudu', 'qiao', 'jiangxia'] },
    { id: 'qiao', name: '谯', type: 'city', provinceId: 'yu', owner: 'caocao', neighbors: ['pengcheng', 'chenliu', 'changyi', 'xiaopei', 'runan', 'shouchun'] },
    { id: 'xiaopei', name: '小沛', type: 'city', provinceId: 'yu', owner: 'caocao', neighbors: ['pengcheng', 'changyi', 'qiao'] },

    // 徐州
    { id: 'pengcheng', name: '彭城', type: 'city', provinceId: 'xu', owner: 'caocao', neighbors: ['xiaopei', 'xiapi', 'qiao'] },
    { id: 'xiapi', name: '下邳', type: 'city', provinceId: 'xu', owner: 'caocao', neighbors: ['pengcheng', 'shouchun', 'guangling', 'jianye'] },
    { id: 'guangling', name: '广陵', type: 'city', provinceId: 'xu', owner: null, neighbors: ['jianye', 'wu', 'xiapi'] },

    // 冀州
    { id: 'ye', name: '邺', type: 'city', provinceId: 'ji', owner: 'caocao', neighbors: ['puyang', 'baima', 'pingyuan', 'zhongshan'] },
    { id: 'zhongshan', name: '中山', type: 'city', provinceId: 'ji', owner: 'caocao', neighbors: ['nanpi', 'ye'] },
    { id: 'nanpi', name: '南皮', type: 'city', provinceId: 'ji', owner: 'caocao', neighbors: ['bohai', 'pingyuan', 'zhongshan'] },
    { id: 'bohai', name: '渤海', type: 'city', provinceId: 'ji', owner: 'caocao', neighbors: ['nanpi'] },
    { id: 'pingyuan', name: '平原', type: 'city', provinceId: 'ji', owner: 'caocao', neighbors: ['nanpi', 'ye', 'puyang', 'changyi'] },

    // 扬州
    { id: 'shouchun', name: '寿春', type: 'city', provinceId: 'yang', owner: 'caocao', neighbors: ['hefei', 'jianye', 'xiapi', 'qiao'] },
    { id: 'hefei', name: '合肥', type: 'city', provinceId: 'yang', owner: 'caocao', neighbors: ['lujiang', 'shouchun', 'jianye'] },
    { id: 'lujiang', name: '庐江', type: 'city', provinceId: 'yang', owner: null, neighbors: ['hefei', 'chaisang'] },
    { id: 'jianye', name: '建业', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['guangling', 'hefei', 'shouchun', 'xiapi'] },
    { id: 'wu', name: '吴', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['kuaiji', 'guangling'] },
    { id: 'kuaiji', name: '会稽', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['wu'] },
    { id: 'chaisang', name: '柴桑', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['yuzhang', 'jiangxia', 'chibi', 'lujiang'] },
    { id: 'yuzhang', name: '豫章', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['chaisang', 'changsha'] },

    // 荆州
    { id: 'wancheng', name: '宛', type: 'city', provinceId: 'jing', owner: 'caocao', neighbors: ['xinye', 'bowangpo', 'changan'] },
    { id: 'bowangpo', name: '博望坡', type: 'field', provinceId: 'jing', owner: 'caocao', neighbors: ['wancheng', 'xudu', 'runan', 'luoyang'] },
    { id: 'xinye', name: '新野', type: 'city', provinceId: 'jing', owner: 'caocao', neighbors: ['fancheng', 'wancheng'] },
    { id: 'fancheng', name: '樊城', type: 'city', provinceId: 'jing', owner: 'caocao', neighbors: ['xiangyang', 'xinye'] },
    { id: 'xiangyang', name: '襄阳', type: 'city', provinceId: 'jing', owner: 'caocao', neighbors: ['fancheng', 'jiangling', 'jiangxia'] },
    { id: 'jiangling', name: '江陵', type: 'city', provinceId: 'jing', owner: 'caocao', neighbors: ['wuling', 'chibi', 'xiangyang'] },
    { id: 'jiangxia', name: '江夏', type: 'city', provinceId: 'jing', owner: 'liubei', neighbors: ['chibi', 'chaisang', 'xiangyang', 'runan'] },
    { id: 'chibi', name: '赤壁', type: 'field', provinceId: 'jing', owner: null, neighbors: ['jiangxia', 'jiangling', 'chaisang', 'changsha'] },
    { id: 'changsha', name: '长沙', type: 'city', provinceId: 'jing', owner: null, neighbors: ['wuling', 'chibi', 'lingling', 'guiyang', 'yuzhang'] },
    { id: 'guiyang', name: '桂阳', type: 'city', provinceId: 'jing', owner: null, neighbors: ['lingling', 'changsha'] },
    { id: 'lingling', name: '零陵', type: 'city', provinceId: 'jing', owner: null, neighbors: ['guiyang', 'changsha'] },
    { id: 'wuling', name: '武陵', type: 'city', provinceId: 'jing', owner: null, neighbors: ['changsha', 'jiangling'] },
  ],
}
