import { test, expect } from '@playwright/test'
import { presetAuth, setupMockRoutes } from './mocks'

test.describe('移动端播放条', () => {
  test('390px 视口下播放模式按钮不被封面缩略图遮挡、可点击', async ({ page }) => {
    await setupMockRoutes(page)
    await presetAuth(page, 'guest')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/playlist/1')
    await page.getByLabel('播放 E2E Song A').click()
    await expect(page.getByTestId('player-bar')).toBeVisible()

    // 命中测试：模式按钮中心点必须命中按钮自身或其子元素。
    // 歌名区封面缩略图 shrink-0 且 position:relative，窄屏下会绘制在控制区按钮之上拦截点击，
    // 歌名区按钮必须 overflow-hidden 裁剪溢出（jsdom 无布局，组件测试钉不住，唯有真视口可测）。
    const modeBtn = page.getByLabel('播放模式')
    const hittable = await modeBtn.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return hit instanceof Element && (hit === el || el.contains(hit))
    })
    expect(hittable).toBe(true)
  })
})
