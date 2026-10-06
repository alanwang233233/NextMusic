import { mainApi } from './http'
import { normPlaylist, normSong } from './normalize'
import type { Playlist, Song } from '@/types/models'

/** 每日推荐歌单（需登录） */
export async function fetchRecommendPlaylists(): Promise<Playlist[]> {
  const body = await mainApi<{ recommend: Record<string, any>[] }>('/recommend/resource')
  return (body.recommend || []).map(normPlaylist)
}

/** 每日推荐歌曲（需登录） */
export async function fetchRecommendSongs(): Promise<Song[]> {
  const body = await mainApi<{ data: { dailySongs?: Record<string, any>[] } }>('/recommend/songs')
  return (body.data?.dailySongs || []).map(normSong)
}

/** 轮播图 */
export async function fetchBanners(): Promise<{ imageUrl: string; targetId: number; typeTitle?: string; url?: string }[]> {
  const body = await mainApi<{ banners: Record<string, any>[] }>('/banner', { type: 0 })
  return (body.banners || [])
    .filter((b) => b.imageUrl)
    .map((b) => ({
      imageUrl: String(b.imageUrl).replace(/^http:\/\//, 'https://'),
      targetId: Number(b.targetId) || 0,
      typeTitle: b.typeTitle,
      url: b.url,
    }))
}

/** 所有榜单摘要 */
export async function fetchToplistDetail(): Promise<Playlist[]> {
  const body = await mainApi<{ list: Record<string, any>[] }>('/toplist/detail')
  return (body.list || []).map(normPlaylist)
}
