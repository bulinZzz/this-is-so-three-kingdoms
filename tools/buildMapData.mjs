// 三国州级轮廓数据生成器
//
// 数据来源：彩色分区底图（本地素材，源图不入库）。
//   州界按底图各州的彩色分区数字化，覆盖 208 年基准（见 AGENTS.md 附录）：
//   河西与陇右同属凉州、阴平入凉州、上郡故地入并州。
//   交州的下边界（不与益州、荆州、扬州相邻的一段）照底图的交州分区手工重描
//   （见 mapData.ts 的 k 系列顶点）：西界沿底图分区的无主地一侧南下，海疆同取底图轮廓。
//   该手工段重跑本脚本会覆盖。
//   塞外陆地南界不越出制图范围，止于北纬 16.3°，其以南的陆地一概不取；重跑本脚本会覆盖此手工处理。
//   底图内容在 104.5°E 以西较真实经度整体偏东，取样时按经度分段修正。
//
// 复现步骤：
//   node tools/buildMapData.mjs <分区底图 PNG 路径> [--out src/game/mapData.ts]
//   脚本重写 src/game/mapData.ts，并打印提取统计、各州顶点数、战略点归属与 ASCII 陆地掩膜。
//
// 输出：每个 0.01° 格元从底图取样定州，边界形状与底图一致；再抽取边界链、统一抽稀，
// 相邻州因此共用同一批顶点，接缝既不重叠也不留空隙。脚本不依赖 Phaser。
// 运行结束打印提取统计与 72x36 的 ASCII 陆地掩膜，便于在无图环境下核对轮廓。

import { readFileSync, writeFileSync } from 'node:fs'
import zlib from 'node:zlib'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

/** 制图经纬度范围，唯一来源为 src/game/mapBounds.json，与 src/game/mapLayout.ts 共用。 */
const BOUNDS = JSON.parse(
  readFileSync(new URL('../src/game/mapBounds.json', import.meta.url), 'utf8'),
)
const CELL = 0.01
/** Douglas–Peucker 抽稀容差，单位为度。 */
const DP_TOLERANCE_DEG = 0.012
/** 抽稀在格网坐标上进行，容差需换算为格数。 */
const GRID_TOLERANCE = DP_TOLERANCE_DEG / CELL
/** 陆地掩膜向外膨胀的格数，用于闭合填充色边界上的发丝缝。 */
const DILATE_CELLS = 4
/** 战略点周围强制归入本州的圆盘半径（格）。 */
const SITE_DISC_RADIUS = 8
/** 圆盘与本州不相接时补出的通道半宽（格）。 */
const SITE_CORRIDOR_HALF_WIDTH = 4
/** 抽稀后复核失守时，恢复整链顶点的窗口半径（格）。 */
const SITE_RESTORE_WINDOW = 12
/** 塞外陆地数据源：Natural Earth 1:10m 陆地（公有领域），GeoJSON。 */
const LAND_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_land.geojson'
/** 塞外底衬连通块的最小跨度，小于此值的碎块丢弃（度）。 */
const LAND_MIN_COMPONENT_DEG = 0.08
/** 塞外底衬抽稀容差（度）。 */
const LAND_DP_TOLERANCE_DEG = 0.02
/**
 * 长江与黄河的中心线数据源：Natural Earth 1:10m 河流与湖泊中心线（公有领域），GeoJSON。
 * 优先 jsDelivr 镜像，失败时回退 GitHub 原始地址。
 */
const RIVER_URLS = [
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_rivers_lake_centerlines.geojson',
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson',
]
/**
 * 要保留的两条河流：别名统一小写并去掉空格与各类分隔符后，与要素 name / name_en / name_alt 精确匹配。
 * 长江上游在数据中拆为 Jinsha、Tongtian、Tuotuo 三段，黄河上游的湖源中心线同属黄河，均需一并纳入。
 */
const RIVER_NAMES = {
  yangtze: ['yangtze', 'changjiang', 'jinsha', 'tongtian', 'tuotuo'],
  yellow: ['huang', 'huanghe', 'yellow'],
}
/** 河流折线抽稀容差（度）。 */
const RIVER_DP_TOLERANCE_DEG = 0.008
/** 河流折线的最小跨度，小于此值的碎段丢弃（度）。 */
const RIVER_MIN_SPAN_DEG = 0.05
/** 河流下游端落在陆地时，沿末段方向向外延伸寻找海岸线的上限（公里）。 */
const RIVER_COAST_EXTEND_KM = 40
/** 与 src/game/mapLayout.ts 一致的投影参数，仅用于战略点落位校验，不参与几何生成。 */
const KM_PER_LATITUDE_DEGREE = 110.57
const KM_PER_LONGITUDE_DEGREE = 111.32 * Math.cos((33 * Math.PI) / 180)
const PIXELS_PER_KILOMETER = 0.5
const PADDING = 32
const SITE_RADIUS = 13
const MIN_SITE_DISTANCE = 2 * SITE_RADIUS

