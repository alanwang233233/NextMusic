import { test, expect } from '@playwright/test'
import { setupMockRoutes, type MockState } from './mocks'

test.describe('预缓存（播放进度过半自动触发）', () => {
  test('播放进度过半后自动预缓存下一曲并显示指示', async ({ page }) => {
    const state: MockState = await setupMockRoutes(page)
    await page.addInitScript(() => {
      localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'guest', cookie: 'MUSIC_U=guest-cookie' }))
    })

    const callsBefore = state.song302Calls
    await page.goto('/playlist/1')
    await expect(page.getByTestId('play-all')).toBeVisible({ timeout: 10_000 })
    await page.getByLabel('播放 E2E Song A').click()
    await expect(page.getByTestId('play-toggle')).toHaveAttribute('aria-label', '暂停', { timeout: 20_000 })

    // 10s 音频播放到 5s（过半）后触发预缓存 Song B
    // 主链解析（Song A）+ 预缓存解析（Song B）
    await expect
      .poll(() => state.song302Calls, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(callsBefore + 2)

    // 预缓存完成后出现「下一首已缓存」指示（容忍缓冲态短暂切换）
    await expect
      .poll(async () => (await page.getByTestId('player-bar').textContent()) ?? '', { timeout: 20_000 })
      .toContain('下一首已缓存')
  })

  test('手动切歌直接命中预缓存（不再为该曲发起解析请求）', async ({ page }) => {
    const state: MockState = await setupMockRoutes(page)
    // Song B 的 302 一律失败 → 其预缓存只能通过 OuterAPI 解析出直链
    await page.route('**/song/url/v1/302*', (route) => {
      if (route.request().url().includes('id=102')) {
        return route.fulfill({ status: 500, body: 'blocked for test' })
      }
      return route.fallback()
    })
    await page.addInitScript(() => {
      localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'guest', cookie: 'MUSIC_U=guest-cookie' }))
    })

    await page.goto('/playlist/1')
    await expect(page.getByTestId('play-all')).toBeVisible({ timeout: 10_000 })
    await page.getByLabel('播放 E2E Song A').click()
    await expect(page.getByTestId('play-toggle')).toHaveAttribute('aria-label', '暂停', { timeout: 20_000 })

    // 等待 Song B 预缓存完成（走 OuterAPI 解析）
    await expect
      .poll(async () => (await page.getByTestId('player-bar').textContent()) ?? '', { timeout: 20_000 })
      .toContain('下一首已缓存')
    const outerForB = state.outerCallsById[102] ?? 0
    expect(outerForB).toBeGreaterThanOrEqual(1) // Song B 的预缓存消耗了一次 OuterAPI 解析

    // 手动下一曲：命中预缓存直链，Song B 不再产生任何解析请求
    // （回绕预加载 Song A 可能产生新的解析调用，属正常行为，按 id 分别计数）
    await page.locator('button[aria-label="下一曲"]').click()
    await page.waitForTimeout(1500)
    expect(state.outerCallsById[102] ?? 0).toBe(outerForB)
    // Song B 正在播放
    await expect(page.getByTestId('player-bar')).toContainText('E2E Song B')
  })

  test('音源标识与卡顿提示已从播放条移除', async ({ page }) => {
    await setupMockRoutes(page)
    await page.addInitScript(() => {
      localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'guest', cookie: 'MUSIC_U=guest-cookie' }))
    })
    await page.goto('/playlist/1')
    await expect(page.getByTestId('play-all')).toBeVisible({ timeout: 10_000 })
    await page.getByLabel('播放 E2E Song A').click()
    await expect(page.getByTestId('player-bar')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(2000)
    const barText = (await page.getByTestId('player-bar').textContent()) ?? ''
    expect(barText).not.toContain('主音源')
    expect(barText).not.toContain('外部音源')
    expect(barText).not.toContain('已解锁')
    expect(barText).not.toContain('卡顿')
  })
})
