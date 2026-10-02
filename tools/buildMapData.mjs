// 三国郡级矢量数据生成器
//
// 数据来源：c:\Users\67449\Desktop\古代三国郡级矢量图.zip
//   解压后为 <势力>/<州>/NAME_<郡名>.gpkg，共 148 个 GeoPackage，每包一个郡。
//   解压时需跳过 __MACOSX 与以 "." 开头的条目；.gpkg 源文件本身不入库。
//
// 复现步骤：
//   1. 解压 zip（跳过 __MACOSX 与 "." 开头的条目）到临时目录；
//   2. 运行 node tools/buildMapData.mjs <解压目录> [--out src/game/mapData.ts]
//      <解压目录> 指向包含 曹魏/ 东吴/ 蜀汉/ 的上一级目录；
//   3. 脚本重写 src/game/mapData.ts，并打印陆块占比、各州顶点数、战略点归属与 ASCII 陆地掩膜。
//
// 输出：州的边界来自真实郡级矢量。按数据自身范围加少量余量栅格化出陆地掩膜，
// 只在陆地掩膜及其少量膨胀范围内补全空缺，海面保持无归属，故外缘保留真实海岸线；
// 再抽取边界链、统一抽稀，相邻州因此共用同一批顶点。脚本不依赖 Phaser。
// 运行结束打印陆块占比与 72x36 的 ASCII 陆地掩膜，便于在无图环境下核对轮廓。

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

/** 制图经纬度范围，唯一来源为 src/game/mapBounds.json，与 src/game/mapLayout.ts 共用。 */
const BOUNDS = JSON.parse(
  readFileSync(new URL('../src/game/mapBounds.json', import.meta.url), 'utf8'),
)
const CELL = 0.02
/** Douglas–Peucker 抽稀容差，单位为度。 */
const DP_TOLERANCE_DEG = 0.03
/** 抽稀在格网坐标上进行，容差需换算为格数。 */
const GRID_TOLERANCE = DP_TOLERANCE_DEG / CELL
/** 陆地掩膜向外膨胀的格数，用于闭合相邻郡之间的发丝缝。 */
const DILATE_CELLS = 2
/** 战略点周围强制归入本州的圆盘半径（格）。 */
const SITE_DISC_RADIUS = 4
/** 圆盘与本州不相接时补出的通道半宽（格）。 */
const SITE_CORRIDOR_HALF_WIDTH = 2
/** 抽稀后复核失守时，恢复整链顶点的窗口半径（格）。 */
const SITE_RESTORE_WINDOW = 6
/** 塞外陆地数据源：Natural Earth 1:50m 陆地（公有领域），打包为 TopoJSON。 */
const LAND_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json'
/** 塞外底衬连通块的最小跨度，小于此值的碎块丢弃（度）。 */
const LAND_MIN_COMPONENT_DEG = 0.02
/** 塞外底衬抽稀容差（度）。 */
const LAND_DP_TOLERANCE_DEG = 0.05
/** 与 src/game/mapLayout.ts 一致的投影参数，仅用于战略点落位校验，不参与几何生成。 */
const KM_PER_LATITUDE_DEGREE = 110.57
const KM_PER_LONGITUDE_DEGREE = 111.32 * Math.cos((33 * Math.PI) / 180)
const PIXELS_PER_KILOMETER = 0.5
const PADDING = 32
const SITE_RADIUS = 13
const MIN_SITE_DISTANCE = 2 * SITE_RADIUS

const PROVINCES = [
  { id: 'sili', name: '司隶' },
  { id: 'yong', name: '雍州' },
  { id: 'yu', name: '豫州' },
  { id: 'yan', name: '兖州' },
  { id: 'xu', name: '徐州' },
  { id: 'qing', name: '青州' },
  { id: 'liang', name: '凉州' },
  { id: 'bing', name: '并州' },
  { id: 'ji', name: '冀州' },
  { id: 'you', name: '幽州' },
  { id: 'yang', name: '扬州' },
  { id: 'jing', name: '荆州' },
  { id: 'yi', name: '益州' },
  { id: 'jiao', name: '交州' },
]

const FOLDER_TO_PROVINCE = {
  '曹魏/司州': 'sili',
  '曹魏/雍州': 'yong',
  '曹魏/豫州': 'yu',
  '曹魏/兖州': 'yan',
  '曹魏/徐州': 'xu',
  '曹魏/青州': 'qing',
  '曹魏/凉州': 'liang',
  '曹魏/并州': 'bing',
  '曹魏/冀州': 'ji',
  '曹魏/幽州': 'you',
  '曹魏/扬州': 'yang',
  '东吴/扬州': 'yang',
  '曹魏/荆州': 'jing',
  '东吴/荆州': 'jing',
  '蜀汉/益州': 'yi',
  '东吴/交州': 'jiao',
}

const PROVINCE_INDEX = new Map(PROVINCES.map((province, index) => [province.id, index]))
/** ASCII 陆地掩膜使用的州字母，十四州互不重复。 */
const PROVINCE_LETTERS = ['s', 'o', 'u', 'n', 'x', 'q', 'l', 'b', 'j', 'v', 'g', 'i', 'e', 'c']
const OUTSIDE = -2

// ---------------------------------------------------------------------------
// GeoPackage / WKB 解析
// ---------------------------------------------------------------------------

function parseGeoPackageBlob(blob) {
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes[0] !== 0x47 || bytes[1] !== 0x50) {
    throw new Error('不是有效的 GeoPackage 几何（缺少 GP 魔数）')
  }
  const flags = bytes[3]
  const envelopeIndicator = (flags >> 1) & 0x07
  const envelopeBytes = [0, 32, 48, 48, 64][envelopeIndicator]
  const cursor = { offset: 8 + envelopeBytes }
  const geometry = readWkb(bytes, view, cursor)
  if (geometry.type === 'Polygon') return [geometry.rings]
  return geometry.polygons
}

function readWkb(bytes, view, cursor) {
  let offset = cursor.offset
  const little = bytes[offset] === 1
  offset += 1
  let type = view.getUint32(offset, little)
  offset += 4

  let hasZ = false
  if (type & 0x80000000) {
    hasZ = true
    type &= 0x7fffffff
  }
  type &= 0x1fffffff
  let hasM = false
  if (type >= 3000) {
    type -= 3000
    hasZ = true
    hasM = true
  } else if (type >= 2000) {
    type -= 2000
    hasM = true
  } else if (type >= 1000) {
    type -= 1000
    hasZ = true
  }
  const stride = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0)

  if (type === 3) {
    const rings = []
    const ringCount = view.getUint32(offset, little)
    offset += 4
    for (let r = 0; r < ringCount; r += 1) {
      const pointCount = view.getUint32(offset, little)
      offset += 4
      const ring = new Array(pointCount)
      for (let p = 0; p < pointCount; p += 1) {
        ring[p] = [view.getFloat64(offset, little), view.getFloat64(offset + 8, little)]
        offset += stride * 8
      }
      rings.push(ring)
    }
    cursor.offset = offset
    return { type: 'Polygon', rings }
  }

  if (type === 6) {
    const polygons = []
    const polygonCount = view.getUint32(offset, little)
    offset += 4
    cursor.offset = offset
    for (let i = 0; i < polygonCount; i += 1) {
      const polygon = readWkb(bytes, view, cursor)
      polygons.push(polygon.rings)
    }
    return { type: 'MultiPolygon', polygons }
  }

  throw new Error(`不支持的 WKB 几何类型：${type}`)
}

// ---------------------------------------------------------------------------
// 读取全部郡级要素
// ---------------------------------------------------------------------------

function listGeoPackages(root) {
  const results = []
  for (const faction of readdirSync(root)) {
    const factionPath = join(root, faction)
    if (!statSync(factionPath).isDirectory()) continue
    for (const state of readdirSync(factionPath)) {
      const statePath = join(factionPath, state)
      if (!statSync(statePath).isDirectory()) continue
      for (const file of readdirSync(statePath)) {
        if (!file.endsWith('.gpkg')) continue
        results.push({ folder: `${faction}/${state}`, file, path: join(statePath, file) })
      }
    }
  }
  return results
}