const PROVINCES = [
  { id: 'sili', name: '司隶' },
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

const PROVINCE_INDEX = new Map(PROVINCES.map((province, index) => [province.id, index]))
/** ASCII 陆地掩膜使用的州字母，十三州互不重复。 */
const PROVINCE_LETTERS = ['s', 'u', 'n', 'x', 'q', 'l', 'b', 'j', 'v', 'g', 'i', 'e', 'c']
const OUTSIDE = -2

// ---------------------------------------------------------------------------
// 底图提取：彩色分区 → 州标签栅格
// ---------------------------------------------------------------------------

/** 底图的经纬度映射：双比例等经纬，横 237.7103 px/°、纵 271.0309 px/°，基点 90.7°E、44.7017°N。 */
const ATLAS_PIXELS_PER_LON = 237.7103290899571
const ATLAS_PIXELS_PER_LAT = 271.030859444176
const ATLAS_ORIGIN_LON = 90.7
const ATLAS_ORIGIN_LAT = 44.70167585044964

/**
 * 底图内容在 104.5°E 以西较真实经度整体偏东：101°E 以西约 +0.85°，向东线性减至 0。
 * 偏移量由湖泊与城邑点位标定；换算后使格元取到对应地物的颜色，104.5°E 以东不修正。
 */
const ATLAS_LON_CORRECTION_MAX = 0.85
const ATLAS_LON_CORRECTION_END = 104.5
const ATLAS_LON_CORRECTION_SPAN = 3.5

/** 真实经度 → 底图经度。 */
function atlasLonOf(lon) {
  if (lon >= ATLAS_LON_CORRECTION_END) return lon
  const t = Math.min(1, (ATLAS_LON_CORRECTION_END - lon) / ATLAS_LON_CORRECTION_SPAN)
  return lon + ATLAS_LON_CORRECTION_MAX * t
}

/** 判色窗边长（像素）：格元按窗内与各填充色几乎相同的像素数定州，取最多者。 */
const ATLAS_WINDOW = 5
/** 判为「与填充色几乎相同」的宽容度（分量差之和）；填充色两两最小距离为 20，取 2 不会串色。 */
const ATLAS_SUPPORT_TOLERANCE = 2
/** 定州所需的窗内最少同名像素数。细线（道路、界线）与零星色斑不足此数，视为无归属。 */
const ATLAS_MIN_SUPPORT = 4
/** 扬与兖、并与冀的共用色标记，由 resolveSharedColors 拆分。 */
const ATLAS_AMBIG_YANG_YAN = 14
const ATLAS_AMBIG_BING_JI = 15
/** 底图海面填充色；取样时记入海掩膜，缝合通道须避开。 */
const ATLAS_SEA_RGB = [163, 204, 255]
const ATLAS_SEA_TOLERANCE = 45

/**
 * 底图的州填充色。相邻两州的填充色在图上可能相同（扬与兖、并与冀），以既有州界的州标签为界拆开；
 * 阴平在底图上用益色，按既有州界改判入凉；河西与陇右同属凉州，共用那片绿色，无须再分。海面与纸底同属无归属。
 */
const ATLAS_COLORS = [
  { rgb: [207, 204, 240], kind: 'flip', base: 'yi', flip: 'liang' },
  { rgb: [227, 245, 199], kind: 'direct', province: 'liang' },
  { rgb: [207, 224, 240], kind: 'shared', members: ['yang', 'yan'], ambig: ATLAS_AMBIG_YANG_YAN },
  { rgb: [248, 245, 199], kind: 'direct', province: 'jing' },
  { rgb: [248, 204, 199], kind: 'shared', members: ['bing', 'ji'], ambig: ATLAS_AMBIG_BING_JI },
  { rgb: [248, 224, 199], kind: 'direct', province: 'jiao' },
  { rgb: [225, 208, 231], kind: 'direct', province: 'you' },
  { rgb: [207, 245, 219], kind: 'direct', province: 'sili' },
  { rgb: [239, 208, 231], kind: 'direct', province: 'yu' },
  { rgb: [207, 245, 240], kind: 'direct', province: 'xu' },
  { rgb: [207, 245, 199], kind: 'direct', province: 'qing' },
]
/** 交州缝合：参与缝合的分量格数下限与窄道半宽（格），离岸小岛因远小于下限而不参与。 */
const JIAO_BRIDGE_MIN_CELLS = 5000
const JIAO_BRIDGE_HALF_WIDTH = 4
/** 预清理：不与既有州界重叠且小于此格数的分量视为噪声。 */
const PRUNE_MAX_CELLS = 2000

/** 解码 8 位 RGB/RGBA 的 PNG，返回逐行像素缓冲。 */
function decodePng(file) {
  const buf = readFileSync(file)
  let pos = 8
  let width = 0
  let height = 0
  let colorType = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      colorType = data.readUInt8(9)
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (width === 0 || height === 0) throw new Error(`无法解析 PNG：${file}`)
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  const paeth = (a, b, c) => {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const dst = pixels.subarray(y * stride, (y + 1) * stride)
    const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? dst[i - channels] : 0
      const b = prior[i]
      const c = i >= channels ? prior[i - channels] : 0
      let v = src[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) v += paeth(a, b, c)
      dst[i] = v & 0xff
    }
  }
  return { width, height, channels, stride, pixels }
}

/**
 * 从底图提取州标签：0.01° 格元按 5×5 窗内与各填充色几乎相同的像素数定州，取最多者。
 * 细线（道路、界线）与零星色斑的窗内同名像素不足下限，视为无归属；海面、纸底与文字同属无归属。
 * 相邻州共用填充色时记下待拆标记；图幅之外的格元沿用既有州界，交州南端由此保留。
 * 海面另记入掩膜，供缝合通道避开。
 */
