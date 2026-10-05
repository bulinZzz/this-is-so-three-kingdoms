import { describe, expect, it } from 'vitest'
import {
  cloneGeography,
  EMPTY_GEOGRAPHY,
  resolveProvinceOwners,
  validateGeography,
} from '../src/core/geography'
import type { Geography } from '../src/core/model'

const FACTION_IDS = ['caocao', 'liubei']

/** 荆豫两州的三个战略点：新野与宛相邻，虎牢关只连宛，且无归属。 */
function createGeography(): Geography {
  return {
    provinces: [
      { id: 'jing', name: '荆州', owner: null },
      { id: 'yu', name: '豫州', owner: null },
    ],
    sites: [
      {
        id: 'xinye',
        name: '新野',
        type: 'city',
        provinceId: 'jing',
        owner: 'liubei',
        neighbors: ['wancheng'],
      },
      {
        id: 'wancheng',
        name: '宛',
        type: 'city',
        provinceId: 'jing',
        owner: 'caocao',
        neighbors: ['xinye', 'hulao'],
      },
      {
        id: 'hulao',
        name: '虎牢关',
        type: 'pass',
        provinceId: 'yu',
        owner: null,
        neighbors: ['wancheng'],
      },
    ],
  }
}

describe('validateGeography', () => {
  it('自洽的数据没有问题，无归属的战略点合法', () => {
    expect(validateGeography(createGeography(), FACTION_IDS)).toEqual([])
    expect(validateGeography(EMPTY_GEOGRAPHY, FACTION_IDS)).toEqual([])
  })

  it('指出重复的州 id', () => {
    const geography = createGeography()
    geography.provinces.push({ id: 'jing', name: '荆州南部', owner: null })

    expect(validateGeography(geography, FACTION_IDS)).toEqual(['州 id 重复：jing'])
  })

  it('指出重复的战略点 id', () => {
    const geography = createGeography()
    geography.sites.push({ ...geography.sites[1], neighbors: ['xinye', 'hulao'] })

    expect(validateGeography(geography, FACTION_IDS)).toEqual(['战略点 id 重复：wancheng'])
  })

  it('指出不存在的所属州', () => {
    const geography = createGeography()
    geography.sites[0].provinceId = 'you'

    expect(validateGeography(geography, FACTION_IDS)).toEqual([
      '战略点 xinye 的所属州不存在：you',
    ])
  })

  it('指出不存在的归属势力', () => {
    const geography = createGeography()
    geography.sites[0].owner = 'yuanshao'

    expect(validateGeography(geography, FACTION_IDS)).toEqual([
      '战略点 xinye 的归属势力不存在：yuanshao',
    ])
  })

  it('指出不存在的州归属势力', () => {
    const geography = createGeography()
    geography.provinces[0].owner = 'yuanshao'

    expect(validateGeography(geography, FACTION_IDS)).toEqual([
      '州 jing 的归属势力不存在：yuanshao',
    ])
  })

  it('指出不存在的相邻战略点', () => {
    const geography = createGeography()
    geography.sites[0].neighbors.push('changan')

    expect(validateGeography(geography, FACTION_IDS)).toEqual([
      '战略点 xinye 的相邻战略点不存在：changan',
    ])
  })

  it('指出不对称的相邻关系', () => {
    const geography = createGeography()
    geography.sites[0].neighbors = []

    expect(validateGeography(geography, FACTION_IDS)).toEqual([
      '战略点 wancheng 与 xinye 的相邻关系不对称',
    ])
  })

  it('指出与自身相邻的战略点', () => {
    const geography = createGeography()
    geography.sites[0].neighbors = ['xinye', 'wancheng']

    expect(validateGeography(geography, FACTION_IDS)).toEqual(['战略点 xinye 不能与自身相邻'])
  })

  it('指出重复的相邻战略点', () => {
    const geography = createGeography()
    geography.sites[0].neighbors = ['wancheng', 'wancheng']

    expect(validateGeography(geography, FACTION_IDS)).toEqual([
      '战略点 xinye 的相邻列表重复：wancheng',
    ])
  })
})

describe('cloneGeography', () => {
  it('与原数据不共享可变对象', () => {
    const original = createGeography()
    const clone = cloneGeography(original)

    clone.provinces[0].name = '改动'
    clone.sites[0].owner = 'caocao'
    clone.sites[0].neighbors.push('hulao')

    expect(original.provinces[0].name).toBe('荆州')
    expect(original.sites[0].owner).toBe('liubei')
    expect(original.sites[0].neighbors).toEqual(['wancheng'])
  })
})

/** 构造只有一州的地理，州内据点按给定归属排列。 */
function geographyWith(
  provinceOwner: string | null,
  siteOwners: ReadonlyArray<string | null>,
): Geography {
  return {
    provinces: [{ id: 'jing', name: '荆州', owner: provinceOwner }],
    sites: siteOwners.map((owner, index) => ({
      id: `site-${index}`,
      name: `据点${index}`,
      type: 'city',
      provinceId: 'jing',
      owner,
      neighbors: [],
    })),
  }
}

describe('resolveProvinceOwners', () => {
  it('占该州战略点最多者取得归属', () => {
    const geography = geographyWith(null, ['liubei', 'liubei', 'caocao'])

    resolveProvinceOwners(geography)

    expect(geography.provinces[0].owner).toBe('liubei')
  })

  it('与他方并列时保持原归属势力', () => {
    const geography = geographyWith('caocao', ['liubei', 'caocao'])

    resolveProvinceOwners(geography)

    expect(geography.provinces[0].owner).toBe('caocao')
  })

  it('并列而原归属不在其中时判为无归属', () => {
    const geography = geographyWith('sunquan', ['liubei', 'caocao'])

    resolveProvinceOwners(geography)

    expect(geography.provinces[0].owner).toBeNull()
  })

  it('一州之内优势易手，归属随之改变', () => {
    const geography = geographyWith('caocao', ['liubei', 'liubei', 'caocao'])

    resolveProvinceOwners(geography)

    expect(geography.provinces[0].owner).toBe('liubei')
  })

  it('州内没有任何势力据点时归属为空', () => {
    const geography = geographyWith('caocao', [null, null])

    resolveProvinceOwners(geography)

    expect(geography.provinces[0].owner).toBeNull()
  })
})
