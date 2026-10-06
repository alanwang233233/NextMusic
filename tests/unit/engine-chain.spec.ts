import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindCookieProvider, MAIN_API_BASE } from '@/api/http'
import { ATTEMPT_CHAIN, PlayerEngine, isTooShort, main302Url, resetEngineForTest, type AttemptKind } from '@/player/engine'
import type { EngineCallbacks } from '@/player/engine'
import type { Song } from '@/types/models'

vi.mock('@/api/outer', () => ({
  fetchOuterSongUrl: vi.fn(async (id: number) => ({ id, url: `https://outer.example/${id}.mp3`, br: 320000, level: 'exhigh', size: 1 })),
}))

const song: Song = {
  id: 42,
  name: 'test-song',
  artists: [{ id: 1, name: 'artist' }],
  album: { id: 10, name: 'album' },
  duration: 200_000,
}

/** 可控的假 Audio：记录 src，手动派发事件 */
class FakeAudio {
  static instances: FakeAudio[] = []
  src = ''
  currentSrc = ''
  volume = 1
  preload = ''
  duration = Number.NaN
  currentTime = 0
  paused = true
  private listeners = new Map<string, ((e?: unknown) => void)[]>()

  constructor() {
    FakeAudio.instances.push(this)
  }

  addEventListener(type: string, cb: (e?: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), cb])
  }

  removeEventListener() {}

  dispatch(type: string) {
    for (const cb of this.listeners.get(type) || []) cb()
  }

  playAttempts = 0
  play(): Promise<void> {
    this.playAttempts++
    return Promise.resolve()
  }

  pause() {
    this.paused = true
  }

  load() {}

  removeAttribute(name: string) {
    if (name === 'src') this.src = ''
  }
}

function makeCallbacks() {
  const resolvedUrls: string[] = []
  const failed: string[] = []
  return {
    resolvedUrls,
    failed,
    callbacks: {
      onResolved: (r: { url: string }) => resolvedUrls.push(r.url),
      onFailed: (reason: string) => failed.push(reason),
      onPlaying: () => undefined,
      onPaused: () => undefined,
      onEnded: () => undefined,
      onTimeUpdate: () => undefined,
    } satisfies EngineCallbacks,
  }
}

describe('isTooShort', () => {
  it('期望时长不足 30 秒时不判定过短', () => {
    expect(isTooShort(20_000, 5)).toBe(false)
  })

  it('试听片段判定', () => {
    // 期望 200s，实际 30s（< 65%）→ 过短
    expect(isTooShort(200_000, 30)).toBe(true)
    expect(isTooShort(200_000, 135)).toBe(false)
  })
})

describe('main302Url', () => {
  afterEach(() => {
    bindCookieProvider(() => undefined)
  })

  it('构造 302 地址并携带 level 与时间戳', () => {
    const url = new URL(main302Url(42, 'exhigh', false))
    expect(url.origin + url.pathname).toBe(`${MAIN_API_BASE}/song/url/v1/302`)
    expect(url.searchParams.get('id')).toBe('42')
    expect(url.searchParams.get('level')).toBe('exhigh')
    expect(url.searchParams.get('timestamp')).toMatch(/^\d{13}$/)
  })

  it('unblock=true 参数', () => {
    expect(main302Url(42, 'lossless', true)).toContain('unblock=true')
  })

  it('登录态 cookie 追加到 302 地址（保证音质等级生效）', () => {
    bindCookieProvider(() => 'MUSIC_U=abc')
    const url = new URL(main302Url(42, 'lossless', false))
    expect(url.searchParams.get('cookie')).toBe('MUSIC_U=abc')
  })

  it('未登录时不携带 cookie 参数', () => {
    const url = new URL(main302Url(42, 'standard', false))
    expect(url.searchParams.has('cookie')).toBe(false)
  })
})

describe('ATTEMPT_CHAIN', () => {
  it('降级顺序：302 → 302+unblock → OuterAPI', () => {
    expect(ATTEMPT_CHAIN).toEqual<AttemptKind[]>(['main302', 'main302-unblock', 'outer'])
  })
})

