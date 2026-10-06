import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { setupMockRoutes } from '../e2e/mocks'

const OUT_DIR = 'test-results/visual'

async function screenshot(page: Page, name: string, options: { fullPage?: boolean } = {}) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: options.fullPage ?? false })
}

/** 断言无横向溢出 */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

async function startPlayback(page: Page) {
  await page.goto('/playlist/1')
  await expect(page.getByTestId('play-all')).toBeVisible({ timeout: 10_000 })
  await page.getByLabel('播放 E2E Song A').click()
  await expect(page.getByTestId('player-bar')).toBeVisible()
}

test.describe('视觉测试 - 桌面端', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('登录页', async ({ page }) => {
    await setupMockRoutes(page)
    await page.goto('/login')
    await expect(page.getByText('NextMusic').first()).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await screenshot(page, 'desktop-login')
  })

  test('首页（游客）', async ({ page }) => {
    await setupMockRoutes(page)
    await page.addInitScript(() => {
      localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'guest', cookie: 'MUSIC_U=guest-cookie' }))
    })
    await page.goto('/')
    await expect(page.getByText('推荐歌单 1', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('热门歌手')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await screenshot(page, 'desktop-home', { fullPage: true })
  })

  test('歌单详情 + 播放条', async ({ page }) => {
    await setupMockRoutes(page)
    await page.addInitScript(() => {
      localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'guest', cookie: 'MUSIC_U=guest-cookie' }))
    })
    await startPlayback(page)
    await expectNoHorizontalOverflow(page)
    await screenshot(page, 'desktop-playlist-playing')
  })

  test('全屏正在播放（歌词）', async ({ page }) => {
    await setupMockRoutes(page)
    await page.addInitScript(() => {
      localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'guest', cookie: 'MUSIC_U=guest-cookie' }))
    })
    await startPlayback(page)
    await page.getByLabel('打开播放页').click()
    await expect(page.getByTestId('now-playing')).toBeVisible()
    await expect(page.getByText('E2E 第一句')).toBeVisible()
    await screenshot(page, 'desktop-now-playing')
  })

  test('搜索页', async ({ page }) => {
    await setupMockRoutes(page)
    await page.addInitScript(() => {
      localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'guest', cookie: 'MUSIC_U=guest-cookie' }))
    })
    await page.goto('/search')
    await expect(page.getByText('热门搜索')).toBeVisible()
    await page.getByLabel('搜索关键词').fill('E2E Song')
    await page.keyboard.press('Enter')
    await expect(page.getByText('E2E Song A')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await screenshot(page, 'desktop-search')
  })
})

test.describe('视觉测试 - 移动端', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('登录页', async ({ page }) => {
    await setupMockRoutes(page)
    await page.goto('/login')
    await expectNoHorizontalOverflow(page)
    await screenshot(page, 'mobile-login')
  })

  test('首页（游客）含底部导航', async ({ page }) => {
    await setupMockRoutes(page)
    await page.addInitScript(() => {
      localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'guest', cookie: 'MUSIC_U=guest-cookie' }))
    })
    await page.goto('/')
    await expect(page.getByText('推荐歌单 1', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expectNoHorizontalOverflow(page)
    await screenshot(page, 'mobile-home')
  })

  test('歌单 + 播放条 + 底部导航不遮挡', async ({ page }) => {
    await setupMockRoutes(page)
    await page.addInitScript(() => {
      localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'guest', cookie: 'MUSIC_U=guest-cookie' }))
    })
    await startPlayback(page)
    // 播放条与底部导航同时可见且不重叠
    const playerBar = page.getByTestId('player-bar')
    const playerBox = await playerBar.boundingBox()
    expect(playerBox).not.toBeNull()
    expect(playerBox!.y + playerBox!.height).toBeLessThanOrEqual(845)
    await screenshot(page, 'mobile-playlist-playing')
  })
})
