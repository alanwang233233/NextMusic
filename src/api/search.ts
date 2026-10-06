import { mainApi } from './http'
import { normAlbum, normArtistDetail, normPlaylist, normSong } from './normalize'
import type { Album, ArtistDetail, Playlist, Song } from '@/types/models'

/** 搜索（cloudsearch，type: 1 单曲 10 专辑 100 歌手 1000 歌单） */
export async function cloudSearch(params: {
  keywords: string
  type?: number
  limit?: number
  offset?: number
}): Promise<{ songs: Song[]; albums: Album[]; artists: ArtistDetail[]; playlists: Playlist[]; count: number }> {
  const body = await mainApi<{ result: Record<string, any> }>('/cloudsearch', params)
  const result = body.result || {}
  return {
    songs: (result.songs || []).map(normSong),
    albums: (result.albums || []).map(normAlbum),
    artists: (result.artists || []).map((raw: any) => normArtistDetail(raw)),
    playlists: (result.playlists || []).map(normPlaylist),
    count: Number(result.songCount ?? result.albumCount ?? result.artistCount ?? result.playlistCount ?? 0),
  }
}

/** 热搜列表（详细） */
export async function fetchHotSearches(): Promise<{ searchWord: string; score: number; content?: string }[]> {
  const body = await mainApi<{ data: Record<string, any>[] }>('/search/hot/detail')
  return (body.data || []).map((item) => ({
    searchWord: String(item.searchWord),
    score: Number(item.score || 0),
    content: item.content,
  }))
}

/** 搜索建议 */
export async function fetchSearchSuggest(keywords: string): Promise<{
  order: string[]
  songs: Song[]
  artists: ArtistDetail[]
  playlists: Playlist[]
  albums: Album[]
}> {
  const body = await mainApi<{ result: Record<string, any> }>('/search/suggest', { keywords })
  const result = body.result || {}
  return {
    order: result.order || [],
    songs: (result.songs || []).map(normSong),
    artists: (result.artists || []).map((raw: any) => normArtistDetail(raw)),
    playlists: (result.playlists || []).map(normPlaylist),
    albums: (result.albums || []).map(normAlbum),
  }
}
