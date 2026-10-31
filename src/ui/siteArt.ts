import type { SiteType } from '../core/model'

/**
 * 战略点方图的线描插画：五类各一幅，统一 96×96 视图、同一套墨色与金色描边，
 * 在侧栏以 72×72 呈现。图片只是场景标识，规模文字仍随名称一起显示。
 */
export const SITE_ART: Record<SiteType, string> = {
  metropolis: `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 78h84" stroke="#4a3d2c" stroke-width="2" stroke-linecap="round"/>
  <path d="M12 78V52h10v-5h6v5h8v-5h24v5h8v-5h6v5h10v26" fill="#332a20" stroke="#8f7a53" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M41 78V64a7 7 0 0 1 14 0v14" fill="#1b1712" stroke="#c8b081" stroke-width="1.5"/>
  <path d="M34 52V40h28v12" fill="#3a2f23" stroke="#a08b63" stroke-width="1.5"/>
  <path d="M28 40l20-14 20 14z" fill="#5a472e" stroke="#d9a85f" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M48 26v-8" stroke="#d9a85f" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M48 18l9 3-9 3z" fill="#d9a85f"/>
</svg>`,
  city: `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 80h84" stroke="#4a3d2c" stroke-width="2" stroke-linecap="round"/>
  <path d="M10 80V58h12v-6h6v6h10v-6h6v6h16v-6h6v6h10v-6h6v6h6v22" fill="#332a20" stroke="#8f7a53" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M40 80V66a8 8 0 0 1 16 0v14" fill="#1b1712" stroke="#c8b081" stroke-width="1.5"/>
  <path d="M18 58V46h12v12" fill="#3a2f23" stroke="#a08b63" stroke-width="1.5"/>
  <path d="M13 46l11-8 11 8z" fill="#5a472e" stroke="#d9a85f" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M66 58V46h12v12" fill="#3a2f23" stroke="#a08b63" stroke-width="1.5"/>
  <path d="M61 46l11-8 11 8z" fill="#5a472e" stroke="#d9a85f" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`,
  town: `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 78h80" stroke="#4a3d2c" stroke-width="2" stroke-linecap="round"/>
  <path d="M22 78V60h52v18" fill="#332a20" stroke="#8f7a53" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M40 78V67a8 8 0 0 1 16 0v11" fill="#1b1712" stroke="#c8b081" stroke-width="1.5"/>
  <path d="M30 60V52h36v8" fill="#3a2f23" stroke="#a08b63" stroke-width="1.5"/>
  <path d="M26 52l22-12 22 12z" fill="#5a472e" stroke="#d9a85f" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M14 78v-8m6 8v-5m56 5v-7m6 7v-4" stroke="#6b5535" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  pass: `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 82h84" stroke="#4a3d2c" stroke-width="2" stroke-linecap="round"/>
  <path d="M8 82V34l16 10v38z" fill="#332a20" stroke="#6b5535" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M88 82V34L72 44v38z" fill="#332a20" stroke="#6b5535" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M32 82V56h32v26" fill="#3a2f23" stroke="#a08b63" stroke-width="1.5"/>
  <path d="M28 56l20-12 20 12z" fill="#5a472e" stroke="#d9a85f" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M42 82V68a6 6 0 0 1 12 0v14" fill="#1b1712" stroke="#c8b081" stroke-width="1.5"/>
</svg>`,
  field: `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 82h84" stroke="#4a3d2c" stroke-width="2" stroke-linecap="round"/>
  <path d="M6 82c14-18 26-24 38-22s24 12 46 0v22z" fill="#332a20" stroke="#6b5535" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M8 80c16-8 30-10 44-6s24 6 36 2" fill="none" stroke="#8f7a53" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M20 72l4-8m-2 8l3-6m38 6l4-8m-2 8l3-6" stroke="#8f7a53" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M64 76v-9" stroke="#8f7a53" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="64" cy="62" r="6" fill="#3a3128" stroke="#8f7a53" stroke-width="1.5"/>
</svg>`,
}
