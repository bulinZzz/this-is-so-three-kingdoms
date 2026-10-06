import { describe, expect, it } from 'vitest'
import { validateCharacters } from '../src/core/characters'
import { CHARACTERS_SANGUO } from '../src/core/charactersSanguo'
import { GEOGRAPHY_SANGUO } from '../src/core/geographySanguo'
import { SANGUO_208 } from '../src/core/scenarios'

const FACTION_IDS = SANGUO_208.factions.map((faction) => faction.id)

describe('三国人物数据', () => {
  it('数据自洽', () => {
    expect(validateCharacters(CHARACTERS_SANGUO, FACTION_IDS, GEOGRAPHY_SANGUO)).toEqual([])
  })

  it('三家各有在仕武将', () => {
    for (const factionId of FACTION_IDS) {
      const serving = CHARACTERS_SANGUO.filter(
        (character) => character.status === 'serving' && character.factionId === factionId,
      )

      expect(serving.length).toBeGreaterThan(0)
    }
  })

  it('三家各有且只有一名君主', () => {
    for (const factionId of FACTION_IDS) {
      const monarchs = CHARACTERS_SANGUO.filter(
        (character) =>
          character.status === 'serving' && character.factionId === factionId && character.isMonarch,
      )

      expect(monarchs).toHaveLength(1)
    }
  })

  it('在仕武将驻守各自势力的自有战略点', () => {
    const siteOwner = new Map(GEOGRAPHY_SANGUO.sites.map((site) => [site.id, site.owner]))

    for (const character of CHARACTERS_SANGUO.filter((item) => item.status === 'serving')) {
      expect(siteOwner.get(character.stationedSiteId as string)).toBe(character.factionId)
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