function loadFeatures(root) {
  const features = []
  let vertexCount = 0
  for (const entry of listGeoPackages(root)) {
    const provinceId = FOLDER_TO_PROVINCE[entry.folder]
    if (provinceId === undefined) throw new Error(`未映射的目录：${entry.folder}`)

    const db = new DatabaseSync(entry.path)
    const table = entry.file.replace(/\.gpkg$/, '')
    let row
    try {
      row = db.prepare(`SELECT geom FROM "${table}" LIMIT 1`).get()
    } catch {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((t) => t.name)
        .filter((name) => !name.startsWith('gpkg_') && !name.startsWith('rtree_') && name !== 'sqlite_sequence')
      row = db.prepare(`SELECT geom FROM "${tables[0]}" LIMIT 1`).get()
    }
    db.close()

    const polygons = []
    for (const polygon of parseGeoPackageBlob(row.geom)) {
      const rings = []
      for (const ring of polygon) {
        if (ring.length >= 3) {
          rings.push(ring)
          vertexCount += ring.length
        }
      }
      if (rings.length > 0) polygons.push(rings)
    }

    if (polygons.length > 0) {
      features.push({ provinceIndex: PROVINCE_INDEX.get(provinceId), polygons })
    }
  }
  return { features, vertexCount }
}

// ---------------------------------------------------------------------------
// 栅格化、补齐为完整分区
// ---------------------------------------------------------------------------

function rasterize(features, cols, rows) {
  const labels = new Int8Array(cols * rows).fill(-1)
  const land = new Uint8Array(cols * rows)

  for (const feature of features) {
    const province = feature.provinceIndex
    for (let j = 0; j < rows; j += 1) {
      const yc = BOUNDS.minLat + (j + 0.5) * CELL
      const xs = []
      for (const polygon of feature.polygons) {
        for (const ring of polygon) {
          for (let k = 0; k < ring.length; k += 1) {
            const a = ring[k]
            const b = ring[(k + 1) % ring.length]
            if (a[1] > yc === b[1] > yc) continue
            const t = (yc - a[1]) / (b[1] - a[1])
            xs.push(a[0] + t * (b[0] - a[0]))
          }
        }
      }
      if (xs.length < 2) continue
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const start = Math.ceil((xs[k] - BOUNDS.minLon) / CELL - 0.5)
        const end = Math.floor((xs[k + 1] - BOUNDS.minLon) / CELL - 0.5)
        const i0 = Math.max(0, start)
        const i1 = Math.min(cols - 1, end)
        for (let i = i0; i <= i1; i += 1) {
          const index = j * cols + i
          if (labels[index] === -1 || province < labels[index]) labels[index] = province
          land[index] = 1
        }
      }
    }
  }

  return { labels, land }
}

function collectComponents(cols, rows, labels, p) {
  const visited = new Uint8Array(cols * rows)
  const components = []
  for (let start = 0; start < labels.length; start += 1) {
    if (labels[start] !== p || visited[start]) continue
    const cells = []
    const queue = [start]
    visited[start] = 1
    let head = 0
    while (head < queue.length) {
      const index = queue[head++]
      cells.push(index)
      const i = index % cols
      const j = (index - i) / cols
      if (i > 0 && labels[index - 1] === p && !visited[index - 1]) {
        visited[index - 1] = 1
        queue.push(index - 1)
      }
      if (i < cols - 1 && labels[index + 1] === p && !visited[index + 1]) {
        visited[index + 1] = 1
        queue.push(index + 1)
      }
      if (j > 0 && labels[index - cols] === p && !visited[index - cols]) {
        visited[index - cols] = 1
        queue.push(index - cols)
      }
      if (j < rows - 1 && labels[index + cols] === p && !visited[index + cols]) {
        visited[index + cols] = 1
        queue.push(index + cols)
      }
    }
    components.push(cells)
  }
  return components
}

/** 将孤立的小分量并入相邻州，保证每个州都是一块连通区域。 */
function removeSmallComponents(cols, rows, labels) {
  const MAX_NOISE = 4
  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false
    for (let p = 0; p < PROVINCES.length; p += 1) {
      const components = collectComponents(cols, rows, labels, p)
      components.sort((a, b) => b.length - a.length)
      for (let c = 1; c < components.length; c += 1) {
        if (components[c].length > MAX_NOISE) {
          throw new Error(`州 ${PROVINCES[p].id} 存在大小为 ${components[c].length} 的分离分量`)
        }
        for (const index of components[c]) {
          const i = index % cols
          const j = (index - i) / cols
          const tally = new Map()
          const neighbors = []
          if (i > 0) neighbors.push(index - 1)
          if (i < cols - 1) neighbors.push(index + 1)
          if (j > 0) neighbors.push(index - cols)
          if (j < rows - 1) neighbors.push(index + cols)
          for (const n of neighbors) {
            const label = labels[n]
            if (label < 0 || label === p) continue
            tally.set(label, (tally.get(label) ?? 0) + 1)
          }
          let best = -1
          let bestCount = -1
          for (const [label, count] of tally) {
            if (count > bestCount || (count === bestCount && label < best)) {
              best = label
              bestCount = count
            }
          }
          labels[index] = best
          changed = true
        }
      }
    }
    if (!changed) break
  }
}

/** 保留陆地掩膜中最大的四连通分量，丢弃离岸岛屿，保证每个州只有一块连通陆地。 */
function keepLargestLand(cols, rows, labels, land) {
  const seen = new Uint8Array(cols * rows)
  let best = null
  for (let start = 0; start < land.length; start += 1) {
    if (land[start] !== 1 || seen[start]) continue
    const cells = []
    const queue = [start]
    seen[start] = 1
    let head = 0
    while (head < queue.length) {
      const index = queue[head++]
      cells.push(index)
      const i = index % cols
      const j = (index - i) / cols
      if (i > 0 && land[index - 1] === 1 && !seen[index - 1]) {
        seen[index - 1] = 1
        queue.push(index - 1)
      }
      if (i < cols - 1 && land[index + 1] === 1 && !seen[index + 1]) {
        seen[index + 1] = 1
        queue.push(index + 1)
      }
      if (j > 0 && land[index - cols] === 1 && !seen[index - cols]) {
        seen[index - cols] = 1
        queue.push(index - cols)
      }
      if (j < rows - 1 && land[index + cols] === 1 && !seen[index + cols]) {
        seen[index + cols] = 1
        queue.push(index + cols)
      }
    }
    if (best === null || cells.length > best.length) best = cells
  }
  land.fill(0)
  for (const index of best ?? []) land[index] = 1
  for (let index = 0; index < labels.length; index += 1) {
    if (land[index] !== 1) labels[index] = -1
  }
}

/** 将掩膜向外膨胀 radius 格（切比雪夫距离）。 */
function dilateMask(cols, rows, mask, radius) {
  const out = new Uint8Array(cols * rows)
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      if (mask[j * cols + i] !== 1) continue
      const j0 = Math.max(0, j - radius)
      const j1 = Math.min(rows - 1, j + radius)
      const i0 = Math.max(0, i - radius)
      const i1 = Math.min(cols - 1, i + radius)
      for (let jj = j0; jj <= j1; jj += 1) {
        for (let ii = i0; ii <= i1; ii += 1) out[jj * cols + ii] = 1
      }
    }
  }
  return out
}

