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
import os from 'node:os'
import path from 'node:path'

const hasDesktopBuild =
  fs.existsSync(path.resolve('electron/dist/main.cjs')) && fs.existsSync(path.resolve('dist/index.html'))

/** Electron userData 目录（dev 二进制为 Electron；打包版取 asar 内 package.json 的 name，而非 productName） */
function userDataDir(executablePath?: string): string {
  const appData =
    process.platform === 'win32'
      ? path.join(os.homedir(), 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : path.join(os.homedir(), '.config')
  const appName = executablePath
    ? (JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8')) as { name: string }).name
    : 'Electron'
  return path.join(appData, appName)
}

/** 轮询等待文件包含指定内容（登录态镜像为异步 IPC 写盘） */
function waitForFileContent(file: string, needle: string, timeoutMs = 10_000): boolean {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if (fs.readFileSync(file, 'utf-8').includes(needle)) return true
    } catch {
      /* 未写入，继续轮询 */
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
  }
  return false
}

test.describe('桌面冒烟', () => {
  // 桌面 app 有单实例锁：两用例并行会令第二实例立即退出，必须串行
  test.describe.configure({ mode: 'serial' })
  test.skip(!hasDesktopBuild, '需要先构建：npm run build && npm run desktop:build:electron')

  test('窗口打开、本地 API 注入、健康检查与解灰 IPC', async () => {
    test.setTimeout(120_000)
    const executablePath = process.env.DESKTOP_EXECUTABLE
    const authFile = path.join(userDataDir(executablePath), 'nextmusic-auth.json')
    // 登录态主进程持久化：dev 模式预置快照验证「启动注入→渲染层恢复」；打包模式文件随装随用，不预置
    const seedAuth = !executablePath
    if (seedAuth) {
      fs.mkdirSync(path.dirname(authFile), { recursive: true })
      fs.writeFileSync(
        authFile,
        JSON.stringify({
          mode: 'user',
          cookie: 'MUSIC_U=smoke-seed',
          profile: { userId: 1, nickname: '冒烟用户', avatarUrl: 'https://p1.music.126.net/a.jpg' },
        }),
      )
    }
    const app = executablePath
      ? await _electron.launch({ executablePath, timeout: 90_000 })
      : await _electron.launch({ args: ['electron/dist/main.cjs'], timeout: 90_000 })
    try {
      const page = await app.firstWindow()
      // UI 真实加载（非 404/白屏）：SPA 挂载点必须出现——同时覆盖 dev 直启与 asar 两种模式
      await page.waitForSelector('#app', { state: 'attached', timeout: 30_000 })
      // 首启必须落在根路由：历史模式下 pathname 若为 /index.html 会命中 404 兜底路由（页面不存在）
      await page.waitForSelector('#app > *', { state: 'attached', timeout: 30_000 })
      expect(await page.evaluate(() => window.location.pathname)).toBe('/')
      expect(await page.textContent('body')).not.toContain('页面不存在')
      const bridge = await page.evaluate(() =>
        Promise.resolve(
          (window as {
            nextmusicDesktop?: { mainApiBase?: string; setGeneralUnblock?: unknown; persistedAuth?: { mode?: string } }
          }).nextmusicDesktop,
        ),
      )
      expect(bridge, 'preload 应注入 nextmusicDesktop 桥接').toBeTruthy()
      expect(bridge!.mainApiBase).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

      // 登录态恢复：dev 模式预置了主进程快照，preload 应同步注入并回写 localStorage
      if (seedAuth) {
        expect(bridge!.persistedAuth?.mode).toBe('user')
        const restored = await page.evaluate(() => localStorage.getItem('nextmusic.auth'))
        expect(restored).toContain('"mode":"user"')
      }

      // 健康检查：本地服务根路径（静态 public，不触发 NCM 外呼，离线可用）
      const health = await page.request.get(`${bridge!.mainApiBase}/`)
      expect(health.status()).toBe(200)

      // 解灰 IPC 链路：invoke 返回 true
      const unblockResult = await page.evaluate(async () => {
        const b = (window as { nextmusicDesktop?: { setGeneralUnblock?: (enabled: boolean) => Promise<boolean> } }).nextmusicDesktop
        return b?.setGeneralUnblock ? await b.setGeneralUnblock(true) : null
      })
      expect(unblockResult).toBe(true)

      // 登录态镜像写路径：桥接 setPersistedAuth → 主进程文件落盘（双模式均验证）
      await page.evaluate(async () => {
        const b = (window as { nextmusicDesktop?: { setPersistedAuth?: (data: unknown) => Promise<boolean> } }).nextmusicDesktop
        if (!b?.setPersistedAuth) throw new Error('桥接缺少 setPersistedAuth')
        await b.setPersistedAuth({ mode: 'user', cookie: 'MUSIC_U=smoke-mirror' })
      })
      expect(waitForFileContent(authFile, 'MUSIC_U=smoke-mirror'), '登录态镜像应写入主进程文件').toBe(true)

      // 清理冒烟痕迹（避免假登录态污染本机/CI 的 Electron profile）
      await page.evaluate(() => localStorage.removeItem('nextmusic.auth'))
    } finally {
      await app.close()
      fs.rmSync(authFile, { force: true })
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
      const page = await app.firstWindow()
      const mainApiBase = await page.evaluate(
        () => (window as { nextmusicDesktop?: { mainApiBase?: string } }).nextmusicDesktop?.mainApiBase,
      )
      expect(mainApiBase).toBeTruthy()
      const res = await page.request.get(
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
