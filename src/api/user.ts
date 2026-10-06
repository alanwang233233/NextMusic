import { mainApi } from './http'
import { normProfile, normSong } from './normalize'
import type { Song, UserProfile } from '@/types/models'

/** 用户详情（含等级、听歌数等） */
export async function fetchUserDetail(uid: number): Promise<UserProfile> {
  const body = await mainApi<Record<string, any>>('/user/detail', { uid })
  return normProfile({ ...body.profile, level: body.level, listenSongs: body.listenSongs, createDays: body.createDays })
}

export interface UserPlaylistItem {
  id: number
  name: string
  subscribed: boolean
  creatorUid: number
}

/** 用户歌单（第一个通常是“我喜欢的音乐”） */
export async function fetchUserPlaylists(uid: number, limit = 1000): Promise<{ playlists: RawPlaylist[]; more: boolean }> {
  const body = await mainApi<{ playlist: Record<string, any>[]; more: boolean }>('/user/playlist', { uid, limit })
  return { playlists: body.playlist || [], more: Boolean(body.more) }
}
type RawPlaylist = Record<string, any>

/** 用户听歌排行（type=1 周榜 type=0 总榜） */
export async function fetchUserRecord(uid: number, type: 0 | 1 = 1): Promise<{ song: Song; playCount: number; score: number }[]> {
  const body = await mainApi<{ weekData?: any[]; allData?: any[] }>('/user/record', { uid, type })
  const list = type === 1 ? body.weekData : body.allData
  return (list || []).map((item) => ({
    song: normSong(item.song),
    playCount: Number(item.playCount || 0),
    score: Number(item.score || 0),
  }))
}

/** 最近播放-歌曲（需登录） */
export async function fetchRecentSongs(limit = 100): Promise<{ song: Song; playTime: number }[]> {
  const body = await mainApi<{ data: { list: any[]; total: number } }>('/record/recent/song', { limit })
  return (body.data?.list || []).map((item) => ({
    song: normSong(item.data),
    playTime: Number(item.playTime || 0),
  }))
}

/** 喜欢音乐 id 列表 */
export async function fetchLikeList(uid: number): Promise<number[]> {
  const body = await mainApi<{ ids: (string | number)[] }>('/likelist', { uid })
  return (body.ids || []).map((id) => Number(id))
}

/** 喜欢 / 取消喜欢音乐 */
export async function likeSong(id: number, like = true): Promise<{ code: number }> {
  return mainApi('/like', { id, like }, { method: 'POST' })
}