/** 只在陆地掩膜膨胀范围内补全空缺，海面保持无归属。 */
function fillUnassigned(cols, rows, labels, allowed) {
  const queue = new Int32Array(cols * rows)
  let head = 0
  let tail = 0
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] !== -1) queue[tail++] = index
  }
  while (head < tail) {
    const index = queue[head++]
    const label = labels[index]
    const i = index % cols
    const j = (index - i) / cols
    if (i > 0 && labels[index - 1] === -1 && allowed[index - 1] === 1) {
      labels[index - 1] = label
      queue[tail++] = index - 1
    }
    if (i < cols - 1 && labels[index + 1] === -1 && allowed[index + 1] === 1) {
      labels[index + 1] = label
      queue[tail++] = index + 1
    }
    if (j > 0 && labels[index - cols] === -1 && allowed[index - cols] === 1) {
      labels[index - cols] = label
      queue[tail++] = index - cols
    }
    if (j < rows - 1 && labels[index + cols] === -1 && allowed[index + cols] === 1) {
      labels[index + cols] = label
      queue[tail++] = index + cols
    }
  }
}

/** 填平不与图外海面相通的封闭水域，避免州界出现内环（孔洞）。 */
function fillEnclosedSea(cols, rows, labels) {
  const reachable = new Uint8Array(cols * rows)
  const queue = new Int32Array(cols * rows)
  let head = 0
  let tail = 0
  const push = (index) => {
    if (labels[index] === -1 && reachable[index] === 0) {
      reachable[index] = 1
      queue[tail++] = index
    }
  }
  for (let i = 0; i < cols; i += 1) {
    push(i)
    push((rows - 1) * cols + i)
  }
  for (let j = 0; j < rows; j += 1) {
    push(j * cols)
    push(j * cols + cols - 1)
  }
  while (head < tail) {
    const index = queue[head++]
    const i = index % cols
    const j = (index - i) / cols
    if (i > 0) push(index - 1)
    if (i < cols - 1) push(index + 1)
    if (j > 0) push(index - cols)
    if (j < rows - 1) push(index + cols)
  }
  const enclosed = new Uint8Array(cols * rows)
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] === -1 && reachable[index] === 0) enclosed[index] = 1
  }
  fillUnassigned(cols, rows, labels, enclosed)
}

// ---------------------------------------------------------------------------
// 战略点强制归属
// ---------------------------------------------------------------------------

/**
 * 让分区尊重史实归属：在战略点真实坐标周围强制一小片本州格网。
 * 若该片与本州已有陆地不相接，则沿格网补一条窄通道接回本州，
 * 使本州成为包含该点的单一连通区域，再统一抽稀。
 */
function forceSiteProvinces(cols, rows, labels, sites, discRadius, corridorHalfWidth) {
  const inBounds = (i, j) => i >= 0 && i < cols && j >= 0 && j < rows
  const forced = []
  for (const site of sites) {
    const ci = Math.floor((site.lon - BOUNDS.minLon) / CELL)
    const cj = Math.floor((site.lat - BOUNDS.minLat) / CELL)
    if (!inBounds(ci, cj)) throw new Error(`战略点 ${site.id} 落在图幅之外`)

    let touches = false
    for (let j = cj - discRadius; j <= cj + discRadius && !touches; j += 1) {
      for (let i = ci - discRadius; i <= ci + discRadius; i += 1) {
        if (!inBounds(i, j)) continue
        if (Math.hypot(i - ci, j - cj) > discRadius) continue
        if (labels[j * cols + i] === site.provinceIndex) {
          touches = true
          break
        }
      }
    }
    if (!touches) carveCorridor(cols, rows, labels, ci, cj, site.provinceIndex, corridorHalfWidth)

    for (let j = cj - discRadius; j <= cj + discRadius; j += 1) {
      for (let i = ci - discRadius; i <= ci + discRadius; i += 1) {
        if (!inBounds(i, j)) continue
        if (Math.hypot(i - ci, j - cj) <= discRadius) labels[j * cols + i] = site.provinceIndex
      }
    }
    forced.push(site.id)
  }
  return forced
}

/** 从本州已有陆地出发，沿陆地格网找最短路径，加宽后并入本州。 */
function carveCorridor(cols, rows, labels, ci, cj, provinceIndex, halfWidth) {
  const parent = new Int32Array(cols * rows).fill(-1)
  const isSource = new Uint8Array(cols * rows)
  const queue = new Int32Array(cols * rows)
  let head = 0
  let tail = 0
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] !== provinceIndex) continue
    parent[index] = index
    isSource[index] = 1
    queue[tail++] = index
  }
  const target = cj * cols + ci
  let found = false
  while (head < tail) {
    const index = queue[head++]
    if (index === target) {
      found = true
      break
    }
    const i = index % cols
    const j = (index - i) / cols
    const neighbors = []
    if (i > 0) neighbors.push(index - 1)
    if (i < cols - 1) neighbors.push(index + 1)
    if (j > 0) neighbors.push(index - cols)
    if (j < rows - 1) neighbors.push(index + cols)
    for (const next of neighbors) {
      if (parent[next] !== -1 || labels[next] < 0) continue
      parent[next] = index
      queue[tail++] = next
    }
  }
  if (!found) throw new Error(`战略点 (${ci},${cj}) 无法与 ${PROVINCES[provinceIndex].id} 连通`)

  let index = target
  for (;;) {
    const i = index % cols
    const j = (index - i) / cols
    for (let jj = j - halfWidth; jj <= j + halfWidth; jj += 1) {
      for (let ii = i - halfWidth; ii <= i + halfWidth; ii += 1) {
        if (ii < 0 || ii >= cols || jj < 0 || jj >= rows) continue
        labels[jj * cols + ii] = provinceIndex
      }
    }
    if (isSource[index] === 1) break
    index = parent[index]
  }
}

// ---------------------------------------------------------------------------
// 边界链提取
// ---------------------------------------------------------------------------

function buildChains(cols, rows, labels) {
  const vertexId = (i, j) => j * (cols + 1) + i
  const edges = new Map()
  const adjacency = new Map()

  const addEdge = (u, v, a, b) => {
    const key = u < v ? `${u}_${v}` : `${v}_${u}`
    if (edges.has(key)) return
    edges.set(key, { u, v })
    if (!adjacency.has(u)) adjacency.set(u, [])
    if (!adjacency.has(v)) adjacency.set(v, [])
    adjacency.get(u).push(key)
    adjacency.get(v).push(key)
  }

  const at = (i, j) => labels[j * cols + i]
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const label = at(i, j)
      const east = i + 1 < cols ? at(i + 1, j) : OUTSIDE
      if (east !== label) addEdge(vertexId(i + 1, j), vertexId(i + 1, j + 1), label, east)
      const north = j + 1 < rows ? at(i, j + 1) : OUTSIDE
      if (north !== label) addEdge(vertexId(i, j + 1), vertexId(i + 1, j + 1), label, north)
      if (i === 0) addEdge(vertexId(0, j), vertexId(0, j + 1), label, OUTSIDE)
      if (j === 0) addEdge(vertexId(i, 0), vertexId(i + 1, 0), label, OUTSIDE)
    }
  }

  const isJunction = (vertex) => {
    const list = adjacency.get(vertex)
    if (!list || list.length !== 2) return true
    const a = edges.get(list[0])
    const b = edges.get(list[1])
    return edgePair(labels, cols, rows, a) !== edgePair(labels, cols, rows, b)
  }

  const other = (key, vertex) => {
    const edge = edges.get(key)
    return edge.u === vertex ? edge.v : edge.u
  }

  const used = new Set()
  const chains = []
  const chainOfEdge = new Map()

  for (const key of edges.keys()) {
    if (used.has(key)) continue
    const edge = edges.get(key)
    used.add(key)
    const path = [edge.u, edge.v]

    let current = edge.v
    let previousKey = key
    while (!isJunction(current)) {
      const list = adjacency.get(current)
      const nextKey = list[0] === previousKey ? list[1] : list[0]
      if (nextKey === undefined || used.has(nextKey)) break
      used.add(nextKey)
      current = other(nextKey, current)
      path.push(current)
      previousKey = nextKey
    }

    current = edge.u
    previousKey = key
    while (!isJunction(current)) {
      const list = adjacency.get(current)
      const nextKey = list[0] === previousKey ? list[1] : list[0]
      if (nextKey === undefined || used.has(nextKey)) break
      used.add(nextKey)
      current = other(nextKey, current)
      path.unshift(current)
      previousKey = nextKey
    }

    const chainId = chains.length
    for (let k = 0; k + 1 < path.length; k += 1) {
      const a = path[k]
      const b = path[k + 1]
      chainOfEdge.set(a < b ? `${a}_${b}` : `${b}_${a}`, chainId)
    }
    chains.push({ vertices: path, closed: path[0] === path[path.length - 1] })
  }

  return { chains, chainOfEdge }
}

