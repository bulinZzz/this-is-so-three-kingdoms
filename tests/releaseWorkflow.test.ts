import { describe, expect, it } from 'vitest'
import workflow from '../.github/workflows/deploy.yml?raw'

/**
 * 发布工作流的门禁顺序：单元测试 → 验收推演 → 生产构建 → 上传 → 部署。
 * 验收失败时命令以非零退出，构建任务随之失败，依赖它的部署任务不会执行。
 */
describe('发布工作流', () => {
  it('单元测试、验收推演、生产构建与上传按门禁顺序执行', () => {
    const unitTests = workflow.indexOf('npm test')
    const acceptance = workflow.indexOf('npm run acceptance')
    const build = workflow.indexOf('npm run build')
    const upload = workflow.indexOf('actions/upload-pages-artifact')

    expect(unitTests).toBeGreaterThan(-1)
    expect(acceptance).toBeGreaterThan(-1)
    expect(build).toBeGreaterThan(-1)
    expect(upload).toBeGreaterThan(-1)

    expect(unitTests).toBeLessThan(acceptance)
    expect(acceptance).toBeLessThan(build)
    expect(build).toBeLessThan(upload)
  })

  it('部署任务依赖构建任务，构建失败时不会部署', () => {
    expect(workflow).toMatch(/deploy:\s*\n\s*needs: build/)
  })

  it('发布 Actions 使用 Node 24 兼容版本', () => {
    expect(workflow).toContain('actions/checkout@v5')
    expect(workflow).toContain('actions/setup-node@v5')
    expect(workflow).toContain('actions/upload-pages-artifact@v5')
    expect(workflow).toContain('actions/deploy-pages@v5')
  })
})
