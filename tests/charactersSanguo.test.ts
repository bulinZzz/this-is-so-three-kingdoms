import { describe, expect, it } from 'vitest'
import { validateCharacters } from '../src/core/characters'
import { CHARACTERS_SANGUO } from '../src/core/charactersSanguo'
import { GEOGRAPHY_SANGUO } from '../src/core/geographySanguo'
import { SANGUO_208 } from '../src/core/scenarios'

const FACTION_IDS = SANGUO_208.factions.map((faction) => faction.id)
const PROVINCE_IDS = GEOGRAPHY_SANGUO.provinces.map((province) => province.id)

describe('三国人物数据', () => {
  it('数据自洽', () => {
    expect(validateCharacters(CHARACTERS_SANGUO, FACTION_IDS, PROVINCE_IDS)).toEqual([])
  })

  it('三家各有在仕武将', () => {
    for (const factionId of FACTION_IDS) {
      const serving = CHARACTERS_SANGUO.filter(
        (character) => character.status === 'serving' && character.factionId === factionId,
      )

      expect(serving.length).toBeGreaterThan(0)
    }
  })

  it('荆州有可供寻访的在野人才', () => {
    const wild = CHARACTERS_SANGUO.filter(
      (character) => character.status === 'wild' && character.provinceId === 'jing',
    )

    expect(wild.length).toBeGreaterThanOrEqual(5)
  })

  it('在野人才分布在多个州', () => {
    const provinces = new Set(
      CHARACTERS_SANGUO.filter((character) => character.status === 'wild').map(
        (character) => character.provinceId,
      ),
    )

    expect(provinces.size).toBeGreaterThan(1)
  })
})