function edgePair(labels, cols, rows, edge) {
  const ia = edge.u % (cols + 1)
  const ja = (edge.u - ia) / (cols + 1)
  const ib = edge.v % (cols + 1)
  const jb = (edge.v - ib) / (cols + 1)
  let p
  let q
  if (ja === jb) {
    const row = ja
    const col = Math.min(ia, ib)
    p = row < rows ? labels[row * cols + col] : OUTSIDE
    q = row - 1 >= 0 ? labels[(row - 1) * cols + col] : OUTSIDE
  } else {
    const col = ia
    const row = Math.min(ja, jb)
    p = col < cols ? labels[row * cols + col] : OUTSIDE
    q = col - 1 >= 0 ? labels[row * cols + col - 1] : OUTSIDE
  }
  return p < q ? `${p}|${q}` : `${q}|${p}`
}

// ---------------------------------------------------------------------------
// Douglas–Peucker 简化
// ---------------------------------------------------------------------------

function perpendicularDistance(point, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(point[0] - a[0], point[1] - a[1])
  let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy))
}

function simplify(points, tolerance) {
  const n = points.length
  if (n < 3) return points.slice()
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const stack = [[0, n - 1]]
  while (stack.length > 0) {
    const [a, b] = stack.pop()
    let maxDistance = -1
    let index = -1
    for (let k = a + 1; k < b; k += 1) {
      const distance = perpendicularDistance(points[k], points[a], points[b])
      if (distance > maxDistance) {
        maxDistance = distance
        index = k
      }
    }
    if (maxDistance > tolerance && index !== -1) {
      keep[index] = 1
      stack.push([a, index], [index, b])
    }
  }
  return points.filter((_, i) => keep[i] === 1)
}

/** 对闭环抽稀：以距起点最远的点为界拆成两段，各段端点固定。 */
function simplifyClosed(points, tolerance) {
  const open = points.slice(0, points.length - 1)
  if (open.length < 4) return points.slice()
  let farthest = 0
  let best = -1
  for (let i = 1; i < open.length; i += 1) {
    const distance = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1])
    if (distance > best) {
      best = distance
      farthest = i
    }
  }
  const firstHalf = simplify(open.slice(0, farthest + 1), tolerance)
  const secondHalf = simplify(open.slice(farthest), tolerance)
  return firstHalf.concat(secondHalf.slice(1), [firstHalf[0]])
}

// ---------------------------------------------------------------------------
// 州环组装
// ---------------------------------------------------------------------------

/**
 * 按统一容差对每条链抽稀，返回链序号到简化点列的映射。
 * 相邻州引用同一条链，因此简化结果天然一致。
 */
function simplifyChains(cols, chains, tolerance) {
  const vertexIJ = (id) => {
    const i = id % (cols + 1)
    return [i, (id - i) / (cols + 1)]
  }
  return new Map(
    chains.map((chain, index) => [
      index,
      chain.closed
        ? simplifyClosed(chain.vertices.map(vertexIJ), tolerance)
        : simplify(chain.vertices.map(vertexIJ), tolerance),
    ]),
  )
}

/**
 * 抽稀后若战略点落到本州之外，把该点附近窗口内的链恢复为未抽稀顶点。
 * 只做局部恢复，不提高全局容差；链为相邻州共用，恢复后接缝仍完全一致。
 */
function restoreChainsNearSites(cols, chains, simplifiedById, targets, windowCells) {
  const vertexIJ = (id) => {
    const i = id % (cols + 1)
    return [i, (id - i) / (cols + 1)]
  }
  const restored = []
  for (let index = 0; index < chains.length; index += 1) {
    const chain = chains[index]
    if (simplifiedById.get(index).length >= chain.vertices.length) continue
    let near = false
    for (const target of targets) {
      for (const id of chain.vertices) {
        const [i, j] = vertexIJ(id)
        if (Math.abs(i - target.ci) <= windowCells && Math.abs(j - target.cj) <= windowCells) {
          near = true
          break
        }
      }
      if (near) break
    }
    if (near) {
      simplifiedById.set(index, chain.vertices.map(vertexIJ))
      restored.push(index)
    }
  }
  return restored
}

function buildRings(cols, rows, labels, chains, chainOfEdge, simplifiedById) {
  const vertexId = (i, j) => j * (cols + 1) + i
  const vertexIJ = (id) => {
    const i = id % (cols + 1)
    return [i, (id - i) / (cols + 1)]
  }
  // 每个州，按方向码记录有向边界边。
  const outgoing = new Map()
  for (let p = 0; p < PROVINCES.length; p += 1) outgoing.set(p, new Map())

  const addDirected = (p, from, to) => {
    const [fi, fj] = vertexIJ(from)
    const [ti, tj] = vertexIJ(to)
    const di = ti - fi
    const dj = tj - fj
    const dir = di === 1 ? 0 : di === -1 ? 2 : dj === 1 ? 1 : 3
    const map = outgoing.get(p)
    if (!map.has(from)) map.set(from, [])
    map.get(from).push({ to, dir })
  }

  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const label = labels[j * cols + i]
      const east = i + 1 < cols ? labels[j * cols + i + 1] : OUTSIDE
      if (east !== label) {
        const u = vertexId(i + 1, j)
        const v = vertexId(i + 1, j + 1)
        if (east === label) continue
        if (label >= 0) addDirected(label, u, v)
        if (east >= 0) addDirected(east, v, u)
      }
      const north = j + 1 < rows ? labels[(j + 1) * cols + i] : OUTSIDE
      if (north !== label) {
        const u = vertexId(i, j + 1)
        const v = vertexId(i + 1, j + 1)
        if (north >= 0) addDirected(north, u, v)
        if (label >= 0) addDirected(label, v, u)
      }
      if (i === 0 && label >= 0) addDirected(label, vertexId(0, j + 1), vertexId(0, j))
      if (j === 0 && label >= 0) addDirected(label, vertexId(i, 0), vertexId(i + 1, 0))
    }
  }

  const ringsByProvince = []
  for (let p = 0; p < PROVINCES.length; p += 1) {
    const map = outgoing.get(p)
    const usedDirected = new Set()
    const rings = []
    for (const startVertex of map.keys()) {
      for (const startEdge of map.get(startVertex)) {
        const startKey = `${startVertex}_${startEdge.to}`
        if (usedDirected.has(startKey)) continue
        const ring = [startVertex]
        let from = startVertex
        let current = startEdge
        usedDirected.add(startKey)
        for (;;) {
          ring.push(current.to)
          if (current.to === startVertex) break
          const list = map.get(current.to)
          if (!list) break
          const reverse = (current.dir + 2) % 4
          let picked = null
          for (let k = 1; k <= 3; k += 1) {
            const candidate = (reverse - k + 4) % 4
            const found = list.find((e) => e.dir === candidate && !usedDirected.has(`${current.to}_${e.to}`))
            if (found) {
              picked = found
              break
            }
          }
          if (!picked) break
          usedDirected.add(`${current.to}_${picked.to}`)
          from = current.to
          current = picked
        }
        rings.push(ring)
      }
    }
    ringsByProvince.push(rings)
  }

  // 将网格环替换为抽稀后的链坐标。
  const chainsById = new Map(chains.map((chain, index) => [index, chain]))

  const junctionSet = new Set()
  for (const chain of chains) {
    junctionSet.add(chain.vertices[0])
    junctionSet.add(chain.vertices[chain.vertices.length - 1])
  }

  const provinceRings = []
  for (let p = 0; p < PROVINCES.length; p += 1) {
    const rings = ringsByProvince[p]
    if (rings.length !== 1) {
      throw new Error(`州 ${PROVINCES[p].id} 得到 ${rings.length} 个环，需要人工处理`)
    }
    const raw = rings[0]
    const closed = raw[raw.length - 1] === raw[0]
    const open = closed ? raw.slice(0, raw.length - 1) : raw
    let start = 0
    if (closed) {
      for (let index = 0; index < open.length; index += 1) {
        if (junctionSet.has(open[index])) {
          start = index
          break
        }
      }
    }
    const gridRing = start > 0 ? open.slice(start).concat(open.slice(0, start)) : open
    const n = gridRing.length
    const result = []
    let k = 0
    while (k < n) {
      const a = gridRing[k]
      const b = gridRing[(k + 1) % n]
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      const chainId = chainOfEdge.get(key)
      const chain = chainsById.get(chainId)
      if (!chain) {
        throw new Error(`州 ${PROVINCES[p].id} 环边 ${key} 无对应链（k=${k}, n=${n}）`)
      }
      const stepEdges = chain.vertices.length - 1
      const nextKey =
        gridRing[(k + stepEdges) % n] < gridRing[(k + stepEdges + 1) % n]
          ? `${gridRing[(k + stepEdges) % n]}_${gridRing[(k + stepEdges + 1) % n]}`
          : `${gridRing[(k + stepEdges + 1) % n]}_${gridRing[(k + stepEdges) % n]}`
      if (chainOfEdge.get(nextKey) === chainId) {
        throw new Error(`州 ${PROVINCES[p].id} 链${chainId} 未按整链跨越（k=${k}）`)
      }
      let points = simplifiedById.get(chainId)
      if (gridRing[k] !== chain.vertices[0]) points = points.slice().reverse()
      for (let t = 0; t + 1 < points.length; t += 1) result.push(points[t])
      k += stepEdges
    }
    provinceRings.push(result)
  }

  return { provinceRings, vertexIJ }
}

