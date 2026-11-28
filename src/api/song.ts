import { mainApi } from './http'
import type { LyricPayload } from '@/types/models'

/** 下载直链（/song/download/url/v1） */
export interface DownloadUrlResult {
  url?: string | null
  type?: string
  encodeType?: string
}

/** 获取歌曲下载直链（需登录）；v1 接口按 level 请求音质（standard…sky 全 10 档） */
export async function fetchDownloadUrl(id: number, level: string): Promise<DownloadUrlResult> {
  const body = await mainApi<{ data: DownloadUrlResult | null }>('/song/download/url/v1', { id, level })
  return body.data || {}
}

/** 新版获取歌曲 URL（JSON 直链，供预缓存 Blob 化拉取；试听片段时 freeTrialInfo 非空） */
export interface SongUrlResult {
  id?: number
  url?: string | null
  level?: string
  type?: string
  size?: number
  freeTrialInfo?: { start?: number; end?: number } | null
}

export async function fetchSongDirectUrl(id: number, level: string): Promise<SongUrlResult> {
  const body = await mainApi<{ data: SongUrlResult[] | null }>(
    '/song/url/v1',
    // 解灰开启时附带 unblock=true：服务端对 VIP/灰色歌曲尝试换取完整音频（本地与远程增强版实例均支持）
    { id, level, ...(unblockEnabled() ? { unblock: true } : {}) },
  )
  return normalizeSongUrlResult(body.data?.[0] ?? {})
}

type UnblockProvider = () => boolean

let unblockProvider: UnblockProvider | null = null

/** 由 settings store 注册解灰开关读取函数（仿 bindCookieProvider） */
export function bindUnblockProvider(fn: UnblockProvider | null): void {
  unblockProvider = fn
}

function unblockEnabled(): boolean {
  try {
    return unblockProvider?.() ?? false
  } catch {
    return false
  }
}

/**
 * 归一化上游怪癖：解灰成功后 freeTrialInfo 为字符串 "null"（truthy！）
 * 会被预缓存误判为试听片段而放弃整段音频，统一归一化为 null。
 */
function normalizeSongUrlResult(result: SongUrlResult): SongUrlResult {
  if (typeof result.freeTrialInfo === 'string') result.freeTrialInfo = null
  return result
}

/** 获取歌词（新版，含逐字歌词） */
export async function fetchLyric(id: number): Promise<LyricPayload> {
  const body = await mainApi<Record<string, any>>('/lyric/new', { id })
  const pick = (field: string): string => {
    const obj = body[field]
    if (obj && typeof obj === 'object' && typeof obj.lyric === 'string') return obj.lyric
    return ''
  }
  return {
    lrc: pick('lrc'),
    tlyric: pick('tlyric'),
    romalrc: pick('romalrc'),
    yrc: pick('yrc'),
  }
}

/** 听歌打卡 */
export function scrobble(id: number, sourceid: number, time: number): Promise<{ code: number }> {
  return mainApi('/scrobble', { id, sourceid, time })
}

/** 心动模式 / 智能播放列表 */
export async function fetchIntelligenceList(params: { id: number; pid: number; sid?: number }): Promise<import('@/types/models').Song[]> {
  const { normSong } = await import('./normalize')
  const body = await mainApi<{ data: any[] }>('/playmode/intelligence/list', params)
  return (body.data || [])
    .map((item) => (item.songInfo ? normSong(item.songInfo) : null))
    .filter((s: unknown): s is import('@/types/models').Song => Boolean(s))
}
