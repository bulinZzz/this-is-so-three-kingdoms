// 战略点邻接推导器
//
// 依据 src/game/mapData.ts 中的 SITE_COORDINATES，按 Gabriel 图推导全部战略点的相邻关系：
// 两点相邻，当且仅当没有第三个战略点落在以这两点为直径的圆内。
// 邻接表按投影距离升序排列。
//
// 本脚本只打印结果，不修改任何文件；运行时不依赖 Phaser。
// 运行：node tools/buildAdjacency.mjs
//
// Node 无法直接加载 src/game/mapLayout.ts（其内部为无扩展名的相对导入），
// 故此处复制该模块的投影参数，取值与 src/game/mapLayout.ts 保持一致。

import { readFileSync } from 'node:fs'

/**
 * 强制相邻的战略点对：几何规则（Gabriel 图）之外，因史实需要必须连通的两点。
 * 每项为 [点甲, 点乙]，并在注释中说明理由；这些点对无条件写入邻接表，不再受几何约束。
 */
const FORCED_EDGES = [
  // 赤壁之战为孙刘联军；柴桑是周瑜的前线基地。
  ['chibi', 'chaisang'],
  // 江陵与夷陵之间是长江水道，舟行直通；当阳的长坂坡落在这条直径圆内，仅凭几何会误判为不相邻。
  ['jiangling', 'yiling'],
  // 零陵与武陵同属荆南，湘江与沅水水道相通；长沙落在两点直径圆内，仅凭几何会误判为不相邻。
  ['lingling', 'wuling'],
]

/**
 * 强制不相邻的战略点对：几何上无第三点阻挡，但两地之间隔着秦岭、巴山，并无直接通道。
 * 每项为 [点甲, 点乙]，并在注释中说明理由；这些点对从邻接表中删除。
 */
const EXCLUDED_EDGES = [
  // 长安在关中、白帝城在巴东，中隔秦岭与大巴山，须经汉中或葭萌关绕行。
  ['changan', 'baidicheng'],
  // 临淄在青州、小沛在豫州，中隔兖、徐二州，并无直接通道。
  ['linzi', 'xiaopei'],
  // 晋阳在并州、蓟在幽州，中隔冀州（太行、恒山），须经邺或南皮绕行。
  ['jinyang', 'jicheng'],
]

// 制图经纬度范围，唯一来源为 src/game/mapBounds.json，与 src/game/mapLayout.ts 共用；
// 其余投影参数与 src/game/mapLayout.ts 保持一致。
const BOUNDS = JSON.parse(
  readFileSync(new URL('../src/game/mapBounds.json', import.meta.url), 'utf8'),
)
const REFERENCE_LATITUDE = 33
const KM_PER_LATITUDE_DEGREE = 110.57
const KM_PER_LONGITUDE_DEGREE = 111.32 * Math.cos((REFERENCE_LATITUDE * Math.PI) / 180)
const PIXELS_PER_KILOMETER = 0.5

function projectLonLat([lon, lat]) {
  return {
    x: (lon - BOUNDS.minLon) * KM_PER_LONGITUDE_DEGREE * PIXELS_PER_KILOMETER,
    y: (BOUNDS.maxLat - lat) * KM_PER_LATITUDE_DEGREE * PIXELS_PER_KILOMETER,
  }
}

/** 从源码中截取 `export const <name> ... = { ... }` 的完整声明（含其上方注释）。 */
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

/** 把对象字面量声明求值为 JavaScript 值。 */
function evaluateObject(block) {
  const text = block.slice(block.indexOf('=') + 1).trim()
  const object = text.slice(0, text.lastIndexOf('}') + 1)
  return new Function(`return ${object}`)()
}

const mapData = readFileSync(new URL('../src/game/mapData.ts', import.meta.url), 'utf8')
const geographySource = readFileSync(new URL('../src/core/geographySanguo.ts', import.meta.url), 'utf8')

const coordinates = evaluateObject(extractBlock(mapData, 'SITE_COORDINATES'))
const geography = evaluateObject(extractBlock(geographySource, 'GEOGRAPHY_SANGUO'))

const names = new Map(geography.sites.map((site) => [site.id, site.name]))
const ids = Object.keys(coordinates)

const projected = new Map(ids.map((id) => [id, projectLonLat(coordinates[id])]))
const pixelDistance = (a, b) => {
  const p = projected.get(a)
  const q = projected.get(b)
  return Math.hypot(p.x - q.x, p.y - q.y)
}
const km = (a, b) => pixelDistance(a, b) / PIXELS_PER_KILOMETER

/**
 * 点 w 是否严格落在以 u、v 为直径的圆内（等价于 u-w-v 为钝角）。
 * 落在圆内即破坏 u 与 v 的相邻关系。
 */
function insideDiameterCircle(w, u, v) {
  const a = projected.get(w)
  const b = projected.get(u)
  const c = projected.get(v)
  return (a.x - b.x) * (a.x - c.x) + (a.y - b.y) * (a.y - c.y) < 0
}

function buildAdjacency() {
  const adjacency = new Map(ids.map((id) => [id, []]))
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const u = ids[i]
      const v = ids[j]
      const blocked = ids.some((w) => w !== u && w !== v && insideDiameterCircle(w, u, v))
      if (!blocked) {
        adjacency.get(u).push(v)
        adjacency.get(v).push(u)
      }
    }
  }
  for (const [u, v] of FORCED_EDGES) {
    if (!adjacency.has(u) || !adjacency.has(v)) {
      throw new Error(`强制相邻引用了未知战略点：${u} - ${v}`)
    }
    if (!adjacency.get(u).includes(v)) adjacency.get(u).push(v)
    if (!adjacency.get(v).includes(u)) adjacency.get(v).push(u)
  }
  for (const [u, v] of EXCLUDED_EDGES) {
    if (!adjacency.has(u) || !adjacency.has(v)) {
      throw new Error(`强制不相邻引用了未知战略点：${u} - ${v}`)
    }
    const listU = adjacency.get(u)
    const listV = adjacency.get(v)
    const indexU = listU.indexOf(v)
    if (indexU !== -1) listU.splice(indexU, 1)
    const indexV = listV.indexOf(u)
    if (indexV !== -1) listV.splice(indexV, 1)
  }
  for (const [id, list] of adjacency) {
    list.sort((a, b) => pixelDistance(id, a) - pixelDistance(id, b))
  }
  return adjacency
}

const adjacency = buildAdjacency()

for (const id of ids) {
  const list = adjacency.get(id)
  console.log(`${names.get(id) ?? '?'} ${id}`)
  console.log(`  neighbors: [${list.map((neighbor) => `'${neighbor}'`).join(', ')}],`)
  for (const neighbor of list) {
    console.log(`  ${neighbor} ${names.get(neighbor) ?? '?'} ${km(id, neighbor).toFixed(1)} km`)
  }
}

const edgeCount = ids.reduce((sum, id) => sum + adjacency.get(id).length, 0) / 2
console.log(`总边数：${edgeCount}`)

const start = 'xinye'
const visited = new Set([start])
const queue = [start]
while (queue.length > 0) {
  const current = queue.shift()
  for (const neighbor of adjacency.get(current) ?? []) {
    if (!visited.has(neighbor)) {
      visited.add(neighbor)
      queue.push(neighbor)
    }
  }
}
const reachable = ids.every((id) => visited.has(id))
console.log(`从新野可达全部战略点：${reachable ? '是' : '否'}（${visited.size}/${ids.length}）`)
if (!reachable) {
  console.log(`不可达：${ids.filter((id) => !visited.has(id)).join(', ')}`)
}