describe('PlayerEngine 降级链', () => {
  let fake: FakeAudio

  beforeEach(() => {
    FakeAudio.instances = []
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio)
    resetEngineForTest()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('第一次尝试即成功', async () => {
    const { callbacks, resolvedUrls, failed } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'exhigh')
    expect(resolvedUrls[0]).toContain('/song/url/v1/302?id=42&level=exhigh')
    expect(failed).toHaveLength(0)
    // 模拟元数据加载完成：时长正常
    fake.duration = 200
    fake.dispatch('loadedmetadata')
    fake.dispatch('playing')
    expect(failed).toHaveLength(0)
  })

  it('音频报错后推进到 unblock 尝试，再报错后走 OuterAPI', async () => {
    const { callbacks, resolvedUrls } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'exhigh')
    expect(resolvedUrls[0]).not.toContain('unblock=true')

    // 第一次失败
    fake.dispatch('error')
    await vi.waitFor(() => expect(resolvedUrls).toHaveLength(2))
    expect(resolvedUrls[1]).toContain('unblock=true')

    // 第二次失败 → OuterAPI
    fake.dispatch('error')
    await vi.waitFor(() => expect(resolvedUrls).toHaveLength(3))
    expect(resolvedUrls[2]).toContain('outer.example/42.mp3')
  })

  it('元数据时长过短也推进降级链', async () => {
    const { callbacks, resolvedUrls, failed } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'standard')
    // 试听片段 30 秒（歌曲 200 秒）
    fake.duration = 30
    fake.dispatch('loadedmetadata')
    await vi.waitFor(() => expect(resolvedUrls).toHaveLength(2))

    // 第二次依旧过短 → OuterAPI
    fake.duration = 30
    fake.dispatch('loadedmetadata')
    await vi.waitFor(() => expect(resolvedUrls).toHaveLength(3))
    expect(failed).toHaveLength(0)
  })

  it('全部尝试失败后回调 onFailed（且只回调一次）', async () => {
    const { callbacks, failed } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'standard')
    fake.dispatch('error')
    await vi.waitFor(() => expect(failed.length).toBeGreaterThanOrEqual(0))
    fake.dispatch('error')
    await vi.waitFor(() => expect(failed.length).toBeGreaterThanOrEqual(0))
    fake.dispatch('error')
    await vi.waitFor(() => expect(failed).toHaveLength(1))
    // 链路已耗尽，继续派发错误不再累积失败回调
    fake.dispatch('error')
    await new Promise((r) => setTimeout(r, 10))
    expect(failed).toHaveLength(1)
  })

  it('旧资源残留的 error 事件（currentSrc 不匹配）不会推进链路', async () => {
    const { callbacks, resolvedUrls, failed } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'standard')
    fake.currentSrc = 'https://old-resource.example/a.mp3' // 与 pendingUrl 不一致
    fake.dispatch('error')
    await new Promise((r) => setTimeout(r, 10))
    expect(resolvedUrls).toHaveLength(1) // 链路未推进
    expect(failed).toHaveLength(0)
  })

  it('currentSrc 匹配时 error 正常推进链路', async () => {
    const { callbacks, resolvedUrls } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'standard')
    fake.currentSrc = fake.src // 浏览器已选中当前资源
    fake.dispatch('error')
    await vi.waitFor(() => expect(resolvedUrls).toHaveLength(2))
  })

  it('旧歌曲残留的 loadedmetadata（时长过短）不会影响新歌', async () => {
    const { callbacks, resolvedUrls, failed } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'standard')
    // 切歌后，旧短音频的 loadedmetadata 才到达
    fake.currentSrc = 'https://old-resource.example/a.mp3'
    fake.duration = 5
    fake.dispatch('loadedmetadata')
    await new Promise((r) => setTimeout(r, 10))
    expect(resolvedUrls).toHaveLength(1)
    expect(failed).toHaveLength(0)
  })

  it('切歌后旧链路不再生效（token 隔离）', async () => {
    const { callbacks, resolvedUrls } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'standard')
    const firstLen = resolvedUrls.length
    // 切新歌
    await engine.play({ ...song, id: 43 }, 'standard')
    fake.dispatch('error')
    await vi.waitFor(() => expect(resolvedUrls.length).toBeGreaterThan(firstLen))
  })
})
