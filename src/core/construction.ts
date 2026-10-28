import { runAction, type ActionResult } from './actions'
import { scopeSitesFor } from './characters'
import {
  DEVELOPMENT_LABELS,
  developmentLevel,
  developmentLimit,
  developmentOf,
  developmentRequirement,
  setSiteProgress,
  siteProgressOf,
} from './development'
import { logisticsFactor } from './logistics'
import { hasActedThisTurn, markActed, officerBlockedReason } from './military'
import type {
  Character,
  CharacterId,
  DevelopmentKind,
  FactionId,
  GameState,
} from './model'

/**
 * 建设的动工：每次固定花一笔钱，由一名未行动的武将主持，按内政与兵力推进进度。
 * 进度攒够当前级的所需便升一级，级别越高所需进度越长。
 */

/** 每次开工的固定花费。 */
export const BUILD_COST = 200

/** 主持建设的武将每点内政带来的进度。 */
export const DEVELOPMENT_PROGRESS_PER_POLITICS = 8

/** 该武将一次建设能推进的进度：内政乘兵力系数，兵散光了便无人可用。 */
export function buildProgressOf(character: Character): number {
  return Math.round(
    character.politics * DEVELOPMENT_PROGRESS_PER_POLITICS * logisticsFactor(character),
  )
}

/**
 * 建设：派一名未行动的武将到自有战略点兴修农田、市集或民居，消耗行动力与金钱。
 * 并非每次都能升一级：进度攒够当前级的所需才升级，级别越高越费工夫。
 * 非自有战略点、已达该项上限、金钱不足或该武将本季已行动时拒绝且不扣行动力。
 */
export function build(
  state: GameState,
  siteId: string,
  kind: DevelopmentKind,
  characterId: CharacterId,
  factionId: FactionId = state.playerFaction,
): ActionResult {
  const site = state.geography.sites.find((item) => item.id === siteId) ?? null
  const character = state.characters.find((item) => item.id === characterId) ?? null

  return runAction(state, {
    kind: 'build',
    factionId,
    precondition: (current) => {
      if (site === null) {
        return '战略点不存在'
      }
      if (site.owner !== factionId) {
        return '此处不是自有战略点'
      }
      if (developmentLevel(site, kind) >= developmentLimit(site)) {
        return `${DEVELOPMENT_LABELS[kind]} 已达上限`
      }

      const blocked = officerBlockedReason(current, character, factionId)
      if (blocked !== null) {
        return blocked
      }
      if (
        factionId !== current.playerFaction &&
        character !== null &&
        !scopeSitesFor(current, character).includes(siteId)
      ) {
        return `${character.name} 的活动范围不含此处`
      }
      if (character !== null && hasActedThisTurn(current, character.id)) {
        return `${character.name} 本回合已行动`
      }
      const faction = current.factions.find((item) => item.id === factionId)
      if (faction === undefined || faction.money < BUILD_COST) {
        return '金钱不足'
      }
      return null
    },
    execute: (current) => {
      const faction = current.factions.find((item) => item.id === factionId)
      if (site === null || faction === undefined || character === null) {
        return { outcome: '建设未生效' }
      }

      const label = DEVELOPMENT_LABELS[kind]
      const limit = developmentLimit(site)
      let level = developmentLevel(site, kind)
      let progress = siteProgressOf(site, kind) + buildProgressOf(character)
      let leveled = false

      while (level < limit && progress >= developmentRequirement(level)) {
        progress -= developmentRequirement(level)
        level += 1
        leveled = true
      }

      site.development = developmentOf(site)
      site.development[kind] = level
      setSiteProgress(site, kind, level >= limit ? 0 : progress)
      faction.money -= BUILD_COST
      markActed(current, character.id)

      const suffix = `（金 −${BUILD_COST}）`
      if (!leveled) {
        return {
          targetId: site.id,
          outcome: `${character.name} 在${site.name}兴修${label}，进度 ${progress}/${developmentRequirement(level)}${suffix}`,
        }
      }

      return {
        targetId: site.id,
        outcome:
          level >= limit
            ? `${character.name} 在${site.name}兴修${label}，升至 ${level} 级，已至顶${suffix}`
            : `${character.name} 在${site.name}兴修${label}，升至 ${level} 级（进度 ${progress}/${developmentRequirement(level)}）${suffix}`,
      }
    },
  })
}
