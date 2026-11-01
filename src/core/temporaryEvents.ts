import { resolveProvinceOwners } from './geography'
import { isFactionDestroyed } from './military'
import type { GameState } from './model'
import { setRelation } from './relations'

/**
 * 临时事件：南郡风云。
 *
 * 叙事前提为赤壁之战后周瑜与曹仁相持南郡；荆南覆灭只是当前借用的触发时点。
 * 这是 1.0 发布前的临时解法，用来打通西川方向；后续事件系统落地时再按正式设计重写。
 */
export const TEMPORARY_JINGNAN_NANJUN_EVENT_ID = 'temporary-jingnan-nanjun'

export interface TemporaryEventNotice {
  id: string
  title: string
  text: string
}

const JINGNAN_SITE_IDS = ['lingling', 'wuling', 'guiyang', 'changsha'] as const
const TRANSFER_SITE_IDS = ['yiling', 'zigui'] as const

const JINGNAN_NANJUN_NOTICE: TemporaryEventNotice = {
  id: TEMPORARY_JINGNAN_NANJUN_EVENT_ID,
  title: '南郡风云',
  text:
    '赤壁战后，荆南四郡尽归刘备。周瑜与曹仁相持南郡，曹军主力胶着江陵，无暇西顾，' +
    '夷陵、秭归孤悬江西。刘备以助周瑜、绝曹军西道为名，引兵西出，两城遂下。',
}

/** 按事件标识取临时事件的标题与正文，供界面弹窗使用。 */
export function temporaryEventById(id: string | null): TemporaryEventNotice | undefined {
  return id === TEMPORARY_JINGNAN_NANJUN_EVENT_ID ? JINGNAN_NANJUN_NOTICE : undefined
}

/**
 * 结算临时事件：刘备拿下荆南四郡、荆南势力覆灭后的下一回合开始时，
 * 接管夷陵与秭归，并与曹操、孙权保持中立，打开西川方向。一次性事件，写入 firedEvents。
 */
export function resolveTemporaryEvents(state: GameState): TemporaryEventNotice | null {
  if (state.playerFaction !== 'liubei') {
    return null
  }
  if (state.firedEvents.includes(TEMPORARY_JINGNAN_NANJUN_EVENT_ID)) {
    return null
  }
  if (state.factions.every((faction) => faction.id !== 'jingnan')) {
    return null
  }
  if (!isFactionDestroyed(state, 'jingnan')) {
    return null
  }

  const ownsJingnan = JINGNAN_SITE_IDS.every(
    (siteId) => state.geography.sites.find((site) => site.id === siteId)?.owner === 'liubei',
  )
  if (!ownsJingnan) {
    return null
  }

  for (const siteId of TRANSFER_SITE_IDS) {
    const site = state.geography.sites.find((item) => item.id === siteId)
    if (site === undefined) {
      continue
    }

    // 原守将随城撤出，但不被俘、不降忠诚，仍留在原势力名册。
    for (const character of state.characters) {
      if (character.stationedSiteId === siteId) {
        character.stationedSiteId = null
      }
    }
    site.owner = 'liubei'
  }

  resolveProvinceOwners(state.geography)
  setRelation(state, 'liubei', 'caocao', 'neutral')
  setRelation(state, 'liubei', 'sunquan', 'neutral')

  state.firedEvents.push(TEMPORARY_JINGNAN_NANJUN_EVENT_ID)
  state.history.push({
    kind: 'event',
    factionId: null,
    date: { ...state.currentDate },
    targetId: TEMPORARY_JINGNAN_NANJUN_EVENT_ID,
    outcome: JINGNAN_NANJUN_NOTICE.text,
  })

  return JINGNAN_NANJUN_NOTICE
}
