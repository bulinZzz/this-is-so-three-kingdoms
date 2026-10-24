// 战略点邻接推导器
//
// 依据 src/game/mapData.ts 中的 SITE_COORDINATES，按 Gabriel 图推导战略点的相邻关系：
// 两点相邻，当且仅当没有第三个参与推导的战略点落在以这两点为直径的圆内。
// 邻接表按投影距离升序排列。
//
// 参与推导的节点取自被推导的那份地理数据：只有在它里面登记、且在 SITE_COORDINATES 里有坐标的点才入图。
// 野地默认不入图——旧图里野地是无归属的公共区域，两城之间纵有野地仍可直接行军，故它既不作节点也不作阻挡；
// 新图里野地可参与行军，传 `--fields` 令野地一并入图。
//
// 本脚本只打印结果，不修改任何文件；运行时不依赖 Phaser。运行：
//   node tools/buildAdjacency.mjs                                                       # 旧图
//   node tools/buildAdjacency.mjs geographySanguoNew GEOGRAPHY_SANGUO_NEW --fields      # 新图，野地入图
//
// Node 无法直接加载 src/game/mapLayout.ts（其内部为无扩展名的相对导入），
// 故此处复制该模块的投影参数，取值与 src/game/mapLayout.ts 保持一致。

import { readFileSync } from 'node:fs'

/**
 * 强制相邻的战略点对：几何规则（Gabriel 图）之外，因史实需要必须连通的两点。
 * 每项为 [点甲, 点乙]，并在注释中说明理由；这些点对无条件写入邻接表，不再受几何约束。
 * 只对已入图的点生效：引用未入图的点即跳过，故同一张表可为不同 geography 复用。
 */
const FORCED_EDGES = [
  // 零陵与武陵同属荆南，湘江与沅水水道相通；长沙落在两点直径圆内，仅凭几何会误判为不相邻。
  ['lingling', 'wuling'],
  // 公安与夷陵同临长江，水路相通；江陵落在两点直径圆内，仅凭几何会误判为不相邻。
  ['gongan', 'yiling'],
  // 公安与长沙由长江转洞庭湖入湘江相通，荆南不必只从武陵一处进入；武陵落在两点直径圆内（擦边），仅凭几何会误判为不相邻。
  ['gongan', 'changsha'],
  // 赤壁与江陵隔江相望，荆扬之间多由此渡；公安落在两点直径圆内，仅凭几何会误判为不相邻。
  ['chibi', 'jiangling'],
  // 成都与绵竹同在成都平原北端，大道直通；雒城落在两点直径圆内，仅凭几何会误判为不相邻。
  ['chengdu', 'mianzhu'],
  // 南郑与阳平关由汉中腹地的大道直通；定军山落在两点直径圆内，仅凭几何会误判为不相邻。
  ['nanzheng', 'yangpingguan'],
  // 定军山与葭萌关同在汉中南缘的山道上相通，是刘备由葭萌关北上取汉中的一路；
  // 阳平关落在两点直径圆内，仅凭几何会误判为不相邻。
  ['dingjunshan', 'jiamengguan'],
  // 寿春在淮南、广陵在江北，两地本通；建业落在两点直径圆内，仅凭几何会误判为不相邻。
  ['shouchun', 'guangling'],
  // 赤壁与柴桑隔江相望，荆扬之间多由此渡；江北的江夏落在两点直径圆内，仅凭几何会误判为不相邻。
  ['chibi', 'chaisang'],
  // 成都与泸水是自蜀中南渡金沙江的一路；雒城、绵竹落在两点直径圆内，仅凭几何会误判为不相邻。
  ['chengdu', 'lushui'],
  // 陈仓与阳平关是陈仓道（故道）的一线，自关中出散关、经略阳入汉中；定军山落在两点直径圆内，仅凭几何会误判为不相邻。
  ['chencang', 'yangpingguan'],
  // 子午谷与长安是子午道的北段，自长安南入秦岭；槐里落在两点直径圆内，仅凭几何会误判为不相邻。
  ['changan', 'zhiwugu'],
  // 金城与天水是陇右东西一线的大道；此边为设计所需，无条件写入。
  ['tianshui', 'jincheng'],
  // 柴桑与建业同在长江南岸，水军自柴桑顺流东下即入建业；濡须落在两点直径圆内，仅凭几何会误判为不相邻。
  ['chaisang', 'jianye'],
  // 许都与谯是中原南下淮南的第一程；陈留落在两点直径圆内，仅凭几何会误判为不相邻。
  ['xudu', 'qiao'],
]