// ---------------------------------------------------------------------------
// 州名锚点
// ---------------------------------------------------------------------------

function computeLabels(cols, rows, labels, provinceRings, vertexIJ) {
  // 距离变换：从边界格子做多源 BFS，depth 越大越靠内。
  const depth = new Int32Array(cols * rows).fill(-1)
  const queue = new Int32Array(cols * rows)
  let head = 0
  let tail = 0
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const index = j * cols + i
      const label = labels[index]
      const edge =
        i === 0 ||
        j === 0 ||
        i === cols - 1 ||
        j === rows - 1 ||
        labels[index - 1] !== label ||
        labels[index + 1] !== label ||
        labels[index - cols] !== label ||
        labels[index + cols] !== label
      if (edge) {
        depth[index] = 0
        queue[tail++] = index
      }
    }
  }
  while (head < tail) {
    const index = queue[head++]
    const i = index % cols
    const j = (index - i) / cols
    const next = depth[index] + 1
    if (i > 0 && depth[index - 1] === -1) {
      depth[index - 1] = next
      queue[tail++] = index - 1
    }
    if (i < cols - 1 && depth[index + 1] === -1) {
      depth[index + 1] = next
      queue[tail++] = index + 1
    }
    if (j > 0 && depth[index - cols] === -1) {
      depth[index - cols] = next
      queue[tail++] = index - cols
    }
    if (j < rows - 1 && depth[index + cols] === -1) {
      depth[index + cols] = next
      queue[tail++] = index + cols
    }
  }

  const cellCenter = (index) => {
    const i = index % cols
    const j = (index - i) / cols
    return [BOUNDS.minLon + (i + 0.5) * CELL, BOUNDS.minLat + (j + 0.5) * CELL]
  }

  const result = []
  for (let p = 0; p < PROVINCES.length; p += 1) {
    let sumI = 0
    let sumJ = 0
    let count = 0
    const cells = []
    for (let index = 0; index < labels.length; index += 1) {
      if (labels[index] === p) {
        const i = index % cols
        const j = (index - i) / cols
        sumI += i
        sumJ += j
        count += 1
        cells.push(index)
      }
    }
    const centroidI = sumI / count
    const centroidJ = sumJ / count
    let primary = cells[0]
    let primaryScore = Infinity
    let fallback = cells[0]
    let fallbackDepth = -1
    for (const index of cells) {
      const i = index % cols
      const j = (index - i) / cols
      const score = Math.hypot(i - centroidI, j - centroidJ)
      if (score < primaryScore) {
        primaryScore = score
        primary = index
      }
      if (depth[index] > fallbackDepth) {
        fallbackDepth = depth[index]
        fallback = index
      }
    }

    const ringPoints = provinceRings[p].map(([i, j]) => [
      BOUNDS.minLon + i * CELL,
      BOUNDS.minLat + j * CELL,
    ])
    const primaryPoint = cellCenter(primary)
    const point = pointInPolygon(primaryPoint, ringPoints) ? primaryPoint : cellCenter(fallback)
    result.push(point)
  }
  return result
}

function pointInPolygon(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses = a[1] > point[1] !== b[1] > point[1]
    const xAt = ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    if (crosses && point[0] < xAt) inside = !inside
  }
  return inside
}

// ---------------------------------------------------------------------------
// 塞外陆地（Natural Earth，公有领域）
// ---------------------------------------------------------------------------

/** 解码 TopoJSON：先做增量还原，再套用 transform 得到经纬度。 */
function decodeTopologyArcs(topology) {
  const { scale, translate } = topology.transform
  return topology.arcs.map((arc) => {
    let x = 0
    let y = 0
    return arc.map((delta) => {
      x += delta[0]
      y += delta[1]
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]]
    })
  })
}

/** 把一串 arc 索引拼接成一个环，负索引表示反向。 */
function ringFromArcs(arcs, arcIndexes) {
  const ring = []
  for (const index of arcIndexes) {
    const arc = index >= 0 ? arcs[index] : arcs[~index].slice().reverse()
    for (let i = ring.length === 0 ? 0 : 1; i < arc.length; i += 1) ring.push(arc[i])
  }
  return ring
}

/** 获取 Natural Earth 陆地的全部环（经纬度），不做裁剪。 */
async function fetchLandRings() {
  let response
  try {
    response = await fetch(LAND_URL)
  } catch (error) {
    throw new Error(`无法获取 Natural Earth 陆地数据（${LAND_URL}）：${error.message}`)
  }
  if (!response.ok) {
    throw new Error(`无法获取 Natural Earth 陆地数据（${LAND_URL}）：HTTP ${response.status}`)
  }
  const topology = await response.json()
  const arcs = decodeTopologyArcs(topology)
  const geometries =
    topology.objects.land.type === 'GeometryCollection'
      ? topology.objects.land.geometries
      : [topology.objects.land]

  const rings = []
  for (const geometry of geometries) {
    const polygons = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs
    for (const polygon of polygons) {
      for (const arcIndexes of polygon) {
        const ring = ringFromArcs(arcs, arcIndexes)
        if (ring.length >= 3) rings.push(ring)
      }
    }
  }
  return rings
}

/** 按与十四州完全相同的格网（同原点、同格距、同尺寸）把环填充为布尔掩膜。 */
function rasterizeRings(rings, cols, rows) {
  const mask = new Uint8Array(cols * rows)
  for (let j = 0; j < rows; j += 1) {
    const yc = BOUNDS.minLat + (j + 0.5) * CELL
    const xs = []
    for (const ring of rings) {
      for (let k = 0; k < ring.length; k += 1) {
        const a = ring[k]
        const b = ring[(k + 1) % ring.length]
        if ((a[1] > yc) === (b[1] > yc)) continue
        const t = (yc - a[1]) / (b[1] - a[1])
        xs.push(a[0] + t * (b[0] - a[0]))
      }
    }
    if (xs.length < 2) continue
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const start = Math.ceil((xs[k] - BOUNDS.minLon) / CELL - 0.5)
      const end = Math.floor((xs[k + 1] - BOUNDS.minLon) / CELL - 0.5)
      const i0 = Math.max(0, start)
      const i1 = Math.min(cols - 1, end)
      for (let i = i0; i <= i1; i += 1) mask[j * cols + i] = 1
    }
  }
  return mask
}

