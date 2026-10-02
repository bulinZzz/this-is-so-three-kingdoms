import './style.css'
import { GameSession } from './app/gameSession'
import { createGame } from './game/createGame'
import { mountGameShell } from './ui/gameShell'

const session = new GameSession()

mountGameShell(session)
createGame(session)
