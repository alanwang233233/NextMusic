/**
 * Electron 桌面冒烟测试（Playwright _electron）。
 *
 * 门控：electron/dist/main.cjs 与 dist/index.html 都存在才执行（纯 Web CI / 本地未打桌面时自动跳过）。
 * 默认模式以 dev 的 electron 二进制启动 electron/dist/main.cjs；
 * DESKTOP_EXECUTABLE=<可执行文件> 时启动打包后的 app（验证 asar 内 require 与引导）。
 * DESKTOP_NET_CHECK=1 时加深断言：/song/url/v1 JSON 直链可用（xeapi 引导生效，需外网）。
 */
import { expect, test, _electron } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const hasDesktopBuild =
  fs.existsSync(path.resolve('electron/dist/main.cjs')) && fs.existsSync(path.resolve('dist/index.html'))

test.describe('桌面冒烟', () => {
  // 桌面 app 有单实例锁：两用例并行会令第二实例立即退出，必须串行
  test.describe.configure({ mode: 'serial' })
  test.skip(!hasDesktopBuild, '需要先构建：npm run build && npm run desktop:build:electron')

  test('窗口打开、本地 API 注入、健康检查与解灰 IPC', async () => {
    test.setTimeout(120_000)
    const executablePath = process.env.DESKTOP_EXECUTABLE
    const app = executablePath
      ? await _electron.launch({ executablePath, timeout: 90_000 })
      : await _electron.launch({ args: ['electron/dist/main.cjs'], timeout: 90_000 })
    try {
      const window = await app.firstWindow()
      // UI 真实加载（非 404/白屏）：SPA 挂载点必须出现——同时覆盖 dev 直启与 asar 两种模式
      await window.waitForSelector('#app', { state: 'attached', timeout: 30_000 })
      const bridge = await window.evaluate(() =>
        Promise.resolve((window as { nextmusicDesktop?: { mainApiBase?: string; setGeneralUnblock?: unknown } }).nextmusicDesktop),
      )
      expect(bridge, 'preload 应注入 nextmusicDesktop 桥接').toBeTruthy()
      expect(bridge!.mainApiBase).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

      // 健康检查：本地服务根路径（静态 public，不触发 NCM 外呼，离线可用）
      const health = await window.request.get(`${bridge!.mainApiBase}/`)
      expect(health.status()).toBe(200)

      // 解灰 IPC 链路：invoke 返回 true
      const unblockResult = await window.evaluate(async () => {
        const b = (window as { nextmusicDesktop?: { setGeneralUnblock?: (enabled: boolean) => Promise<boolean> } }).nextmusicDesktop
        return b?.setGeneralUnblock ? await b.setGeneralUnblock(true) : null
      })
      expect(unblockResult).toBe(true)
    } finally {
      await app.close()
    }
  })

  test('DESKTOP_NET_CHECK=1 时本地 JSON 直链可用（xeapi 引导生效）', async () => {
    test.skip(process.env.DESKTOP_NET_CHECK !== '1', '仅在有网环境显式开启时执行')
    test.setTimeout(120_000)
    const executablePath = process.env.DESKTOP_EXECUTABLE
    const app = executablePath
      ? await _electron.launch({ executablePath, timeout: 90_000 })
      : await _electron.launch({ args: ['electron/dist/main.cjs'], timeout: 90_000 })
    try {
      const window = await app.firstWindow()
      const mainApiBase = await window.evaluate(
        () => (window as { nextmusicDesktop?: { mainApiBase?: string } }).nextmusicDesktop?.mainApiBase,
      )
      expect(mainApiBase).toBeTruthy()
      const res = await window.request.get(
        `${mainApiBase}/song/url/v1?id=347230&level=exhigh&timestamp=${Date.now()}`,
      )
      expect(res.status()).toBe(200)
      const body = (await res.json()) as { code?: number }
      expect(body.code).toBe(200)
    } finally {
      await app.close()
    }
  })
})
