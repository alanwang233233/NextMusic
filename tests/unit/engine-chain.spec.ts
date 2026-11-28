import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindCookieProvider, MAIN_API_BASE } from '@/api/http'
import { fetchSongDirectUrl, isSongUnblockEnabled } from '@/api/song'
import {
  ATTEMPT_CHAIN,
  PlayerEngine,
  isTooShort,
  main302Url,
  resetEngineForTest,
  type AttemptKind,
} from '@/player/engine'
import type { EngineCallbacks } from '@/player/engine'
import type { Song } from '@/types/models'

vi.mock('@/api/song', () => ({
  fetchSongDirectUrl: vi.fn(),
  isSongUnblockEnabled: vi.fn(),
  bindUnblockProvider: vi.fn(),
  scrobble: vi.fn(),
  fetchLyric: vi.fn(async () => ({ lrc: '', tlyric: '', romalrc: '', yrc: '' })),
}))

const fetchSongDirectUrlMock = vi.mocked(fetchSongDirectUrl)
const unblockEnabledMock = vi.mocked(isSongUnblockEnabled)

const song: Song = {
  id: 42,
  name: 'test-song',
  artists: [{ id: 1, name: 'artist' }],
  album: { id: 10, name: 'album' },
  duration: 200_000,
}

const JSON_FULL = { id: 42, url: 'https://cdn.example/json-42.flac', level: 'exhigh', freeTrialInfo: null }

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
    const url = new URL(main302Url(42, 'exhigh'))
    expect(url.origin + url.pathname).toBe(`${MAIN_API_BASE}/song/url/v1/302`)
    expect(url.searchParams.get('id')).toBe('42')
    expect(url.searchParams.get('level')).toBe('exhigh')
    expect(url.searchParams.get('timestamp')).toMatch(/^\d{13}$/)
  })

  it('登录态 cookie 追加到 302 地址（保证音质等级生效）', () => {
    bindCookieProvider(() => 'MUSIC_U=abc')
    const url = new URL(main302Url(42, 'lossless'))
    expect(url.searchParams.get('cookie')).toBe('MUSIC_U=abc')
  })

  it('未登录时不携带 cookie 参数', () => {
    const url = new URL(main302Url(42, 'standard'))
    expect(url.searchParams.has('cookie')).toBe(false)
  })
})

describe('ATTEMPT_CHAIN', () => {
  it('常规降级顺序：302（解灰候选项由 play 按开关动态前插）', () => {
    expect(ATTEMPT_CHAIN).toEqual<AttemptKind[]>(['main302'])
  })
})

