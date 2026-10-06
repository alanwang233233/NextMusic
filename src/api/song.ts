import { mainApi } from './http'
import type { LyricPayload } from '@/types/models'

/** 下载直链（/song/download/url） */
export interface DownloadUrlResult {
  url?: string | null
  type?: string
  encodeType?: string
}

/** 获取客户端歌曲下载 url（需登录） */
export async function fetchDownloadUrl(id: number, br = 999000): Promise<DownloadUrlResult> {
  const body = await mainApi<{ data: DownloadUrlResult | null }>('/song/download/url', { id, br })
  return body.data || {}
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
