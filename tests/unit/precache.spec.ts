import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextSongPreloader } from '@/player/precache'
import type { Song } from '@/types/models'

vi.mock('@/api/song', () => ({
  fetchSongDirectUrl: vi.fn(async (id: number, level: string) => ({
    id,
    url: 'http://cdn.example/direct.mp3',
    level,
    type: 'mp3',
    size: 1,
  })),
}))


/** 可控假 Audio：手动派发 canplay / error，可设 duration */
class FakeAudio {
  static instances: FakeAudio[] = []
  src = ''
  currentSrc = ''
  preload = ''
  duration = Number.NaN
  paused = true
  private listeners = new Map<string, (() => void)[]>()

  constructor() {
    FakeAudio.instances.push(this)
  }

  addEventListener(type: string, cb: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), cb])
  }

  removeEventListener() {}

  dispatch(type: string) {
    for (const cb of this.listeners.get(type) || []) cb()
  }

  load() {}

  pause() {
    this.paused = true
  }

  removeAttribute(name: string) {
    if (name === 'src') this.src = ''
  }
}

const song: Song = {
  id: 7,
  name: 'preload-target',
  artists: [{ id: 1, name: 'a' }],
  album: { id: 10, name: 'al' },
  duration: 200_000,
}

let blobSeq = 0
let fetchMock: ReturnType<typeof vi.fn>
let createObjectURL: ReturnType<typeof vi.fn>
let revokeObjectURL: ReturnType<typeof vi.fn>
let realCreate: typeof URL.createObjectURL | undefined
let realRevoke: typeof URL.revokeObjectURL | undefined

