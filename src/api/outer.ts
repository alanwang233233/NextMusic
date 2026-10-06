import { outerApi } from './http'
import { normSong, parseDurationText } from './normalize'
import type { Song } from '@/types/models'

/** OuterAPI getSongUrl 响应 */
export interface OuterSongUrl {
  id: number
  url: string
  br: number
  level: string
  size: number
  md5?: string
}

/**
 * OuterAPI 获取播放直链（播放降级链第 3 步使用）
 * 文档：POST /api/getSongUrl {id, level}
 */
export async function fetchOuterSongUrl(id: number, level: string): Promise<OuterSongUrl> {
  const body = await outerApi<{ data: OuterSongUrl }>('/api/getSongUrl', { id: String(id), level })
  if (!body.data?.url) throw new Error('OuterAPI 未返回可用链接')
  return body.data
}

/** OuterAPI 获取歌曲基本信息（兜底补全歌曲信息） */
export async function fetchOuterSongInfo(id: number): Promise<Song> {
  const body = await outerApi<{ data: Record<string, any> }>('/api/getSongInfo', { id: String(id) })
  const d = body.data || {}
  return normSong({
    id: d.id,
    name: d.name,
    singer: d.singer,
    album: d.album,
    picimg: d.picimg,
    duration: parseDurationText(d.duration),
    source: 'outer',
  })
}
