import type { GameSession } from '../app/gameSession'
import type { SettingsStore } from '../app/settingsStore'
import type { Faction, GameState, Season } from '../core/model'
import { SLOT_COUNT, type SaveSummary } from '../core/saveStore'
import { resolveFactionOrder } from '../core/turn'
import { UNOWNED_SITE_COLOR } from '../game/mapLayout'
import './shell.css'

const SHELL_HTML = `
  <div class="shell">
    <header class="shell__header">
      <div class="shell__heading">
        <p class="shell__date"></p>
        <p class="shell__turn"></p>
      </div>
      <div class="shell__menu">
        <button type="button" class="shell__link" data-action="open-saves">存档</button>
        <button type="button" class="shell__link" data-action="open-settings">设置</button>
      </div>
    </header>
    <section class="shell__section">
      <h2 class="shell__title">势力</h2>
      <ul class="shell__factions"></ul>
    </section>
    <section class="shell__actions">
      <button type="button" class="shell__button" data-action="end-turn">结束回合</button>
    </section>
    <p class="shell__status" role="status"></p>
    <dialog class="settings">
      <div class="saves__head">
        <h2 class="saves__title">设置</h2>
        <button type="button" class="saves__close" data-action="close-settings">关闭</button>
      </div>
      <label class="settings__option">
        <input type="checkbox" class="settings__checkbox" />
        <span>展示战略点的连线</span>
      </label>
    </dialog>
    <dialog class="saves">
      <div class="saves__head">
        <h2 class="saves__title">存档与读档</h2>
        <button type="button" class="saves__close" data-action="close-saves">关闭</button>
      </div>
      <ul class="saves__list"></ul>
    </dialog>
  </div>
`

function requireElement<T extends Element>(scope: ParentNode, selector: string): T {
  const element = scope.querySelector<T>(selector)
  if (element === null) {
    throw new Error(`未找到界面元素：${selector}`)
  }

  return element
}

const SEASON_CHARACTERS: Record<Season, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
}

const CHINESE_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 把 1–999 的纪年转成中文数字，元年以「元」表示。 */
function toChineseNumeral(value: number): string {
  if (value === 1) {
    return '元'
  }

  const hundreds = Math.floor(value / 100)
  const tens = Math.floor((value % 100) / 10)
  const units = value % 10
  const parts: string[] = []

  if (hundreds > 0) {
    parts.push(CHINESE_DIGITS[hundreds], '百')
    if (tens === 0 && units > 0) {
      parts.push('零')
    }
  }

  if (tens > 0) {
    if (hundreds > 0 || tens > 1) {
      parts.push(CHINESE_DIGITS[tens])
    }
    parts.push('十')
  }

  if (units > 0) {
    parts.push(CHINESE_DIGITS[units])
  }

  return parts.join('')
}

/** 把日期渲染为「建安十二年 秋」的形式。 */
function formatDate(state: GameState): string {
  const { era, year, season } = state.currentDate

  return `${era}${toChineseNumeral(year)}年 ${SEASON_CHARACTERS[season]}`
}

function formatSlotSummary(summary: SaveSummary): string {
  const { era, year, season } = summary.date

  return `${era}${toChineseNumeral(year)}年${SEASON_CHARACTERS[season]} · 第${summary.turn}回合`
}

function renderFactions(list: Element, state: GameState): void {
  const factionsById = new Map(state.factions.map((faction) => [faction.id, faction]))
  const ordered = resolveFactionOrder(state)
    .map((id) => factionsById.get(id))
    .filter((faction): faction is Faction => faction !== undefined)

  const items = ordered.map((faction) => {
    const item = document.createElement('li')
    item.className = 'shell__faction'

    const swatch = document.createElement('span')
    swatch.className = 'shell__swatch'
    swatch.style.background = faction.color

    const name = document.createElement('span')
    name.className = 'shell__faction-name'
    name.textContent = faction.name

    item.append(swatch, name)

    if (faction.id === state.playerFaction) {
      const badge = document.createElement('span')
      badge.className = 'shell__badge'
      badge.textContent = '我'
      item.append(badge)
    }

    return item
  })

  // 地图上还有一类「无归属」战略点，同样要在图例里给出颜色。
  const neutral = document.createElement('li')
  neutral.className = 'shell__faction'
  const neutralSwatch = document.createElement('span')
  neutralSwatch.className = 'shell__swatch'
  neutralSwatch.style.background = UNOWNED_SITE_COLOR
  const neutralName = document.createElement('span')
  neutralName.className = 'shell__faction-name'
  neutralName.textContent = '无归属'
  neutral.append(neutralSwatch, neutralName)

  list.replaceChildren(...items, neutral)
}

