import { test, expect } from '@playwright/test'
import { setupMockRoutes } from './mocks'

test.describe('扫码登录', () => {
  test('二维码轮询 803 后携带 cookie 跳转首页（回归：cookie 随异常丢失导致不跳转）', async ({ page }) => {
    await setupMockRoutes(page)

    // 轮询序列：第一次 801 等待，之后 803 成功并返回 cookie
    let pollCount = 0
    await page.route('**/login/qr/check*', (route) => {
      pollCount++
      const body =
        pollCount === 1
          ? { code: 801, message: '等待扫码', cookie: '' }
          : { code: 803, message: '授权登录成功', cookie: 'MUSIC_U=qr-e2e-cookie' }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })
    await page.route('**/user/account*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          account: { id: 9 },
          profile: { userId: 9, nickname: '扫码用户', avatarUrl: 'https://p1.music.126.net/e2e-avatar.svg' },
        }),
      }),
    )

    await page.goto('/login')
    await page.getByTestId('tab-qr').click()

    // 二维码生成
    await expect(page.getByTestId('qr-status')).toContainText('扫码', { timeout: 10_000 })

    // 803 后跳转首页
    await page.waitForURL('/', { timeout: 20_000 })

    // 登录态与用户信息落库
    const auth = await page.evaluate(() => localStorage.getItem('nextmusic.auth'))
    expect(auth).not.toBeNull()
    expect(JSON.parse(auth!)).toMatchObject({ mode: 'user', cookie: 'MUSIC_U=qr-e2e-cookie' })
    await expect(page.locator('aside').getByText('扫码用户')).toBeVisible()
  })

  test('二维码过期（800）后提示过期并支持刷新', async ({ page }) => {
    await setupMockRoutes(page)
    await page.route('**/login/qr/check*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 800, message: '二维码已过期', cookie: '' }),
      }),
    )

    await page.goto('/login')
    await page.getByTestId('tab-qr').click()
    await expect(page.getByTestId('qr-status')).toContainText('过期', { timeout: 10_000 })
    await expect(page.getByRole('button', { name: '刷新二维码' })).toBeVisible()
  })
})
