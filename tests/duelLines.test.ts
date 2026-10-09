import { describe, expect, it } from 'vitest'
import { CHARACTERS_SANGUO } from '../src/core/charactersSanguo'
import { duelLineOf, duelResponseLineOf } from '../src/core/duelLines'

function characterOf(id: string) {
  const character = CHARACTERS_SANGUO.find((item) => item.id === id)
  if (character === undefined) {
    throw new Error(`武将不存在：${id}`)
  }
  return character
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
})
