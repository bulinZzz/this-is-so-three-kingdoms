import { describe, expect, it } from 'vitest'
import { CHARACTERS_SANGUO } from '../src/core/charactersSanguo'
import { duelLineOf, duelResponseLineOf } from '../src/core/duelLines'
import { GUARD_CHARACTER_PREFIX } from '../src/core/guards'
import type { Character } from '../src/core/model'

function characterOf(id: string) {
  const character = CHARACTERS_SANGUO.find((item) => item.id === id)
  if (character === undefined) {
    throw new Error(`武将不存在：${id}`)
  }
  return character
}

/** 由名号造一个守军临时武将：不入武将体系，只借名号取应战台词。 */
function guardOf(name: string): Character {
  return {
    id: `${GUARD_CHARACTER_PREFIX}somewhere`,
    name,
    status: 'serving',
    factionId: null,
    provinceId: 'p',
    might: 55,
    command: 50,
    intellect: 40,
    politics: 0,
    age: 0,
    personality: 'steady',
    affinities: {},
    loyalty: 0,
    isMonarch: false,
    stationedSiteId: null,
    troops: 100,
    tier: null,
  }
}

describe('单挑台词', () => {
  it('名将用专属台词', () => {
    expect(duelLineOf(characterOf('zhangfei'))).toContain('张翼德')
    expect(duelLineOf(characterOf('guanyu'))).not.toBe(duelLineOf(characterOf('zhangfei')))
  })

  it('不列名者按性格出通用台词', () => {
    // 糜竺性格沉稳，不在专属名单里。
    expect(duelLineOf(characterOf('mizhu'))).toBe('既已列阵，便来分个高下。')
  })

  it('挑战与应战各有其词，同一个人两句话不同', () => {
    const zhangfei = characterOf('zhangfei')

    expect(duelResponseLineOf(zhangfei)).toContain('吃我一矛')
    expect(duelResponseLineOf(zhangfei)).not.toBe(duelLineOf(zhangfei))
    // 蔡瑁有专属的应战台词，走上阵前先怯三分。
    expect(duelResponseLineOf(characterOf('caimao'))).toBe('这……来将何人？')
    // 不列名者按性格给应战台词。
    expect(duelResponseLineOf(characterOf('mizhu'))).toBe('请。')
  })

  it('人人有挑战与应战两句台词', () => {
    for (const character of CHARACTERS_SANGUO) {
      expect(duelLineOf(character).length).toBeGreaterThan(0)
      expect(duelResponseLineOf(character).length).toBeGreaterThan(0)
    }
  })

  it('守军头目按名号应战，各出一句', () => {
    // 名号里的类别决定它说什么：山贼与义军不会同一句话。
    expect(duelResponseLineOf(guardOf('山贼·头目'))).toBe('此山是我开，留下买路财！')
    expect(duelResponseLineOf(guardOf('义军·领袖'))).not.toBe('请。')
    expect(duelResponseLineOf(guardOf('海盗·头目'))).not.toBe(
      duelResponseLineOf(guardOf('山贼·头目')),
    )

    // 名号词表里的每一类都有台词，不会落回寻常武将的「请。」。
    for (const title of ['义军', '民兵', '戍卒', '关卒', '山贼', '流寇', '海盗']) {
      expect(duelResponseLineOf(guardOf(`${title}·某`))).not.toBe('请。')
    }
  })
})