/** 标记掩膜的四连通分量，返回分量编号。 */
function labelMaskComponents(cols, rows, mask) {
  const comp = new Int32Array(cols * rows).fill(-1)
  const queue = new Int32Array(cols * rows)
  let count = 0
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1 || comp[start] !== -1) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    comp[start] = count
    while (head < tail) {
      const index = queue[head++]
      const i = index % cols
      const j = (index - i) / cols
      if (i > 0 && mask[index - 1] === 1 && comp[index - 1] === -1) {
        comp[index - 1] = count
        queue[tail++] = index - 1
      }
      if (i < cols - 1 && mask[index + 1] === 1 && comp[index + 1] === -1) {
        comp[index + 1] = count
        queue[tail++] = index + 1
      }
      if (j > 0 && mask[index - cols] === 1 && comp[index - cols] === -1) {
        comp[index - cols] = count
        queue[tail++] = index - cols
      }
      if (j < rows - 1 && mask[index + cols] === 1 && comp[index + cols] === -1) {
        comp[index + cols] = count
        queue[tail++] = index + cols
      }
    }
    count += 1
  }
  return comp
}

/** 环（顶点 id）的有向面积，用于在多个环中挑出外轮廓。 */
function ringSignedArea(ring, stride) {
  let sum = 0
  for (let k = 0; k + 1 < ring.length; k += 1) {
    const a = ring[k]
    const b = ring[k + 1]
    const ai = a % stride
    const aj = (a - ai) / stride
    const bi = b % stride
    const bj = (b - bi) / stride
    sum += ai * bj - bi * aj
  }
  return sum / 2
}

/**
 * 沿格边追踪每个四连通分量的外轮廓，每个分量只取面积最大的一条环。
 * 有向边始终让填充格位于行进方向右侧，因此连通块内出现的孔洞会形成独立的内环，被外轮廓淘汰。
 */
function traceMaskContours(cols, rows, mask) {
  const comp = labelMaskComponents(cols, rows, mask)
  const vertexId = (i, j) => j * (cols + 1) + i
  const perComponent = new Map()
  const boundsOf = new Map()
  const addEdge = (component, from, dir, to) => {
    let map = perComponent.get(component)
    if (!map) {
      map = new Map()
      perComponent.set(component, map)
    }
    if (!map.has(from)) map.set(from, [])
    map.get(from).push({ to, dir })
  }

  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const index = j * cols + i
      if (mask[index] !== 1) continue
      const component = comp[index]
      const west = i > 0 && mask[index - 1] === 1
      const east = i < cols - 1 && mask[index + 1] === 1
      const south = j > 0 && mask[index - cols] === 1
      const north = j < rows - 1 && mask[index + cols] === 1
      if (!west) addEdge(component, vertexId(i, j), 1, vertexId(i, j + 1))
      if (!east) addEdge(component, vertexId(i + 1, j + 1), 3, vertexId(i + 1, j))
      if (!south) addEdge(component, vertexId(i + 1, j), 2, vertexId(i, j))
      if (!north) addEdge(component, vertexId(i, j + 1), 0, vertexId(i + 1, j + 1))
      let bounds = boundsOf.get(component)
      if (!bounds) {
        bounds = { minI: i, maxI: i, minJ: j, maxJ: j }
        boundsOf.set(component, bounds)
      } else {
        if (i < bounds.minI) bounds.minI = i
        if (i > bounds.maxI) bounds.maxI = i
        if (j < bounds.minJ) bounds.minJ = j
        if (j > bounds.maxJ) bounds.maxJ = j
      }
    }
  }

  const contours = []
  for (const [component, map] of perComponent) {
    const used = new Set()
    let outer = null
    let outerArea = -1
    for (const [from, list] of map) {
      for (const edge of list) {
        const key = `${from}>${edge.to}`
        if (used.has(key)) continue
        used.add(key)
        const ring = [from]
        let current = edge
        for (;;) {
          ring.push(current.to)
          if (current.to === from) break
          const candidates = map.get(current.to)
          if (!candidates) break
          const order = [(current.dir + 3) % 4, current.dir, (current.dir + 1) % 4, (current.dir + 2) % 4]
          let picked = null
          for (const dir of order) {
            picked = candidates.find((e) => e.dir === dir && !used.has(`${current.to}>${e.to}`))
            if (picked) break
          }
          if (!picked) break
          used.add(`${current.to}>${picked.to}`)
          current = picked
        }
        if (current.to !== from) continue
        const area = Math.abs(ringSignedArea(ring, cols + 1))
        if (area > outerArea) {
          outerArea = area
          outer = ring
        }
      }
    }
    if (outer) contours.push({ ring: outer, bounds: boundsOf.get(component) })
  }
  return contours
}

/**
 * 塞外底衬：把 Natural Earth 陆地栅格化到同一格网，扣除膨胀后的十四州陆地，
 * 再按连通块抽取外轮廓并抽稀。仅作底衬，不参与十四州分区。
 */
async function buildLandOutlines(cols, rows, labels) {
  const landRings = await fetchLandRings()
  const landMask = rasterizeRings(landRings, cols, rows)
  const provinceMask = new Uint8Array(cols * rows)
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] >= 0) provinceMask[index] = 1
  }
  const dilatedProvince = dilateMask(cols, rows, provinceMask, DILATE_CELLS)
  const backdropMask = new Uint8Array(cols * rows)
  let backdropCells = 0
  for (let index = 0; index < backdropMask.length; index += 1) {
    if (landMask[index] === 1 && dilatedProvince[index] !== 1) {
      backdropMask[index] = 1
      backdropCells += 1
    }
  }

  const stride = cols + 1
  const contours = traceMaskContours(cols, rows, backdropMask)
  const rings = []
  for (const { ring, bounds } of contours) {
    const spanCells = Math.max(bounds.maxI - bounds.minI, bounds.maxJ - bounds.minJ)
    if (spanCells * CELL < LAND_MIN_COMPONENT_DEG) continue
    const coordinates = ring.map((id) => {
      const i = id % stride
      const j = (id - i) / stride
      return [BOUNDS.minLon + i * CELL, BOUNDS.minLat + j * CELL]
    })
    const simplified = simplifyClosed(coordinates, LAND_DP_TOLERANCE_DEG)
    if (simplified.length >= 4) rings.push(simplified)
  }
  return { rings, backdropCells }
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

function round(value) {
  return Math.round(value * 1e6) / 1e6
}

function extractBlock(source, name) {
  const declStart = source.indexOf(`export const ${name}`)
  if (declStart === -1) throw new Error(`找不到 ${name}`)
  let start = declStart
  const commentStart = source.lastIndexOf('/**', declStart)
  if (commentStart !== -1 && /^\/\*\*[\s\S]*\*\/\s*$/.test(source.slice(commentStart, declStart))) {
    start = commentStart
  }
  const end = source.indexOf('\n}', declStart)
  if (end === -1) throw new Error(`找不到 ${name} 的结束`)
  return source.slice(start, end + 2)
}

function evaluateSiteCoordinates(block) {
  const text = block.slice(block.indexOf('=') + 1).trim()
  const object = text.slice(0, text.lastIndexOf('}') + 1)
  return new Function(`return ${object}`)()
}

function assignSites(siteCoordinates, cols, rows, labels) {
  const assignments = {}
  for (const [site, [lon, lat]] of Object.entries(siteCoordinates)) {
    const i = Math.floor((lon - BOUNDS.minLon) / CELL)
    const j = Math.floor((lat - BOUNDS.minLat) / CELL)
    if (i < 0 || i >= cols || j < 0 || j >= rows) {
      assignments[site] = null
      continue
    }
    const label = labels[j * cols + i]
    assignments[site] = label >= 0 ? PROVINCES[label].id : null
  }
  return assignments
}

// ---------------------------------------------------------------------------
// 投影与战略点落位校验
// ---------------------------------------------------------------------------

