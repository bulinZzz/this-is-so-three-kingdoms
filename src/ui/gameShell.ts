import type { GameSession } from '../app/gameSession'
import type { SelectionStore } from '../app/selectionStore'
import type { SettingsStore } from '../app/settingsStore'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN, canAfford } from '../core/actions'
import { affinityAttitude, affinityToward } from '../core/affinity'
import type {
  AbilityKind,
  BattleReport,
  BattleReportSide,
  CaptiveReport,
  Character,
  CharacterId,
  CharacterStatus,
  DevelopmentKind,
  Faction,
  FactionId,
  GameDate,
  GameState,
  Personality,
  RelationKind,
  Season,
  Site,
  SiteId,
  SiteType,
} from '../core/model'
import {
  ACTION_THRESHOLD,
  ARM_STATS,
  attackCandidates,
  ATTACKER_SELECTION,
  autoFormation,
  currentActor,
  DEFENDER_SELECTION,
  defenderCandidates,
  isAttackable,
  rowOfSlot,
  setUnitSlot,
  stationedAt,
  targetsFor,
  type BattleActionEvent,
  type BattleDeployment,
  type BattleOrder,
  type BattleSide,
  type BattleState,
  type BattleUnit,
  type ForcedOutcome,
} from '../core/battle'
import { isRecruitable, isRetired, isServing, scopeSitesFor } from '../core/characters'
import { captivesOf } from '../core/captives'
import {
  buildCost,
  developmentLevel,
  developmentLimit,
  DEVELOPMENT_KINDS,
  DEVELOPMENT_LABELS,
  GRAIN_BONUS_PER_FARM_LEVEL,
  MONEY_BONUS_PER_MARKET_LEVEL,
  POPULATION_PER_HOUSING,
} from '../core/development'
import { grainBalance, granaryIncome, moneyYield, troopUpkeep } from '../core/economy'
import { ALLIANCE_FAVOR, GIFT_MONEY, PEACE_FAVOR } from '../core/diplomacy'
import { granaryOf } from '../core/granary'
import { ABILITY_KINDS, ABILITY_LABELS, BOOST_GAIN, boostCredits, EXP_PER_BOOST } from '../core/growth'
import { defectThresholdFor, loyaltyHint } from '../core/loyalty'
import type { DefenseRequest, FactionTurnSignal } from '../core/turn'
import { SLOT_COUNT, type SaveSummary } from '../core/saveStore'
import { SCENARIOS } from '../core/scenarios'
import {
  factionTroops,
  hasActedThisTurn,
  isFactionDestroyed,
  sitePopulationCap,
  troopLimit,
} from '../core/military'
import { favorBetween, relationBetween } from '../core/relations'
import { resolveFactionOrder } from '../core/turn'
import { UNOWNED_SITE_COLOR } from '../game/mapLayout'
import './shell.css'

const SHELL_HTML = `
  <div class="shell">
    <header class="shell__header">
      <div class="shell__menu">
        <button type="button" class="shell__link" data-action="open-new-game">新游戏</button>
        <button type="button" class="shell__link" data-action="open-saves">存档</button>
        <button type="button" class="shell__link" data-action="open-settings">设置</button>
      </div>
      <div class="shell__heading">
        <p class="shell__date"></p>
        <p class="shell__turn"></p>
        <p class="shell__action-points"></p>
      </div>
    </header>
    <section class="shell__section">
      <h2 class="shell__title">势力</h2>
      <ul class="shell__factions"></ul>
    </section>
    <section class="shell__section site-panel" hidden>
      <h2 class="shell__title">战略点</h2>
      <div class="site-panel__head">
        <p class="site-panel__name"></p>
        <p class="site-panel__owner"></p>
      </div>
      <p class="site-panel__meta"></p>
      <p class="site-panel__label">驻守</p>
      <ul class="site-panel__officers"></ul>
      <div class="site-panel__actions">
        <button type="button" class="site-panel__action" data-action="attack-here" hidden>
          <span>进攻此地</span>
          <span class="action-cost"></span>
        </button>
        <button type="button" class="site-panel__action" data-action="site-info" hidden>
          <span>进入</span>
        </button>
        <button type="button" class="site-panel__action" data-action="station-here" hidden>
          <span>任命驻将</span>
          <span class="action-cost"></span>
        </button>
        <button type="button" class="site-panel__action" data-action="seek-here" hidden>
          <span>在此寻访</span>
          <span class="action-cost"></span>
        </button>
      </div>
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
        <div class="roster__list">
          <section class="roster__section">
            <h3 class="roster__section-title roster__officers-title" hidden>麾下<span class="roster__count roster__officers-count"></span></h3>
            <div class="roster__table-wrap">
              <table class="roster__table">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>驻地</th>
                    <th>兵力</th>
                    <th>武</th>
                    <th>统</th>
                    <th>智</th>
                    <th>政</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody class="roster__officers"></tbody>
              </table>
            </div>
          </section>
          <section class="roster__section roster__dev" hidden>
            <h3 class="roster__section-title">全部武将<span class="roster__count roster__all-count"></span></h3>
            <div class="roster__table-wrap">
              <table class="roster__table roster__table--all">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>所在州</th>
                    <th>兵力</th>
                    <th>武</th>
                    <th>统</th>
                    <th>智</th>
                    <th>政</th>
                    <th>状态</th>
                    <th>君主</th>
                  </tr>
                </thead>
                <tbody class="roster__all"></tbody>
              </table>
            </div>
          </section>
        </div>
        <div class="roster__detail" hidden></div>
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
        <section class="domestic__section">
          <h3 class="domestic__heading">当前</h3>
          <div class="domestic__row">
            <span class="domestic__label">兵力</span>
            <span class="domestic__value domestic__troops"></span>
          </div>
          <div class="domestic__row">
            <span class="domestic__label">粮食</span>
            <span class="domestic__value domestic__grain"></span>
          </div>
          <div class="domestic__row">
            <span class="domestic__label">黄金</span>
            <span class="domestic__value domestic__money"></span>
          </div>
          <div class="domestic__row">
            <span class="domestic__label">人口</span>
            <span class="domestic__value domestic__population"></span>
          </div>
          <div class="domestic__row">
            <span class="domestic__label">存量</span>
            <span class="domestic__value domestic__granary"></span>
          </div>
        </section>
        <section class="domestic__section">
          <h3 class="domestic__heading">每季收支</h3>
          <div class="domestic__row">
            <span class="domestic__label">粮食</span>
            <span class="domestic__value domestic__grain-flow"></span>
          </div>
          <div class="domestic__row">
            <span class="domestic__label">黄金</span>
            <span class="domestic__value domestic__money-flow"></span>
          </div>
        </section>
        <p class="domestic__status" role="status"></p>
      </div>
    </dialog>
    <dialog class="order">
      <div class="saves__head">
        <h2 class="saves__title order__title"></h2>
        <button type="button" class="saves__close" data-action="close-order">关闭</button>
      </div>
      <div class="order__body">
        <div class="order__head">
          <p class="order__target"></p>
          <p class="order__count"></p>
        </div>
        <label class="order__site-row" hidden>
          <span class="order__site-label">战略点</span>
          <select class="order__site"></select>
        </label>
        <ul class="order__officers"></ul>
        <div class="order__actions">
          <button type="button" class="order__abandon" data-action="order-abandon" hidden>
            放弃战斗
          </button>
          <button type="button" class="order__submit" data-action="order-go"></button>
        </div>
        <p class="order__status" role="status"></p>
      </div>
    </dialog>
    <dialog class="battle-plan">
      <div class="saves__head">
        <h2 class="saves__title battle-plan__title">战斗</h2>
        <span class="battle-plan__meta"></span>
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
        <h2 class="saves__title">俘虏</h2>
        <button type="button" class="saves__close" data-action="close-prison">关闭</button>
      </div>
      <ul class="prison__list"></ul>
      <p class="prison__status" role="status"></p>
    </dialog>
    <dialog class="diplomacy">
      <div class="saves__head">
        <h2 class="saves__title">外交</h2>
        <div class="saves__head-actions">
          <button type="button" class="saves__close" data-action="diplomacy-back" hidden>返回</button>
          <button type="button" class="saves__close" data-action="close-diplomacy">关闭</button>
        </div>
      </div>
      <p class="diplomacy__target"></p>
      <ul class="diplomacy__list"></ul>
      <p class="diplomacy__status" role="status"></p>
    </dialog>
    <dialog class="disband">
      <div class="saves__head">
        <h2 class="saves__title">遣散</h2>
        <button type="button" class="saves__close" data-action="close-disband">关闭</button>
      </div>
      <p class="disband__target"></p>
      <div class="disband__body">
        <span class="disband__label"></span>
        <input type="range" class="disband__slider" min="0" />
      </div>
      <div class="disband__actions">
        <button type="button" class="disband__submit" data-action="disband-confirm">遣散</button>
      </div>
      <p class="disband__status" role="status"></p>
    </dialog>
    <dialog class="confirm">
      <div class="saves__head">
        <h2 class="saves__title">解任</h2>
        <button type="button" class="saves__close" data-action="close-confirm">关闭</button>
      </div>
      <p class="confirm__text"></p>
      <div class="confirm__actions">
        <button type="button" class="confirm__button" data-action="dismiss-cancel">取消</button>
        <button type="button" class="confirm__button confirm__button--primary" data-action="dismiss-confirm">解任</button>
      </div>
    </dialog>
    <dialog class="site-info">
      <div class="saves__head">
        <h2 class="saves__title site-info__title">战略点</h2>
        <button type="button" class="saves__close" data-action="close-site-info">关闭</button>
      </div>
      <div class="site-info__body">
        <dl class="site-info__facts"></dl>
        <h3 class="site-info__heading">建设</h3>
        <ul class="site-info__list"></ul>
      </div>
      <p class="site-info__status" role="status"></p>
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
        <input type="checkbox" class="settings__checkbox" data-setting="showActionCosts" />
        <span>显示行动力消耗</span>
      </label>
      <label class="settings__option">
        <input type="checkbox" class="settings__checkbox" data-setting="showAllCharacters" />
        <span>开发者模式：列出全部武将及其所在州</span>
      </label>
      <label class="settings__option">
        <input type="checkbox" class="settings__checkbox" data-setting="battleShortcuts" />
        <span>开发者模式：战斗情报幕附「一键胜利／一键失败」</span>
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
    <dialog class="ending">
      <div class="ending__body">
        <h2 class="ending__title"></h2>
        <p class="ending__date"></p>
        <h3 class="ending__heading">势力</h3>
        <ul class="ending__factions"></ul>
        <h3 class="ending__heading">战果</h3>
        <p class="ending__tally"></p>
      </div>
      <div class="ending__actions">
        <button type="button" class="ending__button" data-action="ending-saves">读档</button>
        <button type="button" class="ending__button ending__button--primary" data-action="ending-new-game">新游戏</button>
      </div>
    </dialog>
  </div>
`

/** 底部操作区：承载游戏内容入口，与顶部只放存档、设置的菜单分开。 */
const ACTION_BAR_HTML = `
  <nav class="action-bar">
    <button type="button" class="action-bar__button" data-action="open-roster">武将</button>
    <button type="button" class="action-bar__button" data-action="open-domestic">内政</button>
    <button type="button" class="action-bar__button" data-action="open-diplomacy">外交</button>
    <button type="button" class="action-bar__button" data-action="open-prison">俘虏</button>
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

/** 关系状态的中文名。 */
function relationLabel(kind: RelationKind): string {
  if (kind === 'ally') {
    return '同盟'
  }
  if (kind === 'hostile') {
    return '敌对'
  }
  return '中立'
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

    // 覆灭者已不在版图，只标结局，不再并列关系。
    if (isFactionDestroyed(state, faction.id)) {
      const badge = document.createElement('span')
      badge.className = 'shell__badge shell__badge--destroyed'
      badge.textContent = '已覆灭'
      item.append(badge)
    } else if (faction.id === state.playerFaction) {
      const badge = document.createElement('span')
      badge.className = 'shell__badge'
      badge.textContent = '我'
      item.append(badge)
    } else {
      const relation = relationBetween(state, state.playerFaction, faction.id)
      const badge = document.createElement('span')
      badge.className = `shell__badge shell__badge--${relation}`
      badge.textContent = relationLabel(relation)
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

/** 结局弹窗：胜负标题、终局时间、各势力存亡、我方兵力粮金，以及由行动历史统计的战果。 */
function renderEnding(dialog: HTMLElement, state: GameState): void {
  requireElement<HTMLElement>(dialog, '.ending__title').textContent =
    state.outcome === 'victory' ? '天下一统' : '势力覆灭'
  requireElement<HTMLElement>(dialog, '.ending__date').textContent =
    `终局　${formatGameDate(state.currentDate)}　第 ${state.endedTurn ?? state.currentTurn} 回合`

  const factions = requireElement<HTMLElement>(dialog, '.ending__factions')
  factions.replaceChildren(
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
        item.append(createBadge('我', ''))
      }
      item.append(
        isFactionDestroyed(state, faction.id)
          ? createBadge('已覆灭', 'shell__badge--destroyed')
          : createBadge('存续', ''),
      )

      return item
    }),
  )

  const battles = state.history.filter(
    (record) => record.kind === 'attack' && record.factionId === state.playerFaction,
  ).length
  requireElement<HTMLElement>(dialog, '.ending__tally').textContent = `主动进攻 ${battles} 次`
}

/** 势力行上的一枚徽记；`modifier` 为空时用通用样式。 */
function createBadge(text: string, modifier: string): HTMLSpanElement {
  const badge = document.createElement('span')
  badge.className = modifier === '' ? 'shell__badge' : `shell__badge ${modifier}`
  badge.textContent = text

  return badge
}

/** 带符号的数量：非负加「+」，负数带「−」。 */
function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`
}

