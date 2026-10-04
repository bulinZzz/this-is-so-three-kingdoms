import type { Geography } from './model'

/**
 * 三国时期的地理格局。
 * 河西与陇右同属凉州，共覆盖司隶、豫、兖、徐、青、凉、并、冀、幽、扬、荆、益、交十三州，共 49 个战略点。
 * 邻接表示「可直接行军」，按地理推导：若两点之间存在第三个战略点，则它们不相邻。
 */
export const GEOGRAPHY_SANGUO: Geography = {
  provinces: [
    { id: 'sili', name: '司隶' },
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
    { id: 'changan', name: '长安', type: 'city', provinceId: 'sili', owner: null, neighbors: ['wuzhangyuan', 'tongguan'] },
    { id: 'luoyang', name: '洛阳', type: 'city', provinceId: 'sili', owner: 'caocao', neighbors: ['hulao', 'bowangpo', 'tongguan'] },
    { id: 'sishui', name: '汜水关', type: 'pass', provinceId: 'sili', owner: 'caocao', neighbors: ['hulao', 'guandu', 'xudu'] },
    { id: 'hulao', name: '虎牢关', type: 'pass', provinceId: 'sili', owner: 'caocao', neighbors: ['sishui', 'luoyang'] },
    { id: 'tongguan', name: '潼关', type: 'pass', provinceId: 'sili', owner: null, neighbors: ['changan', 'luoyang'] },
    { id: 'wuzhangyuan', name: '五丈原', type: 'field', provinceId: 'sili', owner: null, neighbors: ['changan', 'hanzhong', 'jieting'] },

    // 兖州
    { id: 'guandu', name: '官渡', type: 'field', provinceId: 'sili', owner: 'caocao', neighbors: ['chenliu', 'sishui', 'xudu', 'baima'] },
    { id: 'chenliu', name: '陈留', type: 'city', provinceId: 'yan', owner: 'caocao', neighbors: ['guandu', 'baima', 'xiaopei'] },
    { id: 'puyang', name: '濮阳', type: 'city', provinceId: 'yan', owner: 'caocao', neighbors: ['baima', 'ye', 'xiaopei'] },
    { id: 'baima', name: '白马', type: 'pass', provinceId: 'yan', owner: 'caocao', neighbors: ['puyang', 'ye', 'chenliu', 'guandu'] },

    // 豫州
    { id: 'xudu', name: '许都', type: 'city', provinceId: 'yu', owner: 'caocao', neighbors: ['guandu', 'sishui', 'bowangpo'] },
    { id: 'xiaopei', name: '小沛', type: 'city', provinceId: 'yu', owner: 'caocao', neighbors: ['pengcheng', 'puyang', 'chenliu'] },

    // 徐州
    { id: 'pengcheng', name: '彭城', type: 'city', provinceId: 'xu', owner: 'caocao', neighbors: ['xiaopei', 'xiapi'] },
    { id: 'xiapi', name: '下邳', type: 'city', provinceId: 'xu', owner: 'caocao', neighbors: ['pengcheng', 'shouchun', 'jianye'] },

    // 冀州
    { id: 'ye', name: '邺', type: 'city', provinceId: 'ji', owner: 'caocao', neighbors: ['puyang', 'baima', 'nanpi'] },
    { id: 'nanpi', name: '南皮', type: 'city', provinceId: 'ji', owner: 'caocao', neighbors: ['ye'] },

    // 扬州
    { id: 'shouchun', name: '寿春', type: 'city', provinceId: 'yang', owner: 'caocao', neighbors: ['hefei', 'jianye', 'xiapi'] },
    { id: 'hefei', name: '合肥', type: 'city', provinceId: 'yang', owner: 'caocao', neighbors: ['lujiang', 'shouchun', 'jianye'] },
    { id: 'lujiang', name: '庐江', type: 'city', provinceId: 'yang', owner: null, neighbors: ['hefei', 'danyang', 'chaisang'] },
    { id: 'jianye', name: '建业', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['danyang', 'hefei', 'shouchun', 'wu', 'xiapi'] },
    { id: 'wu', name: '吴', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['kuaiji', 'danyang', 'jianye'] },
    { id: 'kuaiji', name: '会稽', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['wu', 'danyang'] },
    { id: 'chaisang', name: '柴桑', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['poyang', 'yuzhang', 'jiangxia', 'chibi', 'lujiang'] },
    { id: 'yuzhang', name: '豫章', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['poyang', 'chaisang', 'changsha'] },
    { id: 'poyang', name: '鄱阳', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['yuzhang', 'chaisang', 'danyang'] },
    { id: 'danyang', name: '丹阳', type: 'city', provinceId: 'yang', owner: 'sunquan', neighbors: ['jianye', 'lujiang', 'wu', 'kuaiji', 'poyang'] },

    // 荆州
    { id: 'wancheng', name: '宛', type: 'city', provinceId: 'jing', owner: 'caocao', neighbors: ['xinye', 'bowangpo'] },
    { id: 'bowangpo', name: '博望坡', type: 'field', provinceId: 'jing', owner: 'caocao', neighbors: ['wancheng', 'xudu', 'luoyang'] },
    { id: 'xinye', name: '新野', type: 'city', provinceId: 'jing', owner: 'caocao', neighbors: ['fancheng', 'wancheng'] },
    { id: 'fancheng', name: '樊城', type: 'city', provinceId: 'jing', owner: 'caocao', neighbors: ['xiangyang', 'xinye'] },
    { id: 'xiangyang', name: '襄阳', type: 'city', provinceId: 'jing', owner: 'caocao', neighbors: ['fancheng', 'changbanpo', 'jiangxia'] },
    { id: 'jiangling', name: '江陵', type: 'city', provinceId: 'jing', owner: 'caocao', neighbors: ['changbanpo', 'yiling', 'wuling', 'chibi'] },
    { id: 'jiangxia', name: '江夏', type: 'city', provinceId: 'jing', owner: 'liubei', neighbors: ['chibi', 'chaisang', 'xiangyang'] },
    { id: 'chibi', name: '赤壁', type: 'field', provinceId: 'jing', owner: null, neighbors: ['jiangxia', 'jiangling', 'chaisang', 'changsha'] },
    { id: 'changbanpo', name: '长坂坡', type: 'field', provinceId: 'jing', owner: 'caocao', neighbors: ['yiling', 'jiangling', 'xiangyang'] },
    { id: 'yiling', name: '夷陵', type: 'field', provinceId: 'jing', owner: 'caocao', neighbors: ['changbanpo', 'jiangling', 'baidicheng'] },
    { id: 'wuling', name: '武陵', type: 'city', provinceId: 'jing', owner: null, neighbors: ['changsha', 'jiangling'] },
    { id: 'lingling', name: '零陵', type: 'city', provinceId: 'jing', owner: null, neighbors: ['guiyang', 'changsha'] },
    { id: 'changsha', name: '长沙', type: 'city', provinceId: 'jing', owner: null, neighbors: ['wuling', 'chibi', 'lingling', 'guiyang', 'yuzhang'] },
    { id: 'guiyang', name: '桂阳', type: 'city', provinceId: 'jing', owner: null, neighbors: ['lingling', 'changsha'] },

    // 益州
    { id: 'chengdu', name: '成都', type: 'city', provinceId: 'yi', owner: null, neighbors: ['luocheng', 'jiangzhou'] },
    { id: 'baidicheng', name: '白帝城', type: 'city', provinceId: 'yi', owner: null, neighbors: ['yiling', 'jiangzhou', 'hanzhong'] },
    { id: 'jiamengguan', name: '葭萌关', type: 'pass', provinceId: 'yi', owner: null, neighbors: ['fucheng', 'hanzhong', 'qishan'] },
    { id: 'jiangzhou', name: '江州', type: 'city', provinceId: 'yi', owner: null, neighbors: ['chengdu', 'luocheng', 'fucheng', 'baidicheng'] },
    { id: 'fucheng', name: '涪城', type: 'city', provinceId: 'yi', owner: null, neighbors: ['luocheng', 'jiamengguan', 'jiangzhou'] },
    { id: 'luocheng', name: '雒城', type: 'city', provinceId: 'yi', owner: null, neighbors: ['chengdu', 'fucheng', 'jiangzhou'] },

    // 凉州
    { id: 'hanzhong', name: '汉中', type: 'city', provinceId: 'liang', owner: null, neighbors: ['jiamengguan', 'wuzhangyuan', 'qishan', 'baidicheng'] },
    { id: 'jieting', name: '街亭', type: 'field', provinceId: 'liang', owner: null, neighbors: ['qishan', 'wuzhangyuan'] },
    { id: 'qishan', name: '祁山', type: 'field', provinceId: 'liang', owner: null, neighbors: ['jieting', 'hanzhong', 'jiamengguan'] },
  ],
}
