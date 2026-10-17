import type { Geography } from './model'

/**
 * 「建安十三年（新）」的地理数据，从头重做，正在逐点搭建。
 * 眼下是荆州一隅与扬州东端的柴桑：赤壁战后，刘备据公安，曹操守江陵与襄阳，孙权据柴桑，
 * 夷陵与赤壁是无归属的野地；荆南四郡（武陵、长沙、零陵、桂阳）自成一家的「荆南」势力所据——
 * 四郡名义上属曹操，但曹军远在江北，中间隔着公安与夷陵，刘备南下取四郡时北军顾及不及，
 * 故另立一家，与曹操无涉。赤壁当荆扬之间，江陵、公安、长沙、柴桑皆通于此，是四家共临的争地。
 * 扬州另有合肥与京口：合肥属曹操、京口属孙权，中间隔着无主的濡须口——曹操渡江入江东多走此口；
 * 江东另有建业，为孙权所据。淮南与江东一带尚待徐州、庐江铺开后再接上邻接。关中另有槐里、长安、潼关三点：槐里在西属马腾，
 * 长安与潼关在东属曹操，两家在关中相望，与荆州、扬州之间暂无通路。汉中另有张鲁一家：
 * 南郑为其所居，阳平关扼其西路，是汉中腹地与西面门户；葭萌关在益州，是汉中南入益州的关口，
 * 归刘璋——两家在关前相望。这三点与荆州、关中之间也暂无通路。
 * 州界定归属、战略点再落到州上，是逐个补入的顺序；州界与地形的轮廓另有出处（mapData.ts），
 * 不随本文件增减而变，删掉这里的州也不会让图上的州界消失。
 * 与旧图的一处差别：野地并入行军图，可驻军、可作调动与进攻的目标（见《游戏机制》）。
 * 邻接由 tools/buildAdjacency.mjs 推导后手工粘入。运行：
 *   node tools/buildAdjacency.mjs geographySanguoNew GEOGRAPHY_SANGUO_NEW --fields
 */
export const GEOGRAPHY_SANGUO_NEW: Geography = {
  provinces: [
    { id: 'sili', name: '司隶', owner: 'caocao' },
    { id: 'yu', name: '豫州', owner: null },
    { id: 'yan', name: '兖州', owner: null },
    { id: 'xu', name: '徐州', owner: null },
    { id: 'qing', name: '青州', owner: null },
    // 凉州：南郑为张鲁所居、阳平关扼其西路，眼下只此两点，故凉州归张鲁。
    { id: 'liang', name: '凉州', owner: 'zhanglu' },
    { id: 'bing', name: '并州', owner: null },
    { id: 'ji', name: '冀州', owner: null },
    { id: 'you', name: '幽州', owner: null },
    // 扬州：孙权据柴桑，据江东西口，眼下只此一点，故扬州归孙权。
    { id: 'yang', name: '扬州', owner: 'sunquan' },
    // 荆州：荆南四郡属荆南、江陵与襄阳属曹操、公安属刘备，占点多者判归属，故荆州归荆南。
    { id: 'jing', name: '荆州', owner: 'jingnan' },
    // 益州：眼下只葭萌关一点，在汉中之南，归刘璋。
    { id: 'yi', name: '益州', owner: 'liuzhang' },
    { id: 'jiao', name: '交州', owner: null },
  ],
  sites: [
    // 关中：槐里在西属马腾，长安与潼关在东属曹操，两家在关中相望。
    { id: 'huaili', name: '槐里', type: 'town', population: 30000, provinceId: 'sili', owner: 'mateng', neighbors: ['changan'] },
    { id: 'changan', name: '长安', type: 'city', population: 80000, provinceId: 'sili', owner: 'caocao', neighbors: ['huaili', 'tongguan'] },
    { id: 'tongguan', name: '潼关', type: 'pass', population: 20000, provinceId: 'sili', owner: 'caocao', neighbors: ['changan'] },

    { id: 'gongan', name: '公安', type: 'city', population: 80000, provinceId: 'jing', owner: 'liubei', neighbors: ['jiangling', 'wuling', 'yiling', 'chibi', 'changsha'] },
    { id: 'jiangling', name: '江陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'caocao', neighbors: ['gongan', 'yiling', 'chibi', 'xiangyang'] },
    { id: 'xiangyang', name: '襄阳', type: 'metropolis', population: 120000, provinceId: 'jing', owner: 'caocao', neighbors: ['yiling', 'jiangling'] },
    { id: 'yiling', name: '夷陵', type: 'field', population: 0, provinceId: 'jing', owner: null, neighbors: ['jiangling', 'gongan', 'xiangyang', 'wuling'] },
    // 赤壁：长江南岸的无主野地，荆扬之间的渡口，四家共临。
    { id: 'chibi', name: '赤壁', type: 'field', population: 0, provinceId: 'jing', owner: null, neighbors: ['gongan', 'jiangling', 'chaisang', 'changsha'] },

    // 荆南四郡：四家太守各守其郡，同属「荆南」。
    { id: 'wuling', name: '武陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['gongan', 'changsha', 'yiling', 'lingling'] },
    { id: 'changsha', name: '长沙', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['wuling', 'gongan', 'chibi', 'lingling', 'guiyang'] },
    { id: 'lingling', name: '零陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['guiyang', 'changsha', 'wuling'] },
    { id: 'guiyang', name: '桂阳', type: 'city', population: 80000, provinceId: 'jing', owner: 'jingnan', neighbors: ['lingling', 'changsha'] },

    // 扬州：孙权据柴桑，扼江东西口；江东另有建业。
    { id: 'chaisang', name: '柴桑', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['chibi'] },
    // 合肥与江东之间：濡须口是无主野地，当曹操渡江的渡口，上下家由它串起；建业为孙权所据。
    { id: 'hefei', name: '合肥', type: 'city', population: 80000, provinceId: 'yang', owner: 'caocao', neighbors: ['ruxukou'] },
    { id: 'jingkou', name: '京口', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['jianye'] },
    { id: 'jianye', name: '建业', type: 'metropolis', population: 120000, provinceId: 'yang', owner: 'sunquan', neighbors: ['jingkou', 'ruxukou'] },
    { id: 'ruxukou', name: '濡须口', type: 'field', population: 0, provinceId: 'yang', owner: null, neighbors: ['hefei', 'jianye'] },

    // 汉中与益州门户：张鲁据南郑，阳平关扼其西路；葭萌关在益州，是汉中南入益州的关口，归刘璋。
    // 三点眼下自成一隅，与荆州、关中之间暂无通路。
    { id: 'nanzheng', name: '南郑', type: 'city', population: 80000, provinceId: 'liang', owner: 'zhanglu', neighbors: ['yangpingguan'] },
    { id: 'yangpingguan', name: '阳平关', type: 'pass', population: 20000, provinceId: 'liang', owner: 'zhanglu', neighbors: ['jiamengguan', 'nanzheng'] },
    { id: 'jiamengguan', name: '葭萌关', type: 'pass', population: 20000, provinceId: 'yi', owner: 'liuzhang', neighbors: ['yangpingguan'] },
  ],
}
