import Phaser from 'phaser'
import type { GameState } from '../../core/model'
import { provinceShapes, SITE_LABEL_OFFSET, siteRegion } from '../mapLayout'

/** 地图所需的状态来源，由装配层提供，地图只读不写。 */
export interface MapStateSource {
  getState(): GameState
  subscribe(listener: (state: GameState) => void): void
}

const UNOWNED_COLOR = 0x6b6459
const SITE_STROKE_COLOR = 0xe8d9b5
const PROVINCE_FILL_COLOR = 0x241e16
const PROVINCE_STROKE_COLOR = 0x5a4c38
const SITE_LABEL_COLOR = '#e8d9b5'
const PROVINCE_LABEL_COLOR = '#6b5c44'
const LABEL_FONT = '"Noto Serif SC", "Songti SC", "SimSun", serif'

function toColorNumber(hexColor: string): number {
  return Number.parseInt(hexColor.replace('#', ''), 16)
}

/** 天下地图：先铺州轮廓，再按归属为战略点着色并标注名称。 */
export class MapScene extends Phaser.Scene {
  private readonly drawn: Phaser.GameObjects.GameObject[] = []

  constructor(private readonly source: MapStateSource) {
    super('Map')
  }

  create(): void {
    this.render(this.source.getState())
    this.source.subscribe((state) => this.render(state))
  }

  private render(state: GameState): void {
    for (const object of this.drawn.splice(0)) {
      object.destroy()
    }

    this.drawProvinces()

    const colorOf = new Map(
      state.factions.map((faction) => [faction.id, toColorNumber(faction.color)]),
    )

    const graphics = this.add.graphics()
    this.drawn.push(graphics)

    for (const site of state.geography.sites) {
      const region = siteRegion(site.id)
      if (region === null) {
        continue
      }

      const ownerColor = site.owner === null ? undefined : colorOf.get(site.owner)

      graphics.fillStyle(ownerColor ?? UNOWNED_COLOR, 1)
      graphics.fillCircle(region.x, region.y, region.radius)
      graphics.lineStyle(1.5, SITE_STROKE_COLOR, 0.45)
      graphics.strokeCircle(region.x, region.y, region.radius)

      const label = this.add
        .text(region.x, region.y + region.radius + SITE_LABEL_OFFSET, site.name, {
          fontFamily: LABEL_FONT,
          fontSize: '13px',
          color: SITE_LABEL_COLOR,
        })
        .setOrigin(0.5, 0)
      this.drawn.push(label)
    }
  }

  private drawProvinces(): void {
    const shapes = provinceShapes()
    const graphics = this.add.graphics()
    this.drawn.push(graphics)

    for (const shape of shapes) {
      const points = shape.points.map((point) => new Phaser.Math.Vector2(point.x, point.y))
      graphics.fillStyle(PROVINCE_FILL_COLOR, 1)
      graphics.fillPoints(points, true)
    }

    for (const shape of shapes) {
      const points = shape.points.map((point) => new Phaser.Math.Vector2(point.x, point.y))
      graphics.lineStyle(1, PROVINCE_STROKE_COLOR, 0.9)
      graphics.strokePoints(points, true)
    }

    for (const shape of shapes) {
      const label = this.add
        .text(shape.label.x, shape.label.y, shape.name, {
          fontFamily: LABEL_FONT,
          fontSize: '18px',
          color: PROVINCE_LABEL_COLOR,
        })
        .setOrigin(0.5)
      this.drawn.push(label)
    }
  }
}
