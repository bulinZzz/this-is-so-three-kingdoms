import type { GameSession } from '../app/gameSession'
import type { SettingsStore } from '../app/settingsStore'
import { ACTION_POINTS_PER_TURN } from '../core/actions'
import type { CharacterStatus, Faction, GameState, Season } from '../core/model'
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
        <p class="shell__action-points"></p>
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
    <section class="shell__section">
      <h2 class="shell__title">本季已执行</h2>
      <ul class="shell__log"></ul>
    </section>
    <section class="shell__actions">
      <button type="button" class="shell__button" data-action="end-turn">结束回合</button>
    </section>
    <p class="shell__status" role="status"></p>
    <dialog class="talents">
      <div class="saves__head">
        <h2 class="saves__title">人才</h2>
        <button type="button" class="saves__close" data-action="close-talents">关闭</button>
      </div>
      <div class="talents__body">
        <button type="button" class="shell__button" data-action="seek-talent">寻访人才</button>
        <p class="talents__status" role="status"></p>
        <h3 class="shell__title">麾下</h3>
        <ul class="talents__list talents__officers"></ul>
        <section class="talents__dev" hidden>
          <h3 class="shell__title">全部武将</h3>
          <ul class="talents__list talents__all"></ul>
        </section>
      </div>
    </dialog>
    <dialog class="settings">
      <div class="saves__head">
        <h2 class="saves__title">设置</h2>
        <button type="button" class="saves__close" data-action="close-settings">关闭</button>
      </div>
      <label class="settings__option">
        <input type="checkbox" class="settings__checkbox" data-setting="showStrategicLinks" />
        <span>展示战略点的连线</span>
      </label>
      <label class="settings__option">
        <input type="checkbox" class="settings__checkbox" data-setting="developerMode" />
        <span>开发者模式：显示全部武将所在州</span>
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

