import type { Geography } from './model'

/**
 * 建安十三年（208 年）的地理格局。
 * 覆盖司隶、雍、豫、兖、徐、青、凉、并、冀、幽、扬、荆、益、交十四州，共 40 个战略点。
 */
export const GEOGRAPHY_208: Geography = {
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
    // 雍州
    { id: 'changan', name: '长安', type: 'city', provinceId: 'yong', owner: null, neighbors: ['luoyang'] },

    // 司隶
    { id: 'luoyang', name: '洛阳', type: 'city', provinceId: 'sili', owner: 'caocao', neighbors: ['changan', 'sishui'] },
    { id: 'sishui', name: '汜水关', type: 'pass', provinceId: 'sili', owner: 'caocao', neighbors: ['luoyang', 'hulao'] },
    { id: 'hulao', name: '虎牢关', type: 'pass', provinceId: 'sili', owner: 'caocao', neighbors: ['sishui', 'chenliu', 'guandu'] },

    // 兖州
    { id: 'guandu', name: '官渡', type: 'field', provinceId: 'sili', owner: 'caocao', neighbors: ['hulao', 'chenliu', 'puyang', 'baima'] },
    { id: 'chenliu', name: '陈留', type: 'city', provinceId: 'yan', owner: 'caocao', neighbors: ['hulao', 'guandu', 'xudu', 'puyang'] },
    { id: 'puyang', name: '濮阳', type: 'city', provinceId: 'yan', owner: 'caocao', neighbors: ['chenliu', 'guandu', 'baima', 'ye', 'changyi'] },
    { id: 'baima', name: '白马', type: 'pass', provinceId: 'yan', owner: 'caocao', neighbors: ['guandu', 'puyang', 'ye'] },
    { id: 'changyi', name: '昌邑', type: 'city', provinceId: 'yan', owner: 'caocao', neighbors: ['puyang', 'qiao', 'pengcheng', 'pingyuan'] },

    // 豫州
    { id: 'xudu', name: '许都', type: 'city', provinceId: 'yu', owner: 'caocao', neighbors: ['chenliu', 'runan', 'wancheng'] },
    { id: 'runan', name: '汝南', type: 'city', provinceId: 'yu', owner: 'caocao', neighbors: ['xudu', 'qiao', 'shouchun', 'wancheng'] },
    { id: 'qiao', name: '谯', type: 'city', provinceId: 'yu', owner: 'caocao', neighbors: ['runan', 'changyi', 'xiaopei'] },
    { id: 'xiaopei', name: '小沛', type: 'city', provinceId: 'yu', owner: 'caocao', neighbors: ['qiao', 'pengcheng'] },

    // 徐州
    { id: 'pengcheng', name: '彭城', type: 'city', provinceId: 'xu', owner: 'caocao', neighbors: ['xiaopei', 'xiapi', 'changyi'] },
    { id: 'xiapi', name: '下邳', type: 'city', provinceId: 'xu', owner: 'caocao', neighbors: ['pengcheng', 'guangling'] },
    { id: 'guangling', name: '广陵', type: 'city', provinceId: 'xu', owner: null, neighbors: ['xiapi', 'hefei'] },

    // 冀州
    { id: 'ye', name: '邺', type: 'city', provinceId: 'ji', owner: 'caocao', neighbors: ['puyang', 'baima', 'zhongshan', 'nanpi', 'pingyuan'] },
    { id: 'zhongshan', name: '中山', type: 'city', provinceId: 'ji', owner: 'caocao', neighbors: ['ye', 'nanpi'] },
    { id: 'nanpi', name: '南皮', type: 'city', provinceId: 'ji', owner: 'caocao', neighbors: ['ye', 'zhongshan', 'bohai', 'pingyuan'] },
    { id: 'bohai', name: '渤海', type: 'city', provinceId: 'ji', owner: 'caocao', neighbors: ['nanpi', 'pingyuan'] },
    { id: 'pingyuan', name: '平原', type: 'city', provinceId: 'ji', owner: 'caocao', neighbors: ['ye', 'nanpi', 'bohai', 'changyi'] },

    // 扬州
    { id: 'shouchun', name: '寿春', type: 'city', provinceId: 'yang', owner: 'caocao', neighbors: ['runan', 'hefei', 'lujiang'] },
    { id: 'hefei', name: '合肥', type: 'city', provinceId: 'yang', owner: 'caocao', neighbors: ['shouchun', 'lujiang', 'jianye', 'guangling'] },
    { id: 'lujiang', name: '庐江', type: 'city', provinceId: 'yang', owner: null, neighbors: ['shouchun', 'hefei', 'chaisang'] },
    { id: 'jianye', name: '建业', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['hefei', 'wu', 'chaisang'] },
    { id: 'wu', name: '吴', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['jianye', 'kuaiji'] },
    { id: 'kuaiji', name: '会稽', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['wu', 'yuzhang'] },
    { id: 'chaisang', name: '柴桑', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['lujiang', 'jianye', 'yuzhang', 'jiangxia'] },
    { id: 'yuzhang', name: '豫章', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['kuaiji', 'chaisang', 'changsha'] },

    // 荆州
    { id: 'wancheng', name: '宛', type: 'city', provinceId: 'jing', owner: 'caocao', neighbors: ['xudu', 'runan', 'bowangpo', 'xiangyang'] },
    { id: 'bowangpo', name: '博望坡', type: 'field', provinceId: 'jing', owner: null, neighbors: ['wancheng', 'xinye'] },
    { id: 'xinye', name: '新野', type: 'city', provinceId: 'jing', owner: 'liubei', neighbors: ['bowangpo', 'xiangyang', 'fancheng'] },
    { id: 'fancheng', name: '樊城', type: 'city', provinceId: 'jing', owner: null, neighbors: ['xinye', 'xiangyang', 'jiangling'] },
    { id: 'xiangyang', name: '襄阳', type: 'city', provinceId: 'jing', owner: null, neighbors: ['wancheng', 'xinye', 'fancheng', 'jiangling'] },
    { id: 'jiangling', name: '江陵', type: 'city', provinceId: 'jing', owner: null, neighbors: ['fancheng', 'xiangyang', 'jiangxia', 'wuling', 'changsha'] },
    { id: 'jiangxia', name: '江夏', type: 'city', provinceId: 'jing', owner: null, neighbors: ['chaisang', 'jiangling', 'changsha'] },
    { id: 'changsha', name: '长沙', type: 'city', provinceId: 'jing', owner: null, neighbors: ['yuzhang', 'jiangling', 'jiangxia', 'guiyang', 'lingling', 'wuling'] },
    { id: 'guiyang', name: '桂阳', type: 'city', provinceId: 'jing', owner: null, neighbors: ['changsha', 'lingling'] },
    { id: 'lingling', name: '零陵', type: 'city', provinceId: 'jing', owner: null, neighbors: ['changsha', 'guiyang', 'wuling'] },
    { id: 'wuling', name: '武陵', type: 'city', provinceId: 'jing', owner: null, neighbors: ['jiangling', 'changsha', 'lingling'] },
  ],
}