function extractAtlasLabels(atlasPath, cols, rows, oldLabels) {
  const png = decodePng(atlasPath)
  const palette = ATLAS_COLORS.map((entry) => entry.rgb)
  const rules = ATLAS_COLORS.map((entry) => ({
    kind: entry.kind,
    base: entry.base === undefined ? undefined : PROVINCE_INDEX.get(entry.base),
    flip: entry.flip === undefined ? undefined : PROVINCE_INDEX.get(entry.flip),
    province: entry.province === undefined ? undefined : PROVINCE_INDEX.get(entry.province),
    members: entry.members === undefined ? undefined : entry.members.map((id) => PROVINCE_INDEX.get(id)),
    ambig: entry.ambig,
  }))
  // 逐像素预判：与某填充色几乎相同的记其编号（1 起），其余为 0（海面、纸底、界线、道路、文字等）。
  const codes = new Uint8Array(png.width * png.height)
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const p = y * png.stride + x * png.channels
      const r = png.pixels[p]
      const g = png.pixels[p + 1]
      const b = png.pixels[p + 2]
      for (let k = 0; k < palette.length; k += 1) {
        const [pr, pg, pb] = palette[k]
        if (Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb) <= ATLAS_SUPPORT_TOLERANCE) {
          codes[y * png.width + x] = k + 1
          break
        }
      }
    }
  }
  const stats = { hit: 0, blank: 0, outside: 0 }
  const half = (ATLAS_WINDOW - 1) / 2
  const tally = new Uint8Array(palette.length + 1)
  const classifyPixel = (x, y) => {
    tally.fill(0)
    let best = 0
    let bestCount = 0
    for (let dy = -half; dy <= half; dy += 1) {
      const Y = y + dy
      if (Y < 0 || Y >= png.height) continue
      const row = Y * png.width
      for (let dx = -half; dx <= half; dx += 1) {
        const X = x + dx
        if (X < 0 || X >= png.width) continue
        const code = codes[row + X]
        if (code === 0) continue
        const count = (tally[code] += 1)
        if (count > bestCount) {
          bestCount = count
          best = code
        }
      }
    }
    if (bestCount >= ATLAS_MIN_SUPPORT) {
      stats.hit += 1
      return best
    }
    stats.blank += 1
    return 0
  }
  const labels = new Int8Array(cols * rows).fill(-1)
  const sea = new Uint8Array(cols * rows)
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const index = j * cols + i
      const lon = BOUNDS.minLon + (i + 0.5) * CELL
      const lat = BOUNDS.minLat + (j + 0.5) * CELL
      const x = Math.round((atlasLonOf(lon) - ATLAS_ORIGIN_LON) * ATLAS_PIXELS_PER_LON)
      const y = Math.round((ATLAS_ORIGIN_LAT - lat) * ATLAS_PIXELS_PER_LAT)
      if (x < 0 || x >= png.width || y < 0 || y >= png.height) {
        labels[index] = oldLabels[index]
        stats.outside += 1
        continue
      }
      const p = y * png.stride + x * png.channels
      if (
        Math.abs(png.pixels[p] - ATLAS_SEA_RGB[0]) +
          Math.abs(png.pixels[p + 1] - ATLAS_SEA_RGB[1]) +
          Math.abs(png.pixels[p + 2] - ATLAS_SEA_RGB[2]) <=
        ATLAS_SEA_TOLERANCE
      ) {
        sea[index] = 1
      }
      const code = classifyPixel(x, y)
      if (code === 0) continue
      const rule = rules[code - 1]
      const old = oldLabels[index]
      if (rule.kind === 'direct') labels[index] = rule.province
      else if (rule.kind === 'flip') labels[index] = old === rule.flip ? old : rule.base
      else labels[index] = rule.members.includes(old) ? old : rule.ambig
    }
  }
  return { labels, stats, sea }
}

/** 把共用色拆成两个州：从已定格的本族州出发做多源 BFS，只经过未定格的同色格；残格置为无归属。 */
function resolveSharedColors(cols, rows, labels, members, ambig) {
  const queue = new Int32Array(cols * rows)
  let head = 0
  let tail = 0
  for (let index = 0; index < labels.length; index += 1) {
    if (members.includes(labels[index])) queue[tail++] = index
  }
  while (head < tail) {
    const index = queue[head++]
    const label = labels[index]
    const i = index % cols
    const j = (index - i) / cols
    const visit = (next) => {
      if (labels[next] === ambig) {
        labels[next] = label
        queue[tail++] = next
      }
    }
    if (i > 0) visit(index - 1)
    if (i < cols - 1) visit(index + 1)
    if (j > 0) visit(index - cols)
    if (j < rows - 1) visit(index + cols)
  }
  let leftover = 0
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] === ambig) {
      labels[index] = -1
      leftover += 1
    }
  }
  return leftover
}

/** 去掉不与既有州界重叠、又小于给定格数的分量：多为底图噪声或边界误差。 */
function pruneUnanchoredComponents(cols, rows, labels, oldLabels, maxCells) {
  const removed = []
  for (let p = 0; p < PROVINCES.length; p += 1) {
    for (const cells of collectComponents(cols, rows, labels, p)) {
      if (cells.length >= maxCells) continue
      let anchored = false
      for (const index of cells) {
        if (oldLabels[index] === p) {
          anchored = true
          break
        }
      }
      if (anchored) continue
      for (const index of cells) labels[index] = -1
      const i = cells[0] % cols
      const j = (cells[0] - i) / cols
      removed.push({
        province: p,
        cells: cells.length,
        lon: BOUNDS.minLon + (i + 0.5) * CELL,
        lat: BOUNDS.minLat + (j + 0.5) * CELL,
      })
    }
  }
  return removed
}

/**
 * 把某州被图幅底边切成两段的分量接回：从较小的分量出发做 BFS，
 * 只在未定州的陆地格与同州格上寻路，不穿海面、不穿他州；命中较大的分量后沿路径补一条窄道。
 * 只用于交州南端（图幅之外沿用既有州界的那段）；无法在陆上连通的分量跳过，允许同州多环。
 */
