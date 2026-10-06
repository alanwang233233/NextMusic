import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, bindCookieProvider, mainApi, outerApi, getCookie, MAIN_API_BASE } from '@/api/http'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  bindCookieProvider(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response
}

describe('mainApi', () => {
  it('GET 构造 query 并解析 body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, result: 'ok' }))
    const res = await mainApi('/search', { keywords: 'a b', limit: 10 })
    expect(res).toEqual({ code: 200, result: 'ok' })
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/search')
    expect(url.searchParams.get('keywords')).toBe('a b')
    expect(url.searchParams.get('limit')).toBe('10')
    // 全部请求都追加时间戳防 2 分钟缓存
    expect(url.searchParams.get('timestamp')).toMatch(/^\d{13}$/)
  })

  it('GET 注入 cookie 查询参数', async () => {
    bindCookieProvider(() => 'MUSIC_U=abc')
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200 }))
    await mainApi('/user/account')
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get('cookie')).toBe('MUSIC_U=abc')
  })

  it('POST 参数放入 JSON body（密码不出现在 URL 中）并追加时间戳', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200 }))
    await mainApi('/login/cellphone', { phone: '13800138000', password: 'secret' }, { method: 'POST' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${MAIN_API_BASE}/login/cellphone`)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ phone: '13800138000', password: 'secret' })
    expect(typeof body.timestamp).toBe('number')
    expect(url.includes('secret')).toBe(false)
  })

  it('POST 将 cookie 放入 body', async () => {
    bindCookieProvider(() => 'MUSIC_U=xyz')
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200 }))
    await mainApi('/like', { id: 1, like: true }, { method: 'POST' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.cookie).toBe('MUSIC_U=xyz')
    expect(body.id).toBe(1)
  })

  it('code=301（未登录）抛出 ApiError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 301, message: '请先登录' }))
    await expect(mainApi('/personal_fm')).rejects.toMatchObject({ code: 301, message: '请先登录' })
  })

  it('code=400 抛出错误信息', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 400, message: '参数错误' }))
    await expect(mainApi('/x')).rejects.toMatchObject({ code: 400, message: '参数错误' })
  })

  it('网络异常转为统一 ApiError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'))
    await expect(mainApi('/x')).rejects.toBeInstanceOf(ApiError)
  })

  it('超时抛出超时错误', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const promise = mainApi('/x')
    promise.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(16_000)
    await expect(promise).rejects.toMatchObject({ code: -1 })
    vi.useRealTimers()
  })
})

describe('outerApi', () => {
  it('POST JSON 必带 ip 且不带 timestamp', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, data: { url: 'https://x' } }))
    const res = await outerApi('/api/getSongUrl', { id: '1', level: 'standard' })
    expect(res.data).toEqual({ url: 'https://x' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('nextmusic.toubiec.cn/api/getSongUrl')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ id: '1', level: 'standard' })
    expect(body.ip).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/)
    expect(body.timestamp).toBeUndefined()
  })

  it('非 200 code 抛出 ApiError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 500, message: 'server error', data: null }))
    await expect(outerApi('/api/getSongInfo', { id: '1' })).rejects.toMatchObject({ code: 500 })
  })
})

describe('bindCookieProvider', () => {
  it('默认未绑定返回 undefined', () => {
    expect(getCookie()).toBeUndefined()
  })
})

describe('MAIN_API_BASE 隔离', () => {
  it('测试环境使用占位地址，仓库中不出现真实地址', () => {
    expect(MAIN_API_BASE).toBe('https://mainapi.test')
  })

  it('未配置地址时 mainApi 抛出配置错误', async () => {
    vi.stubEnv('VITE_MAIN_API', '')
    const { mainApi: freshMainApi } = await import('@/api/http')
    await expect(freshMainApi('/x')).rejects.toMatchObject({ code: -1 })
    vi.unstubAllEnvs()
  })
})
