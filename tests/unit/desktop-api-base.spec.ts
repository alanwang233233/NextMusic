import { afterEach, describe, expect, it, vi } from 'vitest'

/** 桥接桩形状（与 preload 注入一致） */
function stubBridge(mainApiBase: string): void {
  ;(globalThis as Record<string, unknown>).nextmusicDesktop = {
    mainApiBase,
    setGeneralUnblock: async () => true,
  }
}

function bridgeValue(): { mainApiBase: string } | undefined {
  return (globalThis as { nextmusicDesktop?: { mainApiBase: string } }).nextmusicDesktop
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).nextmusicDesktop
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('主 API 地址三级解析', () => {
  it('无桥接：MAIN_API_BASE 取构建期 env，requireMainApiBase 原样返回（Web 回归）', async () => {
    vi.resetModules()
    const http = await import('@/api/http')
    expect(http.MAIN_API_BASE).toBe('https://mainapi.test')
    expect(http.requireMainApiBase()).toBe('https://mainapi.test')
  })

  it('有桥接：桥接地址优先于构建期 env（模块加载期求值）', async () => {
    stubBridge('http://127.0.0.1:34567')
    vi.resetModules()
    const http = await import('@/api/http')
    expect(http.MAIN_API_BASE).toBe('http://127.0.0.1:34567')
  })

  it('override 优先且去除尾斜杠', async () => {
    stubBridge('http://127.0.0.1:34567')
    vi.resetModules()
    const http = await import('@/api/http')
    http.bindMainApiOverride(() => 'https://remote.example.com/')
    expect(http.requireMainApiBase()).toBe('https://remote.example.com')
  })

  it('override 惰性求值：清空后立即回退桥接地址（无需重建模块）', async () => {
    stubBridge('http://127.0.0.1:34567')
    vi.resetModules()
    const http = await import('@/api/http')
    let override: string | undefined = 'https://remote.example.com'
    http.bindMainApiOverride(() => override)
    expect(http.requireMainApiBase()).toBe('https://remote.example.com')
    override = undefined
    expect(http.requireMainApiBase()).toBe('http://127.0.0.1:34567')
  })

  it('桥接存在但服务地址为空且无 override：抛桌面专属文案', async () => {
    stubBridge('')
    // 生产桌面构建强制置空 VITE_MAIN_API（见 desktop-build 脚本），此处还原该环境
    vi.stubEnv('VITE_MAIN_API', '')
    vi.resetModules()
    const http = await import('@/api/http')
    http.bindMainApiOverride(() => undefined)
    try {
      http.requireMainApiBase()
      expect.unreachable('应当抛出 ApiError')
    } catch (err) {
      expect((err as { code: number; message: string }).code).toBe(-1)
      expect((err as { message: string }).message).toBe('本地 API 服务未就绪，请重启应用')
    }
  })

  it('无桥接、override 清空：回退 env 值（Web 行为不变，不抛错）', async () => {
    vi.resetModules()
    const http = await import('@/api/http')
    http.bindMainApiOverride(() => '')
    expect(http.requireMainApiBase()).toBe('https://mainapi.test')
  })
})
