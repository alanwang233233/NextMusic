import { getCookie, requireMainApiBase } from '@/api/http'
import { fetchOuterSongUrl } from '@/api/outer'
import type { Song, UrlSource } from '@/types/models'

/** 播放降级链：1) 302 新版接口 2) 302 + unblock 3) OuterAPI */
export type AttemptKind = 'main302' | 'main302-unblock' | 'outer'

export const ATTEMPT_CHAIN: AttemptKind[] = ['main302', 'main302-unblock', 'outer']

export function attemptSource(kind: AttemptKind): UrlSource {
  return kind === 'outer' ? 'outer' : kind
}

/**
 * 构造 302 端点地址（audio 直接跟随 302 到音频直链）。
 * 登录 cookie 需要一并携带，否则登录用户拿不到所选音质等级对应的直链。
 */
export function main302Url(songId: number, level: string, unblock: boolean): string {
  const base = requireMainApiBase()
  const params = new URLSearchParams({ id: String(songId), level, timestamp: String(Date.now()) })
  if (unblock) params.set('unblock', 'true')
  const cookie = getCookie()
  if (cookie) params.set('cookie', cookie)
  return `${base}/song/url/v1/302?${params.toString()}`
}

/** 元数据时长是否过短（试听片段判定）：期望 >= 30s 且实际 < 期望 × 0.65 */
export function isTooShort(expectedMs: number, actualSec: number): boolean {
  if (!expectedMs || expectedMs < 30_000) return false
  return actualSec < (expectedMs / 1000) * 0.65
}

export interface UrlResolution {
  url: string
  source: UrlSource
}

/**
 * 对单次尝试求值：
 * - main302：直接返回 302 地址，由 audio 元数据校验
 * - outer：先请求 OuterAPI 拿直链
 */
export async function resolveAttempt(kind: AttemptKind, song: Song, level: string): Promise<UrlResolution> {
  if (kind === 'outer') {
    const data = await fetchOuterSongUrl(song.id, level)
    return { url: data.url, source: 'outer' }
  }
  return { url: main302Url(song.id, level, kind === 'main302-unblock'), source: attemptSource(kind) }
}

export interface EngineCallbacks {
  onResolved: (resolution: UrlResolution) => void
  /** 全部尝试失败 */
  onFailed: (reason: string) => void
  onPlaying: () => void
  onPaused: () => void
  onEnded: () => void
  onTimeUpdate: (currentTimeMs: number, durationMs: number) => void
}

/**
 * 播放引擎：持有唯一的 audio 元素。
 * play() 触发降级链，事件（error / loadedmetadata 时长校验）驱动下一步尝试。
 */
export class PlayerEngine {
  audio: HTMLAudioElement
  private callbacks: EngineCallbacks
  private chain: AttemptKind[] = []
  private chainIndex = 0
  private currentSong: Song | null = null
  private level: string = 'exhigh'
  private token = 0
  /** 当前尝试赋给 audio 的地址，用于识别旧资源残留的媒体事件 */
  private pendingUrl: string | null = null
  /** 已对当前 token 上报过失败的标记，避免链路耗尽后重复回调 */
  private failedToken = 0

  constructor(callbacks: EngineCallbacks) {
    this.callbacks = callbacks
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.addEventListener('error', () => {
      // 旧歌曲/旧尝试残留的 error 事件不应推进当前的降级链
      if (!this.isEventForCurrentAttempt()) return
      this.advance('音频加载失败')
    })
    this.audio.addEventListener('loadedmetadata', () => {
      if (!this.isEventForCurrentAttempt()) return
      const duration = this.audio.duration
      if (Number.isFinite(duration) && this.currentSong && isTooShort(this.currentSong.duration, duration)) {
        this.advance('音源时长过短（试听片段）')
      }
    })
    this.audio.addEventListener('playing', () => this.callbacks.onPlaying())
    this.audio.addEventListener('pause', () => this.callbacks.onPaused())
    this.audio.addEventListener('ended', () => this.callbacks.onEnded())
    this.audio.addEventListener('timeupdate', () => {
      this.callbacks.onTimeUpdate(this.audio.currentTime * 1000, this.audio.duration * 1000)
    })
  }

  get current(): Song | null {
    return this.currentSong
  }

  get activeSource(): UrlSource | null {
    return this.activeSourceValue
  }

  private activeSourceValue: UrlSource | null = null

  /** 媒体事件是否属于当前尝试（currentSrc 与刚赋值的地址一致才算） */
  private isEventForCurrentAttempt(): boolean {
    if (!this.pendingUrl) return false
    const currentSrc = this.audio.currentSrc
    return !currentSrc || currentSrc === this.pendingUrl
  }

  /** 开始播放歌曲（触发完整降级链） */
  async play(song: Song, level: string): Promise<void> {
    const myToken = ++this.token
    this.currentSong = song
    this.level = level
    this.chain = ATTEMPT_CHAIN
    this.chainIndex = 0
    this.activeSourceValue = null
    this.pendingUrl = null
    await this.runChain(myToken, '开始播放')
  }

  private async runChain(token: number, failureReason: string): Promise<void> {
    if (token !== this.token) return
    if (this.chainIndex >= this.chain.length) {
      if (token === this.token && this.failedToken !== this.token) {
        this.failedToken = this.token
        this.callbacks.onFailed(failureReason)
      }
      return
    }
    const kind = this.chain[this.chainIndex]
    try {
      const resolution = await resolveAttempt(kind, this.currentSong!, this.level)
      if (token !== this.token) return
      this.activeSourceValue = resolution.source
      this.callbacks.onResolved(resolution)
      this.pendingUrl = resolution.url
      this.audio.src = resolution.url
      await this.audio.play().catch((err: DOMException) => {
        // 自动播放策略拒绝不属于音源问题：保留已加载的 src，等待用户交互后再播
        if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
          this.callbacks.onPaused()
          return
        }
        this.advance('浏览器拒绝了播放请求')
      })
    } catch (err) {
      if (token !== this.token) return
      const reason = err instanceof Error ? err.message : String(err)
      this.advance(reason)
    }
  }

  /** 当前尝试失败，推进到下一步 */
  private advance(reason: string): void {
    if (this.chainIndex >= this.chain.length - 1) {
      if (this.failedToken !== this.token) {
        this.failedToken = this.token
        this.callbacks.onFailed(reason)
      }
      return
    }
    this.chainIndex++
    const token = this.token
    void this.runChain(token, reason)
  }

  togglePlay(): void {
    if (this.audio.paused) {
      void this.audio.play().catch(() => undefined)
    } else {
      this.audio.pause()
    }
  }

  seek(ms: number): void {
    if (Number.isFinite(this.audio.duration)) {
      this.audio.currentTime = Math.min(Math.max(ms / 1000, 0), this.audio.duration)
    }
  }

  setVolume(v: number): void {
    this.audio.volume = Math.min(Math.max(v, 0), 1)
  }
}

let engine: PlayerEngine | null = null

/** 惰性创建（浏览器环境才可 new Audio） */
export function getEngine(callbacks: EngineCallbacks): PlayerEngine {
  if (!engine) engine = new PlayerEngine(callbacks)
  return engine
}

export function resetEngineForTest(): void {
  engine = null
}
