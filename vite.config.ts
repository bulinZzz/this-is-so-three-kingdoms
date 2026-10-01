import { defineConfig } from 'vitest/config'

/** GitHub Pages 项目站点所在的子路径，开发与构建统一使用。 */
const GITHUB_PAGES_BASE = '/this-is-so-three-kingdoms/'

export default defineConfig({
  base: GITHUB_PAGES_BASE,
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'node',
  },
})
