import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  create(): void {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, '这很三国', {
        fontFamily: '"Noto Serif SC", "Songti SC", "SimSun", serif',
        fontSize: '40px',
        color: '#e8d9b5',
      })
      .setOrigin(0.5)
  }
}
