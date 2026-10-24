import { test, expect } from '@playwright/test'
import { setupMockRoutes } from './mocks'

test.describe('游客登录完整链路', () => {
  test('游客登录 → 首页 → 歌单 → 播放', async ({ page }) => {
    const state = await setupMockRoutes(page)
    await page.goto('/login')

    // 游客登录
    await page.getByTestId('guest-login').click()
    await page.waitForURL('/')
    await expect(page.getByTestId('player-bar')).toHaveCount(0)

    // 首页渲染推荐歌单
    await expect(page.getByText('推荐歌单 1', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('热门歌手')).toBeVisible()
    await expect(page.getByText('排行榜')).toBeVisible()

    // 进入歌单详情
    await page.getByText('推荐歌单 1').first().click()
    await page.waitForURL('/playlist/1000')
    // 注意：playlist/1000 未在 mock 中特殊处理，通用 playlist/detail 返回 E2E 精选歌单
    await expect(page.getByText('E2E 精选歌单')).toBeVisible()
    await expect(page.getByTestId('play-all')).toBeVisible()

    // 点击第一首歌曲 → 播放条出现
    await page.getByLabel('播放 E2E Song A').click()
    await expect(page.getByTestId('player-bar')).toBeVisible()
    await expect(page.getByText('E2E Song A').first()).toBeVisible()

    // 302 播放链路被命中
    expect(state.song302Calls).toBeGreaterThan(0)
  })

  test('播放过程中可打开全屏歌词页，高亮行不被遮挡', async ({ page }) => {
    await setupMockRoutes(page)
    await page.addInitScript(() => {
      localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'guest', cookie: 'MUSIC_U=guest-cookie' }))
    })
    await page.goto('/playlist/1')
    await expect(page.getByTestId('play-all')).toBeVisible()
    await page.getByLabel('播放 E2E Song A').click()
    await expect(page.getByTestId('player-bar')).toBeVisible()

    // 点击封面打开正在播放
    await page.getByLabel('打开播放页').click()
    await expect(page.getByTestId('now-playing')).toBeVisible()
    await expect(page.getByText('E2E 歌词行 1', { exact: true })).toBeVisible()

    // seek 到中段：高亮行跳到滚动后才能可见的中间行（约第 10 行）
    const slider = page.locator('input[aria-label="播放进度"]')
    await slider.evaluate((el) => {
      const input = el as HTMLInputElement
      input.value = '500'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.locator('[data-testid="lyrics-box"] p.text-white').first()).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1200) // 等待平滑滚动到位

    // 高亮行完整落在歌词可视区域内且大致居中（不被顶部栏遮挡）
    const box = await page.getByTestId('lyrics-box').boundingBox()
    const active = await page.locator('[data-testid="lyrics-box"] p.text-white').first().boundingBox()
    expect(box).not.toBeNull()
    expect(active).not.toBeNull()
    // 允许 scale-105 造成的 2px 误差
    expect(active!.y).toBeGreaterThanOrEqual(box!.y - 2)
    expect(active!.y + active!.height).toBeLessThanOrEqual(box!.y + box!.height + 2)
    // 高亮行应大致居中（偏差不超过盒子高度的 25%）
    const lineCenter = active!.y + active!.height / 2 - box!.y
    expect(Math.abs(lineCenter - box!.height / 2)).toBeLessThan(box!.height * 0.25)

    await page.getByTestId('close-now-playing').click()
    await expect(page.getByTestId('now-playing')).toHaveCount(0)
  })

  test('游客模式喜欢歌曲被拦截并提示', async ({ page }) => {
    const state = await setupMockRoutes(page)
    await page.addInitScript(() => {
      localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'guest', cookie: 'MUSIC_U=guest-cookie' }))
    })
    await page.goto('/playlist/1')
    await expect(page.getByTestId('play-all')).toBeVisible()

    await page.getByLabel('喜欢').first().click()
    await expect(page.getByText('游客模式不支持该操作，请先登录')).toBeVisible()
    expect(state.likeCalls).toHaveLength(0)
  })
})
