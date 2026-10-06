import type { SiteId } from '../core/model'

export type SelectionListener = (siteId: SiteId | null) => void

/** 地图与侧栏共用的当前据点选择。 */
export interface SelectionSource {
  get(): SiteId | null
  select(siteId: SiteId | null): void
  subscribe(listener: SelectionListener): void
}

/** 当前选中的战略点，会话内有效，不落盘。 */
export class SelectionStore implements SelectionSource {
  private selected: SiteId | null = null
  private readonly listeners = new Set<SelectionListener>()

  get(): SiteId | null {
    return this.selected
  }

  select(siteId: SiteId | null): void {
    if (this.selected === siteId) {
      return
    }

    this.selected = siteId
    for (const listener of this.listeners) {
      listener(this.selected)
    }
  }

  subscribe(listener: SelectionListener): void {
    this.listeners.add(listener)
  }
}
