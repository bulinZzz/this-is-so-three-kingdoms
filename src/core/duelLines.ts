import type { Character, CharacterId, Personality } from './model'

/** 名将出马时的挑战台词，按武将 id；不在名单里者按性格出通用台词。 */
const NAMED_CHALLENGES: Partial<Record<CharacterId, string>> = {
  guanyu: '关某刀下，不斩无名之辈！',
  zhangfei: '吾乃燕人张翼德也！谁敢来与我决一死战！',
  zhaoyun: '常山赵子龙在此，谁敢与我一战！',
  machao: '锦马超在此，可敢与我一决高下！',
  huangzhong: '老将黄忠在此，箭不虚发！',
  weiyan: '魏延在此，谁敢当先！',
  xuchu: '虎痴许仲康在此，谁来送死！',
  taishici: '太史慈在此，愿者上钩！',
  ganning: '锦帆甘宁在此，纳命来！',
  zhouyu: '周瑜在此，可敢一战！',
  zhangliao: '雁门张文远，请赐教！',
  xiahoudun: '独眼夏侯惇在此，何人敢挡！',
  xiahouyuan: '妙才夏侯渊，来战！',
  chengpu: '程普在此，老夫尚能开弓！',
  huanggai: '黄盖在此，可敢近前！',
  handang: '韩当在此，谁来领教！',
}

/** 名将应战时的回话，按武将 id；不在名单里者按性格出通用台词。 */
const NAMED_RESPONSES: Partial<Record<CharacterId, string>> = {
  guanyu: '既来送死，关某成全你。',
  zhangfei: '来得正好，吃我一矛！',
  zhaoyun: '请。',
  machao: '好胆，看枪！',
  huangzhong: '老夫刀下，从不留情。',
  weiyan: '谁怕谁来，动手吧！',
  xuchu: '来得好，某家正缺个对手！',
  taishici: '愿者上钩，便来！',
  ganning: '有种的便上前！',
  zhouyu: '既敢挑战，便让你见识见识。',
  zhangliao: '既已至此，请！',
  xiahoudun: '匹夫，受死！',
  xiahouyuan: '来将通名！',
  chengpu: '后生可畏，放马过来。',
  huanggai: '老夫接下了，来！',
  handang: '不知死活，来吧。',
  caimao: '这……来将何人？',
}

/** 各性格出马时的通用台词。 */
const PERSONALITY_CHALLENGES: Record<Personality, string> = {
  open: '来将可敢报上名来！',
  scheming: '匹夫之勇，何必逞强。',
  brave: '谁来与我大战三百回合！',
  steady: '既已列阵，便来分个高下。',
  cautious: '刀剑无眼，阁下三思。',
  proud: '尔等鼠辈，也敢与我争锋？',
}

/** 各性格应战时的通用回话。 */
const PERSONALITY_RESPONSES: Record<Personality, string> = {
  open: '既然来了，便一战！',
  scheming: '既是单挑，某便陪你走两合。',
  brave: '正合我意，来战！',
  steady: '请。',
  cautious: '刀剑无眼，你可想清楚了？',
  proud: '不知死活的东西，来吧。',
}

/** 某武将出马挑战时的台词。 */
export function duelLineOf(character: Character): string {
  return NAMED_CHALLENGES[character.id] ?? PERSONALITY_CHALLENGES[character.personality]
}

/** 某武将应战时的回话。 */
export function duelResponseLineOf(character: Character): string {
  return NAMED_RESPONSES[character.id] ?? PERSONALITY_RESPONSES[character.personality]
}
