import { mainApi } from './http'
import { normPlaylist, normSong } from './normalize'
import type { Playlist, Song } from '@/types/models'

export interface PlaylistDetail {
  info: Playlist
  /** 完整歌曲（可能只有前若干首） */
  tracks: Song[]
  /** 完整的 trackId 列表 */
  trackIds: number[]
}

/** 歌单详情；tracks 不完整时用 trackIds + song/detail 补全（见 fetchPlaylistSongs） */
export async function fetchPlaylistDetail(id: number): Promise<PlaylistDetail> {
  const body = await mainApi<{ playlist: Record<string, any> }>('/playlist/detail', { id, s: 0 })
  const raw = body.playlist || {}
  const trackIds = (raw.trackIds || []).map((t: any) => Number(t.id)).filter((n: number) => Number.isFinite(n) && n > 0)
  return {
    info: normPlaylist(raw),
    tracks: (raw.tracks || []).map(normSong),
    trackIds,
  }
}

/** 批量获取歌曲详情（ids 用逗号分隔） */
export async function fetchSongsDetail(ids: number[]): Promise<Song[]> {
  if (!ids.length) return []
  const body = await mainApi<{ songs: Record<string, any>[] }>('/song/detail', { ids: ids.join(',') })
  const rawSongs = body.songs || []
  const byId = new Map<number, Song>()
  for (const raw of rawSongs) {
    const song = normSong(raw)
    byId.set(song.id, song)
  }
  // trackIds 顺序为准，缺失的补占位
  return ids.map((id) => byId.get(id) || ({
    id,
    name: '歌曲信息缺失',
    artists: [],
    album: { id: 0, name: '' },
    duration: 0,
  } as Song))
}

/** 更新歌单（名称 + 描述 + 标签一次性提交） */
export function updatePlaylist(params: { id: number; name: string; desc?: string; tags?: string }): Promise<{ code: number }> {
  return mainApi('/playlist/update', params, { method: 'POST' })
}

/** 收藏 / 取消收藏歌单（t=1 收藏 t=2 取消） */
export function subscribePlaylist(id: number, subscribe: boolean): Promise<{ code: number }> {
  return mainApi('/playlist/subscribe', { id, t: subscribe ? 1 : 2 }, { method: 'POST' })
}

/** 对歌单添加/删除歌曲 */
export function manipulatePlaylistTracks(op: 'add' | 'del', pid: number, tracks: number[]): Promise<{ code: number; body?: { code: number } }> {
  return mainApi('/playlist/tracks', { op, pid, tracks: tracks.join(',') }, { method: 'POST' })
}

/** 推荐歌单（不需要登录） */
export async function fetchPersonalizedPlaylists(limit = 30): Promise<Playlist[]> {
  const body = await mainApi<{ result: Record<string, any>[] }>('/personalized', { limit })
  return (body.result || []).map(normPlaylist)
}

