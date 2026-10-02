import { GEOGRAPHY_SANGUO } from './geographySanguo'
import type { Scenario } from './model'

export const SANGUO_208: Scenario = {
  id: 'sanguo-208',
  name: '建安十三年',
  startDate: { era: '建安', year: 13, season: 'autumn' },
  playerFaction: 'liubei',
  factions: [
    { id: 'caocao', name: '曹操', color: '#3d6ea8' },
    { id: 'liubei', name: '刘备', color: '#3f7a5a' },
    { id: 'sunquan', name: '孙权', color: '#b0413e' },
  ],
  geography: GEOGRAPHY_SANGUO,
}
