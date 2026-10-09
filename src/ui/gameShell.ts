import type { GameSession } from '../app/gameSession'
import type { SelectionStore } from '../app/selectionStore'
import type { SettingsStore } from '../app/settingsStore'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../core/actions'
import { affinityAttitude, affinityToward } from '../core/affinity'
import type {
  BattleReport,
  BattleReportSide,
  CaptiveReport,
  Character,
  CharacterId,
  CharacterStatus,
  DuelReport,
  Faction,
  FactionId,
  GameDate,
  GameState,
  Season,
  SiteId,
  SiteType,
} from '../core/model'
import {
  attackBlockReason,
  attackCandidates,
  battleOutlook,
  defenseOutlook,
  duelAnswererAt,
  garrisonAt,
  garrisonCommanderAt,
  isAttackable,
  MORALE_FULL,
  stationedDefendersAt,
  type AttackParty,
  type Party,
} from '../core/battle'
import { isRecruitable, isServing } from '../core/characters'
import { captivesOf } from '../core/captives'
import { grainYield } from '../core/economy'
import { duelLineOf, duelResponseLineOf } from '../core/duelLines'
import { defectThresholdFor, loyaltyHint } from '../core/loyalty'
import type { DefenseRequest, FactionTurnSignal } from '../core/turn'
import { SLOT_COUNT, type SaveSummary } from '../core/saveStore'
import { SCENARIOS } from '../core/scenarios'
import {
  factionTroops,
  hasActedThisTurn,
  isFactionDestroyed,
  isTransferTarget,
  MAX_TRANSFER_PARTY,
  transferCandidates,
  troopLimit,
} from '../core/military'
import { relationBetween } from '../core/relations'
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
        <button type="button" class="shell__link" data-action="open-new-game">新游戏</button>
        <button type="button" class="shell__link" data-action="open-saves">存档</button>
        <button type="button" class="shell__link" data-action="open-settings">设置</button>
      </div>
    </header>
    <section class="shell__section">
      <h2 class="shell__title">势力</h2>
      <ul class="shell__factions"></ul>
    </section>
    <section class="shell__section site-panel" hidden>
      <h2 class="shell__title">战略点</h2>
      <p class="site-panel__name"></p>
      <p class="site-panel__meta"></p>
      <p class="site-panel__owner"></p>
      <ul class="site-panel__officers"></ul>
      <button type="button" class="site-panel__order" data-action="attack-here" hidden>
        <span>进攻此地</span>
        <span class="action-cost"></span>
      </button>
      <button type="button" class="site-panel__order" data-action="transfer-here" hidden>
        <span>调动到此地</span>
        <span class="action-cost"></span>
      </button>
      <button type="button" class="site-panel__seek" data-action="seek-here" hidden>
        <span>在此寻访</span>
        <span class="action-cost"></span>
      </button>
      <p class="site-panel__status" role="status"></p>
    </section>
    <section class="shell__section recruit-panel" hidden>
      <h2 class="shell__title">待招募</h2>
      <ul class="recruit-panel__list"></ul>
      <p class="recruit-panel__status" role="status"></p>
    </section>
    <section class="shell__actions">
      <button type="button" class="shell__button" data-action="end-turn">结束回合</button>
    </section>
    <p class="shell__status" role="status"></p>
    <dialog class="roster">
      <div class="saves__head">
        <h2 class="saves__title">武将</h2>
        <button type="button" class="saves__close" data-action="close-roster">关闭</button>
      </div>
      <div class="roster__body">
        <section class="roster__section">
          <h3 class="roster__section-title roster__officers-title" hidden>麾下<span class="roster__count roster__officers-count"></span></h3>
          <ul class="roster__officers"></ul>
        </section>
        <section class="roster__section roster__dev" hidden>
          <h3 class="roster__section-title">全部武将<span class="roster__count roster__all-count"></span></h3>
          <ul class="roster__all"></ul>
        </section>
      </div>
      <p class="roster__status" role="status"></p>
    </dialog>
    <dialog class="history">
      <div class="saves__head">
        <h2 class="saves__title">历史</h2>
        <button type="button" class="saves__close" data-action="close-history">关闭</button>
      </div>
      <ul class="history__list"></ul>
    </dialog>
    <dialog class="domestic">
      <div class="saves__head">
        <h2 class="saves__title">内政</h2>
        <button type="button" class="saves__close" data-action="close-domestic">关闭</button>
      </div>
      <div class="domestic__body">
        <div class="domestic__row">
          <span class="domestic__label">兵力</span>
          <span class="domestic__value domestic__troops"></span>
        </div>
        <div class="domestic__row">
          <span class="domestic__label">粮食</span>
          <span class="domestic__value domestic__grain"></span>
        </div>
        <div class="domestic__row">
          <span class="domestic__label">每季粮产</span>
          <span class="domestic__value domestic__grain-yield"></span>
        </div>
      </div>
    </dialog>
    <dialog class="order">
      <div class="saves__head">
        <h2 class="saves__title order__title"></h2>
        <button type="button" class="saves__close" data-action="close-order">关闭</button>
      </div>
      <div class="order__body">
        <p class="order__target"></p>
        <p class="order__status" role="status"></p>
        <ul class="order__officers"></ul>
        <button type="button" class="order__submit" data-action="order-go"></button>
      </div>
    </dialog>
    <dialog class="battle-plan">
      <div class="saves__head">
        <h2 class="saves__title battle-plan__title">战斗</h2>
        <button type="button" class="saves__close" data-action="close-battle-plan">关闭</button>
      </div>
      <div class="battle-plan__body"></div>
    </dialog>
    <dialog class="captives">
      <div class="saves__head">
        <h2 class="saves__title">俘虏</h2>
        <button type="button" class="saves__close" data-action="close-captives">关闭</button>
      </div>
      <ul class="captives__list"></ul>
    </dialog>
    <dialog class="prison">
      <div class="saves__head">
        <h2 class="saves__title">降将</h2>
        <button type="button" class="saves__close" data-action="close-prison">关闭</button>
      </div>
      <p class="prison__status"></p>
      <ul class="prison__list"></ul>
    </dialog>
    <dialog class="settings">
      <div class="saves__head">
        <h2 class="saves__title">设置</h2>
        <button type="button" class="saves__close" data-action="close-settings">关闭</button>
      </div>
      <label class="settings__option">
        <input type="checkbox" class="settings__checkbox" data-setting="showStrategicLinks" />
        <span>显示战略点的连线</span>
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
    <dialog class="new-game">
      <div class="saves__head">
        <h2 class="saves__title">新游戏</h2>
        <button type="button" class="saves__close" data-action="close-new-game">关闭</button>
      </div>
      <div class="new-game__body">
        <p class="new-game__hint">开始新游戏会覆盖当前自动存档；手动存档不受影响。</p>
        <ul class="new-game__list"></ul>
      </div>
    </dialog>
  </div>
`

/** 底部操作区：承载游戏内容入口，与顶部只放存档、设置的菜单分开。 */
const ACTION_BAR_HTML = `
  <nav class="action-bar">
    <button type="button" class="action-bar__button" data-action="open-roster">武将</button>
    <button type="button" class="action-bar__button" data-action="open-domestic">内政</button>
    <button type="button" class="action-bar__button" data-action="open-prison">降将</button>
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

