import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'

export const WORLD_WIDTH = 960
export const WORLD_HEIGHT = 540

export function createGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'world',
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    backgroundColor: '#1b1712',
    scene: [BootScene],
  })
}
