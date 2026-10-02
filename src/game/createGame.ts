import Phaser from 'phaser'
import { WORLD_HEIGHT, WORLD_WIDTH } from './mapLayout'
import { MapScene, type MapStateSource } from './scenes/MapScene'

export function createGame(source: MapStateSource): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'world',
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    backgroundColor: '#1b1712',
    scale: {
      mode: Phaser.Scale.FIT,
    },
    scene: [new MapScene(source)],
  })
}
