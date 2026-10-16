import type { KeyValueStorage } from '../core/localSaveStore'

/** 设置与存档分属不同的键位空间，互不覆盖。 */
export const SETTINGS_KEY = 'this-is-so-three-kingdoms/settings'

export interface Settings {
  /** 是否在地图上显示战略点之间的全部连线。 */
  showStrategicLinks: boolean
  /** 是否在各处行动按钮上标出行动力消耗。 */
  showActionCosts: boolean
  /** 开发者模式：列出全部武将及其所在州，不受己方视野限制。 */
  showAllCharacters: boolean
  /** 开发者模式：在战斗情报幕给出「一键胜利／一键失败」。 */
  battleShortcuts: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  showStrategicLinks: false,
  showActionCosts: true,
  showAllCharacters: false,
  battleShortcuts: false,
}

export type SettingsListener = (settings: Settings) => void

/** 地图等只读消费方所需的设置来源。 */
export interface SettingsSource {
  get(): Settings
  subscribe(listener: SettingsListener): void
}

function toSettings(value: unknown): Settings {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_SETTINGS }
  }

  const candidate = value as Partial<Settings>

  return {
    showStrategicLinks:
      typeof candidate.showStrategicLinks === 'boolean'
        ? candidate.showStrategicLinks
        : DEFAULT_SETTINGS.showStrategicLinks,
    showActionCosts:
      typeof candidate.showActionCosts === 'boolean'
        ? candidate.showActionCosts
        : DEFAULT_SETTINGS.showActionCosts,
    showAllCharacters:
      typeof candidate.showAllCharacters === 'boolean'
        ? candidate.showAllCharacters
        : DEFAULT_SETTINGS.showAllCharacters,
    battleShortcuts:
      typeof candidate.battleShortcuts === 'boolean'
        ? candidate.battleShortcuts
        : DEFAULT_SETTINGS.battleShortcuts,
  }
}

/** 持久化设置，落盘到独立的 localStorage 键位。 */
export class SettingsStore implements SettingsSource {
  private settings: Settings
  private readonly listeners = new Set<SettingsListener>()

  constructor(private readonly storage: KeyValueStorage = window.localStorage) {
    this.settings = this.read()
  }

  get(): Settings {
    return this.settings
  }

  update(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch }
    this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
    this.notify()
  }

  subscribe(listener: SettingsListener): void {
    this.listeners.add(listener)
  }

  private read(): Settings {
    const raw = this.storage.getItem(SETTINGS_KEY)
    if (raw === null) {
      return { ...DEFAULT_SETTINGS }
    }

    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      return { ...DEFAULT_SETTINGS }
    }

    return toSettings(data)
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.settings)
    }
  }
}
