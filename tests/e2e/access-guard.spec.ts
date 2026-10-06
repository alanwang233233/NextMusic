import { test, expect } from '@playwright/test'
import { setupMockRoutes } from './mocks'

test.describe('路由守卫', () => {
  test('未登录访问私人 FM / 每日推荐重定向到登录页', async ({ page }) => {
    await setupMockRoutes(page)
    await page.goto('/fm')
    await page.waitForURL(/\/login/)
    await expect(page.getByText('该功能需要登录后使用')).toBeVisible()

    await page.goto('/daily')
    await page.waitForURL(/\/login/)
  })

  test('私人 FM 登录后可播放并跳过歌曲', async ({ page }) => {
    await setupMockRoutes(page)
    await page.addInitScript(() => {
      localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'guest', cookie: 'MUSIC_U=guest-cookie' }))
    })
    // FM 需要正式登录，游客同样被拦截
    await page.goto('/fm')
    await page.waitForURL(/\/login/)

    // 模拟正式登录态（cookie 由 mock 消化）
    await page.addInitScript(() => {
      localStorage.setItem(
        'nextmusic.auth',
        JSON.stringify({ mode: 'user', cookie: 'MUSIC_U=user-cookie', profile: { userId: 1, nickname: 'E2E 正式用户', avatarUrl: '' } }),
      )
    })
    await page.goto('/fm')
    await expect(page.getByTestId('fm-view')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('E2E Song A').first()).toBeVisible()
    await page.getByTestId('fm-next').click()
    await expect(page.getByText('E2E Song B').first()).toBeVisible()
  })
})