/** 内政弹窗：上半记当前资源，下半记每季收支（运回减军粮、金钱收入）；征兵与征粮改在战略点窗口办理。 */
function renderDomestic(
  dialog: HTMLElement,
  state: GameState,
  message: string,
): void {
  const faction = state.factions.find((item) => item.id === state.playerFaction)
  const ownSites = state.geography.sites.filter((site) => site.owner === state.playerFaction)
  const population = ownSites.reduce((total, site) => total + site.population, 0)
  const granary = ownSites.reduce((total, site) => total + granaryOf(site), 0)

  requireElement<HTMLElement>(dialog, '.domestic__troops').textContent = String(
    factionTroops(state, state.playerFaction),
  )
  requireElement<HTMLElement>(dialog, '.domestic__grain').textContent = String(faction?.grain ?? 0)
  requireElement<HTMLElement>(dialog, '.domestic__money').textContent = String(faction?.money ?? 0)
  requireElement<HTMLElement>(dialog, '.domestic__population').textContent = String(population)
  requireElement<HTMLElement>(dialog, '.domestic__granary').textContent = String(granary)
  requireElement<HTMLElement>(dialog, '.domestic__grain-flow').textContent =
    `+${granaryIncome(state, state.playerFaction)} − ${troopUpkeep(state, state.playerFaction)} = ${formatSigned(
      grainBalance(state, state.playerFaction),
    )}`
  requireElement<HTMLElement>(dialog, '.domestic__money-flow').textContent =
    `+${moneyYield(state, state.playerFaction)}`
  requireElement<HTMLElement>(dialog, '.domestic__status').textContent = message
}

const SITE_TYPE_LABELS: Record<SiteType, string> = {
  metropolis: '都会',
  city: '大城',
  town: '小城',
  pass: '关隘',
  field: '野地',
}

/**
 * 行动力角标：框内只报数字，按人计的行动写作「1/人」。
 * 关闭「显示行动力消耗」或消耗为零时留空，整枚由样式隐去。
 */
function createActionCost(cost: number, showCosts: boolean, unit = ''): HTMLSpanElement {
  const badge = document.createElement('span')
  badge.className = 'action-cost'
  if (showCosts && cost > 0) {
    badge.textContent = `${cost}${unit}`
    badge.title = `${cost} 行动力`
  }

  return badge
}

/** 给按钮填上「动作 + 行动力角标」；不耗行动力的行动只有动作，不留空圈。 */
function setActionButton(
  button: HTMLButtonElement,
  label: string,
  cost: number,
  showCosts: boolean,
  unit = '',
): void {
  button.replaceChildren(label, createActionCost(cost, showCosts, unit))
}

/** 表格行内的行动按钮；开启「显示行动力消耗」时把消耗缀在名称后（不耗行动力的不标）。 */
function createRosterAction(
  label: string,
  action: string,
  characterId: CharacterId,
  cost: number,
  showCosts: boolean,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'officer-action'
  button.dataset.action = action
  button.dataset.character = characterId
  if (cost > 0) {
    button.title = `消耗 ${cost} 行动力`
  }
  setActionButton(button, label, cost, showCosts)

  return button
}

/** 年龄的呈现：不足二十岁作「未冠」，含开局尚未出生者。 */
function ageText(age: number): string {
  return age < 20 ? '未冠' : `${age} 岁`
}

/** 武将的即战摘要：兵种、兵力（连同带兵上限）与四项能力。 */
function officerSummaryText(character: Character): string {
  return `${ARM_STATS[character.armType].label} · 兵 ${character.troops}/${troopLimit(character)} · 武 ${character.might} · 智 ${character.intellect} · 统 ${character.command} · 政 ${character.politics}`
}

/** 忠诚提示（「离心」「不满」）；忠心无提示时为空串。 */
function loyaltyHintText(character: Character, factionId: FactionId): string {
  const hint = loyaltyHint(character.loyalty, defectThresholdFor(character, factionId))

  return hint === null ? '' : ` · ${hint}`
}

/** 编成与选将条目的摘要：只给即战信息与忠诚提示，不带态度与年龄。 */
function partyMetaText(character: Character, factionId: FactionId): string {
  return `${officerSummaryText(character)}${loyaltyHintText(character, factionId)}`
}

/** 侧栏战略点面板：名称、类型、归属与驻将；按接壤情况提供进攻、任命与寻访。 */
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
  const station = stationedAt(state, site.id)
  requireElement<HTMLElement>(panel, '.site-panel__officers').replaceChildren(
    createListItem(
      station === null ? 'site-panel__empty' : 'site-panel__officer',
      station === null ? '无驻将' : `${station.name}（兵 ${station.troops}）`,
    ),
  )

  // 进攻、任命与寻访都要进入选将页：行动力不够就不该放进去，按钮压暗、点不动。
  const attackButton = requireElement<HTMLButtonElement>(panel, '[data-action="attack-here"]')
  attackButton.hidden = !isAttackable(state, site.id)
  attackButton.disabled = !canAfford(state, state.playerFaction, 'attack')
  const stationButton = requireElement<HTMLButtonElement>(panel, '[data-action="station-here"]')
  stationButton.hidden = !isOwn
  stationButton.disabled = !canAfford(state, state.playerFaction, 'station')
  setActionButton(
    stationButton,
    station === null ? '任命驻将' : '撤换驻将',
    ACTION_COSTS.station,
    true,
  )
  // 「进入」只对自家领地开放；建设也在那个窗口里办。
  requireElement<HTMLButtonElement>(panel, '[data-action="site-info"]').hidden = !isOwn
  const seekButton = requireElement<HTMLButtonElement>(panel, '[data-action="seek-here"]')
  seekButton.hidden = !isOwn
  seekButton.disabled = !canAfford(state, state.playerFaction, 'seekTalent')
  requireElement<HTMLElement>(panel, '.site-panel__status').textContent = message
}

/**
 * 战略点窗口：列出类型、归属、人口与丁口，并给出一处建设入口——
 * 只有自家领地能进入，故建设区总是可用。
 */
function renderSiteInfoDialog(
  dialog: HTMLElement,
  state: GameState,
  siteId: SiteId | null,
  message: string,
  showCosts: boolean,
): void {
  const site =
    siteId === null ? undefined : state.geography.sites.find((item) => item.id === siteId)
  if (site === undefined) {
    return
  }

  const ownerName =
    site.owner === null
      ? '无归属'
      : (state.factions.find((faction) => faction.id === site.owner)?.name ?? site.owner)

  const station = stationedAt(state, site.id)
  const facts: readonly [string, string][] = [
    ['类型', SITE_TYPE_LABELS[site.type]],
    ['归属', ownerName],
    ['驻将', station === null ? '无' : `${station.name}（兵 ${station.troops}）`],
    ['人口', String(site.population)],
    ['丁口', String(sitePopulationCap(site))],
    ['存粮', String(granaryOf(site))],
  ]

  requireElement<HTMLElement>(dialog, '.site-info__title').textContent = site.name
  requireElement<HTMLElement>(dialog, '.site-info__status').textContent = message

  const list = requireElement<HTMLElement>(dialog, '.site-info__facts')
  list.replaceChildren(
    ...facts.flatMap(([label, value]) => {
      const term = document.createElement('dt')
      term.textContent = label
      const detail = document.createElement('dd')
      detail.textContent = value

      // 征兵、征粮的入口就放在丁口与存粮右侧，点开即进入选将。
      if (label === '丁口' || label === '存粮') {
        const isRecruit = label === '丁口'
        detail.classList.add('site-info__fact')
        detail.title = isRecruit ? '丁口为每次征兵的上限，取该点人口的 2%' : ''

        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'site-info__button'
        button.dataset.action = isRecruit ? 'recruit-here' : 'harvest-here'
        button.dataset.site = site.id
        setActionButton(
          button,
          isRecruit ? '征兵' : '征粮',
          isRecruit ? ACTION_COSTS.recruit : ACTION_COSTS.harvestGrain,
          showCosts,
        )
        button.disabled =
          site.owner !== state.playerFaction ||
          !canAfford(state, state.playerFaction, isRecruit ? 'recruit' : 'harvestGrain') ||
          harvestCandidates(state, site.id).length === 0 ||
          (isRecruit ? sitePopulationCap(site) < 1 : granaryOf(site) < 1)
        detail.append(button)
      }

      return [term, detail]
    }),
  )

  renderDevelopmentList(
    requireElement<HTMLElement>(dialog, '.site-info__list'),
    state,
    site,
    showCosts,
  )
}

/** 建设列表：三项开发的等级、上限、效果与下一级花费；满级或钱不够时按钮不可点。 */
function renderDevelopmentList(
  list: Element,
  state: GameState,
  site: Site,
  showCosts: boolean,
): void {
  const faction = state.factions.find((item) => item.id === state.playerFaction)
  const limit = developmentLimit(site)

  list.replaceChildren(
    ...DEVELOPMENT_KINDS.map((kind) => {
      const level = developmentLevel(site, kind)
      const atLimit = level >= limit
      const cost = buildCost(site, kind)
      const affordable =
        (faction?.money ?? 0) >= cost && canAfford(state, state.playerFaction, 'build')

      const item = document.createElement('li')
      item.className = 'site-info__item'

      const info = document.createElement('div')
      info.className = 'site-info__info'
      const name = document.createElement('span')
      name.className = 'site-info__name'
      name.textContent = DEVELOPMENT_LABELS[kind]
      const meta = document.createElement('span')
      meta.className = 'site-info__meta'
      meta.textContent = `${level} / ${limit}　${developmentEffectText(kind)}${atLimit ? '' : `　下一级 ${cost} 金`}`
      info.append(name, meta)

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'site-info__button'
      button.dataset.action = 'build-item'
      button.dataset.kind = kind
      button.textContent = atLimit ? '已满级' : ''
      if (!atLimit) {
        setActionButton(button, '建设', ACTION_COSTS.build, showCosts)
      }
      button.disabled = atLimit || !affordable

      item.append(info, button)
      return item
    }),
  )
}

/** 命令弹窗的当前请求：进攻、防守、征兵、征粮与任命驻将，都以选将框为入口。 */
interface OrderRequest {
  kind: 'attack' | 'defense' | 'harvest' | 'recruit' | 'station'
  /** 目标战略点；防守、任命、进攻必带，征兵与征粮自战略点窗口进入时也必带。 */
  siteId?: SiteId
  /** 防守时随附来犯的势力与已布好攻方的战斗，供弹窗显示敌情。 */
  defense?: DefenseRequest
}

/** 该武将此刻不能出战的原因：本季已行动或无兵；可以出战时返回 null。 */
function attackDisabledReason(state: GameState, character: Character): string | null {
  if (hasActedThisTurn(state, character.id)) {
    return '已行动'
  }

  return character.troops > 0 ? null : '无兵力'
}

/** 征兵、征粮可选的人：名册中本季未行动、且活动范围含该城的武将。 */
function harvestCandidates(state: GameState, siteId?: string): Character[] {
  return state.characters.filter(
    (character) =>
      isServing(character) &&
      character.factionId === state.playerFaction &&
      !hasActedThisTurn(state, character.id) &&
      (siteId === undefined || scopeSitesFor(state, character).includes(siteId)),
  )
}

/** 自有战略点，按人口由多到少，供征兵、征粮选择地点。 */
function ownSites(state: GameState): Site[] {
  return state.geography.sites
    .filter((site) => site.owner === state.playerFaction)
    .sort((a, b) => b.population - a.population)
}

/** 侧栏「待招募」：玩家接触过、尚未招到的在野者，可再次拜访以提升其意愿。 */
function renderContacts(
  panel: HTMLElement,
  state: GameState,
  message: string,
  showCosts: boolean,
): void {
  const contacts = state.contactedCandidates[state.playerFaction] ?? []
  const candidates = contacts
    .map((contact) => state.characters.find((character) => character.id === contact.characterId))
    .filter(
      (character): character is Character => character !== undefined && isRecruitable(character),
    )

  panel.hidden = candidates.length === 0

  const list = requireElement<HTMLElement>(panel, '.recruit-panel__list')
  list.replaceChildren(
    ...candidates.map((character) => {
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
      setActionButton(button, '再次拜访', ACTION_COSTS.visit, showCosts)

      item.append(name, button)

      return item
    }),
  )

  requireElement<HTMLElement>(panel, '.recruit-panel__status').textContent = message
}

/** 命令弹窗里选择地点的一行：征兵与征粮都要先定一处自有战略点。 */
function renderOrderSites(select: HTMLSelectElement, state: GameState, siteId: SiteId | undefined): void {
  const sites = ownSites(state)

  select.replaceChildren(
    ...sites.map((site) => {
      const option = document.createElement('option')
      option.value = site.id
      option.textContent =
        site.type === 'field'
          ? site.name
          : `${site.name}　人口 ${site.population}　存粮 ${granaryOf(site)}`
      return option
    }),
  )
  if (siteId !== undefined && sites.some((site) => site.id === siteId)) {
    select.value = siteId
  }
}

/**
 * 命令弹窗：进攻、防守、征兵、征粮与任命驻将共用同一套选将框。
 * 进攻、防守勾选一至五人，征兵、征粮先选地点再单选一人，任命驻将只选一人。
 */