/** 与 src/game/mapLayout.ts 相同的投影，用于复核战略点是否落在抽稀后的州界内。 */
function projectPoint(lon, lat) {
  return {
    x: PADDING + (lon - BOUNDS.minLon) * KM_PER_LONGITUDE_DEGREE * PIXELS_PER_KILOMETER,
    y: PADDING + (BOUNDS.maxLat - lat) * KM_PER_LATITUDE_DEGREE * PIXELS_PER_KILOMETER,
  }
}

/** 射线法：点是否落在投影后的环内。 */
function isInsidePoint(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses = a.y > point.y !== b.y > point.y
    const xAt = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses && point.x < xAt) inside = !inside
  }
  return inside
}

/** 射线法：经纬度点是否落在原始环内。 */
function isInsideRing(point, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i]
    const b = ring[j]
    const crosses = a[1] > point[1] !== b[1] > point[1]
    const xAt = ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    if (crosses && point[0] < xAt) inside = !inside
  }
  return inside
}

/** 原始郡级多边形（含孔洞）是否包含经纬度点。 */
function featureContains(feature, point) {
  return feature.polygons.some((polygon) => {
    let inside = false
    for (const ring of polygon) {
      if (isInsideRing(point, ring)) inside = !inside
    }
    return inside
  })
}

/** 打印 72x36 的 ASCII 陆地掩膜，海洋格为 '.'，图幅上方为北。 */
function renderAscii(cols, rows, labels, cellCols = 72, cellRows = 36) {
  const lines = []
  for (let row = 0; row < cellRows; row += 1) {
    const r = cellRows - 1 - row
    let line = ''
    const j0 = Math.floor((r * rows) / cellRows)
    const j1 = Math.floor(((r + 1) * rows) / cellRows)
    for (let c = 0; c < cellCols; c += 1) {
      const i0 = Math.floor((c * cols) / cellCols)
      const i1 = Math.floor(((c + 1) * cols) / cellCols)
      const tally = new Map()
      let land = 0
      let sea = 0
      for (let j = j0; j < j1; j += 1) {
        for (let i = i0; i < i1; i += 1) {
          const label = labels[j * cols + i]
          if (label < 0) {
            sea += 1
          } else {
            land += 1
            tally.set(label, (tally.get(label) ?? 0) + 1)
          }
        }
      }
      if (land > sea && land > 0) {
        let best = -1
        let bestCount = -1
        for (const [label, count] of tally) {
          if (count > bestCount || (count === bestCount && label < best)) {
            best = label
            bestCount = count
          }
        }
        line += PROVINCE_LETTERS[best]
      } else {
        line += '.'
      }
    }
    lines.push(line)
  }
  return lines
}

function asciiLegend() {
  return PROVINCES.map((province, index) => `${PROVINCE_LETTERS[index]}=${province.name}`).join('  ')
}


// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const dataRoot = args.find((arg) => !arg.startsWith('--'))
if (!dataRoot) {
  console.error('用法：node tools/buildMapData.mjs <解压目录> [--out src/game/mapData.ts]')
  process.exit(1)
}
const outIndex = args.indexOf('--out')
const scriptDir = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(scriptDir, '..', outIndex !== -1 ? args[outIndex + 1] : 'src/game/mapData.ts')

const cols = Math.round((BOUNDS.maxLon - BOUNDS.minLon) / CELL)
const rows = Math.round((BOUNDS.maxLat - BOUNDS.minLat) / CELL)

// 复用已有输出中的战略点坐标、显示偏移与地理归属。
const sourcePath = outputPath
const source = readFileSync(sourcePath, 'utf8')
const siteBlock = extractBlock(source, 'SITE_COORDINATES')
const offsetBlock = extractBlock(source, 'SITE_DISPLAY_OFFSETS')
const geography = evaluateSiteCoordinates(
  extractBlock(
    readFileSync(resolve(scriptDir, '..', 'src/core/geographySanguo.ts'), 'utf8'),
    'GEOGRAPHY_SANGUO',
  ),
)
const siteCoordinates = evaluateSiteCoordinates(siteBlock)
const offsets = {}
for (const [site, offset] of Object.entries(evaluateSiteCoordinates(offsetBlock))) {
  offsets[site] = { dx: offset.dx, dy: offset.dy }
}
const provinceIndexById = new Map(PROVINCES.map((province, index) => [province.id, index]))

// 分区：先按郡级矢量栅格化并补齐，再让分区尊重战略点的史实归属。
const { features, vertexCount } = loadFeatures(resolve(dataRoot))
const { labels, land } = rasterize(features, cols, rows)
keepLargestLand(cols, rows, labels, land)
fillUnassigned(cols, rows, labels, dilateMask(cols, rows, land, DILATE_CELLS))
fillEnclosedSea(cols, rows, labels)

const siteRequirements = []
for (const site of geography.sites) {
  const coordinate = siteCoordinates[site.id]
  if (coordinate === undefined) continue
  const provinceIndex = provinceIndexById.get(site.provinceId)
  if (provinceIndex === undefined) throw new Error(`未知州：${site.provinceId}`)
  siteRequirements.push({ id: site.id, lon: coordinate[0], lat: coordinate[1], provinceIndex })
}
forceSiteProvinces(cols, rows, labels, siteRequirements, SITE_DISC_RADIUS, SITE_CORRIDOR_HALF_WIDTH)
removeSmallComponents(cols, rows, labels)
console.error(`要素 ${features.length} 个，顶点 ${vertexCount}，格网 ${cols}x${rows}`)

const { chains, chainOfEdge } = buildChains(cols, rows, labels)
console.error(`边界链 ${chains.length} 条`)
const simplifiedById = simplifyChains(cols, chains, GRID_TOLERANCE)

const provincePolygonsOf = (rings) =>
  rings.map((ring) =>
    ring.map(([i, j]) => projectPoint(BOUNDS.minLon + i * CELL, BOUNDS.minLat + j * CELL)),
  )
const siteProjected = new Map()
for (const [site, [lon, lat]] of Object.entries(siteCoordinates)) {
  siteProjected.set(site, projectPoint(lon, lat))
}
const regionOf = (site) => {
  const base = siteProjected.get(site)
  const offset = offsets[site] ?? { dx: 0, dy: 0 }
  return { x: base.x + offset.dx, y: base.y + offset.dy }
}
const spacingOk = (site, point) => {
  for (const other of Object.keys(siteCoordinates)) {
    if (other === site) continue
    const region = regionOf(other)
    if (Math.hypot(region.x - point.x, region.y - point.y) < MIN_SITE_DISTANCE) return false
  }
  return true
}

// 抽稀后复核：战略点的真实坐标必须仍落在所属州内；失守时只局部恢复附近的未抽稀链，不提高全局容差。
let { provinceRings, vertexIJ } = buildRings(cols, rows, labels, chains, chainOfEdge, simplifiedById)
let provincePolygons = provincePolygonsOf(provinceRings)
const requirementById = new Map(siteRequirements.map((item) => [item.id, item]))
const outsideSites = (polygons) =>
  [...requirementById.values()]
    .filter((item) => !isInsidePoint(siteProjected.get(item.id), polygons[item.provinceIndex]))
    .map((item) => item.id)

let restoredChainCount = 0
let remainingOutside = outsideSites(provincePolygons)
if (remainingOutside.length > 0) {
  const targets = remainingOutside.map((id) => ({
    ci: Math.floor((siteCoordinates[id][0] - BOUNDS.minLon) / CELL),
    cj: Math.floor((siteCoordinates[id][1] - BOUNDS.minLat) / CELL),
  }))
  restoredChainCount = restoreChainsNearSites(
    cols,
    chains,
    simplifiedById,
    targets,
    SITE_RESTORE_WINDOW,
  ).length
  const rebuilt = buildRings(cols, rows, labels, chains, chainOfEdge, simplifiedById)
  provinceRings = rebuilt.provinceRings
  vertexIJ = rebuilt.vertexIJ
  provincePolygons = provincePolygonsOf(provinceRings)
  remainingOutside = outsideSites(provincePolygons)
}
const labelPoints = computeLabels(cols, rows, labels, provinceRings, vertexIJ)

