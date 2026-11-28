import { test, expect } from '@playwright/test'
import { setupMockRoutes, type MockState } from './mocks'

test.describe('预缓存（播放进度过半自动触发）', () => {
  test('播放进度过半后自动预缓存下一曲（JSON 直链 Blob 数据级缓存）并显示指示', async ({ page }) => {
    const state: MockState = await setupMockRoutes(page)
    await page.addInitScript(() => {
      localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'guest', cookie: 'MUSIC_U=guest-cookie' }))
    })

    await page.goto('/playlist/1')
    await expect(page.getByTestId('play-all')).toBeVisible({ timeout: 10_000 })
    await page.getByLabel('播放 E2E Song A').click()
    await expect(page.getByTestId('play-toggle')).toHaveAttribute('aria-label', '暂停', { timeout: 20_000 })

    // 进度过半后预缓存 Song B：走 JSON 直链（/song/url/v1 非 302）拉取 Blob
    // （A 首播自身也走 mainJson 直链，故必须按 B 的 id 计数轮询）
    await expect
      .poll(() => state.songJsonCallsById[102] ?? 0, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(1)

    // 预缓存完成后出现「下一首已缓存」指示（容忍缓冲态短暂切换）
    await expect
      .poll(async () => (await page.getByTestId('player-bar').textContent()) ?? '', { timeout: 20_000 })
      .toContain('下一首已缓存')
  })

  test('手动切歌命中预缓存 blob: URL——不再发起任何解析与音频下载请求', async ({ page }) => {
    const state: MockState = await setupMockRoutes(page)
    // Song B 的 302 一律失败：预缓存走 JSON 直链 Blob 化，切歌不应依赖 302
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
    // 播放全部：以整个歌单重建播放列表（队列 = [A, B]）
    await page.getByTestId('play-all').click()
    await expect(page.getByTestId('play-toggle')).toHaveAttribute('aria-label', '暂停', { timeout: 20_000 })

    // 等待 Song B 预缓存完成（JSON 直链 Blob 化）
    await expect
      .poll(async () => (await page.getByTestId('player-bar').textContent()) ?? '', { timeout: 20_000 })
      .toContain('下一首已缓存')
    expect(state.songJsonCallsById[102] ?? 0).toBeGreaterThanOrEqual(1)

    // 手动下一曲：命中 blob: URL，Song B 零网络请求（无解析、无音频下载）。
    // （回绕预加载 Song A 会产生新的 JSON 调用，属正常行为，按 id 分别计数）
    const song302Before = state.song302Calls
    const jsonForB = state.songJsonCallsById[102] ?? 0
    await page.locator('button[aria-label="下一曲"]').click()
    await page.waitForTimeout(1500)
    expect(state.song302Calls).toBe(song302Before)
    expect(state.songJsonCallsById[102] ?? 0).toBe(jsonForB)
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