/** 事件目标所属的行动按钮；不是行动按钮时返回 null。 */
function actionButtonOf(event: Event): HTMLButtonElement | null {
  if (!(event.target instanceof Element)) {
    return null
  }

  return event.target.closest<HTMLButtonElement>('button[data-action]')
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
    } else {
      const relation = relationBetween(state, state.playerFaction, faction.id)
      if (relation !== null) {
        const badge = document.createElement('span')
        badge.className = `shell__badge shell__badge--${relation}`
        badge.textContent = relation === 'ally' ? '同盟' : '敌对'
        item.append(badge)
      }
    }

    if (isFactionDestroyed(state, faction.id)) {
      const badge = document.createElement('span')
      badge.className = 'shell__badge shell__badge--destroyed'
      badge.textContent = '已覆灭'
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
  const remaining = state.actionPoints[state.playerFaction] ?? 0
  label.textContent = `行动力 ${remaining} / ${ACTION_POINTS_PER_TURN}`
}

/** 内政弹窗：玩家势力的兵力与粮食；后续经营类信息也放这里。 */
function renderDomestic(dialog: HTMLElement, state: GameState): void {
  const faction = state.factions.find((item) => item.id === state.playerFaction)

  requireElement<HTMLElement>(dialog, '.domestic__troops').textContent = String(
    factionTroops(state, state.playerFaction),
  )
  requireElement<HTMLElement>(dialog, '.domestic__grain').textContent = String(faction?.grain ?? 0)
  requireElement<HTMLElement>(dialog, '.domestic__grain-yield').textContent = String(
    grainYield(state, state.playerFaction),
  )
}

const SITE_TYPE_LABELS: Record<SiteType, string> = {
  city: '城市',
  pass: '关隘',
  field: '野地',
}

/** 造一个带 data 属性的行动按钮，供各面板的事件代理读取参数；右侧附上行动力消耗。 */
function createOrderButton(
  label: string,
  action: string,
  data: Record<string, string>,
  cost: number,
  disabled = false,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'officer-action'
  button.dataset.action = action
  button.disabled = disabled
  for (const [key, value] of Object.entries(data)) {
    button.dataset[key] = value
  }

  const text = document.createElement('span')
  text.textContent = label

  const costLabel = document.createElement('span')
  costLabel.className = 'action-cost'
  costLabel.textContent = `${cost} 行动力`

  button.append(text, costLabel)

  return button
}

/** 年龄的呈现：不足二十岁作「未冠」，含开局尚未出生者。 */
function ageText(age: number): string {
  return age < 20 ? '未冠' : `${age} 岁`
}

/** 武将的兵力（连同带兵上限）、能力、对某势力的态度与年龄，供各处卡片统一显示。 */
function officerMetaText(character: Character, factionId: FactionId): string {
  const summary = `兵 ${character.troops}/${troopLimit(character)} · 武 ${character.might} · 智 ${character.intellect} · 统 ${character.command} · 政 ${character.politics}`
  const attitude = affinityAttitude(affinityToward(character, factionId))
  const hint = loyaltyHint(character.loyalty, defectThresholdFor(character, factionId))
  const loyalty = hint === null ? '' : ` · ${hint}`

  return `${summary} · ${attitude} · ${ageText(character.age)}${loyalty}`
}

/** 武将卡片：姓名、兵力、能力、态度与年龄，供选将时比较。可附标记与一排行动按钮。 */
function createOfficerCard(
  character: Character,
  factionId: FactionId,
  actions: readonly HTMLButtonElement[],
  flags: readonly string[] = [],
): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'officer-card'

  const head = document.createElement('div')
  head.className = 'officer-card__head'

  const name = document.createElement('span')
  name.className = 'officer-card__name'
  name.textContent = character.name

  head.append(
    name,
    ...flags.map((text) => {
      const flag = document.createElement('span')
      flag.className = 'officer-card__flag'
      flag.textContent = text

      return flag
    }),
  )

  const meta = document.createElement('span')
  meta.className = 'officer-card__meta'
  meta.textContent = officerMetaText(character, factionId)

  item.append(head, meta)

  if (actions.length > 0) {
    const row = document.createElement('div')
    row.className = 'officer-card__actions'
    row.append(...actions)
    item.append(row)
  }

  return item
}

/** 侧栏战略点面板：所选战略点的名称、类型、归属与驻守武将；按接壤情况提供进攻、调动与寻访。 */
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

  const isOwn = site.owner === state.playerFaction
  const officers = state.characters.filter(
    (character) => isServing(character) && character.stationedSiteId === site.id,
  )

  requireElement<HTMLElement>(panel, '.site-panel__officers').replaceChildren(
    ...(officers.length === 0
      ? [createListItem('site-panel__empty', '无驻守武将')]
      : officers.map((officer) => createListItem('site-panel__officer', officer.name))),
  )

  requireElement<HTMLButtonElement>(panel, '[data-action="attack-here"]').hidden = !isAttackable(
    state,
    site.id,
  )
  requireElement<HTMLButtonElement>(panel, '[data-action="transfer-here"]').hidden =
    !isTransferTarget(state, site.id)
  requireElement<HTMLButtonElement>(panel, '.site-panel__seek').hidden = !isOwn
  requireElement<HTMLElement>(panel, '.site-panel__status').textContent = message
}

/** 命令弹窗的当前请求：进攻、调动或防守，都以目标战略点为起点。 */
interface OrderRequest {
  kind: 'attack' | 'transfer' | 'defense'
  siteId: SiteId
  /** 防守时随附来犯的势力与编成，供编成弹窗显示敌情。 */
  defense?: DefenseRequest
}

/** 该武将此刻不能出战的原因：本季已行动或无兵；可以出战时返回 null。 */
function attackDisabledReason(state: GameState, character: Character): string | null {
  if (hasActedThisTurn(state, character.id)) {
    return '已行动'
  }

  return character.troops > 0 ? null : '无兵力'
}

/** 该武将此刻不能调动的原因：本季已行动；可以调动时返回 null。 */
function transferDisabledReason(state: GameState, character: Character): string | null {
  return hasActedThisTurn(state, character.id) ? '已行动' : null
}

/** 进攻编成中的三个角色：主将必选，副将与军师可选。 */
type PartyRole = 'commander' | 'deputy' | 'strategist'

const PARTY_ROLES: readonly PartyRole[] = ['commander', 'deputy', 'strategist']

const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  commander: '主将',
  deputy: '副将',
  strategist: '军师',
}

/** 侧栏「待招募」：玩家接触过、尚未招到的在野者，可再次拜访以提升其意愿。 */
function renderContacts(panel: HTMLElement, state: GameState, message: string): void {
  const contacts = state.contactedCandidates[state.playerFaction] ?? []
  const candidates = contacts
    .map((contact) => state.characters.find((character) => character.id === contact.characterId))
    .filter(
      (character): character is Character => character !== undefined && isRecruitable(character),
    )

  panel.hidden = candidates.length === 0 && message === ''

  const list = requireElement<HTMLElement>(panel, '.recruit-panel__list')
  list.replaceChildren(
    ...(candidates.length === 0
      ? [createListItem('recruit-panel__empty', '暂无待招募之人')]
      : candidates.map((character) => {
          const item = document.createElement('li')
          item.className = 'recruit-panel__item'

          const name = document.createElement('span')
          name.className = 'recruit-panel__name'
          name.textContent = character.name

          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'recruit-panel__visit'
          button.dataset.action = 'visit-character'
          button.dataset.character = character.id
          button.textContent = `再次拜访 · ${ACTION_COSTS.visit} 行动力`

          item.append(name, button)

          return item
        })),
  )

  requireElement<HTMLElement>(panel, '.recruit-panel__status').textContent = message
}

/**
 * 命令弹窗：进攻时逐行列出候选武将，点选行内的主将、副将与军师标记；
 * 调动与防守时列出候选武将供勾选。本季已行动（或进攻时无兵）者标出且不可选。
 */
