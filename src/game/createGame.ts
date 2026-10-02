import Phaser from 'phaser'
import { MapScene, type MapStateSource } from './scenes/MapScene'

export function createGame(source: MapStateSource): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'world',
    backgroundColor: '#111d25',
    scale: {
      mode: Phaser.Scale.RESIZE,
    },
    scene: [new MapScene(source)],
  })
}