function bridgeProvinceComponents(cols, rows, labels, sea, provinceIndex, minCells, halfWidth) {
  const components = collectComponents(cols, rows, labels, provinceIndex)
  const large = components.filter((cells) => cells.length >= minCells).sort((a, b) => b.length - a.length)
  if (large.length <= 1) return { painted: 0, skipped: 0 }
  const marker = new Int32Array(cols * rows).fill(-1)
  for (const index of large[0]) marker[index] = 0
  const parent = new Int32Array(cols * rows)
  const queue = new Int32Array(cols * rows)
  let painted = 0
  let skipped = 0
  for (let k = 1; k < large.length; k += 1) {
    parent.fill(-1)
    let head = 0
    let tail = 0
    for (const index of large[k]) {
      parent[index] = index
      queue[tail++] = index
    }
    let hit = -1
    while (head < tail) {
      const index = queue[head++]
      if (marker[index] === 0) {
        hit = index
        break
      }
      const i = index % cols
      const j = (index - i) / cols
      const visit = (next) => {
        if (parent[next] !== -1 || sea[next] === 1) return
        if (labels[next] !== -1 && labels[next] !== provinceIndex) return
        parent[next] = index
        queue[tail++] = next
      }
      if (i > 0) visit(index - 1)
      if (i < cols - 1) visit(index + 1)
      if (j > 0) visit(index - cols)
      if (j < rows - 1) visit(index + cols)
    }
    if (hit === -1) {
      skipped += 1
      continue
    }
    let index = hit
    for (;;) {
      const i = index % cols
      const j = (index - i) / cols
      for (let jj = j - halfWidth; jj <= j + halfWidth; jj += 1) {
        for (let ii = i - halfWidth; ii <= i + halfWidth; ii += 1) {
          if (ii < 0 || ii >= cols || jj < 0 || jj >= rows) continue
          const cell = jj * cols + ii
          if (sea[cell] === 1) continue
          if (labels[cell] !== -1 && labels[cell] !== provinceIndex) continue
          if (labels[cell] !== provinceIndex) {
            labels[cell] = provinceIndex
            painted += 1
          }
          marker[cell] = 0
        }
      }
      if (parent[index] === index) break
      index = parent[index]
    }
  }
  return { painted, skipped }
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

/**
 * 整理杂散分量：不超过 4 格的碎块并入相邻州；更大的分量保留为独立轮廓（如厦门岛、平潭），
 * 连同格数返回，供运行日志核对。返回的是最后一次遍历的留存结果。
 */
function absorbTinyComponents(cols, rows, labels) {
  const MAX_NOISE = 4
  let kept = []
  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false
    kept = []
    for (let p = 0; p < PROVINCES.length; p += 1) {
      const components = collectComponents(cols, rows, labels, p)
      components.sort((a, b) => b.length - a.length)
      for (let c = 1; c < components.length; c += 1) {
        if (components[c].length > MAX_NOISE) {
          kept.push({ province: p, cells: components[c].length })
          continue
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
  return kept
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
 * 去掉折返发丝：相邻三段共线且方向相反（沿原路退回）时删去中间点。
 * 端点是链的接点，保持不动，以免破坏相邻州共用同一条链。
 */
function removeHairpins(points, closed) {
  let list = points.slice()
  let changed = true
  while (changed) {
    changed = false
    const loop = closed && list.length > 2
    const body = loop ? list.slice(0, -1) : list
    for (let i = 1; i < body.length - 1; i += 1) {
      const a = body[i - 1]
      const b = body[i]
      const c = body[i + 1]
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
      const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])
      if (cross === 0 && dot < 0) {
        body.splice(i, 1)
        changed = true
        break
      }
    }
    list = loop ? body.concat([body[0]]) : body
  }
  return list
}

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
    chains.map((chain, index) => {
      const points = chain.vertices.map(vertexIJ)
      const simplified = chain.closed
        ? simplifyClosed(points, tolerance)
        : simplify(points, tolerance)
      return [index, removeHairpins(simplified, chain.closed)]
    }),
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
    const built = []
    for (const raw of ringsByProvince[p]) {
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
        if (stepEdges >= n) {
          // 整环是一条闭合链（孤立的离岸沙洲没有分叉点）。
          let points = simplifiedById.get(chainId)
          if (gridRing[k] !== chain.vertices[0]) points = points.slice().reverse()
          for (let t = 0; t + 1 < points.length; t += 1) result.push(points[t])
          break
        }
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
      built.push(result)
    }
    provinceRings.push(built)
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

    const ringPoints = provinceRings[p].map((ring) =>
      ring.map(([i, j]) => [BOUNDS.minLon + i * CELL, BOUNDS.minLat + j * CELL]),
    )
    // 质心附近的格可能落在凹处之外，此时按深入程度（depth）从大到小取第一个确实在轮廓内的格。
    let point = cellCenter(primary)
    if (!pointInAnyPolygon(point, ringPoints)) {
      const candidates = [...cells].sort((a, b) => depth[b] - depth[a])
      const inside = candidates.find((index) => pointInAnyPolygon(cellCenter(index), ringPoints))
      if (inside === undefined) point = cellCenter(fallback)
      else point = cellCenter(inside)
    }
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

/** 点是否落在若干环中的任意一个之内（州可以有多块轮廓）。 */
function pointInAnyPolygon(point, polygons) {
  return polygons.some((polygon) => pointInPolygon(point, polygon))
}

// ---------------------------------------------------------------------------
// 塞外陆地（Natural Earth，公有领域）
// ---------------------------------------------------------------------------

/**
 * 获取 Natural Earth 陆地的外环（经纬度），不做裁剪。
 * 只取每个多边形的外环，湖泊按陆地处理，避免内陆湖被当成海面而影响沿海并入的判断。
 */
async function fetchLandRings() {
  let geojson
  if (process.env.NE_LAND_FILE) {
    geojson = JSON.parse(readFileSync(process.env.NE_LAND_FILE, 'utf8'))
  } else {
    let response
    try {
      response = await fetch(LAND_URL)
    } catch (error) {
      throw new Error(`无法获取 Natural Earth 陆地数据（${LAND_URL}）：${error.message}`)
    }
    if (!response.ok) {
      throw new Error(`无法获取 Natural Earth 陆地数据（${LAND_URL}）：HTTP ${response.status}`)
    }
    geojson = await response.json()
  }

  const rings = []
  for (const feature of geojson.features) {
    const geometry = feature.geometry
    if (!geometry) continue
    const polygons =
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates
          : []
    for (const polygon of polygons) {
      const outer = polygon[0]
      if (outer && outer.length >= 3) rings.push(outer)
    }
  }
  return rings
}

/** 按与十三州完全相同的格网（同原点、同格距、同尺寸）把环填充为布尔掩膜。 */
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
 * 塞外底衬：Natural Earth 陆地扣除十三州陆地后，按连通块抽取外轮廓并抽稀。
 * 州陆与底衬同源于一份陆地栅格。仅作底衬，不参与十三州分区。
 */
function buildLandOutlines(cols, rows, labels, landMask) {
  const backdropMask = new Uint8Array(cols * rows)
  let backdropCells = 0
  for (let index = 0; index < backdropMask.length; index += 1) {
    if (landMask[index] === 1 && labels[index] < 0) {
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
  return { rings, backdropCells, backdropMask }
}

// ---------------------------------------------------------------------------
// 长江与黄河中心线（Natural Earth，公有领域）
// ---------------------------------------------------------------------------

/** Liang–Barsky：把线段裁剪到图幅矩形内，完全在外返回 null。 */
function clipSegmentToBounds(a, b, bounds) {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const limits = [
    [-dx, a[0] - bounds.minLon],
    [dx, bounds.maxLon - a[0]],
    [-dy, a[1] - bounds.minLat],
    [dy, bounds.maxLat - a[1]],
  ]
  for (const [p, q] of limits) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return null
      if (t > t0) t0 = t
    } else {
      if (t < t0) return null
      if (t < t1) t1 = t
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ]
}

/** 把一条折线裁剪到图幅内，返回若干条落在图幅内的折线。 */
function clipPolylineToBounds(line, bounds) {
  const result = []
  let current = []
  for (let i = 0; i + 1 < line.length; i += 1) {
    const segment = clipSegmentToBounds(line[i], line[i + 1], bounds)
    if (segment === null) {
      if (current.length >= 2) result.push(current)
      current = []
      continue
    }
    const [start, end] = segment
    if (current.length === 0) {
      current.push(start)
    } else {
      const last = current[current.length - 1]
      if (last[0] !== start[0] || last[1] !== start[1]) {
        if (current.length >= 2) result.push(current)
        current = [start]
      }
    }
    current.push(end)
  }
  if (current.length >= 2) result.push(current)
  return result
}

/** 折线的最大跨度（度）。 */
function polylineSpan(points) {
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return Math.max(maxLon - minLon, maxLat - minLat)
}

/** 两点间大圆距离（公里）。 */
function haversineKm(a, b) {
  const radius = 6371
  const toRad = (degree) => (degree * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(h))
}

function polylineLengthKm(points) {
  let total = 0
  for (let i = 0; i + 1 < points.length; i += 1) total += haversineKm(points[i], points[i + 1])
  return total
}

/** 归一化河流名：统一小写并去掉所有非字母数字字符，消除空格与各类分隔符差异。 */
function normalizeRiverName(name) {
  return typeof name === 'string' ? name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : ''
}

/** 按要素 name / name_en / name_alt 归一化后精确匹配河流。 */
function riverKeyOf(properties) {
  const candidates = [properties?.name, properties?.name_en, properties?.name_alt]
    .map(normalizeRiverName)
    .filter((name) => name.length > 0)
  for (const [key, names] of Object.entries(RIVER_NAMES)) {
    if (candidates.some((name) => names.includes(name))) return key
  }
  return null
}

/**
 * 获取长江与黄河的中心线（经纬度）：按 name / name_en / name_alt 匹配、裁剪到图幅、抽稀并丢弃碎段。
 * 每条线为开放折线，河流被拆成多个要素时各段独立保留，不做拼接。
 */
async function fetchRiverLines() {
  const errors = []
  let usedUrl = null
  let geojson = null
  if (process.env.NE_RIVERS_FILE) {
    geojson = JSON.parse(readFileSync(process.env.NE_RIVERS_FILE, 'utf8'))
    usedUrl = RIVER_URLS[0]
  } else {
    for (const url of RIVER_URLS) {
      try {
        const response = await fetch(url)
        if (!response.ok) {
          errors.push(`${url}：HTTP ${response.status}`)
          continue
        }
        geojson = await response.json()
        usedUrl = url
        break
      } catch (error) {
        errors.push(`${url}：${error.message}`)
      }
    }
  }
  if (geojson === null) {
    throw new Error(`无法获取 Natural Earth 河流数据：${errors.join('；')}`)
  }

  const lines = []
  const matched = { yangtze: [], yellow: [] }
  const names = { yangtze: new Set(), yellow: new Set() }
  const featureCounts = { yangtze: 0, yellow: 0 }

  for (const feature of geojson.features) {
    const properties = feature.properties ?? {}
    const key = riverKeyOf(properties)
    if (key === null) continue
    featureCounts[key] += 1
    const name = properties.name
    const nameEn = properties.name_en
    names[key].add(name && nameEn && name !== nameEn ? `${name}（${nameEn}）` : nameEn || name)
    const geometry = feature.geometry
    const coordinates =
      geometry?.type === 'LineString'
        ? [geometry.coordinates]
        : geometry?.type === 'MultiLineString'
          ? geometry.coordinates
          : []
    for (const line of coordinates) {
      for (const piece of clipPolylineToBounds(line, BOUNDS)) {
        const simplified = simplify(piece, RIVER_DP_TOLERANCE_DEG)
        if (simplified.length < 2) continue
        if (polylineSpan(simplified) < RIVER_MIN_SPAN_DEG) continue
        lines.push(simplified)
        matched[key].push(simplified)
      }
    }
  }

  const summarize = (key) => ({
    features: featureCounts[key],
    names: [...names[key]],
    polylines: matched[key].length,
    points: matched[key].reduce((sum, line) => sum + line.length, 0),
    km: matched[key].reduce((sum, line) => sum + polylineLengthKm(line), 0),
  })

  return {
    lines,
    byKey: matched,
    usedUrl,
    summary: { yangtze: summarize('yangtze'), yellow: summarize('yellow') },
  }
}

// ---------------------------------------------------------------------------
// 长江下游尾段补到入海口
// ---------------------------------------------------------------------------

/**
 * 长江下游尾段（经度、纬度），自南京以下补到入海处。
 * Natural Earth 的长江中心线在镇江以下被制图综合成稀疏粗顶点，方向在几十公里内反复折；
 * 这里改用沿真实河道的密集控制点替换该段，使下游以平滑的弧线经江阴、南通抵达入海口，
 * 而不是折来折去或在半途断掉。起点为南京下游，接续处与上游中心线走向一致，避免出现折角。
 * 终点没入长江口的开阔海面：下游沿河口的水道折向东北，再以平顺的弧线转东没入海面，全程落在水道与海面上，不横穿底图上无主的近代淤积陆块。
 */
const YANGTZE_TAIL = [
  [118.78, 32.187],
  [118.9, 32.176],
  [119.02, 32.182],
  [119.14, 32.196],
  [119.26, 32.208],
  [119.38, 32.216],
  [119.5, 32.22],
  [119.62, 32.223],
  [119.74, 32.224],
  [119.86, 32.22],
  [119.98, 32.206],
  [120.1, 32.183],
  [120.22, 32.15],
  [120.32, 32.11],
  [120.42, 32.066],
  [120.51, 32.022],
  [120.6, 31.988],
  [120.632, 31.9815],
  [120.652, 31.9825],
  [120.664, 31.9865],
  [120.678, 31.993],
  [120.686, 31.9975],
  [120.7, 32.002],
  [120.71, 32.0035],
  [120.735, 32.005],
  [120.76, 32.0055],
]

/**
 * 海面判据与地图一致：一点所在格既不在州陆栅格内，也不在塞外底衬内，即为海面。
 * 越界视为海面，因为图幅之外不绘制任何陆地。
 */
function makeSeaQuery(cols, rows, labels, backdropMask) {
  const seaAtCell = (i, j) => {
    if (i < 0 || i >= cols || j < 0 || j >= rows) return true
    const index = j * cols + i
    return labels[index] < 0 && backdropMask[index] !== 1
  }
  return {
    seaAtCell,
    seaAt(lon, lat) {
      const i = Math.floor((lon - BOUNDS.minLon) / CELL)
      const j = Math.floor((lat - BOUNDS.minLat) / CELL)
      return seaAtCell(i, j)
    },
  }
}

/**
 * 把一条河流的下游端收在海岸线上。
 * 终点落在陆地时，沿末段方向向外延伸，直到越过州陆与海面的分界；
 * 终点落在海面时，回退到最后一个陆地点，再在陆、海两点之间二分出交点。
 * 直接改写折线，返回处理结果供打印。
 */
function trimRiverToCoast(line, seaQuery, maxExtendKm) {
  const isLand = (p) => !seaQuery.seaAt(p[0], p[1])
  const end = line[line.length - 1]
  if (isLand(end)) {
    const previous = line[line.length - 2] ?? end
    const dx = end[0] - previous[0]
    const dy = end[1] - previous[1]
    const length = Math.hypot(dx, dy) || 1
    for (let km = 0.5; km <= maxExtendKm; km += 0.5) {
      const lon = end[0] + ((dx / length) * km) / KM_PER_LONGITUDE_DEGREE
      const lat = end[1] + ((dy / length) * km) / KM_PER_LATITUDE_DEGREE
      if (!isLand([lon, lat])) {
        line.push([lon, lat])
        return { kind: 'extend', km }
      }
    }
    return { kind: 'stuck', km: null }
  }
  let index = line.length - 1
  while (index > 0 && !isLand(line[index])) index -= 1
  if (index === 0) return { kind: 'floating', km: null }
  let land = line[index]
  let sea = line[index + 1] ?? line[index]
  for (let step = 0; step < 24; step += 1) {
    const mid = [(land[0] + sea[0]) / 2, (land[1] + sea[1]) / 2]
    if (isLand(mid)) land = mid
    else sea = mid
  }
  const removed = line.length - index - 1
  line.length = index + 1
  line.push(sea)
  return { kind: 'trim', km: polylineLengthKm([line[index], sea]), removed }
}

/**
 * 用真实河道的密集控制点替换长江下游尾段：取经度最大的折线为下游段，方向对准下游后，
 * 先截掉尾段起点以东由制图综合产生的粗顶点，再逐点接上尾段。
 * 尾段终点落在入海处的海面，故不与海岸线相接。直接改写传入的折线，返回值仅供打印。
 */
function extendYangtzeToSea(yangtzeLines) {
  let downstream = null
  let downstreamLon = -Infinity
  for (const line of yangtzeLines) {
    if (line.length < 2) continue
    const maxLon = Math.max(line[0][0], line[line.length - 1][0])
    if (maxLon > downstreamLon) {
      downstreamLon = maxLon
      downstream = line
    }
  }
  if (downstream === null) return null
  if (downstream[0][0] > downstream[downstream.length - 1][0]) downstream.reverse()

  const lengthBefore = polylineLengthKm(downstream)
  const tailStartLon = YANGTZE_TAIL[0][0]
  let cut = downstream.length
  while (cut > 1 && downstream[cut - 1][0] >= tailStartLon) cut -= 1
  const removed = downstream.length - cut
  downstream.length = cut
  let added = 0
  for (const point of YANGTZE_TAIL) {
    if (point[0] <= downstream[downstream.length - 1][0]) continue
    downstream.push(point)
    added += 1
  }
  return { line: downstream, added, removed, lengthBefore }
}

/**
 * 取一组折线中经度最大的下游段，并把它的下游端收到海岸线上。
 * 直接改写折线，返回值仅供打印。
 */
function closeRiverToCoast(lines, seaQuery, maxExtendKm) {
  let downstream = null
  let downstreamLon = -Infinity
  for (const line of lines) {
    if (line.length < 2) continue
    const maxLon = Math.max(line[0][0], line[line.length - 1][0])
    if (maxLon > downstreamLon) {
      downstreamLon = maxLon
      downstream = line
    }
  }
  if (downstream === null) return null
  if (downstream[0][0] > downstream[downstream.length - 1][0]) downstream.reverse()
  const result = trimRiverToCoast(downstream, seaQuery, maxExtendKm)
  return { endpoint: downstream[downstream.length - 1], ...result }
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

/** 取出以 `\n]` 结束的数组字面量（如 PROVINCE_OUTLINES），连带其文档注释。 */
function extractArrayBlock(source, name) {
  const declStart = source.indexOf(`export const ${name}`)
  if (declStart === -1) throw new Error(`找不到 ${name}`)
  let start = declStart
  const commentStart = source.lastIndexOf('/**', declStart)
  if (commentStart !== -1 && /^\/\*\*[\s\S]*\*\/\s*$/.test(source.slice(commentStart, declStart))) {
    start = commentStart
  }
  const end = source.indexOf('\n]', declStart)
  if (end === -1) throw new Error(`找不到 ${name} 的结束`)
  return source.slice(start, end + 2)
}

function evaluateSiteCoordinates(block) {
  const text = block.slice(block.indexOf('=') + 1).trim()
  const object = text.slice(0, text.lastIndexOf('}') + 1)
  return new Function(`return ${object}`)()
}

/** 求值以 `]` 结束的数组字面量。 */
function evaluateArrayBlock(block) {
  const text = block.slice(block.indexOf('=') + 1).trim()
  return new Function(`return ${text.slice(0, text.lastIndexOf(']') + 1)}`)()
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

/** 射线法：点是否落在该州任意一块轮廓内。 */
function isInsideAnyPoint(point, polygons) {
  return polygons.some((polygon) => isInsidePoint(point, polygon))
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
const atlasPath = args.find((arg) => !arg.startsWith('--'))
if (!atlasPath) {
  console.error('用法：node tools/buildMapData.mjs <分区底图 PNG> [--out src/game/mapData.ts]')
  process.exit(1)
}
const outIndex = args.indexOf('--out')
const scriptDir = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(scriptDir, '..', outIndex !== -1 ? args[outIndex + 1] : 'src/game/mapData.ts')

const cols = Math.round((BOUNDS.maxLon - BOUNDS.minLon) / CELL)
const rows = Math.round((BOUNDS.maxLat - BOUNDS.minLat) / CELL)

// 复用已有输出中的战略点坐标、显示偏移、州轮廓（旧标签先验）与地理归属。
const sourcePath = outputPath
const source = readFileSync(sourcePath, 'utf8')
const siteBlock = extractBlock(source, 'SITE_COORDINATES')
const offsetBlock = extractBlock(source, 'SITE_DISPLAY_OFFSETS')
const oldVertices = evaluateSiteCoordinates(extractBlock(source, 'MAP_VERTICES'))
const oldOutlines = evaluateArrayBlock(extractArrayBlock(source, 'PROVINCE_OUTLINES'))
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

// 分区：以底图的彩色分区为准取样定州，再让分区尊重战略点的史实归属。
const oldLabels = rasterize(
  oldOutlines.map((outline) => ({
    provinceIndex: PROVINCE_INDEX.get(outline.id),
    polygons: outline.rings.map((ring) => [ring.map((id) => oldVertices[id])]),
  })),
  cols,
  rows,
).labels
const { labels, stats, sea } = extractAtlasLabels(resolve(atlasPath), cols, rows, oldLabels)
console.error(
  `底图取样：色块命中 ${stats.hit}、无归属 ${stats.blank}、图外沿用既有州界 ${stats.outside}`,
)
for (const entry of ATLAS_COLORS) {
  if (entry.kind !== 'shared') continue
  const leftover = resolveSharedColors(
    cols,
    rows,
    labels,
    entry.members.map((id) => PROVINCE_INDEX.get(id)),
    entry.ambig,
  )
  console.error(`共用色 ${entry.members.join('/')} 拆开：残格 ${leftover}`)
}
const bridgedJiao = bridgeProvinceComponents(
  cols,
  rows,
  labels,
  sea,
  PROVINCE_INDEX.get('jiao'),
  JIAO_BRIDGE_MIN_CELLS,
  JIAO_BRIDGE_HALF_WIDTH,
)
console.error(`交州缝合 ${bridgedJiao.painted} 格，跳过分量 ${bridgedJiao.skipped} 个`)
const prunedComponents = pruneUnanchoredComponents(cols, rows, labels, oldLabels, PRUNE_MAX_CELLS)
if (prunedComponents.length > 0) {
  console.error(
    `预清理 ${prunedComponents.reduce((sum, item) => sum + item.cells, 0)} 格：${prunedComponents
      .map((item) => `${PROVINCES[item.province].id} ${item.cells}格@${item.lon.toFixed(2)},${item.lat.toFixed(2)}`)
      .join('，')}`,
  )
}
const labelMask = new Uint8Array(cols * rows)
for (let index = 0; index < labels.length; index += 1) {
  if (labels[index] >= 0) labelMask[index] = 1
}
fillUnassigned(cols, rows, labels, dilateMask(cols, rows, labelMask, DILATE_CELLS))
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
const keptComponents = absorbTinyComponents(cols, rows, labels)
for (const item of keptComponents) {
  console.error(`保留分量：${PROVINCES[item.province].id} ${item.cells} 格`)
}
fillEnclosedSea(cols, rows, labels)

// Natural Earth 陆地掩膜：仅用于扣除州陆后的塞外底衬。
const landRings = await fetchLandRings()
const landMask = rasterizeRings(landRings, cols, rows)
console.error(`格网 ${cols}x${rows}`)

const { chains, chainOfEdge } = buildChains(cols, rows, labels)
console.error(`边界链 ${chains.length} 条`)
const simplifiedById = simplifyChains(cols, chains, GRID_TOLERANCE)

/** 每州可能有多块轮廓，返回「州 → 投影后的多边形数组」。 */
const provincePolygonsOf = (provinceRings) =>
  provinceRings.map((rings) =>
    rings.map((ring) =>
      ring.map(([i, j]) => projectPoint(BOUNDS.minLon + i * CELL, BOUNDS.minLat + j * CELL)),
    ),
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
    .filter((item) => !isInsideAnyPoint(siteProjected.get(item.id), polygons[item.provinceIndex]))
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

// 塞外底衬：从同一份陆地掩膜扣除十三州陆地，仅用于绘制，不参与州界。
const { rings: landOutlines, backdropCells, backdropMask } = buildLandOutlines(
  cols,
  rows,
  labels,
  landMask,
)

// 长江与黄河中心线：Natural Earth 河流与湖泊中心线，裁剪抽稀后同样仅作绘制。
const {
  lines: riverLines,
  byKey: riverByKey,
  usedUrl: riverUrl,
  summary: riverSummary,
} = await fetchRiverLines()

// 长江下游用真实河道的密集控制点补到入海口，黄河下游端收到海岸线上；判海沿用绘制所用的州陆与塞外底衬栅格。
const seaQuery = makeSeaQuery(cols, rows, labels, backdropMask)
const yangtzeTail = extendYangtzeToSea(riverByKey.yangtze)
const yellowCoast = closeRiverToCoast(riverByKey.yellow, seaQuery, RIVER_COAST_EXTEND_KM)
for (const key of ['yangtze', 'yellow']) {
  riverSummary[key].points = riverByKey[key].reduce((sum, line) => sum + line.length, 0)
  riverSummary[key].km = riverByKey[key].reduce((sum, line) => sum + polylineLengthKm(line), 0)
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
  const polygons = provincePolygons[provinceIndexById.get(site.provinceId)]
  if (isInsideAnyPoint(regionOf(site.id), polygons)) continue
  const base = siteProjected.get(site.id)
  const current = offsets[site.id] ?? { dx: 0, dy: 0 }
  let found = null
  for (const [dx, dy] of offsetCandidates) {
    const candidate = { dx: current.dx + dx, dy: current.dy + dy }
    const point = { x: base.x + candidate.dx, y: base.y + candidate.dy }
    if (!isInsideAnyPoint(point, polygons)) continue
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
  const ringIds = provinceRings[p].map((ring) => ring.map(([i, j]) => register(i, j)))
  counts.push(ringIds.reduce((sum, ids) => sum + ids.length, 0))
  const label = labelPoints[p]
  const ringsText = ringIds
    .map((ids) => `      [\n${ids.map((id) => `        '${id}',`).join('\n')}\n      ],`)
    .join('\n')
  outlineBlocks.push(`  {
    id: '${PROVINCES[p].id}',
    name: '${PROVINCES[p].name}',
    labelAt: [${round(label[0])}, ${round(label[1])}],
    rings: [
${ringsText}
    ],
  },`)
}

const header = `import type { ProvinceId, SiteId } from '../core/model'

/** 经纬度，顺序为 [经度, 纬度]。 */
export type LonLat = readonly [number, number]

`
const verticesComment = `/**
 * 州轮廓的全部顶点。
 * 州界取自彩色分区底图，栅格化定州后统一抽稀，
 * 相邻州共用同一批顶点，边界只存在一份，接缝既不重叠也不留空隙。
 */
export const MAP_VERTICES: Record<string, LonLat> = {
`
const vertexLines = vertexEntries.map(([id, lon, lat]) => `  ${id}: [${lon}, ${lat}],`).join('\n')
const outlineComment = `}

/** 州轮廓：每州一到多块闭合成环的顶点序列（离岸沙洲自成一块），州名为标注锚点。 */
export interface ProvinceOutline {
  id: ProvinceId
  name: string
  /** 州名标注位置，落在轮廓内部。 */
  labelAt: LonLat
  rings: readonly (readonly string[])[]
}

export const PROVINCE_OUTLINES: readonly ProvinceOutline[] = [
`

const offsetSource = adjustedOffsets.length > 0 ? serializeOffsets(offsetBlock, offsets) : offsetBlock
const landComment = `/**
 * 塞外陆地（不属于十三州的陆地区域），来自 Natural Earth，公有领域。
 * 数据源：${LAND_URL}（Natural Earth 1:10m 陆地图层，公有领域）。
 * 已栅格化到与十三州相同的格网、扣除十三州陆地并抽稀，仅作底衬，不参与十三州分区。
 */
export const LAND_OUTLINES: readonly (readonly LonLat[])[] = [
`
const landLines = landOutlines
  .map((ring) => `  [${ring.map(([lon, lat]) => `[${round(lon)}, ${round(lat)}]`).join(', ')}],`)
  .join('\n')
const riverComment = `/**
 * 长江与黄河的中心线，来自 Natural Earth，公有领域。
 * 数据源：${riverUrl}（Natural Earth 1:10m 河流与湖泊中心线，公有领域）。
 * 已按图幅裁剪并抽稀，仅保留长江与黄河两条河流，均为开放折线。
 * 长江南京以下由制图综合产生的稀疏粗顶点改用沿真实河道的密集控制点，止于长江口的入海处。
 */
export const RIVER_LINES: readonly (readonly LonLat[])[] = [
`
const riverLinesSerialized = riverLines
  .map((line) => `  [${line.map(([lon, lat]) => `[${round(lon)}, ${round(lat)}]`).join(', ')}],`)
  .join('\n')
const output = `${header}${siteBlock}

${offsetSource}

${verticesComment}${vertexLines}
${outlineComment}${outlineBlocks.join('\n')}
]

${landComment}${landLines}
]

${riverComment}${riverLinesSerialized}
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
  const rings = provinceRings[p]
  if (rings.length <= 1) continue
  for (const ring of rings) {
    let minI = Infinity
    let maxI = -Infinity
    let minJ = Infinity
    let maxJ = -Infinity
    for (const [i, j] of ring) {
      if (i < minI) minI = i
      if (i > maxI) maxI = i
      if (j < minJ) minJ = j
      if (j > maxJ) maxJ = j
    }
    console.log(
      `    环 ${String(ring.length).padStart(5)} 点  lon ${(BOUNDS.minLon + minI * CELL).toFixed(2)}..${(BOUNDS.minLon + maxI * CELL).toFixed(2)}  lat ${(BOUNDS.minLat + minJ * CELL).toFixed(2)}..${(BOUNDS.minLat + maxJ * CELL).toFixed(2)}`,
    )
  }
}
console.log(`  合计\t${counts.reduce((a, b) => a + b, 0)}（去重 ${vertexEntries.length}）`)
console.log('战略点归属（栅格）：')
for (const [site, province] of Object.entries(assignments)) {
  console.log(`  ${site}\t${province ?? 'OUTSIDE'}`)
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
console.log(`河流容差 ${RIVER_DP_TOLERANCE_DEG}°，最小跨度 ${RIVER_MIN_SPAN_DEG}°，数据源 ${riverUrl}`)
for (const [key, label] of [
  ['yangtze', '长江'],
  ['yellow', '黄河'],
]) {
  const item = riverSummary[key]
  console.log(
    `  ${label}：匹配要素 ${item.features}（${item.names.join('、')}），折线 ${item.polylines} 条，顶点 ${item.points}，总长 ${item.km.toFixed(1)} km`,
  )
}
if (yangtzeTail !== null) {
  console.log(`  长江尾段：截去上游粗顶点 ${yangtzeTail.removed} 个，补入 ${yangtzeTail.added} 个`)
}
if (yellowCoast !== null) {
  console.log(
    `  黄河下游端收到海岸线：${yellowCoast.kind}，终点 [${round(yellowCoast.endpoint[0])}, ${round(yellowCoast.endpoint[1])}]` +
      (yellowCoast.km === null ? '' : `，距岸 ${yellowCoast.km.toFixed(1)} km`),
  )
}
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