function renderOrderDialog(root: HTMLElement, state: GameState, request: OrderRequest | null): void {
  if (request === null) {
    return
  }

  const target = state.geography.sites.find((site) => site.id === request.siteId)
  const name = target?.name ?? ''
  const raiders = request.defense
  const defenseTarget =
    raiders === undefined
      ? name
      : `${factionName(state, raiders.attackerId)} 来攻 ${name}　${partySummary(state, raiders.party)}`

  requireElement<HTMLElement>(root, '.order__title').textContent =
    request.kind === 'attack' ? '进攻' : request.kind === 'transfer' ? '调动' : '防守'
  requireElement<HTMLElement>(root, '.order__target').textContent =
    request.kind === 'attack'
      ? `进攻 ${name}`
      : request.kind === 'transfer'
        ? `调动到 ${name}`
        : defenseTarget
  requireElement<HTMLButtonElement>(root, '.order__submit').textContent =
    request.kind === 'attack' ? '进入战斗' : request.kind === 'transfer' ? '调动' : '迎战'

  const list = requireElement<HTMLElement>(root, '.order__officers')

  if (request.kind === 'attack') {
    const candidates = attackCandidates(state, request.siteId)
    if (candidates.length === 0) {
      list.replaceChildren(createListItem('order__empty', '暂无可出战的武将'))
      return
    }

    const defaultCommander = candidates.find(
      (character) => attackDisabledReason(state, character) === null,
    )
    list.replaceChildren(
      ...candidates.map((character) =>
        createOrderOfficerItem(
          character,
          state.playerFaction,
          attackDisabledReason(state, character),
          character.id === defaultCommander?.id,
        ),
      ),
    )
    return
  }

  if (request.kind === 'defense') {
    const members = [...stationedDefendersAt(state, request.siteId)].sort(
      (a, b) => b.troops - a.troops,
    )
    // 与进攻同构：主将必选，副将与军师可选；已行动者也可以出战，只是兵力减半。
    const defaultCommander = garrisonCommanderAt(state, request.siteId)
    list.replaceChildren(
      ...members.map((member) =>
        createOrderOfficerItem(
          member,
          state.playerFaction,
          member.troops > 0 ? null : '无兵力',
          member.id === defaultCommander?.id,
          hasActedThisTurn(state, member.id) ? '已行动 · 兵力减半' : null,
        ),
      ),
    )
    return
  }

  const candidates = transferCandidates(state, request.siteId)
  list.replaceChildren(
    ...(candidates.length === 0
      ? [createListItem('order__empty', '暂无可调动的武将')]
      : candidates.map((character) =>
          createPickerItem(character, state.playerFaction, transferDisabledReason(state, character)),
        )),
  )
}

/** 编成摘要：主将、副将与军师及各自的兵力。 */
function partySummary(state: GameState, party: AttackParty): string {
  const entries: readonly [string, CharacterId | null | undefined][] = [
    ['主将', party.commander],
    ['副将', party.deputy],
    ['军师', party.strategist],
  ]

  return entries
    .filter(([, id]) => id != null && id !== '')
    .map(([label, id]) => {
      const character = state.characters.find((item) => item.id === id)
      return character === undefined ? null : `${label} ${character.name}（兵 ${character.troops}）`
    })
    .filter((text): text is string => text !== null)
    .join(' · ')
}

/** 某战略点归属势力的名称。 */
function siteOwnerName(state: GameState, owner: FactionId | null): string {
  return state.factions.find((faction) => faction.id === owner)?.name ?? '无归属'
}

/** 守军摘要：主将与应战者；无守军时为空串。 */
function enemySummary(state: GameState, siteId: SiteId): string {
  const commander = garrisonCommanderAt(state, siteId)
  if (commander === null) {
    return ''
  }

  const leader = `守将 ${commander.name}（兵 ${commander.troops}）`
  const answerer = duelAnswererAt(state, siteId)
  if (answerer === null || answerer.id === commander.id) {
    return leader
  }

  return `${leader} · 应战 ${answerer.name}（兵 ${answerer.troops}）`
}

/** 战斗演出的一幕：情报与选择、单挑、交战与结果。 */
type BattleStep = 'intel' | 'duel' | 'fight'

/** 正在上演的一场战斗：我方进攻，或他方来攻我方。 */
interface BattleStage {
  /** 这一战是我方进攻，还是我方被攻。 */
  mode: 'attack' | 'defense'
  /** 攻方的编成：进攻时是我方编成，防御时是敌军编成。 */
  party: AttackParty
  /** 战斗发生的战略点。 */
  siteId: SiteId
  /** 防御演出：来犯的势力；进攻时为空。 */
  attackerId: FactionId | null
  /** 防御演出：我方自选的迎战编成；进攻或无将可守时为空。 */
  garrison: Party | null
  step: BattleStep
  /** 已结算的战报；尚未开战时为 null。 */
  report: BattleReport | null
  /** 写入历史的结论文案，结果一幕展示。 */
  outcome: string
}

/** 演出里的一行文字；`variant` 用于加语义样式（如台词、判语）。 */
function stageLine(text: string, variant = ''): HTMLParagraphElement {
  const paragraph = document.createElement('p')
  paragraph.className = variant === '' ? 'battle-plan__line' : `battle-plan__line battle-plan__${variant}`
  paragraph.textContent = text

  return paragraph
}

/** 演出里的一个按钮。 */
function stageButton(label: string, action: string, character?: CharacterId): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'battle-plan__go'
  button.dataset.action = action
  if (character !== undefined) {
    button.dataset.character = character
  }
  button.textContent = label

  return button
}

/** 一排按钮。 */
function stageActions(...buttons: HTMLButtonElement[]): HTMLElement {
  const row = document.createElement('div')
  row.className = 'battle-plan__actions'
  row.append(...buttons)

  return row
}

/** 单挑的交合句：谁与谁交战数合，结果如何。 */
function duelClashText(duel: DuelReport): string {
  if (duel.fallen === duel.answerer) {
    return `${duel.challenger} 与 ${duel.answerer} 交战数合，${duel.answerer} 被斩于马下`
  }
  if (duel.fallen === duel.challenger) {
    return `${duel.challenger} 与 ${duel.answerer} 交战数合，${duel.challenger} 被斩于马下`
  }
  if (duel.challengerWon === true) {
    return `${duel.challenger} 与 ${duel.answerer} 交战数合，${duel.answerer} 抵敌不住，仓皇败走`
  }

  return `${duel.challenger} 与 ${duel.answerer} 交战数合，${duel.challenger} 抵敌不住，败下阵来`
}

/** 战斗过程的简短叙述，由战报数据生成；从玩家这一侧叙述。 */
function battleProcessText(report: BattleReport, mode: 'attack' | 'defense'): string[] {
  const ours = mode === 'attack' ? report.attacker : report.defender
  const theirs = mode === 'attack' ? report.defender : report.attacker
  const clash = report.undefended
    ? mode === 'attack'
      ? `守军无将，${report.attacker.commander} 兵不血刃，直取 ${report.siteName}。`
      : `城中无将，${report.attacker.commander} 长驱直入。`
    : mode === 'attack'
      ? `两军交锋，${report.attacker.commander} 挥军直进，与 ${report.defender.commander} 战于城下。`
      : `两军交锋，${report.attacker.commander} 挥军来犯，${report.defender.commander} 据城迎战。`

  return [clash, `一场鏖战，我方伤亡 ${ours.casualties}，敌方伤亡 ${theirs.casualties}。`]
}

/** 势力名；查不到时退回标识。 */
function factionName(state: GameState, factionId: FactionId | null): string {
  return state.factions.find((faction) => faction.id === factionId)?.name ?? '敌军'
}

