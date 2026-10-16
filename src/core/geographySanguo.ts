import type { Geography } from './model'

/**
 * 三国时期的地理格局。
 * 河西与陇右同属凉州，共覆盖司隶、豫、兖、徐、青、凉、并、冀、幽、扬、荆、益、交十三州，共 60 个战略点。
 * 邻接表示「可直接行军」，按地理推导：若两点之间存在第三个战略点，则它们不相邻。
 *
 * 人口为玩法初值，不作考据：城市分都会（120000）、大城（80000）、小城（50000）三档，另有关隘（20000）与野地（10000），
 * 类型只定档、具体值逐点给，个别名城按史实境况微调（洛阳经董卓之乱残破，压到小城档）。
 * 人口是产粮与兵源的共同基础，随地块走，不因易主而清空；数值由实测与 acceptance 调整。
 *
 * 开局归属按建安十三年的格局给定：益州归刘璋、关中归马腾、陇右归韩遂、汉中归张鲁、辽东归公孙康、交州归士燮；
 * 其余无主之地（荆南四郡、赤壁、庐江、柳城）留作待攻的目标。
 */
export const GEOGRAPHY_SANGUO: Geography = {
  provinces: [
    { id: 'sili', name: '司隶', owner: 'caocao' },
    { id: 'yu', name: '豫州', owner: 'caocao' },
    { id: 'yan', name: '兖州', owner: 'caocao' },
    { id: 'xu', name: '徐州', owner: 'caocao' },
    { id: 'qing', name: '青州', owner: 'caocao' },
    { id: 'liang', name: '凉州', owner: 'hansui' },
    { id: 'bing', name: '并州', owner: 'caocao' },
    { id: 'ji', name: '冀州', owner: 'caocao' },
    { id: 'you', name: '幽州', owner: 'caocao' },
    { id: 'yang', name: '扬州', owner: 'sunquan' },
    { id: 'jing', name: '荆州', owner: 'caocao' },
    { id: 'yi', name: '益州', owner: 'liuzhang' },
    { id: 'jiao', name: '交州', owner: 'shixie' },
  ],
  sites: [
    // 司隶（洛阳一带归曹操，关中归马腾）
    { id: 'changan', name: '长安', type: 'city', population: 80000, provinceId: 'sili', owner: 'mateng', neighbors: ['wuzhangyuan', 'tongguan'] },
    { id: 'luoyang', name: '洛阳', type: 'town', population: 50000, provinceId: 'sili', owner: 'caocao', neighbors: ['hulao', 'bowangpo', 'tongguan'] },
    { id: 'sishui', name: '汜水关', type: 'pass', population: 20000, provinceId: 'sili', owner: 'caocao', neighbors: ['hulao', 'guandu', 'xudu'] },
    { id: 'hulao', name: '虎牢关', type: 'pass', population: 20000, provinceId: 'sili', owner: 'caocao', neighbors: ['sishui', 'luoyang'] },
    { id: 'tongguan', name: '潼关', type: 'pass', population: 20000, provinceId: 'sili', owner: 'mateng', neighbors: ['changan', 'luoyang'] },
    { id: 'wuzhangyuan', name: '五丈原', type: 'field', population: 10000, provinceId: 'sili', owner: 'mateng', neighbors: ['chencang', 'changan', 'hanzhong'] },
    { id: 'chencang', name: '陈仓', type: 'town', population: 50000, provinceId: 'sili', owner: 'mateng', neighbors: ['wuzhangyuan', 'jieting', 'hanzhong'] },

    // 兖州
    { id: 'guandu', name: '官渡', type: 'field', population: 10000, provinceId: 'sili', owner: 'caocao', neighbors: ['chenliu', 'sishui', 'xudu', 'baima'] },
    { id: 'chenliu', name: '陈留', type: 'city', population: 80000, provinceId: 'yan', owner: 'caocao', neighbors: ['guandu', 'baima', 'xiaopei'] },
    { id: 'puyang', name: '濮阳', type: 'city', population: 80000, provinceId: 'yan', owner: 'caocao', neighbors: ['baima', 'ye', 'xiaopei', 'linzi'] },
    { id: 'baima', name: '白马', type: 'pass', population: 20000, provinceId: 'yan', owner: 'caocao', neighbors: ['puyang', 'ye', 'chenliu', 'guandu'] },

    // 豫州
    { id: 'xudu', name: '许都', type: 'metropolis', population: 120000, provinceId: 'yu', owner: 'caocao', neighbors: ['guandu', 'sishui', 'bowangpo'] },
    { id: 'xiaopei', name: '小沛', type: 'town', population: 50000, provinceId: 'yu', owner: 'caocao', neighbors: ['pengcheng', 'puyang', 'chenliu'] },

    // 徐州
    { id: 'pengcheng', name: '彭城', type: 'city', population: 80000, provinceId: 'xu', owner: 'caocao', neighbors: ['xiaopei', 'xiapi'] },
    { id: 'xiapi', name: '下邳', type: 'city', population: 80000, provinceId: 'xu', owner: 'caocao', neighbors: ['pengcheng', 'shouchun', 'jianye'] },

    // 青州
    { id: 'linzi', name: '临淄', type: 'city', population: 80000, provinceId: 'qing', owner: 'caocao', neighbors: ['nanpi', 'puyang'] },

    // 冀州
    { id: 'ye', name: '邺', type: 'metropolis', population: 120000, provinceId: 'ji', owner: 'caocao', neighbors: ['puyang', 'baima', 'jinyang', 'nanpi'] },
    { id: 'nanpi', name: '南皮', type: 'city', population: 80000, provinceId: 'ji', owner: 'caocao', neighbors: ['linzi', 'jicheng', 'ye'] },

    // 并州
    { id: 'jinyang', name: '晋阳', type: 'city', population: 80000, provinceId: 'bing', owner: 'caocao', neighbors: ['ye'] },

    // 幽州（蓟归曹操，辽东归公孙康，辽西的柳城为无主）
    { id: 'jicheng', name: '蓟', type: 'city', population: 80000, provinceId: 'you', owner: 'caocao', neighbors: ['nanpi', 'liucheng'] },
    { id: 'liucheng', name: '柳城', type: 'city', population: 80000, provinceId: 'you', owner: null, neighbors: ['xiangping', 'jicheng'] },
    { id: 'xiangping', name: '襄平', type: 'city', population: 80000, provinceId: 'you', owner: 'gongsunkang', neighbors: ['liucheng'] },

    // 扬州
    { id: 'shouchun', name: '寿春', type: 'city', population: 80000, provinceId: 'yang', owner: 'caocao', neighbors: ['hefei', 'jianye', 'xiapi'] },
    { id: 'hefei', name: '合肥', type: 'city', population: 80000, provinceId: 'yang', owner: 'caocao', neighbors: ['lujiang', 'shouchun', 'jianye'] },
    { id: 'lujiang', name: '庐江', type: 'city', population: 80000, provinceId: 'yang', owner: null, neighbors: ['hefei', 'danyang', 'chaisang'] },
    { id: 'jianye', name: '建业', type: 'metropolis', population: 120000, provinceId: 'yang', owner: 'sunquan', neighbors: ['danyang', 'hefei', 'shouchun', 'wu', 'xiapi'] },
    { id: 'wu', name: '吴', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['kuaiji', 'danyang', 'jianye'] },
    { id: 'kuaiji', name: '会稽', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['wu', 'danyang'] },
    { id: 'chaisang', name: '柴桑', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['poyang', 'yuzhang', 'jiangxia', 'chibi', 'lujiang'] },
    { id: 'yuzhang', name: '豫章', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['poyang', 'chaisang', 'changsha'] },
    { id: 'poyang', name: '鄱阳', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['yuzhang', 'chaisang', 'danyang'] },
    { id: 'danyang', name: '丹阳', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['jianye', 'lujiang', 'wu', 'kuaiji', 'poyang'] },

    // 荆州（江北归曹操，江夏归刘备，荆南为无主）
    { id: 'wancheng', name: '宛', type: 'metropolis', population: 120000, provinceId: 'jing', owner: 'caocao', neighbors: ['xinye', 'bowangpo'] },
    { id: 'bowangpo', name: '博望坡', type: 'field', population: 10000, provinceId: 'jing', owner: 'caocao', neighbors: ['wancheng', 'xudu', 'luoyang'] },
    { id: 'xinye', name: '新野', type: 'city', population: 80000, provinceId: 'jing', owner: 'caocao', neighbors: ['fancheng', 'wancheng'] },
    { id: 'fancheng', name: '樊城', type: 'city', population: 80000, provinceId: 'jing', owner: 'caocao', neighbors: ['xiangyang', 'xinye'] },
    { id: 'xiangyang', name: '襄阳', type: 'metropolis', population: 120000, provinceId: 'jing', owner: 'caocao', neighbors: ['fancheng', 'changbanpo', 'jiangxia'] },
    { id: 'jiangling', name: '江陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'caocao', neighbors: ['changbanpo', 'yiling', 'wuling', 'chibi'] },
    { id: 'jiangxia', name: '江夏', type: 'city', population: 80000, provinceId: 'jing', owner: 'liubei', neighbors: ['chibi', 'chaisang', 'xiangyang'] },
    { id: 'chibi', name: '赤壁', type: 'field', population: 10000, provinceId: 'jing', owner: null, neighbors: ['jiangxia', 'jiangling', 'chaisang', 'changsha'] },
    { id: 'changbanpo', name: '长坂坡', type: 'field', population: 10000, provinceId: 'jing', owner: 'caocao', neighbors: ['yiling', 'jiangling', 'xiangyang'] },
    { id: 'yiling', name: '夷陵', type: 'field', population: 10000, provinceId: 'jing', owner: 'caocao', neighbors: ['changbanpo', 'jiangling', 'baidicheng'] },
    { id: 'wuling', name: '武陵', type: 'city', population: 80000, provinceId: 'jing', owner: null, neighbors: ['changsha', 'jiangling', 'lingling'] },
    { id: 'lingling', name: '零陵', type: 'city', population: 80000, provinceId: 'jing', owner: null, neighbors: ['guiyang', 'changsha', 'wuling'] },
    { id: 'changsha', name: '长沙', type: 'city', population: 80000, provinceId: 'jing', owner: null, neighbors: ['wuling', 'chibi', 'lingling', 'guiyang', 'yuzhang'] },
    { id: 'guiyang', name: '桂阳', type: 'city', population: 80000, provinceId: 'jing', owner: null, neighbors: ['lingling', 'changsha', 'panyu'] },

    // 益州（归刘璋）
    { id: 'chengdu', name: '成都', type: 'metropolis', population: 120000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['luocheng', 'jiangzhou'] },
    { id: 'baidicheng', name: '白帝城', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['yiling', 'jiangzhou', 'hanzhong'] },
    { id: 'jiamengguan', name: '葭萌关', type: 'pass', population: 20000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['fucheng', 'hanzhong', 'qishan'] },
    { id: 'jiangzhou', name: '江州', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['chengdu', 'luocheng', 'fucheng', 'baidicheng'] },
    { id: 'fucheng', name: '涪城', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['luocheng', 'jiamengguan', 'jiangzhou'] },
    { id: 'luocheng', name: '雒城', type: 'city', population: 80000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['chengdu', 'fucheng', 'jiangzhou'] },

    // 凉州（陇右归韩遂，汉中归张鲁）
    { id: 'hanzhong', name: '汉中', type: 'city', population: 80000, provinceId: 'liang', owner: 'zhanglu', neighbors: ['jiamengguan', 'chencang', 'wuzhangyuan', 'qishan', 'baidicheng'] },
    { id: 'jieting', name: '街亭', type: 'field', population: 10000, provinceId: 'liang', owner: 'hansui', neighbors: ['tianshui', 'chencang'] },
    { id: 'qishan', name: '祁山', type: 'field', population: 10000, provinceId: 'liang', owner: 'hansui', neighbors: ['tianshui', 'hanzhong', 'jiamengguan'] },
    { id: 'tianshui', name: '天水', type: 'city', population: 80000, provinceId: 'liang', owner: 'hansui', neighbors: ['qishan', 'jieting'] },

    // 交州（归士燮）
    { id: 'panyu', name: '番禺', type: 'city', population: 80000, provinceId: 'jiao', owner: 'shixie', neighbors: ['guiyang', 'hepu'] },
    { id: 'hepu', name: '合浦', type: 'city', population: 80000, provinceId: 'jiao', owner: 'shixie', neighbors: ['longbian', 'jiuzhen', 'panyu'] },
    { id: 'longbian', name: '龙编', type: 'city', population: 80000, provinceId: 'jiao', owner: 'shixie', neighbors: ['jiuzhen', 'hepu'] },
    { id: 'jiuzhen', name: '九真', type: 'town', population: 50000, provinceId: 'jiao', owner: 'shixie', neighbors: ['longbian', 'hepu'] },
  ],
}