function renderOrderDialog(root: HTMLElement, state: GameState, request: OrderRequest | null): void {
  if (request === null) {
    return
  }

  const target =
    request.siteId === undefined
      ? undefined
      : state.geography.sites.find((site) => site.id === request.siteId)
  const name = target?.name ?? ''
  const raiders = request.defense
  const attackerUnits = raiders?.battle.attacker.units ?? []
  const defenseTarget =
    raiders === undefined
      ? name
      : `${factionName(state, raiders.attackerId)} 来攻 ${name}　${attackerUnits
          .map((unit) => unit.name)
          .join('、')}`

  const titles: Record<OrderRequest['kind'], string> = {
    attack: '进攻',
    defense: '防守',
    harvest: '征粮',
    recruit: '征兵',
    station: '驻将',
  }
  const targets: Record<OrderRequest['kind'], string> = {
    attack: '请选择武将',
    defense: defenseTarget,
    harvest:
      request.siteId === undefined
        ? '先择一处战略点，再派一名未行动的武将征粮'
        : `在 ${name} 征粮，选一名未行动的武将`,
    recruit:
      request.siteId === undefined
        ? '先择一处战略点，再派一名未行动的武将征兵'
        : `在 ${name} 征兵，选一名未行动的武将`,
    station: `任命 ${name} 的驻将，每点至多一人`,
  }
  const submits: Record<OrderRequest['kind'], string> = {
    attack: '进入战斗',
    defense: '迎战',
    harvest: '征粮',
    recruit: '征兵',
    station: '任命',
  }

  const heading = name === '' ? titles[request.kind] : `${titles[request.kind]} · ${name}`
  requireElement<HTMLElement>(root, '.order__title').textContent = heading
  requireElement<HTMLElement>(root, '.order__target').textContent = targets[request.kind]
  requireElement<HTMLButtonElement>(root, '.order__submit').textContent = submits[request.kind]
  // 编成即战前准备：没有可出战的武将时也能从这里退出，不被迫点空列表。
  requireElement<HTMLButtonElement>(root, '[data-action="order-abandon"]').hidden =
    request.kind !== 'attack' && request.kind !== 'defense'
  const countLabel = requireElement<HTMLElement>(root, '.order__count')
  countLabel.hidden = request.kind !== 'attack' && request.kind !== 'defense'
  // 征兵、征粮自战略点窗口进入，关掉时回到那个窗口；进攻与防守改用「放弃战斗」。
  const closeLabel =
    request.kind === 'harvest' || request.kind === 'recruit' ? '返回战略点' : '关闭'
  const closeOrder = requireElement<HTMLButtonElement>(root, '[data-action="close-order"]')
  closeOrder.textContent = closeLabel
  closeOrder.hidden = request.kind === 'attack' || request.kind === 'defense'

  const siteRow = requireElement<HTMLElement>(root, '.order__site-row')
  const siteSelect = requireElement<HTMLSelectElement>(root, '.order__site')
  const isLogistics = request.kind === 'harvest' || request.kind === 'recruit'
  // 从战略点窗口进来时城池已定，不再让玩家改选；旧入口仍可先选地点。
  siteRow.hidden = !isLogistics || request.siteId !== undefined
  if (!siteRow.hidden) {
    renderOrderSites(siteSelect, state, request.siteId)
  }

  const list = requireElement<HTMLElement>(root, '.order__officers')
  siteSelect.onchange = null

  if (request.kind === 'attack') {
    const candidates = attackCandidates(state, request.siteId ?? '')
    if (candidates.length === 0) {
      list.replaceChildren(createListItem('order__empty', '暂无可出战的武将'))
      return
    }

    list.replaceChildren(
      ...candidates.map((character) =>
        createSelectionItem(character, state.playerFaction, 'multi', attackDisabledReason(state, character)),
      ),
    )
    return
  }

  if (request.kind === 'defense') {
    const members = defenderCandidates(state, request.siteId ?? '').sort(
      (a, b) => b.troops - a.troops,
    )
    if (members.length === 0) {
      list.replaceChildren(createListItem('order__empty', '无人可守，只能空城迎敌'))
      return
    }

    list.replaceChildren(
      ...members.map((member) =>
        createSelectionItem(
          member,
          state.playerFaction,
          'multi',
          null,
          {
            checked: member.stationedSiteId === request.siteId,
            locked: member.stationedSiteId === request.siteId,
            note: member.stationedSiteId === request.siteId ? '驻将，自动参战' : null,
          },
        ),
      ),
    )
    return
  }

  if (request.kind === 'harvest' || request.kind === 'recruit') {
    const renderCandidates = (): void => {
      const candidates = harvestCandidates(state, request.siteId ?? siteSelect.value).sort(
        (a, b) => b.politics - a.politics,
      )
      list.replaceChildren(
        ...(candidates.length === 0
          ? [createListItem('order__empty', request.kind === 'harvest' ? '暂无可征粮的武将' : '暂无可征兵的武将')]
          : candidates.map((character) =>
              createSelectionItem(character, state.playerFaction, 'single', null),
            )),
      )
    }

    siteSelect.onchange = request.siteId === undefined ? renderCandidates : null
    renderCandidates()
    return
  }

  // 任命驻将：单选项里先放「不设驻将」，其余为活动范围含此城的在册武将。
  const members = state.characters
    .filter(
      (character) =>
        isServing(character) &&
        character.factionId === state.playerFaction &&
        (request.siteId === undefined ||
          scopeSitesFor(state, character).includes(request.siteId)),
    )
    .sort((a, b) => b.troops - a.troops)
  const current = stationedAt(state, request.siteId ?? '')
  const clearItem = document.createElement('li')
  clearItem.className = 'picker'
  const clearLabel = document.createElement('label')
  clearLabel.className = 'picker__label'
  const clearInput = document.createElement('input')
  clearInput.type = 'radio'
  clearInput.name = 'order-single'
  clearInput.className = 'picker__checkbox'
  clearInput.value = ''
  clearInput.checked = current === null
  const clearName = document.createElement('span')
  clearName.className = 'picker__name'
  clearName.textContent = '不设驻将'
  clearLabel.append(clearInput, clearName)
  clearItem.append(clearLabel)

  list.replaceChildren(
    clearItem,
    ...members.map((character) =>
      createSelectionItem(
        character,
        state.playerFaction,
        'single',
        null,
        {
          checked: character.id === current?.id,
          note:
            character.stationedSiteId === null
              ? null
              : character.stationedSiteId === request.siteId
                ? '现任驻将'
                : '驻守他处，改任将移驻',
        },
      ),
    ),
  )
}

/** 战斗演出的一幕：确认阵型、逐次交锋、战果。 */
type BattleStep = 'deploy' | 'fight' | 'result'

