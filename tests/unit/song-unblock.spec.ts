import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 捕获 mainApi 收到的 params（song.ts 以相对路径 './http' 导入，等价 '@/api/http'）
const mainApiMock = vi.fn()
vi.mock('@/api/http', () => ({
  ApiError: class extends Error {
    code: number
    constructor(code: number, message: string) {
      super(message)
      this.code = code
    }
  },
  WriteBlockedError: class extends Error {},
  bindCookieProvider: vi.fn(),
  bindMainApiOverride: vi.fn(),
  normalizeApiBase: (url: string) => url.trim().replace(/\/+$/, ''),
  MAIN_API_BASE: 'https://mainapi.test',
  mainApi: (...args: unknown[]) => mainApiMock(...args),
}))

import { bindUnblockProvider, fetchSongDirectUrl } from '@/api/song'
import '@/stores/settings'

const FULL_URL = { data: [{ id: 347230, url: 'https://m801.music.126.net/a.flac', level: 'exhigh' }] }

beforeEach(() => {
  mainApiMock.mockReset().mockResolvedValue(FULL_URL)
  bindUnblockProvider(null)
})

afterEach(() => {
  bindUnblockProvider(null)
  vi.restoreAllMocks()
})

describe('fetchSongDirectUrl 解灰参数', () => {
  it('开关开启：请求附带 unblock=true', async () => {
    bindUnblockProvider(() => true)
    await fetchSongDirectUrl(347230, 'exhigh')
    expect(mainApiMock).toHaveBeenCalledWith('/song/url/v1', expect.objectContaining({ unblock: true }))
  })

  it('开关关闭：请求不携带 unblock', async () => {
    bindUnblockProvider(() => false)
    await fetchSongDirectUrl(347230, 'exhigh')
    expect(mainApiMock).toHaveBeenCalledWith('/song/url/v1', expect.not.objectContaining({ unblock: expect.anything() }))
  })

  it('未注册 provider（纯 Web 未初始化）：不携带 unblock，不抛错', async () => {
    await fetchSongDirectUrl(347230, 'exhigh')
    expect(mainApiMock).toHaveBeenCalledWith('/song/url/v1', expect.not.objectContaining({ unblock: expect.anything() }))
  })

  it('provider 抛错时按关闭处理', async () => {
    bindUnblockProvider(() => {
      throw new Error('store 未就绪')
    })
    await expect(fetchSongDirectUrl(347230, 'exhigh')).resolves.toBeDefined()
    expect(mainApiMock).toHaveBeenCalledWith('/song/url/v1', expect.not.objectContaining({ unblock: expect.anything() }))
  })
})

describe('解灰响应归一化', () => {
  it('解灰后 freeTrialInfo 为字符串 "null"（上游怪癖）：归一化为 null（预缓存不再误判为试听）', async () => {
    mainApiMock.mockResolvedValue({
      data: [{ id: 347230, url: 'https://m801.music.126.net/a.flac', freeTrialInfo: 'null', fee: 0 }],
    })
    const result = await fetchSongDirectUrl(347230, 'exhigh')
    expect(result.freeTrialInfo).toBeNull()
    expect(result.url).toBe('https://m801.music.126.net/a.flac')
  })

  it('真实试听片段（对象）保持不变', async () => {
    mainApiMock.mockResolvedValue({
      data: [{ id: 347230, url: 'https://m702.music.126.net/a.mp3', freeTrialInfo: { start: 0, end: 30 } }],
    })
    const result = await fetchSongDirectUrl(347230, 'exhigh')
    expect(result.freeTrialInfo).toEqual({ start: 0, end: 30 })
  })
})