function createSlotItem(label: string, summary: SaveSummary | null): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'slot'

  const info = document.createElement('div')
  info.className = 'slot__info'

  const name = document.createElement('span')
  name.className = 'slot__name'
  name.textContent = label

  const meta = document.createElement('span')
  meta.className = 'slot__meta'
  meta.textContent = summary === null ? '空' : formatSlotSummary(summary)

  info.append(name, meta)
  item.append(info)

  return item
}

function createSlotButton(label: string, action: string, slot?: number): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'slot__button'
  button.dataset.action = action

  if (slot !== undefined) {
    button.dataset.slot = String(slot)
  }

  button.textContent = label

  return button
}

function renderSlots(list: Element, session: GameSession): void {
  const autoItem = createSlotItem('自动存档', session.readAutoSave())
  autoItem.append(createSlotButton('读取', 'load-auto'))

  const slotItems = Array.from({ length: SLOT_COUNT }, (_, index) => {
    const slot = index + 1
    const item = createSlotItem(`存档 ${slot}`, session.readSlot(slot))
    item.append(createSlotButton('保存', 'save-slot', slot), createSlotButton('读取', 'load-slot', slot))

    return item
  })

  list.replaceChildren(autoItem, ...slotItems)
}

export function mountGameShell(session: GameSession, settings: SettingsStore): void {
  const root = requireElement<HTMLElement>(document, '#ui-root')
  root.innerHTML = SHELL_HTML

  const dateLabel = requireElement<HTMLElement>(root, '.shell__date')
  const turnLabel = requireElement<HTMLElement>(root, '.shell__turn')
  const factionList = requireElement<HTMLElement>(root, '.shell__factions')
  const slotList = requireElement<HTMLElement>(root, '.saves__list')
  const statusLabel = requireElement<HTMLElement>(root, '.shell__status')
  const endTurnButton = requireElement<HTMLButtonElement>(root, '[data-action="end-turn"]')
  const openSettingsButton = requireElement<HTMLButtonElement>(root, '[data-action="open-settings"]')
  const openSavesButton = requireElement<HTMLButtonElement>(root, '[data-action="open-saves"]')
  const closeSettingsButton = requireElement<HTMLButtonElement>(root, '[data-action="close-settings"]')
  const closeSavesButton = requireElement<HTMLButtonElement>(root, '[data-action="close-saves"]')
  const settingsDialog = requireElement<HTMLDialogElement>(root, '.settings')
  const settingsCheckbox = requireElement<HTMLInputElement>(root, '.settings__checkbox')
  const savesDialog = requireElement<HTMLDialogElement>(root, '.saves')

  settingsCheckbox.checked = settings.get().showStrategicLinks

  const paint = (state: GameState): void => {
    dateLabel.textContent = formatDate(state)
    turnLabel.textContent = `第 ${state.currentTurn} 回合`
    renderFactions(factionList, state)
    renderSlots(slotList, session)
  }

  endTurnButton.addEventListener('click', () => {
    session.endTurn()
    statusLabel.textContent = `已结束回合，进度保存至 ${formatDate(session.getState())}`
  })

  openSettingsButton.addEventListener('click', () => {
    settingsDialog.showModal()
  })

  closeSettingsButton.addEventListener('click', () => {
    settingsDialog.close()
  })

  settingsCheckbox.addEventListener('change', () => {
    settings.update({ showStrategicLinks: settingsCheckbox.checked })
  })

  openSavesButton.addEventListener('click', () => {
    savesDialog.showModal()
  })

  closeSavesButton.addEventListener('click', () => {
    savesDialog.close()
  })

  slotList.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return
    }

    const button = event.target.closest<HTMLButtonElement>('button[data-action]')
    if (button === null) {
      return
    }

    if (button.dataset.action === 'load-auto') {
      if (session.loadAutoSave()) {
        statusLabel.textContent = `已读取自动存档：${formatDate(session.getState())}`
        savesDialog.close()
        return
      }

      statusLabel.textContent = '没有找到自动存档'
      return
    }

    const slot = Number(button.dataset.slot)

    if (button.dataset.action === 'save-slot') {
      session.saveToSlot(slot)
      statusLabel.textContent = `已保存到存档 ${slot}`
      return
    }

    if (session.loadSlot(slot)) {
      statusLabel.textContent = `已读取存档 ${slot}：${formatDate(session.getState())}`
      savesDialog.close()
      return
    }

    statusLabel.textContent = `存档 ${slot} 还没有内容`
  })

  session.subscribe(paint)
  paint(session.getState())
}
