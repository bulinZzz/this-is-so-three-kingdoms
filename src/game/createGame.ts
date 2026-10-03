import Phaser from 'phaser'
import type { SettingsSource } from '../app/settingsStore'
import { SEA_COLOR } from './mapLayout'
import { MapScene, type MapStateSource } from './scenes/MapScene'

export function createGame(source: MapStateSource, settings: SettingsSource): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'world',
    backgroundColor: SEA_COLOR,
    scale: {
      mode: Phaser.Scale.RESIZE,
    },
    scene: [new MapScene(source, settings)],
  })
}