describe('NextSongPreloader（数据级 Blob 缓存）', () => {
  beforeEach(async () => {
    FakeAudio.instances = []
    blobSeq = 0
    nextSongPreloader.clear()
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio)
    // jsdom 未实现 object URL；fetch 仅被预加载器的 Blob 拉取使用（api 层已模块级 mock）
    createObjectURL = vi.fn(() => `blob:mock-${++blobSeq}`)
    revokeObjectURL = vi.fn()
    realCreate = URL.createObjectURL
    realRevoke = URL.revokeObjectURL
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
    fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['audio-bytes']) }))
    vi.stubGlobal('fetch', fetchMock)
    // 工厂 mock 的实现会跨用例残留，每个用例前显式重置
    const { fetchSongDirectUrl } = await import('@/api/song')
    vi.mocked(fetchSongDirectUrl).mockImplementation(async (id: number, level: string) => ({
      id,
      url: 'http://cdn.example/direct.mp3',
      level,
      type: 'mp3',
      size: 1,
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (realCreate) URL.createObjectURL = realCreate
    if (realRevoke) URL.revokeObjectURL = realRevoke
  })

  function lastProbe(): FakeAudio {
    expect(FakeAudio.instances.length).toBeGreaterThan(0)
    return FakeAudio.instances[FakeAudio.instances.length - 1]!
  }

  it('主路径：JSON 直链拉成 Blob，播放地址为 blob: URL（切歌零请求）', async () => {
    const promise = nextSongPreloader.preload(song, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    // Blob 拉取的是 JSON 直链
    expect(fetchMock).toHaveBeenCalledWith('http://cdn.example/direct.mp3')
    // 探针加载的是 object URL
    expect(lastProbe().src).toBe('blob:mock-1')
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    const outcome = await promise
    expect(outcome).not.toBeNull()
    expect(outcome!.songId).toBe(7)
    expect(outcome!.url).toBe('blob:mock-1')
    expect(outcome!.source).toBe('main302')
    expect(outcome!.blob).toBe(true)
    // 可 take 取出（取出后清空）
    expect(nextSongPreloader.take(7)).not.toBeNull()
    expect(nextSongPreloader.take(7)).toBeNull()
  })

  it('JSON 返回试听片段（freeTrialInfo）→ 跳过 Blob 候选，走 302 元素流', async () => {
    const { fetchSongDirectUrl } = await import('@/api/song')
    vi.mocked(fetchSongDirectUrl).mockImplementation(async () => ({ id: 7, url: 'http://cdn.example/trial.mp3', freeTrialInfo: { start: 0, end: 30 } }))
    const promise = nextSongPreloader.preload(song, 'standard')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    // 未发生 Blob 拉取；探针直连 302 端点
    expect(fetchMock).not.toHaveBeenCalled()
    expect(lastProbe().src).toContain('/song/url/v1/302?id=7')
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    const outcome = await promise
    expect(outcome!.source).toBe('main302')
    expect(outcome!.blob).toBeFalsy()
    expect(outcome!.url).toContain('/song/url/v1/302?id=7')
  })

  it('Blob 拉取失败 → 回退存 JSON 直链（元素直连 CDN，不再经 302）', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch')
    })
    const promise = nextSongPreloader.preload(song, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    expect(lastProbe().src).toBe('http://cdn.example/direct.mp3')
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    const outcome = await promise
    expect(outcome!.url).toBe('http://cdn.example/direct.mp3')
    expect(outcome!.blob).toBeFalsy()
  })

  it('JSON 接口失败 → 走 302 元素流（原有行为兜底）', async () => {
    const { fetchSongDirectUrl } = await import('@/api/song')
    vi.mocked(fetchSongDirectUrl).mockImplementation(async () => {
      throw new Error('api down')
    })
    const promise = nextSongPreloader.preload(song, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    expect(lastProbe().src).toContain('/song/url/v1/302?id=7')
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    const outcome = await promise
    expect(outcome!.url).toContain('/song/url/v1/302?id=7')
    expect(outcome!.blob).toBeFalsy()
  })

  it('主候选试听过短 → 302 也过短 → 候选链耗尽返回 null', async () => {
    const promise = nextSongPreloader.preload(song, 'standard')
    // 第一候选：JSON 直链 Blob（试听 30s）
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    lastProbe().duration = 30
    lastProbe().dispatch('canplay')
    // 第二候选：302 元素流（同样试听 30s）
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(2))
    expect(lastProbe().src).toContain('/song/url/v1/302?id=7')
    lastProbe().duration = 30
    lastProbe().dispatch('error')
    // 候选链耗尽
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(2))
    const outcome = await promise
    expect(outcome).toBeNull()
  })

  it('全部候选失败返回 null', async () => {
    const promise = nextSongPreloader.preload(song, 'standard')
    // 候选链现在只有两项：JSON 直链 + 302
    for (let i = 0; i < 2; i++) {
      await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(i + 1))
      lastProbe().dispatch('error')
    }
    const outcome = await promise
    expect(outcome).toBeNull()
  })

  it('新的 preload 调用取消进行中的旧任务', async () => {
    const first = nextSongPreloader.preload(song, 'standard')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    // 未派发任何事件（pending）时发起新任务
    const other: Song = { ...song, id: 8 }
    const second = nextSongPreloader.preload(other, 'standard')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(2))
    // 旧任务的 probe 已被销毁（src 清空）
    expect(FakeAudio.instances[0]!.src).toBe('')
    // 完成新任务
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    const outcome = await second
    expect(outcome!.songId).toBe(8)
    expect(await first).toBeNull()
  })

  it('切歌 handoff：保留当前与上一代 blob，更早的自动 revoke', async () => {
    // 第一首：blob:mock-1
    const p1 = nextSongPreloader.preload(song, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    await p1
    expect(nextSongPreloader.take(7)!.url).toBe('blob:mock-1')
    // 第二首：blob:mock-2
    const other: Song = { ...song, id: 8 }
    const p2 = nextSongPreloader.preload(other, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(2))
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    await p2
    expect(nextSongPreloader.take(8)!.url).toBe('blob:mock-2')
    expect(revokeObjectURL).not.toHaveBeenCalled()
    // 第三首：blob:mock-3 → 第一代 blob:mock-1 被释放
    const third: Song = { ...song, id: 9 }
    const p3 = nextSongPreloader.preload(third, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(3))
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    await p3
    expect(nextSongPreloader.take(9)!.url).toBe('blob:mock-3')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1')
    // 播放中的 blob:mock-3 与上一代 blob:mock-2 不释放
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:mock-2')
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:mock-3')
  })

  it('store 内同 id 结果被替换时 revoke 旧 blob', async () => {
    const p1 = nextSongPreloader.preload(song, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    await p1
    // 再次预缓存同一首：旧 blob:mock-1 被替换并释放
    const p2 = nextSongPreloader.preload(song, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(2))
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    const outcome = await p2
    expect(outcome!.url).toBe('blob:mock-2')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1')
  })

  it('clear() 释放尚未取出的 blob', async () => {
    const p = nextSongPreloader.preload(song, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    await p
    nextSongPreloader.clear()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1')
  })

  it('takeKeep：保留条目可重复取用（loop 跨轮复用）', async () => {
    const p = nextSongPreloader.preload(song, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    await p
    expect(nextSongPreloader.takeKeep(7)!.url).toBe('blob:mock-1')
    expect(nextSongPreloader.takeKeep(7)!.url).toBe('blob:mock-1')
    // 条目不删除，peek 仍可见（重播过半 peek 命中 → 零重复 fetch）
    expect(nextSongPreloader.peek(7)).not.toBeNull()
  })

  it('evictExcept：清除其他歌曲条目并 revoke blob，保留指定条目', async () => {
    const p1 = nextSongPreloader.preload(song, 'exhigh') // id 7
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    await p1
    const other: Song = { ...song, id: 8 }
    const p2 = nextSongPreloader.preload(other, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(2))
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    await p2
    nextSongPreloader.evictExcept(8)
    expect(nextSongPreloader.peek(7)).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1')
    expect(nextSongPreloader.peek(8)).not.toBeNull()
  })

  it('store 超过 4 条时淘汰最旧条目并 revoke', async () => {
    const ids = [7, 8, 9, 10, 11]
    for (const id of ids) {
      const target: Song = { ...song, id }
      const p = nextSongPreloader.preload(target, 'exhigh')
      await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(ids.indexOf(id) + 1))
      lastProbe().duration = 200
      lastProbe().dispatch('canplay')
      await p
    }
    expect(nextSongPreloader.peek(7)).toBeNull() // 最旧的 7 被淘汰
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1')
    expect(nextSongPreloader.peek(11)).not.toBeNull()
  })
})
