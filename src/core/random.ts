const MULBERRY_INCREMENT = 0x6d2b79f5

export interface Random {
  /** 取一个 [0, 1) 区间的随机数，并推进内部状态。 */
  next(): number
  /** 导出当前状态，用于存档。 */
  getState(): number
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0

  return {
    next(): number {
      state = (state + MULBERRY_INCREMENT) >>> 0

      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    getState(): number {
      return state
    },
  }
}

/** 新开局的随机种子。全项目仅此处使用 Math.random()。 */
export function createSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) + 1
}