/** 底部操作区：承载游戏内容入口，与顶部只放存档、设置的菜单分开。 */
const ACTION_BAR_HTML = `
  <nav class="action-bar">
    <button type="button" class="action-bar__button" data-action="open-talents">人才</button>
  </nav>
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

function renderActionPoints(label: Element, state: GameState): void {
  label.textContent = `行动力 ${state.actionPoints} / ${ACTION_POINTS_PER_TURN}`
}

function renderOfficers(list: Element, state: GameState): void {
  const officers = state.characters.filter(
    (character) => character.status === 'serving' && character.factionId === state.playerFaction,
  )

  list.replaceChildren(
    ...officers.map((officer) => {
      const item = document.createElement('li')
      item.className = 'talents__item'
      item.textContent = officer.name

      return item
    }),
  )
}

const CHARACTER_STATUS_LABELS: Record<CharacterStatus, string> = {
  wild: '在野',
  serving: '在仕',
  retired: '退场',
}

/** 开发者模式：列出全部武将及其所在州、状态与所属势力。 */
function renderAllCharacters(list: Element, state: GameState): void {
  const provinceNames = new Map(
    state.geography.provinces.map((province) => [province.id, province.name]),
  )
  const factionNames = new Map(state.factions.map((faction) => [faction.id, faction.name]))

  list.replaceChildren(
    ...state.characters.map((character) => {
      const where = provinceNames.get(character.provinceId) ?? character.provinceId
      const owner =
        character.factionId === null
          ? ''
          : ` · ${factionNames.get(character.factionId) ?? character.factionId}`

      const item = document.createElement('li')
      item.className = 'talents__item'
      item.textContent = `${character.name} · ${where} · ${CHARACTER_STATUS_LABELS[character.status]}${owner}`

      return item
    }),
  )
}

function renderActionLog(list: Element, state: GameState): void {
  list.replaceChildren(
    ...state.actionLog.map((record) => {
      const item = document.createElement('li')
      item.className = 'shell__log-item'
      item.textContent = record.outcome

      return item
    }),
  )
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

  const actionBar = requireElement<HTMLElement>(document, '#action-bar')
  actionBar.innerHTML = ACTION_BAR_HTML

  const dateLabel = requireElement<HTMLElement>(root, '.shell__date')
  const turnLabel = requireElement<HTMLElement>(root, '.shell__turn')
  const actionPointsLabel = requireElement<HTMLElement>(root, '.shell__action-points')
  const factionList = requireElement<HTMLElement>(root, '.shell__factions')
  const actionLogList = requireElement<HTMLElement>(root, '.shell__log')
  const slotList = requireElement<HTMLElement>(root, '.saves__list')
  const statusLabel = requireElement<HTMLElement>(root, '.shell__status')
  const endTurnButton = requireElement<HTMLButtonElement>(root, '[data-action="end-turn"]')
  const seekTalentButton = requireElement<HTMLButtonElement>(root, '[data-action="seek-talent"]')
  const openTalentsButton = requireElement<HTMLButtonElement>(actionBar, '[data-action="open-talents"]')
  const closeTalentsButton = requireElement<HTMLButtonElement>(root, '[data-action="close-talents"]')
  const talentsDialog = requireElement<HTMLDialogElement>(root, '.talents')
  const talentsStatus = requireElement<HTMLElement>(root, '.talents__status')
  const officerList = requireElement<HTMLElement>(root, '.talents__officers')
  const devSection = requireElement<HTMLElement>(root, '.talents__dev')
  const allCharactersList = requireElement<HTMLElement>(root, '.talents__all')
  const openSettingsButton = requireElement<HTMLButtonElement>(root, '[data-action="open-settings"]')
  const openSavesButton = requireElement<HTMLButtonElement>(root, '[data-action="open-saves"]')
  const closeSettingsButton = requireElement<HTMLButtonElement>(root, '[data-action="close-settings"]')
  const closeSavesButton = requireElement<HTMLButtonElement>(root, '[data-action="close-saves"]')
  const settingsDialog = requireElement<HTMLDialogElement>(root, '.settings')
  const linksCheckbox = requireElement<HTMLInputElement>(root, '[data-setting="showStrategicLinks"]')
  const developerCheckbox = requireElement<HTMLInputElement>(root, '[data-setting="developerMode"]')
  const savesDialog = requireElement<HTMLDialogElement>(root, '.saves')

  linksCheckbox.checked = settings.get().showStrategicLinks
  developerCheckbox.checked = settings.get().developerMode

  const paint = (state: GameState): void => {
    dateLabel.textContent = formatDate(state)
    turnLabel.textContent = `第 ${state.currentTurn} 回合`
    renderActionPoints(actionPointsLabel, state)
    renderFactions(factionList, state)
    renderOfficers(officerList, state)
    renderActionLog(actionLogList, state)
    renderSlots(slotList, session)

    const developerMode = settings.get().developerMode
    devSection.hidden = !developerMode
    if (developerMode) {
      renderAllCharacters(allCharactersList, state)
    }
  }

  endTurnButton.addEventListener('click', () => {
    session.endTurn()
    statusLabel.textContent = `已结束回合，进度保存至 ${formatDate(session.getState())}`
  })

  openTalentsButton.addEventListener('click', () => {
    talentsDialog.showModal()
  })

  closeTalentsButton.addEventListener('click', () => {
    talentsDialog.close()
  })

  seekTalentButton.addEventListener('click', () => {
    const result = session.seekTalent()
    talentsStatus.textContent = result.ok ? result.record.outcome : result.reason
  })

  openSettingsButton.addEventListener('click', () => {
    settingsDialog.showModal()
  })

  closeSettingsButton.addEventListener('click', () => {
    settingsDialog.close()
  })

  linksCheckbox.addEventListener('change', () => {
    settings.update({ showStrategicLinks: linksCheckbox.checked })
  })

  developerCheckbox.addEventListener('change', () => {
    settings.update({ developerMode: developerCheckbox.checked })
    paint(session.getState())
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
