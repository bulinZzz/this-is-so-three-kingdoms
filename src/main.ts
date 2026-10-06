import './style.css'
import { GameSession } from './app/gameSession'
import { SelectionStore } from './app/selectionStore'
import { SettingsStore } from './app/settingsStore'
import { createGame } from './game/createGame'
import { mountGameShell } from './ui/gameShell'

const session = new GameSession()
const settings = new SettingsStore()
const selection = new SelectionStore()

mountGameShell(session, settings, selection)
createGame(session, settings, selection)