/** 正在上演的一场战斗：我方进攻，或他方来攻我方。 */
interface BattleStage {
  /** 这一战是我方进攻，还是我方被攻。 */
  mode: 'attack' | 'defense'
  /** 规则层持有的战斗状态；开战后逐次推进。 */
  battle: BattleState
  step: BattleStep
  /** 已结算的战报；战斗未打完时为 null。 */
  report: BattleReport | null
  /** 写入历史的结论文案，结果一幕展示。 */
  outcome: string
  /** 已发生的行动，供战况记录与演出高亮。 */
  log: BattleActionEvent[]
  /** 最近一次行动；为空时不显示受击演出。 */
  lastAction: BattleActionEvent | null
  /** 阵型一幕已点选的阵位，再点另一格即换位。 */
  pickedSlot: number | null
  /** 阵型调整的提示。 */
  formationMessage: string
  /** 行动条是否已涨满；涨满后才亮起行动者与指令按钮。 */
  paceReady: boolean
  /** 是否自动打完；自动时我方也由规则层下令，条子与间隔减半。 */
  auto: boolean
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

/** 我方在这一战里坐在哪一侧。 */
function ourSideOf(stage: BattleStage): BattleSide {
  return stage.mode === 'attack' ? 'attacker' : 'defender'
}

/** 战场一方的势力名。 */
function sideFactionName(state: GameState, battle: BattleState, side: BattleSide): string {
  return state.factions.find((faction) => faction.id === battle[side].factionId)?.name ?? '敌军'
}

/** 步兵机动 10 涨满一条用 2 秒；其余兵种按机动比例分得时间。 */
const PACE_TICK_SECONDS = 0.2
/** 一次推进太短时，仍给条子一个可见的走位。 */
const PACE_MIN_MS = 150

interface ShownPace {
  from: number
  target: number
  at: number
  /** 这一段涨落自己的时长，据此判断重绘时动画是否还在跑。 */
  duration: number
}

/** 战斗演出：上一帧行动条显示到的比例，下一次渲染从这里涨上去。 */
const shownBattlePace = new WeakMap<BattleState, Map<CharacterId, ShownPace>>()

/** 本次推进在界面上走多久：按规则层的 tick 数换算，所有队伍共用同一节奏。 */
function paceDurationFor(battle: BattleState, auto = false): number {
  const base = Math.max(PACE_MIN_MS, battle.advanceTicks * PACE_TICK_SECONDS * 1000)

  // 自动战斗时条子走得快一倍，行动之间也更紧凑。
  return auto ? Math.max(PACE_MIN_MS / 2, base / 2) : base
}

/**
 * 一个阵位：武将、兵种与战兵条；空位也留一格，便于换阵。
 * 攻击按钮落在可打的目标身上，防御按钮落在当前行动者自己身上。
 */
function createBattleSlot(
  battle: BattleState,
  side: BattleSide,
  slot: number,
  options: {
    draggable: boolean
    playable: boolean
    picked: boolean
    showPace: boolean
    auto: boolean
    actor: BattleUnit | null
    targets: readonly BattleUnit[]
    lastAction: BattleActionEvent | null
  },
): HTMLElement {
  const unit = battle[side].units.find((item) => item.slot === slot)
  const element = document.createElement('div')
  element.className = 'battle-slot'
  element.dataset.slot = String(slot)
  element.dataset.side = side

  if (unit === undefined) {
    element.classList.add('battle-slot--empty')
    if (options.picked) {
      element.classList.add('battle-slot--picked')
    }
    element.textContent = '空'
    return element
  }
  element.dataset.character = unit.characterId

  if (options.picked) {
    element.classList.add('battle-slot--picked')
  }

  if (unit.exited) {
    element.classList.add('battle-slot--out')
  }
  if (options.actor?.characterId === unit.characterId) {
    element.classList.add('battle-slot--acting')
  }
  if (options.lastAction?.actorId === unit.characterId) {
    element.classList.add('battle-slot--struck')
  }
  if (options.lastAction?.targetId === unit.characterId) {
    element.classList.add('battle-slot--hit')
  }

  const head = document.createElement('div')
  head.className = 'battle-slot__head'
  const name = document.createElement('span')
  name.className = 'battle-slot__name'
  name.textContent = unit.name
  const meta = document.createElement('span')
  meta.className = 'battle-slot__meta'
  meta.textContent = unit.exited
    ? `${ARM_STATS[unit.armType].label} · 溃`
    : `${ARM_STATS[unit.armType].label} · ${unit.battleTroops}`
  head.append(name, meta)
  element.append(head)

  const bar = document.createElement('span')
  bar.className = 'battle-slot__bar'
  const fill = document.createElement('span')
  fill.className = 'battle-slot__fill'
  fill.style.width = `${Math.max(0, Math.min(100, (unit.battleTroops / Math.max(1, unit.troops)) * 100))}%`
  bar.append(fill)
  element.append(bar)

  if (options.showPace) {
    const pace = document.createElement('span')
    pace.className = 'battle-slot__pace'
    const paceFill = document.createElement('span')
    paceFill.className = 'battle-slot__pace-fill'

    // 从上一次显示的位置涨到当前进度；开战第一帧从零起，看得见条子往上走。
    const target = Math.max(0, Math.min(100, (unit.progress / ACTION_THRESHOLD) * 100))
    const shown = shownBattlePace.get(battle) ?? new Map<CharacterId, ShownPace>()
    const previous = shown.get(unit.characterId)
    const now = performance.now()
    // 同一段变化里会连着重绘两次（结算一次、记录战况一次），后一次沿用原来的起点，
    // 不把起点抬到终值，免得过渡被整块重建打断。
    const stillAnimating =
      previous !== undefined &&
      Math.abs(previous.target - target) < 0.01 &&
      now - previous.at < previous.duration
    const from = previous === undefined ? 0 : stillAnimating ? previous.from : previous.target

    // 所有队伍共用本次推进的时长，各自的涨幅由机动决定，条子因此匀速走。
    const duration = paceDurationFor(battle, options.auto)
    shown.set(unit.characterId, { from, target, at: now, duration })
    shownBattlePace.set(battle, shown)

    paceFill.style.transitionDuration = `${duration}ms`
    paceFill.style.width = `${from}%`
    pace.append(paceFill)
    element.append(pace)
    window.requestAnimationFrame(() => {
      paceFill.style.width = `${target}%`
    })
  }

  const states: string[] = [rowOfSlot(unit.slot) === 0 ? '前' : '后']
  if (!unit.exited && unit.defending) {
    states.push('守')
  }
  const state = document.createElement('span')
  state.className = 'battle-slot__state'
  state.textContent = states.join(' ')
  element.append(state)

  if (unit.exited) {
    return element
  }

  if (options.targets.some((target) => target.characterId === unit.characterId)) {
    const attack = document.createElement('button')
    attack.type = 'button'
    attack.className = 'battle-slot__action battle-slot__action--attack'
    attack.dataset.action = 'stage-attack'
    attack.dataset.target = unit.characterId
    attack.textContent = '攻击'
    element.append(attack)
  }

  if (options.playable && options.actor?.characterId === unit.characterId) {
    const defend = document.createElement('button')
    defend.type = 'button'
    defend.className = 'battle-slot__action battle-slot__action--defend'
    defend.dataset.action = 'stage-defend'
    defend.textContent = '防御'
    element.append(defend)
  }

  if (options.draggable) {
    element.classList.add('battle-slot--movable')
    element.draggable = true
  }

  return element
}

/**
 * 战场：敌军在上、我军在下，各排两列（前排在靠近对方的一侧）。
 * 阵型一幕可拖动换位；交锋一幕只在目标与行动者身上出按钮。
 */
function createBattleField(
  state: GameState,
  stage: BattleStage,
  actor: BattleUnit | null,
  targets: readonly BattleUnit[],
): HTMLElement {
  const battle = stage.battle
  const ours = ourSideOf(stage)
  const theirs: BattleSide = ours === 'attacker' ? 'defender' : 'attacker'
  const field = document.createElement('div')
  field.className = 'battle-field'

  const banner = (side: BattleSide, label: string): HTMLElement => {
    const item = document.createElement('p')
    item.className = 'battle-field__side'
    const name = document.createElement('span')
    name.textContent = `${sideFactionName(state, battle, side)}　${label}`
    const morale = document.createElement('span')
    morale.className = 'battle-field__morale'
    morale.textContent = `士气 ${battle[side].morale}`
    item.append(name, morale)
    return item
  }

  const row = (side: BattleSide, slots: readonly number[], label: string): HTMLElement => {
    const line = document.createElement('div')
    line.className = 'battle-field__row'
    const caption = document.createElement('span')
    caption.className = 'battle-field__label'
    caption.textContent = label
    line.append(
      caption,
      ...slots.map((slot) =>
        createBattleSlot(battle, side, slot, {
          draggable: stage.step === 'deploy' && side === ours,
          playable: stage.step === 'fight' && side === ours && !stage.auto,
          picked: stage.step === 'deploy' && side === ours && stage.pickedSlot === slot,
          showPace: stage.step === 'fight',
          auto: stage.auto,
          actor,
          targets,
          lastAction: stage.lastAction,
        }),
      ),
    )
    return line
  }

  const clash = document.createElement('p')
  clash.className = 'battle-field__clash'
  clash.textContent = '⚔'

  field.append(
    banner(theirs, '敌军'),
    row(theirs, [3, 4, 5], '后排'),
    row(theirs, [0, 1, 2], '前排'),
    clash,
    row(ours, [0, 1, 2], '前排'),
    row(ours, [3, 4, 5], '后排'),
    banner(ours, '我军'),
  )

  return field
}

/** 战况记录：右侧栏保留最近八条，交手时连同自损一起记。 */
function battleLogLines(stage: BattleStage): HTMLElement[] {
  return stage.log.slice(-8).map((event) => {
    if (event.kind === 'defend') {
      return stageLine(`${event.actorName} 防御`, 'note')
    }
    if (event.targetName === null) {
      return stageLine(`${event.actorName} 扑空`, 'note')
    }

    const selfLoss = event.selfLoss > 0 ? `，自损 ${event.selfLoss}` : ''
    if (event.damage === 0) {
      return stageLine(`${event.actorName} 攻 ${event.targetName}，未能破防${selfLoss}`, 'note')
    }

    return stageLine(
      `${event.actorName} 攻 ${event.targetName}，歼敌 ${event.damage}${selfLoss}`,
      'note',
    )
  })
}

/** 战斗过程的简短叙述，由战报数据生成；从玩家这一侧叙述。 */
function battleProcessText(report: BattleReport, mode: 'attack' | 'defense'): string[] {
  const ours = mode === 'attack' ? report.attacker : report.defender
  const theirs = mode === 'attack' ? report.defender : report.attacker
  const attackerName = report.attacker.officers[0] ?? '攻方'
  const defenderName = report.defender.officers[0] ?? '守方'
  const clash = report.undefended
    ? mode === 'attack'
      ? `守军无将，${attackerName} 兵不血刃，直取 ${report.siteName}。`
      : `城中无将，${attackerName} 长驱直入。`
    : mode === 'attack'
      ? `两军交锋，${attackerName} 挥军直进，与 ${defenderName} 战于城下。`
      : `两军交锋，${attackerName} 挥军来犯，${defenderName} 据城迎战。`

  return [clash, `一场鏖战，我方伤亡 ${ours.casualties}，敌方伤亡 ${theirs.casualties}。`]
}

/** 势力名；查不到时退回标识。 */
function factionName(state: GameState, factionId: FactionId | null): string {
  return state.factions.find((faction) => faction.id === factionId)?.name ?? '敌军'
}

/** 开发者模式专供：越过结算，一键定下这一战的胜负，攻守两侧同一对按钮。 */
function shortcutButtons(showBattleShortcuts: boolean): HTMLButtonElement[] {
  return showBattleShortcuts
    ? [stageButton('一键胜利', 'stage-forced-win'), stageButton('一键失败', 'stage-forced-lose')]
    : []
}

/** 战果判语，从我方一侧说。 */
function verdictText(report: BattleReport, mode: 'attack' | 'defense'): string {
  if (mode === 'attack') {
    return report.undefended ? '不战而下' : report.attackerWins ? '战斗告捷' : '战斗失利'
  }

  return report.attackerWins ? '城池失守' : '守城得胜'
}

/** 按当前幕排出内容：文字若干，末了是一排可操作的按钮。 */
function stageContent(state: GameState, stage: BattleStage, showBattleShortcuts: boolean): HTMLElement[] {
  const battle = stage.battle
  const ours = ourSideOf(stage)
  const actor = stage.step === 'fight' ? currentActor(battle) : null
  const playable = actor !== null && actor.side === ours && stage.paceReady && !stage.auto
  const targets = actor !== null && playable ? targetsFor(battle, actor) : []

  switch (stage.step) {
    case 'deploy':
      return [
        stageLine(`两军对阵于 ${battle.siteName}，请先排列阵型。`, 'prompt'),
        stageLine('拖动或依次点选两个阵位即可互换；近战宜列前排，弓手可居后排。', 'note'),
        ...(stage.formationMessage === '' ? [] : [stageLine(stage.formationMessage, 'prompt')]),
        createBattleField(state, stage, null, []),
        stageActions(
          stageButton('开战', 'stage-begin'),
          stageButton('放弃战斗', 'stage-abandon'),
        ),
      ]

    case 'fight': {
      const main = document.createElement('div')
      main.className = 'battle-plan__main'
      main.append(
        ...(stage.formationMessage === '' ? [] : [stageLine(stage.formationMessage, 'prompt')]),
        createBattleField(state, stage, stage.paceReady ? actor : null, targets),
        stageLine(
          actor === null
            ? '战斗结束'
            : !stage.paceReady
              ? `${actor.name} 即将行动`
              : stage.auto
                ? `自动战斗：${actor.name} 行动`
                : actor.side === ours
                  ? `轮到我军 ${actor.name} 行动`
                  : `敌军 ${actor.name} 行动`,
          'prompt',
        ),
        stageActions(
          stageButton(stage.auto ? '取消自动战斗' : '自动战斗', 'stage-auto'),
          ...shortcutButtons(showBattleShortcuts),
        ),
      )

      const log = document.createElement('aside')
      log.className = 'battle-plan__log'
      log.append(stageLine('战况', 'note'), ...battleLogLines(stage))

      const wrap = document.createElement('div')
      wrap.className = 'battle-plan__fight'
      wrap.append(main, log)
      return [wrap]
    }

    case 'result': {
      const report = stage.report
      if (report === null) {
        return [stageActions(stageButton('收兵', 'stage-close'))]
      }

      const sides = document.createElement('div')
      sides.className = 'battle__sides'
      const attacker = document.createElement('div')
      attacker.className = 'battle__attacker'
      const defender = document.createElement('div')
      defender.className = 'battle__defender'
      fillBattleSide(attacker, '攻方', report.attacker)
      fillBattleSide(defender, '守方', report.defender)
      sides.append(attacker, defender)

      const next =
        stage.mode === 'attack'
          ? [stageButton('收兵', 'stage-close')]
          : [stageButton('继续', 'stage-continue-turn')]

      return [
        ...battleProcessText(report, stage.mode).map((text) => stageLine(text)),
        stageLine(verdictText(report, stage.mode), 'verdict'),
        stageLine(stage.outcome),
        sides,
        stageActions(...next),
      ]
    }

    default:
      return []
  }
}

/** 战斗演出：按当前幕渲染内容与按钮，一幕一幕推进。 */
function renderBattleStage(
  root: HTMLElement,
  state: GameState,
  stage: BattleStage | null,
  showBattleShortcuts: boolean,
): void {
  const meta = requireElement<HTMLElement>(root, '.battle-plan__meta')
  if (stage === null) {
    meta.textContent = ''
    return
  }

  const title = stage.mode === 'attack' ? '战斗' : '防守'
  requireElement<HTMLElement>(root, '.battle-plan__title').textContent = title
  meta.textContent =
    stage.step === 'result'
      ? ''
      : `剩余回合数 ${stage.battle.actionLimit - stage.battle.actionsUsed} / ${stage.battle.actionLimit}`
  requireElement<HTMLElement>(root, '.battle-plan__body').replaceChildren(
    ...stageContent(state, stage, showBattleShortcuts),
  )
}

/** 选将框的两种形态：多选（进攻、防守）与单选（征兵、征粮、驻将）。 */
type SelectionMode = 'multi' | 'single'

/**
 * 选将条目：进攻、防守、征兵、征粮与任命驻将共用。
 * `multi` 与 `single` 是同一套勾选控件，只差复选框与单选框。
 */
function createSelectionItem(
  character: Character,
  factionId: FactionId,
  mode: SelectionMode,
  disabledReason: string | null,
  options: { checked?: boolean; locked?: boolean; note?: string | null } = {},
): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'picker'
  if (disabledReason !== null) {
    item.classList.add('picker--disabled')
  }

  const name = document.createElement('span')
  name.className = 'picker__name'
  name.textContent = character.name

  const meta = document.createElement('span')
  meta.className = 'picker__meta'
  // 选将只给即战信息与忠诚提示；亲附与年龄只在武将详情里看。
  meta.textContent = partyMetaText(character, factionId)

  const statusText = disabledReason ?? options.note ?? null
  const status = document.createElement('span')
  status.className = 'picker__status'
  status.textContent = statusText ?? ''

  const label = document.createElement('label')
  label.className = 'picker__label'

  const input = document.createElement('input')
  input.type = mode === 'single' ? 'radio' : 'checkbox'
  if (mode === 'single') {
    input.name = 'order-single'
  }
  input.className = 'picker__checkbox'
  input.value = character.id
  input.disabled = disabledReason !== null || options.locked === true
  input.checked = options.checked === true
  input.dataset.blocked = disabledReason === null ? 'false' : 'true'
  if (options.locked === true) {
    input.dataset.locked = 'true'
  }

  label.append(input, name, meta)
  if (statusText !== null) {
    label.append(status)
  }
  item.append(label)

  return item
}

/** 从多选框中读出勾选的人。 */
function readSelection(list: HTMLElement): CharacterId[] {
  return Array.from(list.querySelectorAll<HTMLInputElement>('.picker__checkbox:checked')).map(
    (checkbox) => checkbox.value,
  )
}

/** 从勾选的标识取出武将，按兵种排出默认阵形：近战在前、弓手在后。 */
function autoFormationOf(state: GameState, ids: readonly CharacterId[]): BattleDeployment[] {
  return autoFormation(
    ids
      .map((id) => state.characters.find((character) => character.id === id))
      .filter((character): character is Character => character !== undefined),
  )
}

/** 一次出战的名额：进攻五人，防守另有驻将，故至多六队。 */
function selectionLimit(kind: OrderRequest['kind']): number {
  if (kind === 'attack') {
    return ATTACKER_SELECTION
  }

  return kind === 'defense' ? DEFENDER_SELECTION + 1 : 1
}

/** 当前选择距可提交还差什么；已足时返回 null。与提交时的校验同一口径。 */
function orderSelectionGap(list: HTMLElement, kind: OrderRequest['kind']): string | null {
  if (kind === 'station') {
    // 「不设驻将」也是一项选择，故单选组有任何勾选即可提交。
    return list.querySelector('.picker__checkbox:checked') === null ? '请先点选一名武将' : null
  }

  const checked = readSelection(list).length
  if (kind === 'attack' || kind === 'defense') {
    if (checked === 0) {
      return '请先点选出征的武将'
    }

    const limit = selectionLimit(kind)
    return checked > limit ? `至多 ${limit} 人` : null
  }

  return checked === 0 ? '请先点选一名部属' : null
}

function createListItem(className: string, text: string): HTMLLIElement {
  const item = document.createElement('li')
  item.className = className
  item.textContent = text

  return item
}

/** 武将表的列数，供空表与跨列单元格使用。 */
const ROSTER_COLUMNS = 8

/** 表格中的单元格。 */
function createTextCell(text: string, className = ''): HTMLTableCellElement {
  const cell = document.createElement('td')
  if (className !== '') {
    cell.className = className
  }
  cell.textContent = text

  return cell
}

/** 姓名单元格：姓名按钮，点开详情。 */
function createOfficerNameCell(character: Character): HTMLTableCellElement {
  const cell = document.createElement('td')

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'roster__name'
  button.dataset.action = 'officer-detail'
  button.dataset.character = character.id
  button.textContent = character.name

  cell.append(button)

  return cell
}

/** 操作单元格：遣散不计行动，始终可选；已行动者另标「已行动」。征兵入口在战略点窗口。 */
function createOpsCell(
  character: Character,
  acted: boolean,
  showCosts: boolean,
): HTMLTableCellElement {
  const cell = document.createElement('td')
  const ops = document.createElement('div')
  ops.className = 'roster__ops'

  const disband = createRosterAction('遣散', 'disband-open', character.id, ACTION_COSTS.disband, showCosts)

  ops.append(...(acted ? [createDoneAction()] : []), disband)
  cell.append(ops)

  return cell
}

/** 已行动的标牌：与行动按钮同一枚药丸，但停用、点不动。 */
function createDoneAction(): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'officer-action'
  button.disabled = true
  button.textContent = '已行动'

  return button
}

