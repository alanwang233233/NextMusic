import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOuterSongUrl, outerRetryDelayMs, OUTER_RETRY_MAX, OUTER_RETRY_BASE_MS } from '@/api/outer'

const outerApiMock = vi.fn()

vi.mock('@/api/http', () => ({
  outerApi: (...args: unknown[]) => outerApiMock(...(args as [string, Record<string, unknown>])),
  ApiError: class extends Error {
    code: number
    constructor(code: number, message: string) {
      super(message)
      this.code = code
    }
  },
  OUTER_API_BASE: 'https://nextmusic.toubiec.cn',
}))

/** outerApi mock 直接返回解析后的 body（与真实 outerApi 行为一致） */
function okBody(): { code: number; data: { id: number; url: string; br: number; level: string; size: number } } {
  return { code: 200, data: { id: 1, url: 'https://x/1.mp3', br: 128000, level: 'standard', size: 1 } }
}

describe('fetchOuterSongUrl 指数退避重试', () => {
  beforeEach(() => {
    outerApiMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('退避延迟序列为 1s/2s/4s/8s/16s，最多重试 5 次', () => {
    expect(OUTER_RETRY_MAX).toBe(5)
    expect(OUTER_RETRY_BASE_MS).toBe(1000)
    expect([0, 1, 2, 3, 4].map(outerRetryDelayMs)).toEqual([1000, 2000, 4000, 8000, 16000])
  })

  it('首次成功不发重试请求', async () => {
    outerApiMock.mockResolvedValue(okBody())
    const promise = fetchOuterSongUrl(1, 'standard')
    await vi.runAllTimersAsync()
    const res = await promise
    expect(res.url).toBe('https://x/1.mp3')
    expect(outerApiMock).toHaveBeenCalledTimes(1)
  })

  it('失败后按指数等待重试并成功', async () => {
    outerApiMock
      .mockRejectedValueOnce(new Error('限流'))
      .mockRejectedValueOnce(new Error('限流'))
      .mockResolvedValue(okBody())
    const promise = fetchOuterSongUrl(1, 'standard')
    promise.catch(() => undefined)

    // 等待第 1 次重试（1s 后）
    await vi.advanceTimersByTimeAsync(999)
    expect(outerApiMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(outerApiMock).toHaveBeenCalledTimes(2)
    // 第 2 次重试在 2s 后
    await vi.advanceTimersByTimeAsync(2000)
    expect(outerApiMock).toHaveBeenCalledTimes(3)

    const res = await promise
    expect(res.url).toBe('https://x/1.mp3')
  })

  it('持续失败时重试 5 次后抛出最后错误', async () => {
    outerApiMock.mockRejectedValue(new Error('限流'))
    const promise = fetchOuterSongUrl(1, 'standard')
    promise.catch(() => undefined)
    // 初始 + 5 次重试 = 6 次调用；总等待 1+2+4+8+16 = 31s
    await vi.advanceTimersByTimeAsync(31_000 + 1000)
    await expect(promise).rejects.toThrow('限流')
    expect(outerApiMock).toHaveBeenCalledTimes(OUTER_RETRY_MAX + 1)
  })
})
