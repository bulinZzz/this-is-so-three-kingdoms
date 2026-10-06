import { defineConfig } from 'vitest/config'

/** 推演专用配置：只跑 tools 下的推演脚本，不并入 npm test。 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tools/acceptance.ts'],
  },
})