// 塞外底衬：Natural Earth 陆地栅格化后扣除十四州陆地，仅用于绘制，不参与州界。
const { rings: landOutlines, backdropCells } = await buildLandOutlines(cols, rows, labels)

const coverageMismatches = []
for (const site of geography.sites) {
  const coordinate = siteCoordinates[site.id]
  if (coordinate === undefined) continue
  const covering = features
    .filter((feature) => featureContains(feature, coordinate))
    .map((feature) => PROVINCES[feature.provinceIndex].id)
  if (!covering.includes(site.provinceId)) {
    coverageMismatches.push({ site: site.id, declared: site.provinceId, covering })
  }
}

const offsetCandidates = []
for (let dx = -60; dx <= 60; dx += 1) {
  for (let dy = -60; dy <= 60; dy += 1) {
    offsetCandidates.push([dx, dy, Math.hypot(dx, dy)])
  }
}
offsetCandidates.sort((a, b) => a[2] - b[2])

const adjustedOffsets = []
const unresolvedSites = []
for (const site of geography.sites) {
  const coordinate = siteCoordinates[site.id]
  if (coordinate === undefined) continue
  const polygon = provincePolygons[provinceIndexById.get(site.provinceId)]
  if (isInsidePoint(regionOf(site.id), polygon)) continue
  const base = siteProjected.get(site.id)
  const current = offsets[site.id] ?? { dx: 0, dy: 0 }
  let found = null
  for (const [dx, dy] of offsetCandidates) {
    const candidate = { dx: current.dx + dx, dy: current.dy + dy }
    const point = { x: base.x + candidate.dx, y: base.y + candidate.dy }
    if (!isInsidePoint(point, polygon)) continue
    if (!spacingOk(site.id, point)) continue
    found = candidate
    break
  }
  if (found) {
    offsets[site.id] = found
    adjustedOffsets.push(site.id)
  } else {
    unresolvedSites.push(site.id)
  }
}

function serializeOffsets(block, values) {
  const commentEnd = block.indexOf('*/')
  const comment = commentEnd === -1 ? '' : block.slice(0, commentEnd + 2)
  const body = Object.entries(values)
    .map(([site, offset]) => `  ${site}: { dx: ${offset.dx}, dy: ${offset.dy} },`)
    .join('\n')
  return `${comment}
export const SITE_DISPLAY_OFFSETS: Partial<Record<SiteId, { dx: number; dy: number }>> = {
${body}
}`
}

const idOf = new Map()
const vertexEntries = []
const register = (i, j) => {
  const key = `${i}_${j}`
  let id = idOf.get(key)
  if (id === undefined) {
    id = `v${vertexEntries.length}`
    idOf.set(key, id)
    vertexEntries.push([id, round(BOUNDS.minLon + i * CELL), round(BOUNDS.minLat + j * CELL)])
  }
  return id
}

const outlineBlocks = []
const counts = []
for (let p = 0; p < PROVINCES.length; p += 1) {
  const ringIds = provinceRings[p].map(([i, j]) => register(i, j))
  counts.push(ringIds.length)
  const label = labelPoints[p]
  outlineBlocks.push(`  {
    id: '${PROVINCES[p].id}',
    name: '${PROVINCES[p].name}',
    labelAt: [${round(label[0])}, ${round(label[1])}],
    ring: [
${ringIds.map((id) => `      '${id}',`).join('\n')}
    ],
  },`)
}

const header = `import type { ProvinceId, SiteId } from '../core/model'

/** 经纬度，顺序为 [经度, 纬度]。 */
export type LonLat = readonly [number, number]

`
const verticesComment = `/**
 * 州轮廓的全部顶点。
 * 州界由三国郡级矢量数据（GeoPackage）栅格化分区并统一抽稀得到，
 * 相邻州共用同一批顶点，边界只存在一份，接缝既不重叠也不留空隙。
 */
export const MAP_VERTICES: Record<string, LonLat> = {
`
const vertexLines = vertexEntries.map(([id, lon, lat]) => `  ${id}: [${lon}, ${lat}],`).join('\n')
const outlineComment = `}

/** 州轮廓：由顶点 id 依次连成的闭合环，州名为标注锚点。 */
export interface ProvinceOutline {
  id: ProvinceId
  name: string
  /** 州名标注位置，落在轮廓内部。 */
  labelAt: LonLat
  ring: readonly string[]
}

export const PROVINCE_OUTLINES: readonly ProvinceOutline[] = [
`

const offsetSource = adjustedOffsets.length > 0 ? serializeOffsets(offsetBlock, offsets) : offsetBlock
const landComment = `/**
 * 塞外陆地（不属于十四州的陆地区域），来自 Natural Earth，公有领域。
 * 数据源：https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json（Natural Earth 1:50m 陆地图层，公有领域）。
 * 已栅格化到与十四州相同的格网、扣除十四州陆地并抽稀，仅作底衬，不参与十四州分区。
 */
export const LAND_OUTLINES: readonly (readonly LonLat[])[] = [
`
const landLines = landOutlines
  .map((ring) => `  [${ring.map(([lon, lat]) => `[${round(lon)}, ${round(lat)}]`).join(', ')}],`)
  .join('\n')
const output = `${header}${siteBlock}

${offsetSource}

${verticesComment}${vertexLines}
${outlineComment}${outlineBlocks.join('\n')}
]

${landComment}${landLines}
]
`

writeFileSync(sourcePath, output)

const landCells = labels.reduce((sum, label) => sum + (label >= 0 ? 1 : 0), 0)
const landFraction = landCells / (cols * rows)
const assignments = assignSites(siteCoordinates, cols, rows, labels)
console.log(`抽稀容差 ${DP_TOLERANCE_DEG}°（${GRID_TOLERANCE} 格）`)
console.log(`陆地占比 ${(landFraction * 100).toFixed(2)}%（${landCells}/${cols * rows}）`)
console.log('州顶点数：')
for (let p = 0; p < PROVINCES.length; p += 1) {
  console.log(`  ${PROVINCES[p].id}\t${PROVINCES[p].name}\t${counts[p]}`)
}
console.log(`  合计\t${counts.reduce((a, b) => a + b, 0)}（去重 ${vertexEntries.length}）`)
console.log('战略点归属（栅格）：')
for (const [site, province] of Object.entries(assignments)) {
  console.log(`  ${site}\t${province ?? 'OUTSIDE'}`)
}
if (coverageMismatches.length > 0) {
  console.log('原始多边形归属与史实不一致（分区已按战略点修正）：')
  for (const item of coverageMismatches) {
    console.log(`  ${item.site}\t声明 ${item.declared}\t实际 ${item.covering.join('/') || '无'}`)
  }
}
console.log(`微调显示偏移：${adjustedOffsets.length > 0 ? adjustedOffsets.join(', ') : '无'}`)
if (unresolvedSites.length > 0) {
  console.log(`无法用偏移解决：${unresolvedSites.join(', ')}`)
}
console.log(`抽稀后局部恢复链：${restoredChainCount} 条`)
if (remainingOutside.length > 0) {
  console.log(`抽稀后真实坐标仍在州外：${remainingOutside.join(', ')}`)
}
console.log(`塞外底衬容差 ${LAND_DP_TOLERANCE_DEG}°，保留 ${landOutlines.length} 个环`)
console.log(
  `塞外底衬占比 ${((backdropCells / (cols * rows)) * 100).toFixed(2)}%（${backdropCells} 格），州陆地 ${(
    (landCells / (cols * rows)) *
    100
  ).toFixed(2)}%（${landCells} 格），全网格 ${cols * rows} 格`,
)
console.log('陆地掩膜（ASCII，72x36）：')
for (const line of renderAscii(cols, rows, labels)) {
  console.log(line)
}
console.log(`图例：${asciiLegend()}`)
console.log(`已写入 ${sourcePath}`)

