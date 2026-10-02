import './style.css'
import { GameSession } from './app/gameSession'
import { SettingsStore } from './app/settingsStore'
import { createGame } from './game/createGame'
import { mountGameShell } from './ui/gameShell'

const session = new GameSession()
const settings = new SettingsStore()

mountGameShell(session, settings)
createGame(session, settings)
