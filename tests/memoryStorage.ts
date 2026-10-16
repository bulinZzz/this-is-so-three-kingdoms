import type { KeyValueStorage } from '../src/core/localSaveStore'

export class MemoryStorage implements KeyValueStorage {
  private readonly items = new Map<string, string>()

  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }
}

/** 写入一律失败的存储，用来验证存档层对异常的处理。 */
export class FailingStorage implements KeyValueStorage {
  getItem(): string | null {
    return null
  }

  setItem(): void {
    throw new Error('存储不可用')
  }
}