/** 渲染麾下武将为表格行：即战所需的兵力、四项能力、忠诚与当季操作；姓名可点开详情。返回人数。 */
function renderOfficers(list: Element, state: GameState, showCosts: boolean): number {
  const officers = state.characters.filter(
    (character) => isServing(character) && character.factionId === state.playerFaction,
  )
  const siteNames = new Map(state.geography.sites.map((site) => [site.id, site.name]))
  if (officers.length === 0) {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.className = 'roster__empty'
    cell.colSpan = ROSTER_COLUMNS
    cell.textContent = '麾下暂无武将'
    row.append(cell)
    list.replaceChildren(row)

    return 0
  }

  list.replaceChildren(
    ...officers.map((officer) => {
      const acted = hasActedThisTurn(state, officer.id)
      const row = document.createElement('tr')
      if (acted) {
        row.className = 'roster__row--acted'
      }

      row.append(
        createOfficerNameCell(officer),
        createTextCell(
          officer.stationedSiteId === null
            ? '-'
            : (siteNames.get(officer.stationedSiteId) ?? '—'),
        ),
        createTextCell(`${officer.troops}/${troopLimit(officer)}`),
        createTextCell(String(officer.might)),
        createTextCell(String(officer.command)),
        createTextCell(String(officer.intellect)),
        createTextCell(String(officer.politics)),
        createOpsCell(officer, acted, showCosts),
      )

      return row
    }),
  )

  return officers.length
}

const PERSONALITY_LABELS: Record<Personality, string> = {
  open: '豁达',
  scheming: '多谋',
  brave: '刚烈',
  steady: '沉稳',
  cautious: '谨慎',
  proud: '骄矜',
}

/**
 * 武将详情：表格之外的记录性信息——头像位、身份、年龄、性格、忠诚与对己方态度。
 * 赏赐以图标缀在忠诚右侧，解任放在底部。头像暂以姓名首字占位，将来换作正式立绘。
 */
function renderOfficerDetail(
  container: Element,
  state: GameState,
  character: Character,
  showCosts: boolean,
): void {
  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'roster__back'
  back.dataset.action = 'officer-back'
  back.textContent = '返回列表'

  const head = document.createElement('div')
  head.className = 'officer-detail__head'

  const portrait = document.createElement('div')
  portrait.className = 'officer-detail__portrait'
  portrait.textContent = character.name.slice(0, 1)

  const title = document.createElement('div')
  title.className = 'officer-detail__title'

  const name = document.createElement('h3')
  name.className = 'officer-detail__name'
  name.textContent = character.name

  const role = document.createElement('span')
  role.className = 'officer-detail__role'
  role.textContent = character.isMonarch ? '君主' : '麾下'

  title.append(name, role)
  head.append(portrait, title)

  const hint = loyaltyHint(character.loyalty, defectThresholdFor(character, state.playerFaction))
  const credits = boostCredits(character)
  const siteNames = new Map(state.geography.sites.map((site) => [site.id, site.name]))
  const scopeText =
    scopeSitesFor(state, character)
      .map((id) => siteNames.get(id) ?? id)
      .join('、') || '—'
  const scopeNote = character.roamingSiteId === null || character.roamingSiteId === undefined
    ? scopeText
    : `${scopeText}（无籍，当季落脚）`
  const facts: readonly [string, string][] = [
    ['年龄', ageText(character.age)],
    ['性格', PERSONALITY_LABELS[character.personality]],
    ['活动范围', scopeNote],
    ['忠诚', character.isMonarch ? '君主不计' : `${character.loyalty}${hint === null ? '' : `（${hint}）`}`],
    ['对己方态度', affinityAttitude(affinityToward(character, state.playerFaction))],
    ['经验', `${character.exp ?? 0}（每 ${EXP_PER_BOOST} 点得一次强化，现有 ${credits} 次）`],
  ]

  const list = document.createElement('dl')
  list.className = 'officer-detail__facts'
  for (const [label, value] of facts) {
    const term = document.createElement('dt')
    term.textContent = label
    const detail = document.createElement('dd')
    detail.textContent = value
    if (label === '忠诚' && !character.isMonarch) {
      detail.classList.add('officer-detail__loyalty')
      detail.append(createRewardIcon(character.id), createActionCost(ACTION_COSTS.reward, showCosts))
    }
    list.append(term, detail)
  }

  const parts: HTMLElement[] = [back, head, list]

  // 强化：攒够出战额度时，横排四项能力，选一项提升一级。消耗已在标题行说明，按钮不再重复。
  if (credits > 0) {
    const boosts = document.createElement('div')
    boosts.className = 'officer-detail__actions'
    const lead = document.createElement('span')
    lead.className = 'officer-detail__hint'
    lead.replaceChildren('强化', createActionCost(ACTION_COSTS.strengthen, showCosts))

    const row = document.createElement('div')
    row.className = 'officer-detail__boosts'
    for (const kind of ABILITY_KINDS) {
      const button = createRosterAction(
        `${ABILITY_LABELS[kind]} +${BOOST_GAIN}`,
        'strengthen',
        character.id,
        0,
        false,
      )
      button.dataset.kind = kind
      row.append(button)
    }

    boosts.append(lead, row)
    parts.push(boosts)
  }

  if (!character.isMonarch) {
    const actions = document.createElement('div')
    actions.className = 'officer-detail__actions'
    actions.append(createRosterAction('解任', 'dismiss', character.id, ACTION_COSTS.dismiss, showCosts))
    parts.push(actions)
  }

  container.replaceChildren(...parts)
}

/** 赏赐的小图标按钮：一只礼盒，缀在忠诚数值右侧，行动力消耗另以角标缀于其后。 */
function createRewardIcon(characterId: CharacterId): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'officer-icon'
  button.dataset.action = 'reward'
  button.dataset.character = characterId
  button.title = '赏赐'
  button.setAttribute('aria-label', '赏赐')
  button.innerHTML =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
    '<rect x="2.5" y="6.5" width="11" height="7" rx="1" fill="none" stroke="currentColor"/>' +
    '<rect x="1.5" y="4" width="13" height="2.5" rx="0.8" fill="none" stroke="currentColor"/>' +
    '<path d="M8 6.5v7" stroke="currentColor"/>' +
    '</svg>'

  return button
}

const CHARACTER_STATUS_LABELS: Record<CharacterStatus, string> = {
  wild: '在野',
  serving: '在仕',
  captured: '被俘',
  retired: '退场',
}

/** 开发者模式：列出全部武将的所在州、兵力、能力与忠诚，并标出状态与所属君主。返回人数。 */
function renderAllCharacters(list: Element, state: GameState): number {
  const provinceNames = new Map(
    state.geography.provinces.map((province) => [province.id, province.name]),
  )
  const factionNames = new Map(state.factions.map((faction) => [faction.id, faction.name]))
  const monarchNames = new Map<FactionId, string>()
  for (const character of state.characters) {
    if (character.isMonarch && isServing(character) && character.factionId !== null) {
      monarchNames.set(character.factionId, character.name)
    }
  }
  // 被俘者已无势力，来历记在营中的记录里。
  const formerFactions = new Map<CharacterId, FactionId>()
  for (const records of Object.values(state.captives)) {
    for (const record of records) {
      if (record.formerFactionId !== null) {
        formerFactions.set(record.characterId, record.formerFactionId)
      }
    }
  }

  list.replaceChildren(
    ...state.characters.map((character) => {
      const row = document.createElement('tr')
      if (isRetired(character)) {
        row.className = 'roster__row--acted'
      }

      // 君主列写「他属于谁的麾下」：在仕者取现属，被俘者取被俘前的原属，其余留空。
      // 旧主已覆灭时其君主多半不在册，退回势力名。
      const ownerId = character.factionId ?? formerFactions.get(character.id) ?? null
      const monarch =
        ownerId === null
          ? '—'
          : (monarchNames.get(ownerId) ?? factionNames.get(ownerId) ?? '—')

      row.append(
        createTextCell(character.name),
        createTextCell(provinceNames.get(character.provinceId) ?? character.provinceId),
        createTextCell(`${character.troops}/${troopLimit(character)}`),
        createTextCell(String(character.might)),
        createTextCell(String(character.command)),
        createTextCell(String(character.intellect)),
        createTextCell(String(character.politics)),
        createTextCell(CHARACTER_STATUS_LABELS[character.status]),
        createTextCell(monarch, monarch === '—' ? 'roster__muted' : ''),
      )

      return row
    }),
  )

  return state.characters.length
}

