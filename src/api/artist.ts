import { mainApi } from './http'
import { normAlbum, normArtistDetail, normSong } from './normalize'
import type { Album, ArtistDetail, Playlist, Song } from '@/types/models'

/** 歌手详情 */
export async function fetchArtistDetail(id: number): Promise<ArtistDetail> {
  const body = await mainApi<{ data: Record<string, any> }>('/artist/detail', { id })
  const identify = body.data?.identify?.tag
  return normArtistDetail({ ...body.data?.artist, identifyTag: Array.isArray(identify) ? identify.map((t: any) => t.name).join(' / ') : undefined })
}

/** 歌手热门 50 首 */
export async function fetchArtistTopSongs(id: number, limit = 50): Promise<Song[]> {
  const body = await mainApi<{ songs: Record<string, any>[] }>('/artist/top/song', { id, limit })
  return (body.songs || []).map(normSong)
}

/** 歌手专辑 */
export async function fetchArtistAlbums(id: number, limit = 30, offset = 0): Promise<{ albums: Album[]; more: boolean }> {
  const body = await mainApi<{ hotAlbums: Record<string, any>[]; more: boolean }>('/artist/album', { id, limit, offset })
  return { albums: (body.hotAlbums || []).map(normAlbum), more: Boolean(body.more) }
}

/** 歌手描述 */
export async function fetchArtistDesc(id: number): Promise<{ briefDesc: string; introduction: { ti: string; txt: string }[] }> {
  const body = await mainApi<{ briefDesc?: string; introduction?: { ti: string; txt: string }[] }>('/artist/desc', { id })
  return { briefDesc: body.briefDesc || '', introduction: body.introduction || [] }
}

/** 相似歌手 */
export async function fetchSimilarArtists(id: number): Promise<ArtistDetail[]> {
  const body = await mainApi<{ artists: Record<string, any>[] }>('/simi/artist', { id })
  return (body.artists || []).map((raw) => normArtistDetail(raw))
}

/** 收藏 / 取消收藏歌手 */
export function subscribeArtist(id: number, subscribe: boolean): Promise<{ code: number }> {
  return mainApi('/artist/sub', { id, t: subscribe ? 1 : 2 }, { method: 'POST' })
}

/** 收藏的歌手列表 */
export async function fetchSubscribedArtists(limit = 25): Promise<ArtistDetail[]> {
  const body = await mainApi<{ data: Record<string, any>[] }>('/artist/sublist', { limit })
  return (body.data || []).map((raw) => normArtistDetail(raw))
}

/** 热门歌手 */
export async function fetchTopArtists(limit = 30, offset = 0): Promise<{ artists: ArtistDetail[]; more: boolean }> {
  const body = await mainApi<{ artists: Record<string, any>[]; more: boolean }>('/top/artists', { limit, offset })
  return { artists: (body.artists || []).map((raw) => normArtistDetail(raw)), more: Boolean(body.more) }
}
