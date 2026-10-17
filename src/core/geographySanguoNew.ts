import type { Geography } from './model'

/**
 * 「建安十三年（新）」的地理数据，从头重做，正在逐点搭建。
 * 眼下是荆州一隅与扬州东端的柴桑：赤壁战后，刘备据公安，曹操守江陵与襄阳，孙权据柴桑，
 * 夷陵与赤壁是无归属的野地；荆南四郡（武陵、长沙、零陵、桂阳）自成一家的「荆南」势力所据——
 * 四郡名义上属曹操，但曹军远在江北，中间隔着公安与夷陵，刘备南下取四郡时北军顾及不及，
 * 故另立一家，与曹操无涉。赤壁当荆扬之间，江陵、公安、长沙、柴桑皆通于此，是四家共临的争地。
 * 扬州另有合肥与京口一处两点，分属曹操与孙权，彼此相连而暂不与他处相通——淮南与江东的前线，
 * 待徐州、淮南一带铺开后再接上邻接。
 * 州界定归属、战略点再落到州上，是逐个补入的顺序；州界与地形的轮廓另有出处（mapData.ts），
 * 不随本文件增减而变，删掉这里的州也不会让图上的州界消失。
 * 与旧图的一处差别：野地并入行军图，可驻军、可作调动与进攻的目标（见《游戏机制》）。
 * 邻接由 tools/buildAdjacency.mjs 推导后手工粘入。运行：
 *   node tools/buildAdjacency.mjs geographySanguoNew GEOGRAPHY_SANGUO_NEW --fields
 */
export const GEOGRAPHY_SANGUO_NEW: Geography = {
  provinces: [
    { id: 'sili', name: '司隶', owner: null },
    { id: 'yu', name: '豫州', owner: null },
    { id: 'yan', name: '兖州', owner: null },
    { id: 'xu', name: '徐州', owner: null },
    { id: 'qing', name: '青州', owner: null },
    { id: 'liang', name: '凉州', owner: null },
    { id: 'bing', name: '并州', owner: null },
    { id: 'ji', name: '冀州', owner: null },
    { id: 'you', name: '幽州', owner: null },
    // 扬州：孙权据柴桑，据江东西口，眼下只此一点，故扬州归孙权。
    { id: 'yang', name: '扬州', owner: 'sunquan' },
    // 荆州：荆南四郡属荆南、江陵与襄阳属曹操、公安属刘备，占点多者判归属，故荆州归荆南。
    { id: 'jing', name: '荆州', owner: 'jingnan' },
    { id: 'yi', name: '益州', owner: null },
    { id: 'jiao', name: '交州', owner: null },
  ],
  sites: [
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

    // 扬州：孙权据柴桑，扼江东西口。
    { id: 'chaisang', name: '柴桑', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['chibi'] },
    // 淮南与江东的前线：合肥属曹操、京口属孙权，眼下只此两点相连，暂不与他处相通。
    { id: 'hefei', name: '合肥', type: 'city', population: 80000, provinceId: 'yang', owner: 'caocao', neighbors: ['jingkou'] },
    { id: 'jingkou', name: '京口', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['hefei'] },
  ],
}
