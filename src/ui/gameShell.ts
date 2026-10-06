import type { GameSession } from '../app/gameSession'
import type { SelectionStore } from '../app/selectionStore'
import type { SettingsStore } from '../app/settingsStore'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../core/actions'
import type {
  CharacterStatus,
  Faction,
  FactionId,
  GameDate,
  GameState,
  Season,
  SiteId,
  SiteType,
} from '../core/model'
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
    <section class="shell__section site-panel" hidden>
      <h2 class="shell__title">据点</h2>
      <p class="site-panel__name"></p>
      <p class="site-panel__meta"></p>
      <p class="site-panel__owner"></p>
      <ul class="site-panel__officers"></ul>
      <button type="button" class="site-panel__seek" data-action="seek-here" hidden>
        <span>在此寻访</span>
        <span class="site-panel__seek-cost"></span>
      </button>
      <p class="site-panel__status" role="status"></p>
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
        <section class="talents__section">
          <h3 class="talents__section-title">麾下<span class="talents__count talents__officers-count"></span></h3>
          <ul class="talents__officers"></ul>
        </section>
        <section class="talents__section talents__dev" hidden>
          <h3 class="talents__section-title">全部武将<span class="talents__count talents__all-count"></span></h3>
          <ul class="talents__all"></ul>
        </section>
      </div>
    </dialog>
    <dialog class="history">
      <div class="saves__head">
        <h2 class="saves__title">历史</h2>
        <button type="button" class="saves__close" data-action="close-history">关闭</button>
      </div>
      <ul class="history__list"></ul>
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
    <button type="button" class="action-bar__button" data-action="open-history">历史</button>
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
function formatGameDate(date: GameDate): string {
  return `${date.era}${toChineseNumeral(date.year)}年 ${SEASON_CHARACTERS[date.season]}`
}

