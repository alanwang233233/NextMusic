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

/** OuterAPI 限流避让：指数退避（1s/2s/4s/8s/16s），最多重试 5 次 */
export const OUTER_RETRY_MAX = 5
export const OUTER_RETRY_BASE_MS = 1000

export function outerRetryDelayMs(retry: number): number {
  // retry: 0..OUTER_RETRY_MAX-1
  return OUTER_RETRY_BASE_MS * 2 ** retry
}

/**
 * OuterAPI 获取播放直链（播放降级链使用）。
 * 文档：POST /api/getSongUrl {id, level}
 * 该接口限流较严格：失败时按指数时间等待后重试，最多重试 5 次。
 */
export async function fetchOuterSongUrl(id: number, level: string): Promise<OuterSongUrl> {
  let lastError: unknown
  for (let retry = 0; retry <= OUTER_RETRY_MAX; retry++) {
    if (retry > 0) {
      await new Promise((resolve) => setTimeout(resolve, outerRetryDelayMs(retry - 1)))
    }
    try {
      const body = await outerApi<{ data: OuterSongUrl }>('/api/getSongUrl', { id: String(id), level })
      if (!body.data?.url) throw new Error('OuterAPI 未返回可用链接')
      return body.data
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('OuterAPI 持续限流，请稍后重试')
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