describe('PlayerEngine 降级链', () => {
  let fake: FakeAudio

  beforeEach(() => {
    FakeAudio.instances = []
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio)
    resetEngineForTest()
    unblockEnabledMock.mockReturnValue(false)
    fetchSongDirectUrlMock.mockReset().mockResolvedValue(JSON_FULL)
  })

  afterEach(() => {
    unblockEnabledMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('解灰关闭：第一次尝试即 302 直链', async () => {
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
    expect(fetchSongDirectUrlMock).not.toHaveBeenCalled()
  })

  it('解灰开启：首个尝试为 JSON 直链且携带 unblock=true', async () => {
    unblockEnabledMock.mockReturnValue(true)
    console.log('DEBUG mock-is-fn=', vi.isMockFunction(isSongUnblockEnabled), 'impl-return=', isSongUnblockEnabled())
    const { callbacks, resolvedUrls, failed } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'exhigh')
    expect(resolvedUrls[0]).toBe('https://cdn.example/json-42.flac')
    expect(failed).toHaveLength(0)
    expect(fetchSongDirectUrlMock).toHaveBeenCalledWith(42, 'exhigh')
    // unblock 参数在 mainApi 层附加（见 song-unblock.spec），此处验证 JSON 候选确实被消费
    expect(resolvedUrls).toHaveLength(1)
  })

  it('解灰开启：JSON 直链失败后回退 302', async () => {
    unblockEnabledMock.mockReturnValue(true)
    fetchSongDirectUrlMock.mockRejectedValue(new Error('解灰直链不可用'))
    const { callbacks, resolvedUrls } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'exhigh')
    // 失败的尝试不触发 onResolved：JSON 候选不可用时直接推进，成功解析的只有 302
    await vi.waitFor(() => expect(resolvedUrls).toHaveLength(1))
    expect(resolvedUrls[0]).toContain('/song/url/v1/302?id=42&level=exhigh')
    expect(fetchSongDirectUrlMock).toHaveBeenCalledWith(42, 'exhigh')
  })

  it('解灰开启：JSON 返回试听片段（freeTrialInfo）时回退 302', async () => {
    unblockEnabledMock.mockReturnValue(true)
    fetchSongDirectUrlMock.mockResolvedValue({
      id: 42, url: 'https://cdn.example/trial.mp3', freeTrialInfo: { start: 0, end: 30 },
    })
    const { callbacks, resolvedUrls, failed } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'exhigh')
    // 试听片段候选不触发 onResolved，直接推进 302
    await vi.waitFor(() => expect(resolvedUrls).toHaveLength(1))
    expect(resolvedUrls[0]).toContain('/song/url/v1/302?id=42&level=exhigh')
    expect(failed).toHaveLength(0)
  })

  it('解灰开启：JSON 返回空 url（灰曲未解锁）时回退 302', async () => {
    unblockEnabledMock.mockReturnValue(true)
    fetchSongDirectUrlMock.mockResolvedValue({ id: 42, url: null })
    const { callbacks, resolvedUrls } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'exhigh')
    // 空 url 候选不触发 onResolved，直接推进 302
    await vi.waitFor(() => expect(resolvedUrls).toHaveLength(1))
    expect(resolvedUrls[0]).toContain('/song/url/v1/302?id=42&level=exhigh')
    expect(fetchSongDirectUrlMock).toHaveBeenCalledWith(42, 'exhigh')
  })

  it('解灰关闭：302 失败后链路耗尽并回调 onFailed（只回调一次）', async () => {
    const { callbacks, resolvedUrls, failed } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'standard')
    fake.currentSrc = fake.src
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
    unblockEnabledMock.mockReturnValue(true)
    const { callbacks, resolvedUrls } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    fake = engine.audio as unknown as FakeAudio

    await engine.play(song, 'exhigh')
    fake.currentSrc = fake.src // 浏览器已选中当前资源
    fake.dispatch('error')
    await vi.waitFor(() => expect(resolvedUrls).toHaveLength(2))
    expect(resolvedUrls[1]).toContain('/song/url/v1/302?id=42')
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

describe('PlayerEngine 预缓存命中', () => {
  beforeEach(() => {
    FakeAudio.instances = []
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio)
    resetEngineForTest()
    unblockEnabledMock.mockReturnValue(false)
    fetchSongDirectUrlMock.mockReset().mockResolvedValue(JSON_FULL)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('preloaded 作为第 0 步直接使用', async () => {
    const { callbacks, resolvedUrls } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)

    await engine.play(song, 'exhigh', { url: 'https://precache.example/42.mp3', source: 'main302' })
    expect(resolvedUrls[0]).toBe('https://precache.example/42.mp3')
    expect(resolvedUrls).toHaveLength(1)
  })

  it('preloaded 失败后回退到常规 302 链路', async () => {
    const { callbacks, resolvedUrls } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    const fakeAudio = engine.audio as unknown as FakeAudio

    await engine.play(song, 'exhigh', { url: 'https://precache.example/42.mp3', source: 'main302' })
    fakeAudio.currentSrc = 'https://precache.example/42.mp3'
    fakeAudio.dispatch('error')
    await vi.waitFor(() => expect(resolvedUrls).toHaveLength(2))
    expect(resolvedUrls[1]).toContain('/song/url/v1/302?id=42&level=exhigh')
  })

  it('解灰开启时 preloaded 失败后先试 JSON 直链再 302', async () => {
    unblockEnabledMock.mockReturnValue(true)
    const { callbacks, resolvedUrls } = makeCallbacks()
    const engine = new PlayerEngine(callbacks)
    const fakeAudio = engine.audio as unknown as FakeAudio

    fetchSongDirectUrlMock.mockRejectedValue(new Error('解灰直链不可用'))
    await engine.play(song, 'exhigh', { url: 'https://precache.example/42.mp3', source: 'main302' })
    fakeAudio.currentSrc = 'https://precache.example/42.mp3'
    fakeAudio.dispatch('error')
    // 预缓存成功解析（onResolved）→ 失败推进；JSON 候选失败不触发 onResolved → 成功解析的只有 302
    await vi.waitFor(() => expect(resolvedUrls).toHaveLength(2))
    expect(resolvedUrls[0]).toBe('https://precache.example/42.mp3')
    expect(resolvedUrls[1]).toContain('/song/url/v1/302?id=42&level=exhigh')
    expect(fetchSongDirectUrlMock).toHaveBeenCalledWith(42, 'exhigh')
  })
})

describe('PlayerEngine 缓冲状态', () => {
  beforeEach(() => {
    FakeAudio.instances = []
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio)
    resetEngineForTest()
    unblockEnabledMock.mockReturnValue(false)
    fetchSongDirectUrlMock.mockReset().mockResolvedValue(JSON_FULL)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function makeBufferCallbacks() {
    const buffering: boolean[] = []
    const base = makeCallbacks()
    return {
      ...base,
      buffering,
      callbacks: {
        ...base.callbacks,
        onBufferingChange: (b: boolean) => buffering.push(b),
      } as typeof base.callbacks,
    }
  }

  it('waiting 进入缓冲中，恢复播放后清除', async () => {
    const ctx = makeBufferCallbacks()
    const engine = new PlayerEngine(ctx.callbacks)
    const fakeAudio = engine.audio as unknown as FakeAudio

    await engine.play(song, 'exhigh')
    fakeAudio.dispatch('waiting')
    expect(ctx.buffering.at(-1)).toBe(true)
    fakeAudio.dispatch('playing')
    expect(ctx.buffering.at(-1)).toBe(false)
  })

  it('切歌后残留的 waiting 不会触发新歌的缓冲状态', async () => {
    const ctx = makeBufferCallbacks()
    const engine = new PlayerEngine(ctx.callbacks)
    const fakeAudio = engine.audio as unknown as FakeAudio

    await engine.play(song, 'exhigh')
    await engine.play({ ...song, id: 99 }, 'exhigh')
    // 模拟旧歌残留的 waiting：事件归属旧资源（currentSrc 仍指向旧地址）
    fakeAudio.currentSrc = 'https://old-resource.example/a.mp3'
    fakeAudio.dispatch('waiting')
    // play() 已重置 buffering 状态，残留事件不应改动
    expect(ctx.buffering.at(-1)).toBe(false)
  })
})