interface HistoryFactionGroup {
  factionId: FactionId | null
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
        name.textContent =
          faction.factionId === null ? '天下' : (factionNames.get(faction.factionId) ?? faction.factionId)

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

/** 战报中一方的展示块：参战武将、兵力、伤亡与剩余。 */
function fillBattleSide(container: HTMLElement, label: string, side: BattleReportSide): void {
  const heading = document.createElement('p')
  heading.className = 'battle__side-label'
  heading.textContent = label

  const officers = document.createElement('p')
  officers.className = 'battle__officers'
  officers.textContent = side.officers.length === 0 ? '无参战武将' : `参战 ${side.officers.join('、')}`

  const stats = document.createElement('ul')
  stats.className = 'battle__stats'
  stats.append(
    createBattleStat('兵力', String(side.troops)),
    createBattleStat('伤亡', String(side.casualties)),
    createBattleStat('剩余', String(side.remaining)),
  )

  container.replaceChildren(heading, officers, stats)
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
function renderPrison(
  dialog: HTMLDialogElement,
  state: GameState,
  message: string,
  showCosts: boolean,
): void {
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
        setActionButton(persuade, '劝降', ACTION_COSTS.persuade, showCosts)
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

/** 建设一项的开发效果说明。 */
function developmentEffectText(kind: DevelopmentKind): string {
  if (kind === 'farm') {
    return `粮产 +${Math.round(GRAIN_BONUS_PER_FARM_LEVEL * 100)}%`
  }
  if (kind === 'market') {
    return `税收 +${Math.round(MONEY_BONUS_PER_MARKET_LEVEL * 100)}%`
  }
  return `人口 +${POPULATION_PER_HOUSING}`
}

/** 外交弹窗可用的一项动作；`cost` 为该动作的行动力消耗。 */
interface DiplomacyOption {
  label: string
  action: string
  cost: number
  meta?: string
}

/** 按当前关系列出可用的外交动作。 */
function diplomacyOptions(kind: RelationKind): DiplomacyOption[] {
  const options: DiplomacyOption[] = []
  if (kind !== 'hostile') {
    options.push({ label: '宣战', action: 'declare-war', cost: ACTION_COSTS.declareWar })
  }
  if (kind === 'hostile') {
    options.push({
      label: '停战',
      action: 'make-peace',
      cost: ACTION_COSTS.makePeace,
      meta: `需好感 ≥ ${PEACE_FAVOR}`,
    })
  }
  if (kind === 'neutral') {
    options.push({
      label: '结盟',
      action: 'alliance',
      cost: ACTION_COSTS.alliance,
      meta: `需好感 ≥ ${ALLIANCE_FAVOR}`,
    })
  }
  options.push({ label: `赠礼 ${GIFT_MONEY} 金`, action: 'gift', cost: ACTION_COSTS.gift })
  options.push({ label: '索取粮食', action: 'demand', cost: ACTION_COSTS.demand })

  return options
}

/** 他方势力：非玩家、未覆灭者。 */
function otherFactions(state: GameState): Faction[] {
  return state.factions.filter(
    (faction) => faction.id !== state.playerFaction && !isFactionDestroyed(state, faction.id),
  )
}

/** 一条外交行：左侧名称与摘要，右侧一枚按钮，按钮上缀行动力角标。 */
function createDiplomacyRow(
  nameText: string,
  metaText: string | null,
  action: string,
  actionLabel: string,
  cost: number,
  showCosts: boolean,
  factionId?: FactionId,
): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'diplomacy__item'

  const info = document.createElement('div')
  info.className = 'diplomacy__info'
  const name = document.createElement('span')
  name.className = 'diplomacy__name'
  name.textContent = nameText
  info.append(name)
  if (metaText !== null) {
    const meta = document.createElement('span')
    meta.className = 'diplomacy__meta'
    meta.textContent = metaText
    info.append(meta)
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'diplomacy__button'
  button.dataset.action = action
  if (factionId !== undefined) {
    button.dataset.faction = factionId
  }
  setActionButton(button, actionLabel, cost, showCosts)

  item.append(info, button)
  return item
}

/** 外交弹窗：未选对象时列出他方势力，选定后显示其状态、好感与可用的外交动作。 */
function renderDiplomacyDialog(
  dialog: HTMLElement,
  state: GameState,
  factionId: FactionId | null,
  message: string,
  showCosts: boolean,
): void {
  const backButton = requireElement<HTMLButtonElement>(dialog, '[data-action="diplomacy-back"]')
  const targetLine = requireElement<HTMLElement>(dialog, '.diplomacy__target')
  const statusLine = requireElement<HTMLElement>(dialog, '.diplomacy__status')
  const list = requireElement<HTMLElement>(dialog, '.diplomacy__list')

  const target = factionId === null ? undefined : state.factions.find((item) => item.id === factionId)
  if (target === undefined) {
    backButton.hidden = true
    targetLine.textContent = '选择交涉对象'
    statusLine.textContent = ''
    list.replaceChildren(
      ...otherFactions(state).map((faction) =>
        createDiplomacyRow(
          faction.name,
          `${relationLabel(relationBetween(state, state.playerFaction, faction.id))} · ${affinityAttitude(favorBetween(state, state.playerFaction, faction.id))}`,
          'pick-diplomacy',
          '交涉',
          0,
          showCosts,
          faction.id,
        ),
      ),
    )
    return
  }

  backButton.hidden = false
  const kind = relationBetween(state, state.playerFaction, target.id)
  targetLine.textContent = `${target.name}　${relationLabel(kind)} · ${affinityAttitude(favorBetween(state, state.playerFaction, target.id))}`
  statusLine.textContent = message
  list.replaceChildren(
    ...diplomacyOptions(kind).map((option) =>
      createDiplomacyRow(
        option.label,
        option.meta ?? null,
        option.action,
        '执行',
        option.cost,
        showCosts,
      ),
    ),
  )
}

/** 遣散弹窗：以滑杆选定保留的兵力，随即遣散多余士兵；不耗行动力。 */
function renderDisbandDialog(
  dialog: HTMLElement,
  state: GameState,
  characterId: CharacterId | null,
  message: string,
): void {
  const character =
    characterId === null ? undefined : state.characters.find((item) => item.id === characterId)
  if (character === undefined) {
    return
  }

  requireElement<HTMLElement>(dialog, '.disband__target').textContent =
    `${character.name}　当前兵力 ${character.troops}`

  const slider = requireElement<HTMLInputElement>(dialog, '.disband__slider')
  const changedOfficer = slider.dataset.character !== character.id
  slider.dataset.character = character.id
  slider.max = String(character.troops)
  if (changedOfficer || Number(slider.value) > character.troops) {
    slider.value = String(character.troops)
  }

  requireElement<HTMLElement>(dialog, '.disband__label').textContent = `保留 ${slider.value}`
  requireElement<HTMLElement>(dialog, '.disband__status').textContent = message
}

/** 解任确认弹窗：写明要卸下的人与其后果，等一声确认再动手。 */
function renderDismissConfirm(
  dialog: HTMLElement,
  state: GameState,
  characterId: CharacterId | null,
): void {
  const character =
    characterId === null ? undefined : state.characters.find((item) => item.id === characterId)
  if (character === undefined) {
    return
  }

  requireElement<HTMLElement>(dialog, '.confirm__text').textContent =
    `将 ${character.name} 罢为在野，卸下其驻地与部队。`
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
  const rosterList = requireElement<HTMLElement>(root, '.roster__list')
  const rosterDetail = requireElement<HTMLElement>(root, '.roster__detail')
  const devSection = requireElement<HTMLElement>(root, '.roster__dev')
  const allCharactersList = requireElement<HTMLElement>(root, '.roster__all')
  const allCount = requireElement<HTMLElement>(root, '.roster__all-count')
  const openSettingsButton = requireElement<HTMLButtonElement>(root, '[data-action="open-settings"]')
  const openSavesButton = requireElement<HTMLButtonElement>(root, '[data-action="open-saves"]')
  const closeSettingsButton = requireElement<HTMLButtonElement>(root, '[data-action="close-settings"]')
  const closeSavesButton = requireElement<HTMLButtonElement>(root, '[data-action="close-saves"]')
  const settingsDialog = requireElement<HTMLDialogElement>(root, '.settings')
  const linksCheckbox = requireElement<HTMLInputElement>(root, '[data-setting="showStrategicLinks"]')
  const costCheckbox = requireElement<HTMLInputElement>(root, '[data-setting="showActionCosts"]')
  const allCharactersCheckbox = requireElement<HTMLInputElement>(
    root,
    '[data-setting="showAllCharacters"]',
  )
  const battleShortcutsCheckbox = requireElement<HTMLInputElement>(
    root,
    '[data-setting="battleShortcuts"]',
  )
  const savesDialog = requireElement<HTMLDialogElement>(root, '.saves')
  const openNewGameButton = requireElement<HTMLButtonElement>(root, '[data-action="open-new-game"]')
  const closeNewGameButton = requireElement<HTMLButtonElement>(root, '[data-action="close-new-game"]')
  const newGameDialog = requireElement<HTMLDialogElement>(root, '.new-game')
  const newGameList = requireElement<HTMLElement>(root, '.new-game__list')
  const endingDialog = requireElement<HTMLDialogElement>(root, '.ending')
  const endingSavesButton = requireElement<HTMLButtonElement>(root, '[data-action="ending-saves"]')
  const endingNewGameButton = requireElement<HTMLButtonElement>(root, '[data-action="ending-new-game"]')
  const closeOrderButton = requireElement<HTMLButtonElement>(root, '[data-action="close-order"]')
  const orderDialog = requireElement<HTMLDialogElement>(root, '.order')
  const orderStatus = requireElement<HTMLElement>(root, '.order__status')
  const orderList = requireElement<HTMLElement>(root, '.order__officers')
  const orderGoButton = requireElement<HTMLButtonElement>(root, '[data-action="order-go"]')
  const battlePlanDialog = requireElement<HTMLDialogElement>(root, '.battle-plan')
  const battleStageBody = requireElement<HTMLElement>(root, '.battle-plan__body')
  const closeCaptivesButton = requireElement<HTMLButtonElement>(root, '[data-action="close-captives"]')
  const captivesDialog = requireElement<HTMLDialogElement>(root, '.captives')
  const openPrisonButton = requireElement<HTMLButtonElement>(actionBar, '[data-action="open-prison"]')
  const closePrisonButton = requireElement<HTMLButtonElement>(root, '[data-action="close-prison"]')
  const prisonDialog = requireElement<HTMLDialogElement>(root, '.prison')
  const prisonList = requireElement<HTMLElement>(root, '.prison__list')
  const closeDiplomacyButton = requireElement<HTMLButtonElement>(root, '[data-action="close-diplomacy"]')
  const diplomacyDialog = requireElement<HTMLDialogElement>(root, '.diplomacy')
  const diplomacyList = requireElement<HTMLElement>(root, '.diplomacy__list')
  const openDiplomacyButton = requireElement<HTMLButtonElement>(actionBar, '[data-action="open-diplomacy"]')
  const backDiplomacyButton = requireElement<HTMLButtonElement>(root, '[data-action="diplomacy-back"]')
  const closeDisbandButton = requireElement<HTMLButtonElement>(root, '[data-action="close-disband"]')
  const disbandDialog = requireElement<HTMLDialogElement>(root, '.disband')
  const disbandSlider = requireElement<HTMLInputElement>(root, '.disband__slider')
  const disbandConfirmButton = requireElement<HTMLButtonElement>(root, '[data-action="disband-confirm"]')
  const closeSiteInfoButton = requireElement<HTMLButtonElement>(root, '[data-action="close-site-info"]')
  const siteInfoDialog = requireElement<HTMLDialogElement>(root, '.site-info')
  const siteInfoList = requireElement<HTMLElement>(root, '.site-info__list')
  const dismissDialog = requireElement<HTMLDialogElement>(root, '.confirm')
  const dismissCancelButton = requireElement<HTMLButtonElement>(root, '[data-action="dismiss-cancel"]')
  const dismissConfirmButton = requireElement<HTMLButtonElement>(root, '[data-action="dismiss-confirm"]')
  const closeDismissButton = requireElement<HTMLButtonElement>(root, '[data-action="close-confirm"]')

  linksCheckbox.checked = settings.get().showStrategicLinks
  costCheckbox.checked = settings.get().showActionCosts
  allCharactersCheckbox.checked = settings.get().showAllCharacters
  battleShortcutsCheckbox.checked = settings.get().battleShortcuts

  /** 给面板上的行动按钮标注行动力消耗；关闭「显示行动力消耗」时留空，角标随之隐藏。 */
  const applyActionCosts = (showCosts: boolean): void => {
    const setActionCost = (action: string, value: string, title: string): void => {
      const badge = requireElement<HTMLElement>(root, `[data-action="${action}"] .action-cost`)
      badge.textContent = showCosts ? value : ''
      badge.title = showCosts ? title : ''
    }

    setActionCost('attack-here', String(ACTION_COSTS.attack), `${ACTION_COSTS.attack} 行动力`)
    setActionCost('station-here', String(ACTION_COSTS.station), `${ACTION_COSTS.station} 行动力`)
    setActionCost('seek-here', String(ACTION_COSTS.seekTalent), `${ACTION_COSTS.seekTalent} 行动力`)
  }

  /** 选择一变就地更新提交按钮、已选计数与状态行，不必等点提交才知道还差什么。 */
  const refreshOrderSubmit = (): void => {
    if (orderRequest === null) {
      return
    }

    const multi = orderRequest.kind === 'attack' || orderRequest.kind === 'defense'
    if (multi) {
      const limit = selectionLimit(orderRequest.kind)
      requireElement<HTMLElement>(root, '.order__count').textContent =
        `可选 ${readSelection(orderList).length} / ${limit}`
    }

    const gap = orderSelectionGap(orderList, orderRequest.kind)
    orderGoButton.disabled = gap !== null
    orderStatus.textContent = gap ?? ''
  }

  /** 各面板的上一次行动反馈。 */
  let siteMessage = ''
  let recruitMessage = ''
  let contactMessage = ''
  /** 武将详情当前展示的人；为 null 时展示列表。 */
  let detailCharacterId: CharacterId | null = null
  /** 命令弹窗当前的目标与行动：进攻或调动。 */
  let orderRequest: OrderRequest | null = null
  /** 编成后进入战斗的演出：编成、已结算的战报与当前幕。 */
  let battleStage: BattleStage | null = null
  /** 战斗演出里正在拖动的武将。 */
  let draggingCharacterId: CharacterId | null = null
  /** 自动推进敌方行动的定时器。 */
  let battleTimer: number | null = null
  /** 等待行动条涨满的定时器。 */
  let battlePaceTimer: number | null = null
  /** 刚结束的一战里的俘虏；等演出收兵后再单独弹出俘虏窗口。 */
  let pendingCaptives: CaptiveReport[] = []
  /** 俘虏营的上一次操作反馈。 */
  let prisonMessage = ''
  /** 建设弹窗当前的目标战略点与上一次操作反馈。 */
  let buildSiteId: SiteId | null = null
  let buildMessage = ''
  /** 外交弹窗当前的目标势力与上一次操作反馈。 */
  let diplomacyFactionId: FactionId | null = null
  let diplomacyMessage = ''
  /** 遣散弹窗当前的目标武将与上一次操作反馈。 */
  let disbandCharacterId: CharacterId | null = null
  let disbandMessage = ''
  /** 内政面板的回显：征粮结果写在这里。 */
  let domesticMessage = ''
  /** 解任确认弹窗当前要处置的武将。 */
  let dismissTargetId: CharacterId | null = null

  const paint = (state: GameState): void => {
    const showCosts = settings.get().showActionCosts

    dateLabel.textContent = formatDate(state)
    turnLabel.textContent = `第 ${state.currentTurn} 回合`
    renderActionPoints(actionPointsLabel, state)
    renderDomestic(domesticDialog, state, domesticMessage)
    renderFactions(factionList, state)
    applyActionCosts(showCosts)
    renderSitePanel(sitePanel, state, selection.get(), siteMessage)
    renderContacts(contactPanel, state, contactMessage, showCosts)
    renderOrderDialog(root, state, orderRequest)
    refreshOrderSubmit()
    renderBattleStage(root, state, battleStage, settings.get().battleShortcuts)
    officerCount.textContent = String(renderOfficers(officerList, state, showCosts))
    rosterStatus.textContent = recruitMessage

    // 详情只认仍在麾下的人；他若已离队（叛离、阵亡等），自动退回列表。
    const detail =
      detailCharacterId === null
        ? undefined
        : state.characters.find(
            (character) =>
              character.id === detailCharacterId &&
              isServing(character) &&
              character.factionId === state.playerFaction,
          )
    if (detail === undefined) {
      detailCharacterId = null
    }
    rosterList.hidden = detail !== undefined
    rosterDetail.hidden = detail === undefined
    if (detail !== undefined) {
      renderOfficerDetail(rosterDetail, state, detail, showCosts)
    }

    renderHistory(historyList, state)
    renderPrison(prisonDialog, state, prisonMessage, showCosts)
    renderDiplomacyDialog(diplomacyDialog, state, diplomacyFactionId, diplomacyMessage, showCosts)
    renderDisbandDialog(disbandDialog, state, disbandCharacterId, disbandMessage)
    renderSiteInfoDialog(siteInfoDialog, state, buildSiteId, buildMessage, showCosts)
    renderDismissConfirm(dismissDialog, state, dismissTargetId)
    renderSlots(slotList, session)

    const showAllCharacters = settings.get().showAllCharacters
    officersTitle.hidden = !showAllCharacters
    devSection.hidden = !showAllCharacters
    if (showAllCharacters) {
      allCount.textContent = String(renderAllCharacters(allCharactersList, state))
    }

    // 结局一旦落定即弹窗收尾：弹窗为模态，其余入口随之不可点；回到进行中时收掉。
    endTurnButton.disabled = state.outcome !== 'ongoing'
    if (state.outcome === 'ongoing') {
      if (endingDialog.open) {
        endingDialog.close()
      }
    } else {
      renderEnding(endingDialog, state)
      if (!endingDialog.open) {
        endingDialog.showModal()
      }
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
    detailCharacterId = null
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
    domesticMessage = ''
    domesticDialog.showModal()
  })

  closeDomesticButton.addEventListener('click', () => {
    domesticDialog.close()
  })

  closeOrderButton.addEventListener('click', () => {
    abandonOrder()
  })

  requireElement<HTMLButtonElement>(root, '[data-action="order-abandon"]').addEventListener(
    'click',
    () => {
      abandonOrder()
    },
  )

  /** 收掉自动推进的定时器，免得关窗后还在打。 */
  const clearBattleTimer = (): void => {
    if (battleTimer !== null) {
      window.clearTimeout(battleTimer)
      battleTimer = null
    }
  }

  const clearBattlePaceTimer = (): void => {
    if (battlePaceTimer !== null) {
      window.clearTimeout(battlePaceTimer)
      battlePaceTimer = null
    }
  }

  /** 行动条涨满后才亮起行动者与指令；每次行动后重新计时。 */
  const queueBattlePace = (): void => {
    clearBattlePaceTimer()
    if (battleStage === null) {
      return
    }
    battleStage.paceReady = false
    battlePaceTimer = window.setTimeout(() => {
      battlePaceTimer = null
      if (battleStage === null) {
        return
      }
      battleStage.paceReady = true
      paint(session.getState())
    }, paceDurationFor(battleStage.battle, battleStage.auto))
  }

  /** 记下此刻条子的实际位置；切换自动战斗的快慢时从这里接着走，不重头。 */
  const capturePacePositions = (): void => {
    if (battleStage === null) {
      return
    }
    const shown = shownBattlePace.get(battleStage.battle) ?? new Map<CharacterId, ShownPace>()
    for (const slotElement of battleStageBody.querySelectorAll<HTMLElement>('.battle-slot')) {
      const id = slotElement.dataset.character
      const track = slotElement.querySelector<HTMLElement>('.battle-slot__pace')
      const fill = slotElement.querySelector<HTMLElement>('.battle-slot__pace-fill')
      if (id === undefined || track === null || fill === null) {
        continue
      }
      const trackWidth = track.getBoundingClientRect().width
      const ratio = trackWidth > 0 ? (fill.getBoundingClientRect().width / trackWidth) * 100 : 0
      shown.set(id, { from: ratio, target: ratio, at: 0, duration: 0 })
    }
    shownBattlePace.set(battleStage.battle, shown)
  }

  /** 收兵：关掉演出；这一战若抓了俘虏，接上俘虏窗口。 */
  const finishStage = (): void => {
    clearBattleTimer()
    clearBattlePaceTimer()
    draggingCharacterId = null
    battleStage = null
    battlePlanDialog.close()
    if (pendingCaptives.length > 0) {
      renderCaptivesDialog(captivesDialog, pendingCaptives)
      captivesDialog.showModal()
      pendingCaptives = []
    }
  }

  /** 这一季结束：关掉演出并报出新回合；此处只留自动存档一条提示，新回合的日期与粮耗看界面本身。 */
  const settleTurn = (): void => {
    clearBattleTimer()
    battleStage = null
    battlePlanDialog.close()
    if (session.getState().outcome !== 'ongoing') {
      statusLabel.textContent = ''
      return
    }

    statusLabel.textContent = session.isAutoSaveFailed() ? '自动保存失败' : '已自动保存'
  }

  /** 结局或读档之后收掉残留在场的演出与弹窗，回到可玩状态。 */
  const resetTransientUi = (): void => {
    clearBattleTimer()
    battleStage = null
    battlePlanDialog.close()
    orderRequest = null
    orderDialog.close()
    endingDialog.close()
  }

  /** 进入战斗演出：先确认阵型，再逐次交锋，战后摆出战果。 */
  const startBattleStage = (mode: 'attack' | 'defense', battle: BattleState): void => {
    clearBattleTimer()
    draggingCharacterId = null
    battleStage = {
      mode,
      battle,
      step: battle.finished ? 'result' : 'deploy',
      report: null,
      outcome: '',
      log: [],
      lastAction: null,
      pickedSlot: null,
      formationMessage: '',
      paceReady: false,
      auto: false,
    }
    orderRequest = null
    orderDialog.close()
    paint(session.getState())
    battlePlanDialog.showModal()
    if (battle.finished) {
      settleBattle(null)
    }
  }

  /** 把已结算的战报摆上结果一幕。 */
  const applyBattleResult = (report: BattleReport | null, outcome: string): void => {
    if (battleStage === null) {
      return
    }
    battleStage.report = report
    battleStage.outcome = outcome
    battleStage.step = 'result'
    pendingCaptives = report === null ? [] : report.captives
    siteMessage = outcome
    paint(session.getState())
  }

  /**
   * 结算这一战。进攻走我方结算，战果写入历史；防守交回推进器，取回战报。
   * `forced` 为开发者模式专供，取攻方视角。
   */
  const settleBattle = (forced: ForcedOutcome | null): void => {
    if (battleStage === null) {
      return
    }
    clearBattlePaceTimer()

    if (battleStage.mode === 'attack') {
      const result = session.finishAttack(battleStage.battle, forced)
      if (!result.ok) {
        statusLabel.textContent = result.reason
        paint(session.getState())
        return
      }
      applyBattleResult(result.record.battle ?? null, result.record.outcome)
      return
    }

    if (forced !== null) {
      battleStage.battle.attackerWins = forced === 'win'
      battleStage.battle.finished = true
    }
    const signal = session.finishDefense(battleStage.battle)
    if (signal === null) {
      settleTurn()
      return
    }
    if (signal.kind === 'battle') {
      applyBattleResult(signal.report, signal.outcome)
      return
    }
    // 又一场来犯：先收掉这一场的演出，再让玩家排下一场。
    clearBattleTimer()
    battleStage = null
    battlePlanDialog.close()
    runTurnFlow(signal)
  }

  /**
   * 他方来犯：先让守方定下迎战编成（复用命令弹窗），再由演出呈现这一战。
   * 无人可守则不战而下，攻方照付行动力与粮草，守方直接看到失守的战报。
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

    const request = signal.request
    if (defenderCandidates(session.getState(), request.targetSiteId).length === 0) {
      session.deployDefense(request.battle, [])
      startBattleStage('defense', request.battle)
      return
    }

    orderRequest = { kind: 'defense', siteId: request.targetSiteId, defense: request }
    orderStatus.textContent = ''
    paint(session.getState())
    orderDialog.showModal()
  }

  /** 我方为当前行动的一队下令；结算一步后继续演出。 */
  const submitBattleOrder = (order: BattleOrder): void => {
    if (battleStage === null || battleStage.battle.finished) {
      return
    }

    const event = session.battleAction(battleStage.battle, order)
    if (event === null) {
      return
    }
    recordBattleAction(event)
    if (battleStage.battle.finished) {
      settleBattle(null)
      return
    }
    scheduleBattleStep()
  }

  /** 记下这一步行动，供战况记录与受击高亮。 */
  const recordBattleAction = (event: BattleActionEvent): void => {
    if (battleStage === null) {
      return
    }
    battleStage.log = [...battleStage.log, event].slice(-8)
    battleStage.lastAction = event
    battleStage.paceReady = false
    paint(session.getState())
    queueBattlePace()
  }

  /** 敌方的行动按节拍自动推进；轮到我方即停下等指令。 */
  const scheduleBattleStep = (): void => {
    clearBattleTimer()
    if (battleStage === null || battleStage.step !== 'fight') {
      return
    }

    const battle = battleStage.battle
    if (battle.finished) {
      settleBattle(null)
      return
    }
    const actor = currentActor(battle)
    if (actor === null) {
      settleBattle(null)
      return
    }
    // 手动时轮到我方即停下等指令；自动战斗连我方一并推进。
    if (actor.side === ourSideOf(battleStage) && !battleStage.auto) {
      return
    }

    battleTimer = window.setTimeout(() => {
      battleTimer = null
      if (battleStage === null || battleStage.step !== 'fight') {
        return
      }
      const event = session.battleAutoAction(battle)
      if (event === null) {
        settleBattle(null)
        return
      }
      recordBattleAction(event)
      if (battle.finished) {
        settleBattle(null)
        return
      }
      scheduleBattleStep()
    }, paceDurationFor(battle, battleStage.auto) + (battleStage.auto ? 400 : 800))
  }

  /** 阵型确认完毕，开始交锋。 */
  const beginBattle = (): void => {
    if (battleStage === null) {
      return
    }
    battleStage.step = 'fight'
    battleStage.formationMessage = ''
    battleStage.pickedSlot = null
    battleStage.paceReady = false
    // 交锋第一幕重新从零涨条，让开战有个起势。
    shownBattlePace.delete(battleStage.battle)
    paint(session.getState())
    queueBattlePace()
    scheduleBattleStep()
  }

  /** 阵型一幕挪动一个阵位：拖放或点选两格都走这里。 */
  const moveToSlot = (slot: number): void => {
    if (battleStage === null || battleStage.step !== 'deploy') {
      return
    }

    const battle = battleStage.battle
    const ours = ourSideOf(battleStage)
    const unitAt = (target: number): BattleUnit | undefined =>
      battle[ours].units.find((unit) => unit.slot === target)

    if (draggingCharacterId !== null) {
      battleStage.formationMessage = setUnitSlot(battle, draggingCharacterId, slot) ?? ''
      draggingCharacterId = null
      battleStage.pickedSlot = null
      paint(session.getState())
      return
    }

    if (battleStage.pickedSlot === null) {
      if (unitAt(slot) === undefined) {
        return
      }
      battleStage.pickedSlot = slot
      battleStage.formationMessage = ''
      paint(session.getState())
      return
    }

    const moving = unitAt(battleStage.pickedSlot)
    battleStage.pickedSlot = null
    if (moving === undefined) {
      paint(session.getState())
      return
    }
    battleStage.formationMessage = setUnitSlot(battle, moving.characterId, slot) ?? ''
    paint(session.getState())
  }

  /** 守方放弃迎战：不战而下，直接结算失守。 */
  const forfeitDefense = (request: DefenseRequest): void => {
    session.deployDefense(request.battle, [])
    startBattleStage('defense', request.battle)
  }

  /** 关掉命令弹窗；迎战编成放弃即失守，征兵与征粮则回到战略点窗口。 */
  const abandonOrder = (): void => {
    if (orderRequest?.kind === 'defense') {
      const request = orderRequest.defense
      orderRequest = null
      orderDialog.close()
      if (request !== undefined) {
        forfeitDefense(request)
      }
      return
    }

    const backSiteId =
      orderRequest?.kind === 'harvest' || orderRequest?.kind === 'recruit'
        ? orderRequest.siteId
        : undefined
    orderDialog.close()
    if (backSiteId !== undefined) {
      buildSiteId = backSiteId
      siteInfoDialog.showModal()
    }
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

    const kind = orderRequest.kind
    const siteSelect = requireElement<HTMLSelectElement>(root, '.order__site')
    const siteId =
      kind === 'harvest' || kind === 'recruit'
        ? (orderRequest.siteId ?? siteSelect.value)
        : (orderRequest.siteId ?? '')

    if (kind === 'attack') {
      const memberIds = readSelection(orderList)
      const result = session.attack(siteId, autoFormationOf(session.getState(), memberIds))
      if (!result.ok) {
        orderStatus.textContent = result.reason
        return
      }

      orderStatus.textContent = ''
      startBattleStage('attack', result.battle)
      return
    }

    if (kind === 'defense') {
      const request = orderRequest.defense
      if (request === undefined) {
        return
      }
      const problem = session.deployDefense(
        request.battle,
        autoFormationOf(session.getState(), readSelection(orderList)),
      )
      if (problem !== null) {
        orderStatus.textContent = problem
        return
      }

      orderStatus.textContent = ''
      startBattleStage('defense', request.battle)
      return
    }

    if (kind === 'station') {
      const selected = orderList.querySelector<HTMLInputElement>('.picker__checkbox:checked')
      const result = session.assignStation(siteId, selected?.value || null)
      if (!result.ok) {
        orderStatus.textContent = result.reason
        return
      }

      siteMessage = result.record.outcome
      orderDialog.close()
      paint(session.getState())
      return
    }

    const selected = orderList.querySelector<HTMLInputElement>('.picker__checkbox:checked')
    if (selected === null) {
      return
    }

    if (kind === 'harvest') {
      const result = session.harvestGrain(siteId, selected.value)
      if (!result.ok) {
        orderStatus.textContent = result.reason
        return
      }

      // 结果回显到战略点窗口。
      orderStatus.textContent = ''
      orderDialog.close()
      buildSiteId = siteId
      buildMessage = result.record.outcome
      paint(session.getState())
      siteInfoDialog.showModal()
      return
    }

    const result = session.recruit(siteId, selected.value)
    if (!result.ok) {
      orderStatus.textContent = result.reason
      return
    }

    orderStatus.textContent = ''
    recruitMessage = result.record.outcome
    orderDialog.close()
    buildSiteId = siteId
    buildMessage = result.record.outcome
    paint(session.getState())
    siteInfoDialog.showModal()
  })

  /** 防守战看完战果后继续推进本回合。 */
  const continueTurnAfterDefense = (): void => {
    clearBattleTimer()
    battleStage = null
    battlePlanDialog.close()
    runTurnFlow(session.continueTurn())
  }

  /** 演出里的一次操作：开战、攻击、防御、自动战斗、放弃或继续本回合。 */
  battleStageBody.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return
    }

    const button = event.target.closest<HTMLButtonElement>('button[data-action]')
    if (button === null) {
      // 阵型一幕：点选一个阵位，再点另一个即可互换。
      if (battleStage?.step === 'deploy') {
        const slotElement = event.target.closest<HTMLElement>('.battle-slot')
        if (
          slotElement !== null &&
          battleStage !== null &&
          slotElement.dataset.side === ourSideOf(battleStage)
        ) {
          const slot = Number(slotElement.dataset.slot)
          if (Number.isInteger(slot)) {
            moveToSlot(slot)
          }
        }
      }
      return
    }
    if (battleStage === null) {
      return
    }

    const action = button.dataset.action
    if (action === 'stage-begin') {
      beginBattle()
      return
    }
    if (action === 'stage-abandon') {
      if (battleStage.step !== 'deploy') {
        return
      }
      if (battleStage.mode === 'attack') {
        // 主动进攻放弃：退回行动力与粮草，等同没打过。
        session.cancelAttack(battleStage.battle)
        battleStage = null
        battlePlanDialog.close()
        statusLabel.textContent = '已放弃进攻'
        paint(session.getState())
        return
      }
      // 防守方放弃：不战而下，直接结算失守。
      session.deployDefense(battleStage.battle, [])
      settleBattle(null)
      return
    }
    if (action === 'stage-attack') {
      const targetId = button.dataset.target
      const actor = currentActor(battleStage.battle)
      if (targetId === undefined || actor === null) {
        return
      }
      submitBattleOrder({ characterId: actor.characterId, kind: 'attack', targetId })
      return
    }
    if (action === 'stage-defend') {
      const actor = currentActor(battleStage.battle)
      if (actor === null) {
        return
      }
      submitBattleOrder({ characterId: actor.characterId, kind: 'defend' })
      return
    }
    if (action === 'stage-auto') {
      capturePacePositions()
      battleStage.auto = !battleStage.auto
      clearBattleTimer()
      // 条子还在涨时，按新的快慢重新计时，免得亮起与行动错拍。
      if (!battleStage.paceReady) {
        queueBattlePace()
      }
      paint(session.getState())
      scheduleBattleStep()
      return
    }
    if (action === 'stage-forced-win' || action === 'stage-forced-lose') {
      // 「胜利」始终指我方胜：我方在攻即攻方胜，我方在守则攻方败。
      clearBattleTimer()
      const wanted: ForcedOutcome = action === 'stage-forced-win' ? 'win' : 'lose'
      settleBattle(battleStage.mode === 'defense' ? (wanted === 'win' ? 'lose' : 'win') : wanted)
      return
    }
    if (action === 'stage-close') {
      finishStage()
      return
    }
    if (action === 'stage-continue-turn') {
      continueTurnAfterDefense()
    }
  })

  /** 阵型一幕的拖放换位。 */
  battleStageBody.addEventListener('dragstart', (event) => {
    if (battleStage?.step !== 'deploy' || !(event.target instanceof Element)) {
      return
    }
    const slotElement = event.target.closest<HTMLElement>('.battle-slot--movable')
    if (slotElement === null) {
      return
    }
    draggingCharacterId = slotElement.dataset.character ?? null
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', draggingCharacterId ?? '')
    }
  })

  battleStageBody.addEventListener('dragover', (event) => {
    if (battleStage?.step !== 'deploy' || !(event.target instanceof Element)) {
      return
    }
    if (event.target.closest('.battle-slot') !== null) {
      event.preventDefault()
    }
  })

  battleStageBody.addEventListener('drop', (event) => {
    if (battleStage?.step !== 'deploy' || !(event.target instanceof Element)) {
      return
    }
    const slotElement = event.target.closest<HTMLElement>('.battle-slot')
    if (slotElement === null || battleStage === null) {
      return
    }
    if (slotElement.dataset.side !== ourSideOf(battleStage)) {
      return
    }
    event.preventDefault()
    const slot = Number(slotElement.dataset.slot)
    if (Number.isInteger(slot)) {
      moveToSlot(slot)
    }
  })

  battleStageBody.addEventListener('dragend', () => {
    draggingCharacterId = null
  })

  /** 战斗窗口不提供 Esc 退出：放弃只在摆阵幕的按钮上发生。 */
  battlePlanDialog.addEventListener('cancel', (event) => {
    event.preventDefault()
  })

  /** Esc 关掉迎战编成时按「放弃」处理：守方直接失守。 */
  orderDialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    abandonOrder()
  })

  /** 进攻、防守选人：勾满名额后其余候选不可再选，并即时更新提交按钮。 */
  orderList.addEventListener('change', () => {
    if (orderRequest === null) {
      return
    }

    const kind = orderRequest.kind
    const multi = kind === 'attack' || kind === 'defense'
    const limit = selectionLimit(kind)
    const checkboxes = Array.from(orderList.querySelectorAll<HTMLInputElement>('.picker__checkbox'))
    const checked = checkboxes.filter((checkbox) => checkbox.checked).length

    for (const checkbox of checkboxes) {
      const locked = checkbox.dataset.locked === 'true'
      checkbox.disabled =
        locked ||
        checkbox.dataset.blocked === 'true' ||
        (multi && !checkbox.checked && checked >= limit)
    }

    refreshOrderSubmit()
  })

  officerList.addEventListener('click', (event) => {
    const button = actionButtonOf(event)
    const characterId = button?.dataset.character
    if (button === null || characterId === undefined) {
      return
    }

    if (button.dataset.action === 'officer-detail') {
      recruitMessage = ''
      detailCharacterId = characterId
      paint(session.getState())
      return
    }

    if (button.dataset.action === 'disband-open') {
      disbandCharacterId = characterId
      disbandMessage = ''
      paint(session.getState())
      disbandDialog.showModal()
      return
    }
  })

  /** 详情页：返回列表、赏赐与解任。 */
  rosterDetail.addEventListener('click', (event) => {
    const button = actionButtonOf(event)
    const action = button?.dataset.action
    if (button === null || action === undefined) {
      return
    }

    if (action === 'officer-back') {
      detailCharacterId = null
      paint(session.getState())
      return
    }

    const characterId = button.dataset.character
    if (characterId === undefined) {
      return
    }

    if (action === 'reward') {
      const result = session.reward(characterId)
      recruitMessage = result.ok ? result.record.outcome : result.reason
      paint(session.getState())
      return
    }

    if (action === 'strengthen') {
      const kind = button.dataset.kind as AbilityKind | undefined
      if (kind === undefined) {
        return
      }
      const result = session.strengthen(characterId, kind)
      recruitMessage = result.ok ? result.record.outcome : result.reason
      paint(session.getState())
      return
    }

    if (action === 'dismiss') {
      dismissTargetId = characterId
      paint(session.getState())
      dismissDialog.showModal()
    }
  })

  /** 遣散弹窗：滑杆即时显示保留的兵力，确认后奏效。 */
  disbandSlider.addEventListener('input', () => {
    requireElement<HTMLElement>(disbandDialog, '.disband__label').textContent =
      `保留 ${disbandSlider.value}`
  })

  disbandConfirmButton.addEventListener('click', () => {
    if (disbandCharacterId === null) {
      return
    }

    const result = session.disband(disbandCharacterId, Number(disbandSlider.value))
    if (!result.ok) {
      disbandMessage = result.reason
      paint(session.getState())
      return
    }

    recruitMessage = result.record.outcome
    disbandDialog.close()
    paint(session.getState())
  })

  closeDisbandButton.addEventListener('click', () => {
    disbandDialog.close()
  })

  /** 解任确认：确认后把人罢为在野并退回列表；取消或关掉则什么都不动。 */
  dismissConfirmButton.addEventListener('click', () => {
    if (dismissTargetId === null) {
      return
    }

    const result = session.dismiss(dismissTargetId)
    dismissDialog.close()
    recruitMessage = result.ok ? result.record.outcome : result.reason
    if (result.ok) {
      detailCharacterId = null
    }
    paint(session.getState())
  })

  dismissCancelButton.addEventListener('click', () => {
    dismissDialog.close()
  })

  closeDismissButton.addEventListener('click', () => {
    dismissDialog.close()
  })

  closeSiteInfoButton.addEventListener('click', () => {
    siteInfoDialog.close()
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

    if (action === 'site-info') {
      buildSiteId = siteId
      buildMessage = ''
      paint(session.getState())
      siteInfoDialog.showModal()
      return
    }

    if (action === 'attack-here') {
      orderRequest = { kind: 'attack', siteId }
    } else if (action === 'station-here') {
      orderRequest = { kind: 'station', siteId }
    } else {
      return
    }

    orderStatus.textContent = ''
    paint(session.getState())
    orderDialog.showModal()
  })

  /** 战略点窗口里的建设：按所选开发项建设，刷新等级、金钱与产出。 */
  siteInfoList.addEventListener('click', (event) => {
    const button = actionButtonOf(event)
    const kind = button?.dataset.kind
    if (button === null || button.dataset.action !== 'build-item' || kind === undefined) {
      return
    }

    if (buildSiteId === null) {
      return
    }

    const result = session.build(buildSiteId, kind as DevelopmentKind)
    buildMessage = result.ok ? result.record.outcome : result.reason
    paint(session.getState())
  })

  /** 战略点窗口里的征兵、征粮：带着当前城池直接进入选将。 */
  siteInfoDialog.addEventListener('click', (event) => {
    const button = actionButtonOf(event)
    const action = button?.dataset.action
    if (button === null || (action !== 'recruit-here' && action !== 'harvest-here')) {
      return
    }

    const siteId = button.dataset.site ?? buildSiteId
    if (siteId === null || siteId === undefined) {
      return
    }

    siteInfoDialog.close()
    buildMessage = ''
    orderRequest = {
      kind: action === 'recruit-here' ? 'recruit' : 'harvest',
      siteId,
    }
    orderStatus.textContent = ''
    paint(session.getState())
    orderDialog.showModal()
  })

  /** 外交面板：先选交涉对象，再执行动作；返回可退回势力列表。 */
  diplomacyList.addEventListener('click', (event) => {
    const button = actionButtonOf(event)
    const action = button?.dataset.action
    if (button === null || action === undefined) {
      return
    }

    if (action === 'pick-diplomacy') {
      const factionId = button.dataset.faction
      if (factionId === undefined) {
        return
      }
      diplomacyFactionId = factionId
      diplomacyMessage = ''
      paint(session.getState())
      return
    }

    if (diplomacyFactionId === null) {
      return
    }

    const target = diplomacyFactionId
    const result =
      action === 'declare-war'
        ? session.declareWar(target)
        : action === 'make-peace'
          ? session.makePeace(target)
          : action === 'alliance'
            ? session.alliance(target)
            : action === 'gift'
              ? session.gift(target)
              : action === 'demand'
                ? session.demand(target)
                : null
    if (result === null) {
      return
    }

    diplomacyMessage = result.ok ? result.record.outcome : result.reason
    paint(session.getState())
  })

  /** 底部菜单的外交入口：从势力列表开始。 */
  openDiplomacyButton.addEventListener('click', () => {
    diplomacyFactionId = null
    diplomacyMessage = ''
    paint(session.getState())
    diplomacyDialog.showModal()
  })

  backDiplomacyButton.addEventListener('click', () => {
    diplomacyFactionId = null
    diplomacyMessage = ''
    paint(session.getState())
  })

  closeDiplomacyButton.addEventListener('click', () => {
    diplomacyDialog.close()
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

  costCheckbox.addEventListener('change', () => {
    settings.update({ showActionCosts: costCheckbox.checked })
    paint(session.getState())
  })

  allCharactersCheckbox.addEventListener('change', () => {
    settings.update({ showAllCharacters: allCharactersCheckbox.checked })
    paint(session.getState())
  })

  battleShortcutsCheckbox.addEventListener('change', () => {
    settings.update({ battleShortcuts: battleShortcutsCheckbox.checked })
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
        resetTransientUi()
        return
      }

      statusLabel.textContent = '没有找到自动存档'
      return
    }

    const slot = Number(button.dataset.slot)

    if (button.dataset.action === 'save-slot') {
      statusLabel.textContent = session.saveToSlot(slot)
        ? `已保存到存档 ${slot}`
        : `保存到存档 ${slot} 失败`
      return
    }

    if (session.loadSlot(slot)) {
      statusLabel.textContent = `已读取存档 ${slot}：${formatDate(session.getState())}`
      savesDialog.close()
      resetTransientUi()
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

  // 结局弹窗只给两条出路：读档或重开；Esc 也关不掉，免得落回已冻结的棋盘。
  endingDialog.addEventListener('cancel', (event) => {
    event.preventDefault()
  })

  endingSavesButton.addEventListener('click', () => {
    savesDialog.showModal()
  })

  endingNewGameButton.addEventListener('click', () => {
    renderScenarioList(newGameList)
    newGameDialog.showModal()
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
    contactMessage = ''
    detailCharacterId = null
    prisonMessage = ''
    buildSiteId = null
    buildMessage = ''
    diplomacyFactionId = null
    diplomacyMessage = ''
    disbandCharacterId = null
    disbandMessage = ''
    domesticMessage = ''
    dismissTargetId = null
    selection.select(null)
    resetTransientUi()
    newGameDialog.close()
    statusLabel.textContent = `已开始新游戏：${scenario.name}`
  })

  /**
   * 弹窗关掉后清掉上一次的结果：重开时回到初始模样，不把旧反馈带回来。
   * 结果本身都落在各自控件下方，弹窗又贴顶，出现时只向下长，按钮不因此移位。
   */
  const dialogResets: readonly [HTMLDialogElement, () => void][] = [
    [
      rosterDialog,
      () => {
        detailCharacterId = null
        recruitMessage = ''
      },
    ],
    [domesticDialog, () => (domesticMessage = '')],
    [
      orderDialog,
      () => {
        orderRequest = null
        orderStatus.textContent = ''
      },
    ],
    [prisonDialog, () => (prisonMessage = '')],
    [
      siteInfoDialog,
      () => {
        buildSiteId = null
        buildMessage = ''
      },
    ],
    [
      diplomacyDialog,
      () => {
        diplomacyFactionId = null
        diplomacyMessage = ''
      },
    ],
    [
      disbandDialog,
      () => {
        disbandCharacterId = null
        disbandMessage = ''
      },
    ],
    [dismissDialog, () => (dismissTargetId = null)],
  ]
  for (const [dialog, reset] of dialogResets) {
    dialog.addEventListener('close', () => {
      reset()
      paint(session.getState())
    })
  }

  selection.subscribe(() => {
    siteMessage = ''
    paint(session.getState())
  })

  session.subscribe(paint)
  paint(session.getState())
}
