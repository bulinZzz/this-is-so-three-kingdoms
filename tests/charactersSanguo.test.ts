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

  it('除荆南外各势力各有且只有一名君主，荆南不设君主', () => {
    for (const factionId of FACTION_IDS) {
      const monarchs = CHARACTERS_SANGUO.filter(
        (character) =>
          character.status === 'serving' && character.factionId === factionId && character.isMonarch,
      )

      // 荆南四郡各守其郡，不奉一人为主。
      expect(monarchs).toHaveLength(factionId === 'jingnan' ? 0 : 1)
    }
  })

  it('在仕武将或在名册候命、或驻守一处自有战略点，每点至多一名驻将', () => {
    const siteById = new Map(GEOGRAPHY_SANGUO.sites.map((site) => [site.id, site]))
    const stationed = new Set<string>()

    for (const character of CHARACTERS_SANGUO.filter((item) => item.status === 'serving')) {
      if (character.stationedSiteId === null) {
        continue
      }
      const site = siteById.get(character.stationedSiteId)
      expect(site?.owner).toBe(character.factionId)
      expect(stationed.has(character.stationedSiteId)).toBe(false)
      stationed.add(character.stationedSiteId)
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
