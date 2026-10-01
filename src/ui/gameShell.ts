import type { GameSession } from '../app/gameSession'
import type { GameState } from '../core/model'
import { SLOT_COUNT, type SaveSummary } from '../core/saveStore'
import './shell.css'

const SHELL_HTML = `
  <div class="shell">
    <header class="shell__header">
      <p class="shell__date"></p>
      <p class="shell__turn"></p>
    </header>
    <section class="shell__section">
      <h2 class="shell__title">势力</h2>
      <ul class="shell__factions"></ul>
    </section>
    <section class="shell__section shell__section--slots">
      <h2 class="shell__title">存档</h2>
      <ul class="shell__slots"></ul>
    </section>
    <section class="shell__actions">
      <button type="button" class="shell__button" data-action="end-turn">结束回合</button>
      <button type="button" class="shell__button" data-action="load-auto">读取自动存档</button>
    </section>
    <p class="shell__status" role="status"></p>
  </div>
`

function requireElement<T extends Element>(scope: ParentNode, selector: string): T {
  const element = scope.querySelector<T>(selector)
  if (element === null) {
    throw new Error(`未找到界面元素：${selector}`)
  }

  return element
}

function formatDate(state: GameState): string {
  return `${state.currentDate.year} 年 ${state.currentDate.month} 月`
}

function formatSlotSummary(summary: SaveSummary): string {
  return `${summary.date.year}年${summary.date.month}月 · 第${summary.turn}回合`
}

function renderFactions(list: Element, state: GameState): void {
  list.replaceChildren(
    ...state.factions.map((faction) => {
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
        badge.textContent = '玩家'
        item.append(badge)
      }

      return item
    }),
  )
}

function createSlotButton(label: string, action: string, slot: number): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'slot__button'
  button.dataset.action = action
  button.dataset.slot = String(slot)
  button.textContent = label

  return button
}

function renderSlots(list: Element, session: GameSession): void {
  list.replaceChildren(
    ...Array.from({ length: SLOT_COUNT }, (_, index) => {
      const slot = index + 1
      const summary = session.readSlot(slot)

      const item = document.createElement('li')
      item.className = 'slot'

      const info = document.createElement('div')
      info.className = 'slot__info'

      const name = document.createElement('span')
      name.className = 'slot__name'
      name.textContent = `存档 ${slot}`

      const meta = document.createElement('span')
      meta.className = 'slot__meta'
      meta.textContent = summary === null ? '空' : formatSlotSummary(summary)

      info.append(name, meta)
      item.append(info, createSlotButton('保存', 'save-slot', slot), createSlotButton('读取', 'load-slot', slot))

      return item
    }),
  )
}

export function mountGameShell(session: GameSession): void {
  const root = requireElement<HTMLElement>(document, '#ui-root')
  root.innerHTML = SHELL_HTML

  const dateLabel = requireElement<HTMLElement>(root, '.shell__date')
  const turnLabel = requireElement<HTMLElement>(root, '.shell__turn')
  const factionList = requireElement<HTMLElement>(root, '.shell__factions')
  const slotList = requireElement<HTMLElement>(root, '.shell__slots')
  const statusLabel = requireElement<HTMLElement>(root, '.shell__status')
  const endTurnButton = requireElement<HTMLButtonElement>(root, '[data-action="end-turn"]')
  const loadAutoButton = requireElement<HTMLButtonElement>(root, '[data-action="load-auto"]')

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

  loadAutoButton.addEventListener('click', () => {
    statusLabel.textContent = session.loadAutoSave()
      ? `已读取自动存档：${formatDate(session.getState())}`
      : '没有找到自动存档'
  })

  slotList.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return
    }

    const button = event.target.closest<HTMLButtonElement>('button[data-slot]')
    if (button === null) {
      return
    }

    const slot = Number(button.dataset.slot)

    if (button.dataset.action === 'save-slot') {
      session.saveToSlot(slot)
      statusLabel.textContent = `已保存到存档 ${slot}`
      return
    }

    statusLabel.textContent = session.loadSlot(slot)
      ? `已读取存档 ${slot}：${formatDate(session.getState())}`
      : `存档 ${slot} 还没有内容`
  })

  session.subscribe(paint)
  paint(session.getState())
}