/** 武将姓名；查不到时为空串。 */
function characterNameOf(state: GameState, id: CharacterId | null | undefined): string {
  return state.characters.find((item) => item.id === id)?.name ?? ''
}

/** 我方守军一行：按编成列出主将、副将与军师及兵力，与攻方的编成摘要同构。 */
function garrisonSummary(state: GameState, siteId: SiteId, party: Party): string {
  const members = garrisonAt(state, siteId, party).members
  const roles: readonly [string, CharacterId | null | undefined][] = [
    ['主将', party.commander],
    ['副将', party.deputy],
    ['军师', party.strategist],
  ]

  return roles
    .filter(([, id]) => id != null && id !== '')
    .map(([label, id]) => {
      const member = members.find((item) => item.id === id)
      return member === undefined ? null : `${label} ${member.name}（兵 ${member.troops}）`
    })
    .filter((text): text is string => text !== null)
    .join(' · ')
}

/** 情报幕的按钮：进攻时由主将或副将出马，防御时由迎战编成的主将或副将出马。 */
function intelButtons(state: GameState, stage: BattleStage): HTMLButtonElement[] {
  const buttons: HTMLButtonElement[] = []

  if (stage.mode === 'attack') {
    if (garrisonCommanderAt(state, stage.siteId) !== null) {
      buttons.push(
        stageButton(
          `主将 ${characterNameOf(state, stage.party.commander)} 出马`,
          'stage-pick',
          stage.party.commander,
        ),
      )
      if (stage.party.deputy != null) {
        buttons.push(
          stageButton(
            `副将 ${characterNameOf(state, stage.party.deputy)} 出马`,
            'stage-pick',
            stage.party.deputy,
          ),
        )
      }
    }
    buttons.push(stageButton('不单挑，直接开战', 'stage-fight'))

    return buttons
  }

  // 进攻方已提单挑，守方不再选择，只能迎战。
  if (stage.party.challenger != null) {
    return [stageButton('迎战', 'stage-fight')]
  }

  // 与攻方对称：出马者限迎战编成中的主将或副将，君主不参与。
  const garrison = stage.garrison
  const members = garrison === null ? [] : garrisonAt(state, stage.siteId, garrison).members
  const roles: readonly [string, CharacterId | null | undefined][] = [
    ['主将', garrison?.commander],
    ['副将', garrison?.deputy],
  ]
  for (const [label, id] of roles) {
    const member = id == null ? undefined : members.find((item) => item.id === id)
    if (member !== undefined && !member.isMonarch) {
      buttons.push(stageButton(`${label} ${member.name} 出马`, 'stage-pick', member.id))
    }
  }
  buttons.push(stageButton('不单挑，直接迎战', 'stage-fight'))

  return buttons
}

/** 战果判语，从我方一侧说。 */
function verdictText(report: BattleReport, mode: 'attack' | 'defense'): string {
  if (mode === 'attack') {
    return report.undefended ? '不战而下' : report.attackerWins ? '战斗告捷' : '战斗失利'
  }

  return report.attackerWins ? '城池失守' : '守城得胜'
}

/** 按当前幕排出内容：文字若干，末了是一排可操作的按钮。 */
function stageContent(state: GameState, stage: BattleStage): HTMLElement[] {
  const target = state.geography.sites.find((site) => site.id === stage.siteId)
  const siteName = target?.name ?? ''
  const report = stage.report
  const duel = report?.duel ?? null
  const ourSide = stage.mode === 'attack' ? 'attacker' : 'defender'

  switch (stage.step) {
    case 'intel': {
      if (stage.mode === 'attack') {
        return [
          stageLine(`进攻 ${siteName}　归属 ${siteOwnerName(state, target?.owner ?? null)}`),
          stageLine(`敌情：${battleOutlook(state, stage.party, stage.siteId)}`, 'outlook'),
          stageLine(`我方　${partySummary(state, stage.party)}`),
          stageLine(`守军　${enemySummary(state, stage.siteId)}`),
          stageLine('是否提出单挑？', 'prompt'),
          stageActions(...intelButtons(state, stage)),
        ]
      }

      const garrison = stage.garrison
      const lines: HTMLElement[] = [
        stageLine(
          `${factionName(state, stage.attackerId)} 来攻 ${siteName}　归属 ${siteOwnerName(state, target?.owner ?? null)}`,
        ),
        stageLine(
          `敌情：${defenseOutlook(state, stage.party, stage.siteId, garrison ?? undefined)}`,
          'outlook',
        ),
        stageLine(`敌方　${partySummary(state, stage.party)}`),
      ]

      // 守军无将：空城迎敌，无从单挑。
      if (garrison === null) {
        return [
          ...lines,
          stageLine('城中无将，只能空城迎敌。', 'prompt'),
          stageActions(stageButton('迎战', 'stage-fight')),
        ]
      }

      return [
        ...lines,
        stageLine(`我方　${garrisonSummary(state, stage.siteId, garrison)}`),
        // 进攻方已提单挑时，守方不再选，只提示一句。
        stageLine(
          stage.party.challenger != null
            ? `${characterNameOf(state, stage.party.challenger)} 前来挑战。`
            : '是否提出单挑？',
          'prompt',
        ),
        stageActions(...intelButtons(state, stage)),
      ]
    }

    case 'duel': {
      const challenger =
        duel === null ? undefined : state.characters.find((item) => item.id === duel.challengerId)
      const answerer =
        duel?.answererId == null
          ? undefined
          : state.characters.find((item) => item.id === duel.answererId)
      const lines: HTMLElement[] = []
      if (challenger !== undefined) {
        lines.push(stageLine(`${challenger.name}：${duelLineOf(challenger)}`, 'speech'))
      }
      if (duel !== null && !duel.refused && answerer !== undefined) {
        lines.push(stageLine(`${answerer.name}：${duelResponseLineOf(answerer)}`, 'speech'))
      }
      if (duel !== null) {
        lines.push(
          stageLine(
            duel.refused
              ? duel.answerer === ''
                ? '无人应战'
                : `${duel.answerer} 拒战`
              : duelClashText(duel),
          ),
        )
        // 士气按「哪一方」说：我方是攻方还是守方，与由谁出马无关。
        const ourDelta =
          duel.challengerSide === ourSide ? duel.challengerMoraleDelta : duel.answererMoraleDelta
        const theirDelta =
          duel.challengerSide === ourSide ? duel.answererMoraleDelta : duel.challengerMoraleDelta
        lines.push(
          stageLine(`我方士气 ${MORALE_FULL} → ${MORALE_FULL + ourDelta}`),
          stageLine(`敌方士气 ${MORALE_FULL} → ${MORALE_FULL + theirDelta}`),
        )
      }

      return [...lines, stageActions(stageButton('继续', 'stage-next'))]
    }

    case 'fight': {
      if (report === null) {
        return []
      }

      const sides = document.createElement('div')
      sides.className = 'battle__sides'
      const attacker = document.createElement('div')
      attacker.className = 'battle__attacker'
      const defender = document.createElement('div')
      defender.className = 'battle__defender'
      fillBattleSide(attacker, '攻方', '主将', report.attacker)
      fillBattleSide(defender, '守方', '守将', report.defender)
      sides.append(attacker, defender)

      const next =
        stage.mode === 'attack'
          ? stageButton('收兵', 'stage-close')
          : stageButton('继续', 'stage-continue-turn')

      return [
        ...battleProcessText(report, stage.mode).map((text) => stageLine(text)),
        stageLine(verdictText(report, stage.mode), 'verdict'),
        stageLine(stage.outcome),
        sides,
        stageActions(next),
      ]
    }

    default:
      return []
  }
}