/**
 * 强制不相邻的战略点对：几何上无第三点阻挡，但两地之间隔着秦岭、巴山，并无直接通道。
 * 每项为 [点甲, 点乙]，并在注释中说明理由；这些点对从邻接表中删除。
 * 与强制相邻同理，只对已入图的点生效。
 */
const EXCLUDED_EDGES = [
  // 长安在关中、白帝城在巴东，中隔秦岭与大巴山，须经汉中或葭萌关绕行。
  ['changan', 'baidicheng'],
  // 临淄在青州、小沛在豫州，中隔兖、徐二州，并无直接通道。
  ['linzi', 'xiaopei'],
  // 晋阳在并州、蓟在幽州，中隔冀州（太行、恒山），须经邺或南皮绕行。
  ['jinyang', 'jicheng'],
  // 柳城在辽西、临淄在青州，中隔渤海，无陆路直通，须沿海南下或绕行幽、冀。
  ['liucheng', 'linzi'],
  // 龙编在交趾、江州在巴郡，中隔云贵高原（南中），无直接通道，须经荆州或益州南部绕行。
  ['longbian', 'jiangzhou'],
  // 合肥与柴桑一在淮南、一在豫章，中隔庐江；两地不直连，须绕皖城、江夏。
  ['hefei', 'chaisang'],
  // 潼关在关中、襄阳在南阳盆地，中隔秦岭；武关道本就经宛与武关，眼下这两点尚未入图，暂不相通。
  ['tongguan', 'xiangyang'],
  // 夷陵在荆州、南郑在汉中，中隔巴山与神农架，并无直接通道。
  ['yiling', 'nanzheng'],
  // 陈仓道自阳平关入汉中，南郑与陈仓之间不直通。
  ['chencang', 'nanzheng'],
  // 子午谷在南郑与长安之间；槐里在渭北，与子午道并无直接通路。
  ['zhiwugu', 'huaili'],
  // 子午谷是长安与南郑之间的谷道，与渭北的陈仓隔着秦岭北坡，并无直接通路；陈仓入长安仍走槐里。
  ['zhiwugu', 'chencang'],
  // 子午谷在秦岭中，白帝城在巴东，中隔汉中与大巴山，并无直接通道。
  ['zhiwugu', 'baidicheng'],
  // 白帝城在巴东、南郑在汉中，中隔大巴山；米仓道沿线的其他点尚未入图，眼下暂不相通。
  ['baidicheng', 'nanzheng'],
  // 成都与江州同在四川盆地，几何上可直连；但涪城—江州已开通路，再连这一条只是重复走廊，暂不相通。
  ['chengdu', 'jiangzhou'],
  // 洛阳在司隶、襄阳在荆州，中隔南阳盆地；宛尚未入图，眼下两地暂不相通。
  ['luoyang', 'xiangyang'],
  // 许都在豫州、襄阳在荆州，同样中隔南阳（宛）；宛尚未入图，眼下两地暂不相通。
  ['xudu', 'xiangyang'],
  // 陈留在兖州、合肥在扬州，中隔豫、徐二州，并无直接通道。
  ['chenliu', 'hefei'],
  // 许都在豫州、合肥在扬州，中隔汝南、寿春一带；这一线尚未铺开，眼下两地暂不相通。
  ['xudu', 'hefei'],
  // 邺在河北、虎牢关在河南，中隔黄河；白马、濮阳一带尚未入图，眼下两地暂不相通。
  ['ye', 'hulao'],
  // 定军山与阳平关之间隔着一道山，两处并不直接相通；刘备取汉中正是绕开阳平关、转从定军山破敌。
  ['dingjunshan', 'yangpingguan'],
  // 武陵与夷陵同临长江，入荆南本多取此道；但夷陵归曹操后，若仍连通，曹操便与荆南贴邻，
  // 刘备取四郡时北军可由此插手——故断此边，荆南改由公安、长沙、零陵三处出入。
  ['yiling', 'wuling'],
  // 淮南与中原之间尚未铺开，寿春暂不直通陈留；寿春与合肥同在淮南，仍可相通。
  ['shouchun', 'chenliu'],
  // 谯只作许都—寿春之间的一站，不另开东出陈留的直道。
  ['chenliu', 'qiao'],
  // 谯在涡水一线、江夏在长江北岸，中隔淮河与大别山，两地并无直接通道。
  ['qiao', 'jiangxia'],
  // 广陵隔江与京口相望，是江东出入江北的渡口，向北只通寿春，不直通建业。
  ['guangling', 'jianye'],
  // 江夏眼下只通柴桑与赤壁；北面的襄阳、合肥两线待庐江一带铺开后再接。
  ['jiangxia', 'xiangyang'],
  ['jiangxia', 'hefei'],
  // 江夏在江北、皖城在庐江，中隔大别山，并无直达道路；两地须经柴桑或合肥绕行。
  ['jiangxia', 'wanxian'],
  // 金城在陇右、阳平关在汉中，中隔陇山与秦岭，并无直接通道；金城眼下只东出天水、西出西平关。
  ['jincheng', 'yangpingguan'],
  // 泸水在金沙江上，是蜀军南渡之处；与江州中隔越嶲、犍为的山道，出入南中只走成都一路。
  ['lushui', 'jiangzhou'],
  // 天水隔陇山不通槐里、隔秦岭不通阳平关；陇右入关中只走天水—街亭—陈仓一路，街亭由此扼住陇右门户。金城亦不直通槐里。
  ['tianshui', 'huaili'],
  ['tianshui', 'yangpingguan'],
  ['jincheng', 'huaili'],
  // 天水与陈仓分在陇山东西，中间只隔着街亭；关中入陇右走陈仓—街亭，不另开直道。
  ['tianshui', 'chencang'],
  // 金城与街亭、祁山之间隔着陇山与天水，一应出入皆过天水，不另开直道。
  ['jieting', 'jincheng'],
  ['qishan', 'jincheng'],
  // 祁山道自祁山经武都入汉中，祁山不再直通阳平关。
  ['qishan', 'yangpingguan'],
  // 武都入关中须经阳平关走陈仓道、或经祁山走街亭，陇南与关中不另开直道。
  ['wudu', 'chencang'],
  // 泸水在金沙江上属南中，龙编在交趾，中隔云贵群山，并无直接通道；出入交州只走番禺、合浦一路。
  ['lushui', 'longbian'],
  // 会稽与番禺相距千里，海路须经东冶转接，不另开直连。
  ['kuaiji', 'panyu'],
  // 东冶在闽中、柴桑在豫章，中隔武夷山；东冶只作海路的一站，不与内陆直连。
  ['dongye', 'chaisang'],
  // 东冶在闽中、桂阳在湘南，中隔南岭东段，并无直接通道。
  ['dongye', 'guiyang'],
  // 广信当西江一线，北面隔着南岭；入荆南走番禺、桂阳一路，不另开越岭的直道。
  ['guangxin', 'guiyang'],
  ['guangxin', 'lingling'],
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

// 被推导的地理模块与导出名取自命令行，缺省为旧图；`--fields` 令野地一并入图。
const [geographyModule = 'geographySanguo', geographyExport = 'GEOGRAPHY_SANGUO'] =
  process.argv.slice(2)
const includeFields = process.argv.includes('--fields')

const mapData = readFileSync(new URL('../src/game/mapData.ts', import.meta.url), 'utf8')
const geographySource = readFileSync(
  new URL(`../src/core/${geographyModule}.ts`, import.meta.url),
  'utf8',
)

const coordinates = evaluateObject(extractBlock(mapData, 'SITE_COORDINATES'))
const geography = evaluateObject(extractBlock(geographySource, geographyExport))

const names = new Map(geography.sites.map((site) => [site.id, site.name]))
const siteIds = new Set(geography.sites.map((site) => site.id))
const fieldIds = new Set(
  geography.sites.filter((site) => site.type === 'field').map((site) => site.id),
)
// 按 mapData 的书写顺序取节点，输出才稳定可比。
const ids = Object.keys(coordinates).filter(
  (id) => siteIds.has(id) && (includeFields || !fieldIds.has(id)),
)

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
    if (!adjacency.has(u) || !adjacency.has(v)) continue
    if (!adjacency.get(u).includes(v)) adjacency.get(u).push(v)
    if (!adjacency.get(v).includes(u)) adjacency.get(v).push(u)
  }
  for (const [u, v] of EXCLUDED_EDGES) {
    if (!adjacency.has(u) || !adjacency.has(v)) continue
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

console.log(`地理数据：${geographyModule}.ts 的 ${geographyExport}；节点 ${ids.length} 个`)
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

const start = ids[0]
if (start === undefined) {
  console.log('没有可参与推导的战略点')
} else {
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
  console.log(`从 ${start} 可达全部战略点：${reachable ? '是' : '否'}（${visited.size}/${ids.length}）`)
  if (!reachable) {
    console.log(`不可达：${ids.filter((id) => !visited.has(id)).join(', ')}`)
  }
}
