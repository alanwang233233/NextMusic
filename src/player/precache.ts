import { ATTEMPT_CHAIN, isTooShort, resolveAttempt, type UrlResolution } from './engine'
import type { Song, UrlSource } from '@/types/models'

/** 单次预加载探测的超时 */
const PROBE_TIMEOUT_MS = 10_000

export interface PreloadOutcome {
  songId: number
  url: string
  source: UrlSource
}

/**
 * 下一曲预缓存器：
 * 1. 按常规降级链解析下一曲的播放地址
 * 2. 用隐藏 Audio（preload=auto）预加载并验证（时长校验防试听片段）
 * 3. 结果缓存起来，真正切歌时由引擎直接命中第 0 步，绕过解析与缓冲等待
 */
class NextSongPreloader {
  private probe: HTMLAudioElement | null = null
  /** 当前 probe 的 settle 函数，销毁时立即结束等待 */
  private probeSettle: ((ok: boolean) => void) | null = null
  private token = 0
  private store = new Map<number, PreloadOutcome>()

  /** 取出并移除某首歌的预缓存结果 */
  take(songId: number): PreloadOutcome | null {
    const hit = this.store.get(songId) ?? null
    if (hit) this.store.delete(songId)
    return hit
  }

  peek(songId: number): PreloadOutcome | null {
    return this.store.get(songId) ?? null
  }

  clear(): void {
    this.store.clear()
    this.destroyProbe()
  }

  /**
   * 预缓存一首歌。返回成功结果；全部尝试失败返回 null。
   * 新的 preload 调用会取消进行中的旧任务（token 隔离）。
   */
  async preload(song: Song, level: string): Promise<PreloadOutcome | null> {
    const myToken = ++this.token
    this.destroyProbe()
    for (const kind of ATTEMPT_CHAIN) {
      if (myToken !== this.token) return null
      let resolution: UrlResolution
      try {
        resolution = await resolveAttempt(kind, song, level)
      } catch {
        continue
      }
      if (myToken !== this.token) return null
      const ok = await this.probeUrl(resolution.url, song)
      if (myToken !== this.token) return null
      if (ok) {
        const outcome: PreloadOutcome = { songId: song.id, url: resolution.url, source: resolution.source }
        this.store.set(song.id, outcome)
        return outcome
      }
    }
    return null
  }

  /** 用隐藏 audio 预加载地址并验证可播（元数据时长过短视为失败） */
  private probeUrl(url: string, song: Song): Promise<boolean> {
    return new Promise((resolve) => {
      const audio = new Audio()
      audio.preload = 'auto'
      this.probe = audio
      let settled = false
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        audio.removeEventListener('canplay', onReady)
        audio.removeEventListener('canplaythrough', onReady)
        audio.removeEventListener('error', onError)
        audio.pause()
        audio.removeAttribute('src')
        if (this.probe === audio) {
          this.probe = null
          this.probeSettle = null
        }
        resolve(ok)
      }
      const onReady = () => {
        const duration = audio.duration
        if (Number.isFinite(duration) && isTooShort(song.duration, duration)) {
          finish(false)
          return
        }
        finish(true)
      }
      const onError = () => finish(false)
      const timer = window.setTimeout(() => finish(false), PROBE_TIMEOUT_MS)
      this.probeSettle = (ok: boolean) => finish(ok)
      audio.addEventListener('canplay', onReady)
      audio.addEventListener('canplaythrough', onReady)
      audio.addEventListener('error', onError)
      audio.src = url
      audio.load()
    })
  }

  private destroyProbe(): void {
    const settle = this.probeSettle
    this.probeSettle = null
    if (this.probe) {
      this.probe.pause()
      this.probe.removeAttribute('src')
      try {
        this.probe.load()
      } catch {
        /* 忽略 */
      }
      this.probe = null
    }
    // 立即结束等待中的 probe（结果被取消，由调用方的 token 检查丢弃）
    settle?.(false)
  }
}

export const nextSongPreloader = new NextSongPreloader()
