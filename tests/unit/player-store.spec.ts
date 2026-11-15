import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore, buildEngineCallbacks } from '@/stores/player'
import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import type { Song } from '@/types/models'

vi.mock('@/player/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/player/engine')>()
  return {
    ...actual,
    getEngine: vi.fn(() => fakeEngine),
  }
})

const fakeEngine = {
  play: vi.fn(async () => undefined),
  togglePlay: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
}

vi.mock('@/api/user', () => ({
  likeSong: vi.fn(async () => ({ code: 200 })),
  fetchLikeList: vi.fn(async () => []),
}))

vi.mock('@/api/song', () => ({
  scrobble: vi.fn(async () => ({ code: 200 })),
}))

import type { PreloadOutcome } from '@/player/precache'
const preloadMock = vi.fn(async (_song: unknown, _level: string): Promise<PreloadOutcome | null> => null)
const preloadPeek = vi.fn((_id: number): PreloadOutcome | null => null)
const preloadTake = vi.fn((_id: number): PreloadOutcome | null => null)

vi.mock('@/player/precache', () => ({
  nextSongPreloader: {
    preload: (...args: unknown[]) => preloadMock(...(args as [unknown, string])),
    peek: (...args: unknown[]) => preloadPeek(...(args as [number])),
    take: (...args: unknown[]) => preloadTake(...(args as [number])),
    clear: vi.fn(),
  },
}))

function makeSong(id: number): Song {
  return { id, name: `song-${id}`, artists: [{ id: 1, name: 'a' }], album: { id: 10, name: 'al' }, duration: 100_000 }
}