function formatDate(state: GameState): string {
  return formatGameDate(state.currentDate)
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

const SITE_TYPE_LABELS: Record<SiteType, string> = {
  city: '城市',
  pass: '关隘',
  field: '野地',
}

/** 侧栏据点面板：所选据点的名称、类型、归属与驻守武将，自有据点提供就地寻访入口。 */
function renderSitePanel(
  panel: HTMLElement,
  state: GameState,
  siteId: SiteId | null,
  message: string,
): void {
  const site =
    siteId === null ? undefined : state.geography.sites.find((item) => item.id === siteId)

  if (site === undefined) {
    panel.hidden = true
    return
  }

  panel.hidden = false
  requireElement<HTMLElement>(panel, '.site-panel__name').textContent = site.name
  requireElement<HTMLElement>(panel, '.site-panel__meta').textContent = SITE_TYPE_LABELS[site.type]

  const ownerName =
    site.owner === null
      ? '无归属'
      : (state.factions.find((faction) => faction.id === site.owner)?.name ?? site.owner)
  requireElement<HTMLElement>(panel, '.site-panel__owner').textContent = `归属：${ownerName}`

  const officers = state.characters.filter(
    (character) => character.status === 'serving' && character.stationedSiteId === site.id,
  )
  requireElement<HTMLElement>(panel, '.site-panel__officers').replaceChildren(
    ...(officers.length === 0
      ? [createListItem('site-panel__empty', '无驻守武将')]
      : officers.map((officer) => createListItem('site-panel__officer', officer.name))),
  )

  requireElement<HTMLButtonElement>(panel, '.site-panel__seek').hidden =
    site.owner !== state.playerFaction
  requireElement<HTMLElement>(panel, '.site-panel__status').textContent = message
}

function createListItem(className: string, text: string): HTMLLIElement {
  const item = document.createElement('li')
  item.className = className
  item.textContent = text

  return item
}

/** 渲染麾下武将为姓名胶囊，返回人数。 */
function renderOfficers(list: Element, state: GameState): number {
  const officers = state.characters.filter(
    (character) => character.status === 'serving' && character.factionId === state.playerFaction,
  )

  if (officers.length === 0) {
    list.replaceChildren(createListItem('talents__empty', '麾下暂无武将'))
    return 0
  }

  list.replaceChildren(...officers.map((officer) => createListItem('talents__officer', officer.name)))

  return officers.length
}

const CHARACTER_STATUS_LABELS: Record<CharacterStatus, string> = {
  wild: '在野',
  serving: '在仕',
  captured: '被俘',
  retired: '退场',
}

/** 开发者模式：列出全部武将及其所在州、状态与所属势力，返回人数。 */
function renderAllCharacters(list: Element, state: GameState): number {
  const provinceNames = new Map(
    state.geography.provinces.map((province) => [province.id, province.name]),
  )
  const factionNames = new Map(state.factions.map((faction) => [faction.id, faction.name]))

  list.replaceChildren(
    ...state.characters.map((character) => {
      const item = document.createElement('li')
      item.className = 'talents__all-item'

      const name = document.createElement('span')
      name.className = 'talents__all-name'
      name.textContent = character.name

      const where = provinceNames.get(character.provinceId) ?? character.provinceId
      const owner =
        character.factionId === null
          ? ''
          : ` · ${factionNames.get(character.factionId) ?? character.factionId}`

      const meta = document.createElement('span')
      meta.className = 'talents__all-meta'
      meta.textContent = `${where} · ${CHARACTER_STATUS_LABELS[character.status]}${owner}`

      item.append(name, meta)

      return item
    }),
  )

  return state.characters.length
}

interface HistoryFactionGroup {
  factionId: FactionId
  outcomes: string[]
}

interface HistoryTurnGroup {
  label: string
  factions: HistoryFactionGroup[]
}

/** 按「时间 → 势力」把历史折叠成分组；历史本身是时间正序。 */
function groupHistory(state: GameState): HistoryTurnGroup[] {
  const turns: HistoryTurnGroup[] = []

  for (const record of state.history) {
    const label = formatGameDate(record.date)
    let turn = turns[turns.length - 1]
    if (turn === undefined || turn.label !== label) {
      turn = { label, factions: [] }
      turns.push(turn)
    }

    let faction = turn.factions[turn.factions.length - 1]
    if (faction === undefined || faction.factionId !== record.factionId) {
      faction = { factionId: record.factionId, outcomes: [] }
      turn.factions.push(faction)
    }

    faction.outcomes.push(record.outcome)
  }

  return turns
}

/** 历史弹窗：按时间大分组、势力小分组，最新的在最下。 */
function renderHistory(list: Element, state: GameState): void {
  const factionNames = new Map(state.factions.map((faction) => [faction.id, faction.name]))

  if (state.history.length === 0) {
    list.replaceChildren(createListItem('history__empty', '暂无行动'))
    return
  }

  list.replaceChildren(
    ...groupHistory(state).map((turn) => {
      const turnItem = document.createElement('li')
      turnItem.className = 'history__turn'

      const label = document.createElement('p')
      label.className = 'history__date'
      label.textContent = turn.label
      turnItem.append(label)

      for (const faction of turn.factions) {
        const block = document.createElement('div')
        block.className = 'history__faction'

        const name = document.createElement('p')
        name.className = 'history__faction-name'
        name.textContent = factionNames.get(faction.factionId) ?? faction.factionId

        const actions = document.createElement('ul')
        actions.className = 'history__actions'
        actions.replaceChildren(
          ...faction.outcomes.map((outcome) => createListItem('history__action', outcome)),
        )

        block.append(name, actions)
        turnItem.append(block)
      }

      return turnItem
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

export function mountGameShell(
  session: GameSession,
  settings: SettingsStore,
  selection: SelectionStore,
): void {
  const root = requireElement<HTMLElement>(document, '#ui-root')
  root.innerHTML = SHELL_HTML

  const actionBar = requireElement<HTMLElement>(document, '#action-bar')
  actionBar.innerHTML = ACTION_BAR_HTML

  const dateLabel = requireElement<HTMLElement>(root, '.shell__date')
  const turnLabel = requireElement<HTMLElement>(root, '.shell__turn')
  const actionPointsLabel = requireElement<HTMLElement>(root, '.shell__action-points')
  const factionList = requireElement<HTMLElement>(root, '.shell__factions')
  const slotList = requireElement<HTMLElement>(root, '.saves__list')
  const statusLabel = requireElement<HTMLElement>(root, '.shell__status')
  const endTurnButton = requireElement<HTMLButtonElement>(root, '[data-action="end-turn"]')
  const sitePanel = requireElement<HTMLElement>(root, '.site-panel')
  const siteSeekButton = requireElement<HTMLButtonElement>(root, '[data-action="seek-here"]')
  const openTalentsButton = requireElement<HTMLButtonElement>(actionBar, '[data-action="open-talents"]')
  const closeTalentsButton = requireElement<HTMLButtonElement>(root, '[data-action="close-talents"]')
  const talentsDialog = requireElement<HTMLDialogElement>(root, '.talents')
  const openHistoryButton = requireElement<HTMLButtonElement>(actionBar, '[data-action="open-history"]')
  const closeHistoryButton = requireElement<HTMLButtonElement>(root, '[data-action="close-history"]')
  const historyDialog = requireElement<HTMLDialogElement>(root, '.history')
  const historyList = requireElement<HTMLElement>(root, '.history__list')
  const officerList = requireElement<HTMLElement>(root, '.talents__officers')
  const officerCount = requireElement<HTMLElement>(root, '.talents__officers-count')
  const devSection = requireElement<HTMLElement>(root, '.talents__dev')
  const allCharactersList = requireElement<HTMLElement>(root, '.talents__all')
  const allCount = requireElement<HTMLElement>(root, '.talents__all-count')
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

  const seekCostLabel = requireElement<HTMLElement>(root, '.site-panel__seek-cost')
  seekCostLabel.textContent = `${ACTION_COSTS.seekTalent} 行动力`

  /** 上一次就地寻访的反馈，切换据点时清空。 */
  let siteMessage = ''

  const paint = (state: GameState): void => {
    dateLabel.textContent = formatDate(state)
    turnLabel.textContent = `第 ${state.currentTurn} 回合`
    renderActionPoints(actionPointsLabel, state)
    renderFactions(factionList, state)
    renderSitePanel(sitePanel, state, selection.get(), siteMessage)
    officerCount.textContent = String(renderOfficers(officerList, state))
    renderHistory(historyList, state)
    renderSlots(slotList, session)

    const developerMode = settings.get().developerMode
    devSection.hidden = !developerMode
    if (developerMode) {
      allCount.textContent = String(renderAllCharacters(allCharactersList, state))
    }
  }

  endTurnButton.addEventListener('click', () => {
    session.endTurn()
    statusLabel.textContent = `新回合开始：${formatDate(session.getState())}，已自动保存`
  })

  openTalentsButton.addEventListener('click', () => {
    talentsDialog.showModal()
  })

  closeTalentsButton.addEventListener('click', () => {
    talentsDialog.close()
  })

  openHistoryButton.addEventListener('click', () => {
    historyDialog.showModal()
    historyList.scrollTop = historyList.scrollHeight
  })

  closeHistoryButton.addEventListener('click', () => {
    historyDialog.close()
  })

  siteSeekButton.addEventListener('click', () => {
    const siteId = selection.get()
    if (siteId === null) {
      return
    }

    const result = session.seekTalent(siteId)
    siteMessage = result.ok ? result.record.outcome : result.reason
    paint(session.getState())
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

  selection.subscribe(() => {
    siteMessage = ''
    paint(session.getState())
  })

  session.subscribe(paint)
  paint(session.getState())
}
