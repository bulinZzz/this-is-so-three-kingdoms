import type { Geography } from './model'

/**
 * 荆扬一隅的测试夹具。
 *
 * 只服务于验收开局：从荆州、扬州各截数点，规模缩小，便于从玩家视角反复连续游玩、
 * 验收核心循环。正式剧本不用这份数据，改动版图时也不必同步。
 * 长坂坡、豫章为正式版图所无，仅在此保留，作为既有测试基线的一部分。
 * 全图每处战略点都有归属，与正式剧本「没有无主之地」一致。
 */
export const GEOGRAPHY_ACCEPTANCE: Geography = {
  provinces: [
    { id: 'jing', name: '荆州', owner: 'caocao' },
    { id: 'yang', name: '扬州', owner: 'sunquan' },
  ],
  sites: [
    { id: 'jiangxia', name: '江夏', type: 'city', population: 80000, provinceId: 'jing', owner: 'liubei', neighbors: ['chaisang', 'jiangling', 'xiangyang', 'chibi'] },
    { id: 'chibi', name: '赤壁', type: 'field', population: 0, provinceId: 'jing', owner: 'sunquan', neighbors: ['jiangxia', 'jiangling', 'chaisang', 'changsha'] },
    { id: 'changbanpo', name: '长坂坡', type: 'field', population: 0, provinceId: 'jing', owner: 'caocao', neighbors: ['jiangling', 'xiangyang'] },
    { id: 'wuling', name: '武陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'liubei', neighbors: ['changsha', 'jiangling'] },
    { id: 'changsha', name: '长沙', type: 'city', population: 80000, provinceId: 'jing', owner: 'liubei', neighbors: ['wuling', 'yuzhang', 'chibi'] },
    { id: 'xiangyang', name: '襄阳', type: 'metropolis', population: 120000, provinceId: 'jing', owner: 'caocao', neighbors: ['fancheng', 'jiangling', 'jiangxia', 'changbanpo'] },
    { id: 'fancheng', name: '樊城', type: 'city', population: 80000, provinceId: 'jing', owner: 'caocao', neighbors: ['xiangyang'] },
    { id: 'jiangling', name: '江陵', type: 'city', population: 80000, provinceId: 'jing', owner: 'caocao', neighbors: ['wuling', 'xiangyang', 'jiangxia', 'chibi', 'changbanpo'] },
    { id: 'chaisang', name: '柴桑', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['yuzhang', 'jiangxia', 'chibi'] },
    { id: 'yuzhang', name: '豫章', type: 'city', population: 80000, provinceId: 'yang', owner: 'sunquan', neighbors: ['chaisang', 'changsha'] },
  ],
}
