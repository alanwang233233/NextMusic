import { test, expect } from '@playwright/test'
import { setupMockRoutes } from './mocks'

test.describe('搜索流程', () => {
  test('热搜展示 → 关键词搜索 → 结果可播放', async ({ page }) => {
    const _state = await setupMockRoutes(page)
    await page.goto('/search')

    // 热搜词
    await expect(page.getByText('热门搜索')).toBeVisible()
    await expect(page.getByText('热词1').first()).toBeVisible()

    // 关键词搜索
    await page.getByLabel('搜索关键词').fill('E2E Song')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('player-bar')).toHaveCount(0)
    await expect(page.getByText('E2E Song A')).toBeVisible()
    await expect(page.getByText('E2E Song B')).toBeVisible()

    // 播放搜索结果
    await page.getByLabel('播放 E2E Song A').click()
    await expect(page.getByTestId('player-bar')).toBeVisible()
  })

  test('切换到歌手 Tab 展示歌手结果', async ({ page }) => {
    await setupMockRoutes(page)
    await page.goto('/search?q=artist')
    await page.getByLabel('搜索关键词').fill('E2E Artist')
    await page.keyboard.press('Enter')
    await expect(page.getByText('E2E Song A')).toBeVisible()

    await page.getByRole('button', { name: '歌手' }).click()
    await expect(page.getByText('E2E Artist')).toBeVisible()
  })
})
