import { CHARACTERS_SANGUO } from './charactersSanguo'
import { GEOGRAPHY_SANGUO } from './geographySanguo'
import type { Scenario } from './model'

export const SANGUO_208: Scenario = {
  id: 'sanguo-208',
  name: '建安十三年',
  startDate: { era: '建安', year: 13, season: 'autumn' },
  playerFaction: 'liubei',
  factions: [
    { id: 'caocao', name: '曹操', color: '#3d6ea8', grain: 20000 },
    { id: 'liubei', name: '刘备', color: '#3f7a5a', grain: 6000 },
    { id: 'sunquan', name: '孙权', color: '#b0413e', grain: 12000 },
  ],
  geography: GEOGRAPHY_SANGUO,
  characters: CHARACTERS_SANGUO,
}
