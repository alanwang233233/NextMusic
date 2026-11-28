import { fetchSongDirectUrl } from '@/api/song'
import { isTooShort, main302Url } from './engine'
import type { Song, UrlSource } from '@/types/models'

/** 单次预加载探测的超时 */
const PROBE_TIMEOUT_MS = 10_000

export interface PreloadOutcome {
  songId: number
  /** 播放地址：blob: URL（数据级缓存）或直链 / 302 端点地址 */
  url: string
  source: UrlSource
  /** true 表示音频数据已完整缓存在内存（blob: URL），切歌零网络请求 */
  blob?: boolean
}

/** https 页面下把 http 直链升级为 https（避免混合内容拦截）；其余原样返回 */
function upgradeToFetchable(url: string): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return url.replace(/^http:\/\//, 'https://')
  }
  return url
}

/** 全量拉取音频为 Blob 并生成 object URL；失败返回 null（回退为元素直连） */
async function fetchAsBlobUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

function revokeBlobUrl(url: string | null | undefined): void {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* 忽略 */
    }
  }
}

interface Candidate {
  url: string
  source: UrlSource
  /** 是否可 Blob 化拉取（302 端点会被风控拒绝 fetch，只能走媒体元素） */
  blobbable: boolean
}

/**
 * 下一曲预缓存器（数据级）：
 * 1. 按候选链解析下一曲直链：主 API JSON 直链（解灰开启时携带 unblock，可 Blob 化）→ 302 端点（媒体元素流）
 * 2. 可 Blob 化的候选优先 fetch 整段音频缓存为 blob: URL，失败回退为元素直连
 * 3. 用隐藏 Audio 验证时长（防试听片段），结果缓存
 * 4. 真正切歌时引擎第 0 步直接命中 blob: URL——零网络请求，即点即播
 */
class NextSongPreloader {
  private probe: HTMLAudioElement | null = null
  /** 当前 probe 的 settle 函数，销毁时立即结束等待 */
  private probeSettle: ((ok: boolean) => void) | null = null
  private token = 0
  private store = new Map<number, PreloadOutcome>()
  /** 已交出的 blob URL（新→旧，最多保留 2 个：播放中的 + 刚切走的） */
  private handoff: string[] = []

  /** 取出并移除某首歌的预缓存结果 */
  take(songId: number): PreloadOutcome | null {
    const hit = this.store.get(songId) ?? null
    if (hit) {
      this.store.delete(songId)
      if (hit.blob) {
        this.handoff.unshift(hit.url)
        // 只保留当前与上一代（上一代仍可能是切歌瞬间 audio 元素的 src），更早的释放
        while (this.handoff.length > 2) revokeBlobUrl(this.handoff.pop())
      }
    }
    return hit
  }

  /** 保留式取用：命中不删除条目（loop 跨轮复用同一首歌的缓存）；handoff 记录同 URL 去重 */
  takeKeep(songId: number): PreloadOutcome | null {
    const hit = this.store.get(songId) ?? null
    if (hit?.blob && this.handoff[0] !== hit.url) {
      this.handoff.unshift(hit.url)
      while (this.handoff.length > 2) revokeBlobUrl(this.handoff.pop())
    }
    return hit
  }

  /** 清除指定歌曲以外的缓存条目（loop 切歌后释放旧 blob） */
  evictExcept(songId: number): void {
    for (const [id, outcome] of this.store) {
      if (id !== songId) {
        revokeBlobUrl(outcome.url)
        this.store.delete(id)
      }
    }
  }

  peek(songId: number): PreloadOutcome | null {
    return this.store.get(songId) ?? null
  }

  clear(): void {
    for (const outcome of this.store.values()) revokeBlobUrl(outcome.url)
    this.store.clear()
    // 交出记录一并丢弃（播放中的 blob 交给浏览器，不做 revoke）
    this.handoff = []
    this.destroyProbe()
  }

  /**
   * 预缓存一首歌。返回成功结果；全部候选失败返回 null。
   * 新的 preload 调用会取消进行中的旧任务（token 隔离）。
   */
  async preload(song: Song, level: string): Promise<PreloadOutcome | null> {
    const myToken = ++this.token
    this.destroyProbe()
    for (const thunk of this.candidateThunks(song, level)) {
      if (myToken !== this.token) return null
      const candidate = await thunk()
      if (myToken !== this.token) return null
      if (!candidate) continue
      let playUrl = candidate.url
      if (candidate.blobbable) {
        const blobUrl = await fetchAsBlobUrl(candidate.url)
        if (myToken !== this.token) return null
        if (blobUrl) playUrl = blobUrl
      }
      const ok = await this.probeUrl(playUrl, song)
      if (myToken !== this.token) return null
      if (ok) {
        const old = this.store.get(song.id)
        if (old && old.url !== playUrl) revokeBlobUrl(old.url)
        const outcome: PreloadOutcome = {
          songId: song.id,
          url: playUrl,
          source: candidate.source,
          blob: playUrl.startsWith('blob:'),
        }
        this.store.set(song.id, outcome)
        // 卫生上限：快速跳歌时最多保留 4 条，淘汰最旧（Map 迭代序即插入序）
        while (this.store.size > 4) {
          const oldest = this.store.keys().next().value
          if (oldest === undefined) break
          const evicted = this.store.get(oldest)
          this.store.delete(oldest)
          revokeBlobUrl(evicted?.url)
        }
        return outcome
      }
    }
    return null
  }

  /** 候选直链（按优先级懒求值） */
  private candidateThunks(song: Song, level: string): (() => Promise<Candidate | null>)[] {
    return [
      async () => {
        try {
          const direct = await fetchSongDirectUrl(song.id, level)
          // 试听片段直接放弃该候选，不浪费下载
          if (direct.url && !direct.freeTrialInfo) {
            return { url: upgradeToFetchable(direct.url), source: 'main302', blobbable: true }
          }
        } catch {
          /* 主接口不可用时走下一候选 */
        }
        return null
      },
      // 302 端点：带 cookie 的元素流地址，媒体元素可跟随（fetch 会被风控拒绝），作为兜底
      async () => ({ url: main302Url(song.id, level), source: 'main302', blobbable: false }),
    ]
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
