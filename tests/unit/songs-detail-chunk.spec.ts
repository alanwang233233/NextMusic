import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSongsDetail, SONG_DETAIL_CHUNK_SIZE } from '@/api/playlist'

const mainApiMock = vi.fn(async (_path: string, params: { ids: string }) => ({
  code: 200,
  songs: params.ids.split(',').map((id) => ({
    id: Number(id),
    name: `song-${id}`,
    ar: [{ id: 1, name: 'a' }],
    al: { id: 2, name: 'al' },
    dt: 1000,
  })),
}))

vi.mock('@/api/http', () => ({
  mainApi: (...args: unknown[]) => mainApiMock(...(args as [string, { ids: string }])),
  outerApi: vi.fn(),
  ApiError: class extends Error {
    code: number
    constructor(code: number, message: string) {
      super(message)
      this.code = code
    }
  },
  WriteBlockedError: class extends Error {},
  bindCookieProvider: vi.fn(),
  requireMainApiBase: () => 'https://music-api.allenwang.eu.org',
}))

describe('fetchSongsDetail 分块加载（歌单歌曲数超过 1000 首的场景）', () => {
  beforeEach(() => {
    mainApiMock.mockClear()
  })

  it('1200 首 → 3 次请求（500/500/200），顺序保持、无上限', async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => i + 1)
    const songs = await fetchSongsDetail(ids)
    expect(SONG_DETAIL_CHUNK_SIZE).toBe(500)
    expect(mainApiMock).toHaveBeenCalledTimes(3)
    const firstChunkIds = mainApiMock.mock.calls[0]![1].ids.split(',').map(Number)
    expect(firstChunkIds).toHaveLength(500)
    expect(firstChunkIds[0]).toBe(1)
    const lastChunkIds = mainApiMock.mock.calls[2]![1].ids.split(',').map(Number)
    expect(lastChunkIds).toHaveLength(200)
    expect(lastChunkIds[0]).toBe(1001)
    // 顺序与传入 ids 一致
    expect(songs).toHaveLength(1200)
    expect(songs[0]!.id).toBe(1)
    expect(songs[999]!.id).toBe(1000)
    expect(songs[1199]!.id).toBe(1200)
    expect(songs[500]!.name).toBe('song-501')
  })

  it('缺失的歌曲补占位且不打断顺序', async () => {
    mainApiMock.mockImplementationOnce(async (_path: string, params: { ids: string }) => ({
      code: 200,
      songs: params.ids
        .split(',')
        .map(Number)
        .filter((id) => id !== 2)
        .map((id) => ({ id, name: `song-${id}`, ar: [] as { id: number; name: string }[], al: { id: 0, name: '' }, dt: 1000 })),
    }))
    const songs = await fetchSongsDetail([1, 2, 3])
    expect(songs.map((s) => s.id)).toEqual([1, 2, 3])
    expect(songs[1]!.name).toBe('歌曲信息缺失')
  })

  it('空列表直接返回', async () => {
    expect(await fetchSongsDetail([])).toEqual([])
    expect(mainApiMock).not.toHaveBeenCalled()
  })
})
