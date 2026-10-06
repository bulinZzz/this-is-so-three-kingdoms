import type { KeyValueStorage } from '../core/localSaveStore'

/** 设置与存档分属不同的键位空间，互不覆盖。 */
export const SETTINGS_KEY = 'this-is-so-three-kingdoms/settings'

export interface Settings {
  /** 是否在地图上显示战略点之间的全部连线。 */
  showStrategicLinks: boolean
  /** 开发者模式：显示全部武将所在的位置等调试信息。 */
  developerMode: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  showStrategicLinks: false,
  developerMode: false,
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
    developerMode:
      typeof candidate.developerMode === 'boolean'
        ? candidate.developerMode
        : DEFAULT_SETTINGS.developerMode,
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
