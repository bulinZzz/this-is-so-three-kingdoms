export interface GameDate {
  year: number
  month: number
}

export type FactionId = string

export interface Faction {
  id: FactionId
  name: string
  color: string
}

/** 开局剧本：一组初始条件的集合，不同时间点的开局各是一份剧本。 */
export interface Scenario {
  id: string
  name: string
  startDate: GameDate
  playerFaction: FactionId
  factions: Faction[]
}

export interface GameState {
  currentDate: GameDate
  currentTurn: number
  playerFaction: FactionId
  factions: Faction[]
}