/** 战斗演出：按当前幕渲染内容与按钮，一幕一幕推进。 */
function renderBattleStage(root: HTMLElement, state: GameState, stage: BattleStage | null): void {
  if (stage === null) {
    return
  }

  const target = state.geography.sites.find((site) => site.id === stage.siteId)
  const title = stage.mode === 'attack' ? '战斗' : '防守'
  requireElement<HTMLElement>(root, '.battle-plan__title').textContent = `${title} · ${target?.name ?? ''}`
  requireElement<HTMLElement>(root, '.battle-plan__body').replaceChildren(
    ...stageContent(state, stage),
  )
}

/** 进攻候选条目：姓名与能力摘要，右侧主将、副将、军师三个标记可点选。 */
function createOrderOfficerItem(
  character: Character,
  factionId: FactionId,
  disabledReason: string | null,
  isDefaultCommander: boolean,
  note: string | null = null,
): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'picker picker--order'
  if (disabledReason !== null) {
    item.classList.add('picker--disabled')
  }

  const name = document.createElement('span')
  name.className = 'picker__name'
  name.textContent = character.name

  const meta = document.createElement('span')
  meta.className = 'picker__meta'
  meta.textContent = officerMetaText(character, factionId)

  item.append(name, meta)

  const statusText = disabledReason ?? note
  if (statusText !== null) {
    const status = document.createElement('span')
    status.className = 'picker__status'
    status.textContent = statusText
    item.append(status)
  }

  const roles = document.createElement('div')
  roles.className = 'picker__roles'
  for (const role of PARTY_ROLES) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'picker__role'
    button.dataset.action = 'order-role'
    button.dataset.character = character.id
    button.dataset.role = role
    button.textContent = PARTY_ROLE_LABELS[role]
    button.disabled = disabledReason !== null
    const active = isDefaultCommander && role === 'commander'
    button.classList.toggle('picker__role--active', active)
    button.setAttribute('aria-pressed', String(active))
    roles.append(button)
  }

  item.append(roles)

  return item
}

/** 点选角色标记：同一人至多担任一角、同一角至多一人；再次点击已任的角色即取消。 */
function toggleOrderRole(list: HTMLElement, button: HTMLButtonElement): void {
  const wasActive = button.classList.contains('picker__role--active')
  const { character, role } = button.dataset

  for (const other of list.querySelectorAll<HTMLButtonElement>('.picker__role[data-role]')) {
    if (other.dataset.role === role || other.dataset.character === character) {
      other.classList.remove('picker__role--active')
      other.setAttribute('aria-pressed', 'false')
    }
  }

  if (!wasActive) {
    button.classList.add('picker__role--active')
    button.setAttribute('aria-pressed', 'true')
  }
}

/** 从角色标记读出当前编成；主将未指定时以空串表示，交由规则层拒绝。 */
function readOrderParty(list: HTMLElement): AttackParty {
  const activeId = (role: PartyRole): CharacterId | null => {
    const selected = list.querySelector<HTMLButtonElement>(
      `.picker__role--active[data-role="${role}"]`,
    )

    return selected?.dataset.character ?? null
  }

  return {
    commander: activeId('commander') ?? '',
    deputy: activeId('deputy'),
    strategist: activeId('strategist'),
  }
}

/** 可勾选的武将条目：复选框、姓名与兵力能力摘要；不可选时标出原因，可附一句提示。 */
function createPickerItem(
  character: Character,
  factionId: FactionId,
  disabledReason: string | null,
  options: { checked?: boolean; disabled?: boolean; note?: string | null } = {},
): HTMLLIElement {
  const disabled = disabledReason !== null || options.disabled === true
  const item = document.createElement('li')
  item.className = 'picker'
  if (disabled) {
    item.classList.add('picker--disabled')
  }

  const label = document.createElement('label')
  label.className = 'picker__label'

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = 'picker__checkbox'
  checkbox.value = character.id
  checkbox.disabled = disabled
  checkbox.checked = options.checked === true
  checkbox.dataset.blocked = disabledReason === null ? 'false' : 'true'

  const name = document.createElement('span')
  name.className = 'picker__name'
  name.textContent = character.name

  const meta = document.createElement('span')
  meta.className = 'picker__meta'
  meta.textContent = officerMetaText(character, factionId)

  label.append(checkbox, name, meta)

  const note = disabledReason ?? options.note ?? null
  if (note !== null) {
    const status = document.createElement('span')
    status.className = 'picker__status'
    status.textContent = note
    label.append(status)
  }

  item.append(label)

  return item
}

function createListItem(className: string, text: string): HTMLLIElement {
  const item = document.createElement('li')
  item.className = className
  item.textContent = text

  return item
}

/** 渲染麾下武将为卡片，每张可当场征兵，返回人数。 */
function renderOfficers(list: Element, state: GameState): number {
  const officers = state.characters.filter(
    (character) => isServing(character) && character.factionId === state.playerFaction,
  )

  if (officers.length === 0) {
    list.replaceChildren(createListItem('roster__empty', '麾下暂无武将'))
    return 0
  }

  list.replaceChildren(
    ...officers.map((officer) => {
      const acted = hasActedThisTurn(state, officer.id)

      return createOfficerCard(
        officer,
        state.playerFaction,
        [
          createOrderButton(
            '征兵',
            'recruit',
            { character: officer.id },
            ACTION_COSTS.recruit,
            acted,
          ),
          createOrderButton(
            '征粮',
            'harvest-grain',
            { character: officer.id },
            ACTION_COSTS.harvestGrain,
            acted,
          ),
        ],
        acted ? ['已行动'] : [],
      )
    }),
  )

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
      item.className = 'roster__all-item'

      const name = document.createElement('span')
      name.className = 'roster__all-name'
      name.textContent = character.name

      const where = provinceNames.get(character.provinceId) ?? character.provinceId
      const owner =
        character.factionId === null
          ? ''
          : ` · ${factionNames.get(character.factionId) ?? character.factionId}`

      const meta = document.createElement('span')
      meta.className = 'roster__all-meta'
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

/** 战报中一方的展示块：主将与参战者、兵力与战力、伤亡与剩余。 */
function fillBattleSide(
  container: HTMLElement,
  label: string,
  commanderRole: string,
  side: BattleReportSide,
): void {
  const heading = document.createElement('p')
  heading.className = 'battle__side-label'
  heading.textContent = label

  const commander = document.createElement('p')
  commander.className = 'battle__commander'
  commander.textContent = side.commander === '' ? '无将' : `${commanderRole} ${side.commander}`

  const officers = document.createElement('p')
  officers.className = 'battle__officers'
  officers.textContent = side.officers.length === 0 ? '无参战武将' : `参战 ${side.officers.join('、')}`

  const stats = document.createElement('ul')
  stats.className = 'battle__stats'
  stats.append(
    createBattleStat('兵力', String(side.troops)),
    createBattleStat('战力', String(side.power)),
    createBattleStat('伤亡', String(side.casualties)),
    createBattleStat('剩余', String(side.remaining)),
  )

  container.replaceChildren(heading, commander, officers, stats)
}

/** 战报中的一项数值：标签在上、数值在下。 */
function createBattleStat(label: string, value: string): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'battle__stat'

  const name = document.createElement('span')
  name.className = 'battle__stat-label'
  name.textContent = label

  const number = document.createElement('span')
  number.className = 'battle__stat-value'
  number.textContent = value

  item.append(name, number)

  return item
}