describe('player store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('playQueue 设置队列并播放指定曲目', () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2), makeSong(3)], 1)
    expect(player.queue).toHaveLength(3)
    expect(player.index).toBe(1)
    expect(player.currentSong?.id).toBe(2)
    expect(fakeEngine.play).toHaveBeenCalled()
  })

  it('order 模式顺序前进，末尾手动 next 停止', () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2)], 0)
    player.next()
    expect(player.index).toBe(1)
    player.next()
    expect(player.index).toBe(1)
    expect(player.playing).toBe(false)
  })

  it('order 模式自动播放到末尾回绕第一首', () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2)], 1)
    player.next(true)
    expect(player.index).toBe(0)
  })

  it('loop 模式 ended 后重播当前曲目', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2)], 0)
    player.setMode('loop')
    player.playing = true
    buildEngineCallbacks().onEnded()
    expect(player.index).toBe(0) // 单曲循环：索引不变、重新播放
  })

  it('order 模式 ended 后自动进入下一首，末尾回绕', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2)], 0)
    buildEngineCallbacks().onEnded()
    expect(player.index).toBe(1)
    buildEngineCallbacks().onEnded()
    expect(player.index).toBe(0) // 末尾回绕
  })

  it('fmMode 下 ended 到队列末尾即停止，不回绕', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2)], 1)
    player.fmMode = true
    buildEngineCallbacks().onEnded()
    expect(player.index).toBe(1)
    expect(player.playing).toBe(false)
  })

  it('ended 时 user 模式触发听歌打卡', async () => {
    const auth = useAuthStore()
    auth.mode = 'user'
    auth.profile = { userId: 1, nickname: 'u', avatarUrl: '' }
    const { scrobble } = await import('@/api/song')
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    player.currentTimeMs = 50_000
    buildEngineCallbacks().onEnded()
    expect(scrobble).toHaveBeenCalledWith(1, 10, 50)
  })

  it('shuffle 模式下一首不等于当前', () => {
    const player = usePlayerStore()
    player.playQueue(
      [makeSong(1), makeSong(2), makeSong(3), makeSong(4), makeSong(5)],
      2,
    )
    player.setMode('shuffle')
    const seen = new Set<number>()
    for (let i = 0; i < 20; i++) {
      const before = player.index
      player.next()
      seen.add(player.index)
      // 随机模式：下一曲永远不是“当前这一曲”
      expect(player.index).not.toBe(before)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('prev 从第一首回绕到最后一首', () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2), makeSong(3)], 0)
    player.prev()
    expect(player.index).toBe(2)
  })

  it('playSongNow 已在队列中时跳到该曲目', () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2)], 0)
    player.playSongNow(makeSong(2))
    expect(player.index).toBe(1)
    // 不重复插入
    expect(player.queue).toHaveLength(2)
  })

  it('playSongNow 不在队列时插入到当前位置之后', () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2)], 0)
    player.playSongNow(makeSong(9))
    expect(player.queue).toHaveLength(3)
    expect(player.queue[1]?.id).toBe(9)
  })

  it('playSongNow 空队列带浏览上下文：以上下文建立播放列表（预缓存回归：不得自预载当前曲）', async () => {
    const player = usePlayerStore()
    expect(player.queue).toHaveLength(0)
    player.playSongNow(makeSong(102), [makeSong(101), makeSong(102), makeSong(103)])
    await vi.waitFor(() => player.index === 1)
    // 队列 = 整个歌单，而非只有被点的单曲；"下一曲"有真实的下一首
    expect(player.queue.map((s) => s.id)).toEqual([101, 102, 103])
    expect(player.currentSong?.id).toBe(102)

    // 进度过半 → 预缓存预载真实的下一曲 103，而不是回绕自预载 102
    player.playing = true
    player.durationMs = 200_000
    preloadMock.mockResolvedValue({ songId: 103, url: 'https://x/103.mp3', source: 'main302' })
    const callbacks = buildEngineCallbacks()
    callbacks.onTimeUpdate(100_000, 200_000)
    await vi.waitFor(() => preloadMock.mock.calls.length > 0)
    expect(preloadMock.mock.calls[0]![0]).toMatchObject({ id: 103 })

    // 下一曲跟随上下文队列
    player.next()
    expect(player.currentSong?.id).toBe(103)
  })

  it('playSongNow 空队列无上下文：保留单曲就位行为', async () => {
    const player = usePlayerStore()
    player.playSongNow(makeSong(9))
    await vi.waitFor(() => player.index === 0)
    expect(player.queue.map((s) => s.id)).toEqual([9])
    expect(player.currentSong?.id).toBe(9)
  })

  it('removeFromQueue 调整当前索引', () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2), makeSong(3)], 2)
    player.removeFromQueue(0)
    expect(player.queue).toHaveLength(2)
    expect(player.index).toBe(1)
  })

  it('removeFromQueue 不允许移除当前播放', () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2)], 0)
    player.removeFromQueue(0)
    expect(player.queue).toHaveLength(2)
  })

  it('游客模式点击喜欢弹出拦截提示且不发请求', async () => {
    const auth = useAuthStore()
    auth.mode = 'guest'
    const player = usePlayerStore()
    const toast = useToastStore()
    await player.likeSongById(1)
    expect(toast.items.some((t) => t.message.includes('游客模式'))).toBe(true)
    const { likeSong } = await import('@/api/user')
    expect(likeSong).not.toHaveBeenCalled()
  })

  it('user 模式喜欢歌曲成功并更新列表', async () => {
    const auth = useAuthStore()
    auth.mode = 'user'
    auth.profile = { userId: 1, nickname: 'u', avatarUrl: '' }
    auth.likedIds = []
    const player = usePlayerStore()
    const toast = useToastStore()
    await player.likeSongById(7)
    expect(auth.isLiked(7)).toBe(true)
    expect(toast.items.some((t) => t.type === 'success')).toBe(true)
    await player.likeSongById(7)
    expect(auth.isLiked(7)).toBe(false)
  })

  it('setVolume 边界钳制', () => {
    const player = usePlayerStore()
    player.setVolume(2)
    expect(player.volume).toBe(1)
    player.setVolume(-1)
    expect(player.volume).toBe(0)
    expect(player.muted).toBe(true)
  })

  it('播放进度过半自动预缓存下一曲，且每首歌只触发一次', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2)], 0)
    player.playing = true
    player.durationMs = 200_000

    preloadMock.mockResolvedValue({ songId: 2, url: 'https://x/2.mp3', source: 'main302' })
    const { buildEngineCallbacks } = await import('@/stores/player')
    const callbacks = buildEngineCallbacks()

    // 进度未过半：不触发
    callbacks.onTimeUpdate(90_000, 200_000)
    expect(preloadMock).not.toHaveBeenCalled()

    // 过半（>=50%）：触发一次
    callbacks.onTimeUpdate(100_000, 200_000)
    expect(preloadMock).toHaveBeenCalledTimes(1)

    // 同一首歌内继续播放：不重复触发
    callbacks.onTimeUpdate(150_000, 200_000)
    expect(preloadMock).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => player.preloadedNextFor === player.currentSong?.id)
  })

  it('peekNextSong：order 模式回绕，loop/shuffle 返回 null，fm 取下一首', () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2), makeSong(3)], 2)
    expect(player.peekNextSong()?.id).toBe(1) // 末尾回绕到第一首

    player.setMode('loop')
    expect(player.peekNextSong()).toBeNull()
    player.setMode('shuffle')
    expect(player.peekNextSong()).toBeNull()

    player.setMode('order')
    player.fmMode = true
    expect(player.peekNextSong()).toBeNull() // FM 队列末尾
    player.queue.push(makeSong(9))
    expect(player.peekNextSong()?.id).toBe(9)
  })

  it('单曲就位播放不替换播放列表，上一首/下一首跟随播放列表', async () => {
    const player = usePlayerStore()
    // 播放列表：1,2,3，当前为 2
    player.playQueue([makeSong(1), makeSong(2), makeSong(3)], 1)
    // 从别处（其他歌单/搜索）播放歌曲 9：插入当前曲目之后，播放列表不被歌单替换
    player.playSongNow(makeSong(9))
    expect(player.queue.map((s) => s.id)).toEqual([1, 2, 9, 3])
    expect(player.currentSong?.id).toBe(9)
    // 上一首/下一首跟随播放列表，而不是某张歌单
    player.next()
    expect(player.currentSong?.id).toBe(3)
    player.prev()
    expect(player.currentSong?.id).toBe(9)
    player.prev()
    expect(player.currentSong?.id).toBe(2)
  })

  it('播放全部显式替换播放列表（歌单上下文）', () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2)], 0)
    player.playSongNow(makeSong(9))
    expect(player.queue.map((s) => s.id)).toEqual([1, 9, 2])
    // 播放全部：以新歌单重建播放列表
    player.playQueue([makeSong(7), makeSong(8)], 0)
    expect(player.queue.map((s) => s.id)).toEqual([7, 8])
    expect(player.currentSong?.id).toBe(7)
  })

  it('playAt 使用预缓存地址直接播放', async () => {
    const player = usePlayerStore()
    const preloaded = { songId: 2, url: 'https://x/2.mp3', source: 'main302' as const }
    // 无预缓存：play 收到 undefined
    preloadTake.mockReturnValue(null)
    player.playQueue([makeSong(1), makeSong(2)], 0)
    await vi.waitFor(() => player.index === 0)
    expect(fakeEngine.play).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1 }), expect.any(String), undefined)
    // 有预缓存：play 收到预缓存结果
    preloadTake.mockReturnValue(preloaded)
    await player.playAt(1)
    expect(fakeEngine.play).toHaveBeenLastCalledWith(expect.objectContaining({ id: 2 }), expect.any(String), preloaded)
    preloadTake.mockReturnValue(null)
  })
})
