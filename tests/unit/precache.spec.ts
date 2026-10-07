import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextSongPreloader } from '@/player/precache'
import type { Song } from '@/types/models'

vi.mock('@/api/outer', () => ({
  fetchOuterSongUrl: vi.fn(async (id: number) => ({ id, url: `https://outer.example/${id}.mp3`, br: 320000, level: 'exhigh', size: 1 })),
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

describe('NextSongPreloader', () => {
  beforeEach(() => {
    FakeAudio.instances = []
    nextSongPreloader.clear()
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function lastProbe(): FakeAudio {
    expect(FakeAudio.instances.length).toBeGreaterThan(0)
    return FakeAudio.instances[FakeAudio.instances.length - 1]!
  }

  it('第一次尝试成功：缓存结果并可 take 取出（取出后清空）', async () => {
    const promise = nextSongPreloader.preload(song, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    const probe = lastProbe()
    expect(probe.src).toContain('/song/url/v1/302?id=7&level=exhigh')
    probe.duration = 200
    probe.dispatch('canplay')
    const outcome = await promise
    expect(outcome).not.toBeNull()
    expect(outcome!.songId).toBe(7)
    expect(outcome!.source).toBe('main302')

    expect(nextSongPreloader.take(7)).not.toBeNull()
    expect(nextSongPreloader.take(7)).toBeNull()
  })

  it('第一次尝试报错 → 直接走 OuterAPI', async () => {
    const promise = nextSongPreloader.preload(song, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    lastProbe().dispatch('error')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(2))
    // 第二步 OuterAPI 直链
    expect(lastProbe().src).toContain('outer.example/7.mp3')
    lastProbe().duration = 200
    lastProbe().dispatch('canplaythrough')
    const outcome = await promise
    expect(outcome!.source).toBe('outer')
  })

  it('元数据时长过短（试听片段）→ 升级 OuterAPI', async () => {
    const promise = nextSongPreloader.preload(song, 'standard')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
    lastProbe().duration = 30 // 期望 200s，试听 30s
    lastProbe().dispatch('canplay')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(2))
    // OuterAPI 直链
    expect(lastProbe().src).toContain('outer.example/7.mp3')
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    const outcome = await promise
    expect(outcome!.source).toBe('outer')
  })

  it('全部尝试失败返回 null', async () => {
    const promise = nextSongPreloader.preload(song, 'standard')
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
})
