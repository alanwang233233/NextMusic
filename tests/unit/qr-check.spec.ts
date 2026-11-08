import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { qrCheck } from '@/api/auth'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response
}

describe('qrCheck 二维码状态轮询', () => {
  it('803 成功时保留 cookie（回归：此前 cookie 随异常被丢弃导致无法跳转）', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 803, cookie: 'MUSIC_U=qr-cookie' }))
    const res = await qrCheck('unikey-1')
    expect(res.code).toBe(803)
    expect(res.cookie).toBe('MUSIC_U=qr-cookie')
  })

  it('801 等待 / 802 待确认 / 800 过期 状态正常返回', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 801, message: '等待扫码', cookie: '' }))
    expect(await qrCheck('k')).toMatchObject({ code: 801 })
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 802, message: '待确认', cookie: '' }))
    expect(await qrCheck('k')).toMatchObject({ code: 802 })
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 800, message: '过期', cookie: '' }))
    expect(await qrCheck('k')).toMatchObject({ code: 800 })
  })

  it('空字符串 cookie 归一化为 undefined', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 803, cookie: '' }))
    const res = await qrCheck('k')
    expect(res.cookie).toBeUndefined()
  })

  it('网络错误包装为 ApiError 抛出（由轮询方按失败处理）', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'))
    await expect(qrCheck('k')).rejects.toMatchObject({ code: -1 })
  })
})
