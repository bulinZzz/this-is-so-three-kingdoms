import type { KeyValueStorage } from '../src/core/localSaveStore'

export class MemoryStorage implements KeyValueStorage {
  private readonly items = new Map<string, string>()

  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }

  removeItem(key: string): void {
    this.items.delete(key)
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

  removeItem(): void {
    throw new Error('存储不可用')
  }
}

/** 读取一律失败的存储：模拟存储对象存在但被浏览器拒绝访问。 */
export class UnreadableStorage implements KeyValueStorage {
  getItem(): string | null {
    throw new Error('存储不可读')
  }

  setItem(): void {
    throw new Error('存储不可读')
  }

  removeItem(): void {
    throw new Error('存储不可读')
  }
}

/** 删除失败、读写正常的存储。 */
export class UndeletableStorage extends MemoryStorage {
  override removeItem(): void {
    throw new Error('存储不可删')
  }
}
