import { test, expect } from '@playwright/test'
import { setupMockRoutes } from './mocks'

test.describe('虚拟登录只读模式', () => {
  test('昵称搜索 → 选择用户 → 只读浏览 → 写操作不可用', async ({ page }) => {
    const state = await setupMockRoutes(page)
    await page.goto('/login')

    // 切换虚拟登录 Tab
    await page.getByTestId('tab-virtual').click()
    await page.getByLabel('用户昵称').fill('E2E 虚拟用户')
    await page.getByRole('button', { name: '搜索', exact: true }).click()

    // 候选用户出现并选择
    await expect(page.getByText('ID: 777')).toBeVisible()
    await page.getByText('ID: 777').click()

    // 以虚拟身份进入首页，顶栏展示昵称
    await page.waitForURL('/')
    await expect(page.getByText('E2E 虚拟用户').first()).toBeVisible()

    // 进入歌单，尝试喜欢歌曲 → 拦截提示，且无 like 请求
    await page.goto('/playlist/1')
    await expect(page.getByTestId('play-all')).toBeVisible()
    await page.getByLabel('喜欢').first().click()
    await expect(page.getByText('虚拟登录为只读模式，写入操作不可用')).toBeVisible()
    expect(state.likeCalls).toHaveLength(0)

    // 虚拟模式下收藏按钮不渲染（写守卫）
    await expect(page.getByTestId('subscribe-playlist')).toHaveCount(0)
    expect(state.subscribeCalls).toHaveLength(0)
  })

  test('虚拟用户主页展示公开信息与歌单', async ({ page }) => {
    await setupMockRoutes(page)
    await page.addInitScript(() => {
      localStorage.setItem(
        'nextmusic.auth',
        JSON.stringify({ mode: 'virtual', virtualUser: { userId: 777, nickname: 'E2E 虚拟用户', avatarUrl: '' } }),
      )
    })
    await page.goto('/me')
    await expect(page.getByText('虚拟登录（只读）')).toBeVisible()
    await expect(page.getByText('创建的歌单')).toBeVisible()
    await expect(page.getByText('我喜欢的音乐')).toBeVisible()
  })
})