/** 俘虏弹窗：列出被俘者的原属与态度。 */
function renderCaptivesDialog(dialog: HTMLDialogElement, captives: readonly CaptiveReport[]): void {
  const list = requireElement<HTMLElement>(dialog, '.captives__list')

  list.replaceChildren(
    ...captives.map((captive) => {
      const item = document.createElement('li')
      item.className = 'captives__item'

      const name = document.createElement('span')
      name.className = 'captives__name'
      name.textContent = captive.name

      const meta = document.createElement('span')
      meta.className = 'captives__meta'
      meta.textContent = `${captive.formerFaction} · ${captive.attitude}`

      item.append(name, meta)

      return item
    }),
  )
}

/** 俘虏营：列出营中俘虏的原属与态度，可劝降或斩杀；君主只能斩杀。 */
function renderPrison(dialog: HTMLDialogElement, state: GameState, message: string): void {
  const list = requireElement<HTMLElement>(dialog, '.prison__list')
  const factionNames = new Map(state.factions.map((faction) => [faction.id, faction.name]))
  const captives = captivesOf(state, state.playerFaction)

  requireElement<HTMLElement>(dialog, '.prison__status').textContent = message

  if (captives.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'prison__empty'
    empty.textContent = '营中暂无俘虏'
    list.replaceChildren(empty)
    return
  }

  list.replaceChildren(
    ...captives.map(({ character, record, attitude }) => {
      const item = document.createElement('li')
      item.className = 'prison__item'

      const info = document.createElement('div')
      info.className = 'prison__info'

      const name = document.createElement('span')
      name.className = 'prison__name'
      name.textContent = character.name

      const meta = document.createElement('span')
      meta.className = 'prison__meta'
      const former =
        record.formerFactionId === null
          ? '无主'
          : (factionNames.get(record.formerFactionId) ?? record.formerFactionId)
      meta.textContent = `${former} · ${attitude}`

      info.append(name, meta)

      const actions = document.createElement('div')
      actions.className = 'prison__actions'

      if (!character.isMonarch) {
        const persuade = document.createElement('button')
        persuade.type = 'button'
        persuade.className = 'prison__button'
        persuade.dataset.action = 'persuade'
        persuade.dataset.characterId = character.id
        persuade.textContent = `劝降（${ACTION_COSTS.persuade} 行动力）`
        actions.append(persuade)

        const release = document.createElement('button')
        release.type = 'button'
        release.className = 'prison__button'
        release.dataset.action = 'release-captive'
        release.dataset.characterId = character.id
        release.textContent = '释放'
        actions.append(release)
      }

      const execute = document.createElement('button')
      execute.type = 'button'
      execute.className = 'prison__button'
      execute.dataset.action = 'execute-captive'
      execute.dataset.characterId = character.id
      execute.textContent = '斩杀'
      actions.append(execute)

      item.append(info, actions)

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

/** 剧本列表：名称与规模，点「开始」即按该剧本重开一局。 */
function renderScenarioList(list: Element): void {
  list.replaceChildren(
    ...SCENARIOS.map((scenario) => {
      const item = document.createElement('li')
      item.className = 'scenario'

      const info = document.createElement('div')
      info.className = 'scenario__info'

      const name = document.createElement('span')
      name.className = 'scenario__name'
      name.textContent = scenario.name

      const meta = document.createElement('span')
      meta.className = 'scenario__meta'
      meta.textContent = `${scenario.factions.length} 势力 · ${scenario.geography?.sites.length ?? 0} 战略点`

      info.append(name, meta)

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'scenario__start'
      button.dataset.action = 'start-scenario'
      button.dataset.scenario = scenario.id
      button.textContent = '开始'

      item.append(info, button)

      return item
    }),
  )
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
  const contactPanel = requireElement<HTMLElement>(root, '.recruit-panel')
  const siteSeekButton = requireElement<HTMLButtonElement>(root, '[data-action="seek-here"]')
  const openRosterButton = requireElement<HTMLButtonElement>(actionBar, '[data-action="open-roster"]')
  const closeRosterButton = requireElement<HTMLButtonElement>(root, '[data-action="close-roster"]')
  const rosterDialog = requireElement<HTMLDialogElement>(root, '.roster')
  const openHistoryButton = requireElement<HTMLButtonElement>(actionBar, '[data-action="open-history"]')
  const closeHistoryButton = requireElement<HTMLButtonElement>(root, '[data-action="close-history"]')
  const historyDialog = requireElement<HTMLDialogElement>(root, '.history')
  const historyList = requireElement<HTMLElement>(root, '.history__list')
  const openDomesticButton = requireElement<HTMLButtonElement>(actionBar, '[data-action="open-domestic"]')
  const closeDomesticButton = requireElement<HTMLButtonElement>(root, '[data-action="close-domestic"]')
  const domesticDialog = requireElement<HTMLDialogElement>(root, '.domestic')
  const officerList = requireElement<HTMLElement>(root, '.roster__officers')
  const officerCount = requireElement<HTMLElement>(root, '.roster__officers-count')
  const officersTitle = requireElement<HTMLElement>(root, '.roster__officers-title')
  const rosterStatus = requireElement<HTMLElement>(root, '.roster__status')
  const devSection = requireElement<HTMLElement>(root, '.roster__dev')
  const allCharactersList = requireElement<HTMLElement>(root, '.roster__all')
  const allCount = requireElement<HTMLElement>(root, '.roster__all-count')
  const openSettingsButton = requireElement<HTMLButtonElement>(root, '[data-action="open-settings"]')
  const openSavesButton = requireElement<HTMLButtonElement>(root, '[data-action="open-saves"]')
  const closeSettingsButton = requireElement<HTMLButtonElement>(root, '[data-action="close-settings"]')
  const closeSavesButton = requireElement<HTMLButtonElement>(root, '[data-action="close-saves"]')
  const settingsDialog = requireElement<HTMLDialogElement>(root, '.settings')
  const linksCheckbox = requireElement<HTMLInputElement>(root, '[data-setting="showStrategicLinks"]')
  const developerCheckbox = requireElement<HTMLInputElement>(root, '[data-setting="developerMode"]')
  const savesDialog = requireElement<HTMLDialogElement>(root, '.saves')
  const openNewGameButton = requireElement<HTMLButtonElement>(root, '[data-action="open-new-game"]')
  const closeNewGameButton = requireElement<HTMLButtonElement>(root, '[data-action="close-new-game"]')
  const newGameDialog = requireElement<HTMLDialogElement>(root, '.new-game')
  const newGameList = requireElement<HTMLElement>(root, '.new-game__list')
  const closeOrderButton = requireElement<HTMLButtonElement>(root, '[data-action="close-order"]')
  const orderDialog = requireElement<HTMLDialogElement>(root, '.order')
  const orderStatus = requireElement<HTMLElement>(root, '.order__status')
  const orderList = requireElement<HTMLElement>(root, '.order__officers')
  const orderGoButton = requireElement<HTMLButtonElement>(root, '[data-action="order-go"]')
  const closeBattlePlanButton = requireElement<HTMLButtonElement>(root, '[data-action="close-battle-plan"]')
  const battlePlanDialog = requireElement<HTMLDialogElement>(root, '.battle-plan')
  const battleStageBody = requireElement<HTMLElement>(root, '.battle-plan__body')
  const closeCaptivesButton = requireElement<HTMLButtonElement>(root, '[data-action="close-captives"]')
  const captivesDialog = requireElement<HTMLDialogElement>(root, '.captives')
  const openPrisonButton = requireElement<HTMLButtonElement>(actionBar, '[data-action="open-prison"]')
  const closePrisonButton = requireElement<HTMLButtonElement>(root, '[data-action="close-prison"]')
  const prisonDialog = requireElement<HTMLDialogElement>(root, '.prison')
  const prisonList = requireElement<HTMLElement>(root, '.prison__list')

  linksCheckbox.checked = settings.get().showStrategicLinks
  developerCheckbox.checked = settings.get().developerMode

  /** 给面板上的行动按钮标注行动力消耗，与征兵按钮的标注一致。 */
  const setActionCost = (action: string, text: string): void => {
    requireElement<HTMLElement>(root, `[data-action="${action}"] .action-cost`).textContent = text
  }
  setActionCost('attack-here', `${ACTION_COSTS.attack} 行动力`)
  setActionCost('transfer-here', `${ACTION_COSTS.transfer} 行动力/人`)
  setActionCost('seek-here', `${ACTION_COSTS.seekTalent} 行动力`)

  /** 各面板的上一次行动反馈。 */
  let siteMessage = ''
  let recruitMessage = ''
  let contactMessage = ''
  /** 命令弹窗当前的目标与行动：进攻或调动。 */
  let orderRequest: OrderRequest | null = null
  /** 编成后进入战斗的演出：编成、已结算的战报与当前幕。 */
  let battleStage: BattleStage | null = null
  /** 刚结束的一战里的俘虏；等演出收兵后再单独弹出俘虏窗口。 */
  let pendingCaptives: CaptiveReport[] = []
  /** 俘虏营的上一次操作反馈。 */
  let prisonMessage = ''

  const paint = (state: GameState): void => {
    dateLabel.textContent = formatDate(state)
    turnLabel.textContent = `第 ${state.currentTurn} 回合`
    renderActionPoints(actionPointsLabel, state)
    renderDomestic(domesticDialog, state)
    renderFactions(factionList, state)
    renderSitePanel(sitePanel, state, selection.get(), siteMessage)
    renderContacts(contactPanel, state, contactMessage)
    renderOrderDialog(root, state, orderRequest)
    renderBattleStage(root, state, battleStage)
    officerCount.textContent = String(renderOfficers(officerList, state))
    rosterStatus.textContent = recruitMessage
    renderHistory(historyList, state)
    renderPrison(prisonDialog, state, prisonMessage)
    renderSlots(slotList, session)

    const developerMode = settings.get().developerMode
    officersTitle.hidden = !developerMode
    devSection.hidden = !developerMode
    if (developerMode) {
      allCount.textContent = String(renderAllCharacters(allCharactersList, state))
    }
  }

  endTurnButton.addEventListener('click', () => {
    recruitMessage = ''
    contactMessage = ''
    runTurnFlow(session.endTurnStaged())
  })

  openRosterButton.addEventListener('click', () => {
    recruitMessage = ''
    rosterStatus.textContent = ''
    rosterDialog.showModal()
  })

  closeRosterButton.addEventListener('click', () => {
    rosterDialog.close()
  })

  openHistoryButton.addEventListener('click', () => {
    historyDialog.showModal()
    historyList.scrollTop = historyList.scrollHeight
  })

  closeHistoryButton.addEventListener('click', () => {
    historyDialog.close()
  })

  openDomesticButton.addEventListener('click', () => {
    domesticDialog.showModal()
  })

  closeDomesticButton.addEventListener('click', () => {
    domesticDialog.close()
  })

  closeOrderButton.addEventListener('click', () => {
    abandonOrder()
  })

  /** 收兵：关掉演出；这一战若抓了俘虏，接上俘虏窗口。 */
  const finishStage = (): void => {
    battleStage = null
    battlePlanDialog.close()
    if (pendingCaptives.length > 0) {
      renderCaptivesDialog(captivesDialog, pendingCaptives)
      captivesDialog.showModal()
      pendingCaptives = []
    }
  }

  /** 这一季结束：关掉演出并报出新回合。 */
  const settleTurn = (): void => {
    battleStage = null
    battlePlanDialog.close()
    const state = session.getState()
    statusLabel.textContent = `新回合开始：${formatDate(state)}，粮产 +${grainYield(state, state.playerFaction)}，已自动保存`
  }

  /** 迎战编成既定：进入防守演出（情报与选择 → 单挑 → 交战与结果）。 */
  const startDefenseStage = (request: DefenseRequest, garrison: Party | null): void => {
    battleStage = {
      mode: 'defense',
      party: request.party,
      siteId: request.targetSiteId,
      attackerId: request.attackerId,
      garrison,
      step: 'intel',
      report: null,
      outcome: '',
    }
    paint(session.getState())
    battlePlanDialog.showModal()
  }

  /**
   * 他方来犯：先让守方定下迎战编成（复用命令弹窗），再由演出呈现这一战。
   * 依次上演每一次来犯，全部看完才进入下一季；无将可守时无从编成，直接进演出。
   */
  const runTurnFlow = (signal: FactionTurnSignal | null): void => {
    if (signal === null) {
      settleTurn()
      return
    }
    if (signal.kind === 'battle') {
      // 这一战的战报已在相应的幕里呈现，继续推进本回合。
      runTurnFlow(session.continueTurn())
      return
    }

    if (stationedDefendersAt(session.getState(), signal.request.targetSiteId).length === 0) {
      startDefenseStage(signal.request, null)
      return
    }

    orderRequest = { kind: 'defense', siteId: signal.request.targetSiteId, defense: signal.request }
    orderStatus.textContent = ''
    paint(session.getState())
    orderDialog.showModal()
  }

  /** 我方进攻：编成既定，按是否由某人出马结算这一战，再转入演出的后续幕。 */
  const resolveBattle = (challenger: CharacterId | null): void => {
    if (battleStage === null || battleStage.mode !== 'attack') {
      return
    }

    const party = { ...battleStage.party, challenger }
    const result = session.attack(party, battleStage.siteId)
    if (!result.ok) {
      battleStage.step = 'intel'
      statusLabel.textContent = result.reason
      paint(session.getState())
      return
    }

    const report = result.record.battle ?? null
    battleStage.party = party
    battleStage.report = report
    battleStage.outcome = result.record.outcome
    // 我方不提时守军也可能反来挑战，所以看战报里有没有单挑，而不是看我方是否出马。
    battleStage.step = report?.duel == null ? 'fight' : 'duel'
    pendingCaptives = report === null ? [] : report.captives
    siteMessage = result.record.outcome
    paint(session.getState())
  }

  /** 我方防守：把迎战编成与出马决定交回推进器，随即取到这一战的战报。 */
  const answerDefense = (challenger: CharacterId | null): void => {
    if (battleStage === null || battleStage.mode !== 'defense') {
      return
    }

    const signal = session.answerDefense({
      party: battleStage.garrison ?? undefined,
      challenger,
    })
    if (signal === null) {
      settleTurn()
      return
    }
    if (signal.kind !== 'battle') {
      runTurnFlow(signal)
      return
    }

    battleStage.report = signal.report
    battleStage.outcome = signal.outcome
    battleStage.step = signal.report?.duel == null ? 'fight' : 'duel'
    siteMessage = signal.outcome
    paint(session.getState())
  }

  /** 情报幕的选择：进攻时发起进攻，防御时就这一战作出应战决定。 */
  const chooseDueler = (challenger: CharacterId | null): void => {
    if (battleStage === null) {
      return
    }

    if (battleStage.mode === 'attack') {
      resolveBattle(challenger)
    } else {
      answerDefense(challenger)
    }
  }

  /** 推进一幕：看过单挑后便是交战与结果。 */
  const advanceStage = (): void => {
    if (battleStage === null) {
      return
    }

    if (battleStage.step === 'duel') {
      battleStage.step = 'fight'
    }
    paint(session.getState())
  }

  /** 防御演出走到一半关掉：把剩下的来犯一律按不单挑结算到底。 */
  const skipDefenses = (): void => {
    let signal = battleStage?.step === 'intel' ? session.answerDefense(null) : session.continueTurn()
    while (signal !== null) {
      signal = signal.kind === 'defense' ? session.answerDefense(null) : session.continueTurn()
    }
    settleTurn()
  }

  /** 关掉命令弹窗；若关掉的正是迎战编成，余下的来犯按默认编成一路结算到底。 */
  const abandonOrder = (): void => {
    if (orderRequest?.kind === 'defense') {
      orderRequest = null
      orderDialog.close()
      skipDefenses()
      return
    }
    orderDialog.close()
  }

  closeCaptivesButton.addEventListener('click', () => {
    captivesDialog.close()
  })

  openPrisonButton.addEventListener('click', () => {
    prisonMessage = ''
    paint(session.getState())
    prisonDialog.showModal()
  })

  closePrisonButton.addEventListener('click', () => {
    prisonDialog.close()
  })

  prisonList.addEventListener('click', (event) => {
    const button = actionButtonOf(event)
    const characterId = button?.dataset.characterId
    if (button === null || characterId === undefined) {
      return
    }

    const action = button.dataset.action
    const result =
      action === 'persuade'
        ? session.persuade(characterId)
        : action === 'execute-captive'
          ? session.executeCaptive(characterId)
          : action === 'release-captive'
            ? session.releaseCaptive(characterId)
            : null
    if (result === null) {
      return
    }

    prisonMessage = result.ok ? result.record.outcome : result.reason
    paint(session.getState())
  })

  orderGoButton.addEventListener('click', () => {
    if (orderRequest === null) {
      return
    }

    if (orderRequest.kind === 'attack') {
      const party = readOrderParty(orderList)
      const state = session.getState()
      const blocked = attackBlockReason(state, party, orderRequest.siteId)
      if (blocked !== null) {
        orderStatus.textContent = blocked
        return
      }

      battleStage = {
        mode: 'attack',
        party,
        siteId: orderRequest.siteId,
        attackerId: null,
        garrison: null,
        step: 'intel',
        report: null,
        outcome: '',
      }
      orderStatus.textContent = ''
      orderDialog.close()
      renderBattleStage(root, state, battleStage)
      battlePlanDialog.showModal()
      return
    }

    if (orderRequest.kind === 'defense') {
      const garrison = readOrderParty(orderList)
      if (garrison.commander === '') {
        orderStatus.textContent = '必须指定主将'
        return
      }

      const request = orderRequest.defense
      orderStatus.textContent = ''
      orderRequest = null
      orderDialog.close()
      if (request !== undefined) {
        startDefenseStage(request, garrison)
      }
      return
    }

    const characterIds = Array.from(
      orderList.querySelectorAll<HTMLInputElement>('.picker__checkbox:checked'),
    ).map((checkbox) => checkbox.value)
    if (characterIds.length === 0) {
      orderStatus.textContent = '请选择要调动的武将'
      return
    }

    const result = session.transfer(characterIds, orderRequest.siteId)
    if (!result.ok) {
      orderStatus.textContent = result.reason
      return
    }

    siteMessage = result.record.outcome
    orderDialog.close()
    paint(session.getState())
  })

  /** 进攻选人：点选武将行内的主将、副将与军师标记。 */
  orderList.addEventListener('click', (event) => {
    const button = actionButtonOf(event)
    if (button === null || button.dataset.action !== 'order-role') {
      return
    }

    toggleOrderRole(orderList, button)
  })

  closeBattlePlanButton.addEventListener('click', () => {
    if (battleStage?.mode === 'defense') {
      skipDefenses()
      return
    }
    finishStage()
  })

  /** 演出里的一次操作：选定出马者或直接开战、推进一幕、收兵或继续本回合。 */
  battleStageBody.addEventListener('click', (event) => {
    const button = actionButtonOf(event)
    const action = button?.dataset.action
    if (button === null || battleStage === null || action === undefined) {
      return
    }

    if (action === 'stage-fight') {
      chooseDueler(null)
    } else if (action === 'stage-pick') {
      chooseDueler(button.dataset.character ?? null)
    } else if (action === 'stage-next') {
      advanceStage()
    } else if (action === 'stage-close') {
      finishStage()
    } else if (action === 'stage-continue-turn') {
      battleStage = null
      runTurnFlow(session.continueTurn())
    }
  })

  /** 演出进行中不允许 Esc 直接关掉：防御演出未完结时，等同于「关闭」的处理。 */
  battlePlanDialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    if (battleStage?.mode === 'defense') {
      skipDefenses()
      return
    }
    finishStage()
  })

  /** Esc 关掉迎战编成时不能白关：余下的来犯按默认编成一路结算到底。 */
  orderDialog.addEventListener('cancel', (event) => {
    if (orderRequest?.kind !== 'defense') {
      return
    }
    event.preventDefault()
    abandonOrder()
  })

  /** 调动选人：勾满三人后，其余候选不可再选。 */
  orderList.addEventListener('change', () => {
    const checkboxes = Array.from(orderList.querySelectorAll<HTMLInputElement>('.picker__checkbox'))
    const checked = checkboxes.filter((checkbox) => checkbox.checked).length

    for (const checkbox of checkboxes) {
      checkbox.disabled =
        checkbox.dataset.blocked === 'true' || (!checkbox.checked && checked >= MAX_TRANSFER_PARTY)
    }
  })

  officerList.addEventListener('click', (event) => {
    const button = actionButtonOf(event)
    const characterId = button?.dataset.character
    if (button === null || characterId === undefined) {
      return
    }

    const result =
      button.dataset.action === 'harvest-grain'
        ? session.harvestGrain(characterId)
        : session.recruit(characterId)
    recruitMessage = result.ok ? result.record.outcome : result.reason
    paint(session.getState())
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

  /** 待招募名单：再次拜访某人，花行动力提升其意愿并重新判定招聘。 */
  contactPanel.addEventListener('click', (event) => {
    const button = actionButtonOf(event)
    const characterId = button?.dataset.character
    if (button === null || button.dataset.action !== 'visit-character' || characterId === undefined) {
      return
    }

    const result = session.visit(characterId)
    contactMessage = result.ok ? result.record.outcome : result.reason
    paint(session.getState())
  })

  sitePanel.addEventListener('click', (event) => {
    const action = actionButtonOf(event)?.dataset.action
    const siteId = selection.get()
    if (siteId === null) {
      return
    }

    if (action === 'attack-here') {
      orderRequest = { kind: 'attack', siteId }
    } else if (action === 'transfer-here') {
      orderRequest = { kind: 'transfer', siteId }
    } else {
      return
    }

    orderStatus.textContent = ''
    paint(session.getState())
    orderDialog.showModal()
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

  openNewGameButton.addEventListener('click', () => {
    renderScenarioList(newGameList)
    newGameDialog.showModal()
  })

  closeNewGameButton.addEventListener('click', () => {
    newGameDialog.close()
  })

  newGameList.addEventListener('click', (event) => {
    const scenarioId = actionButtonOf(event)?.dataset.scenario
    if (scenarioId === undefined) {
      return
    }

    const scenario = SCENARIOS.find((item) => item.id === scenarioId)
    if (scenario === undefined) {
      return
    }

    session.newGame(scenario)
    orderRequest = null
    siteMessage = ''
    recruitMessage = ''
    selection.select(null)
    newGameDialog.close()
    statusLabel.textContent = `已开始新游戏：${scenario.name}`
  })

  selection.subscribe(() => {
    siteMessage = ''
    paint(session.getState())
  })

  session.subscribe(paint)
  paint(session.getState())
}
