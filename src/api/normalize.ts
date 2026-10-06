import type {
  Album,
  AlbumRef,
  ArtistDetail,
  ArtistRef,
  Playlist,
  Song,
  UserProfile,
} from '@/types/models'

type Raw = Record<string, any>

/** 网易云图片 URL：http -> https，避免混合内容 */
export function httpsUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  return url.replace(/^http:\/\//, 'https://')
}

/** 网易云图片缩放：?param=宽y高 */
export function withImageSize(url: string | undefined, size: number): string | undefined {
  const https = httpsUrl(url)
  if (!https) return undefined
  if (!/music\.126\.net/.test(https)) return https
  return `${https}${https.includes('?') ? '&' : '?'}param=${size}y${size}`
}

function toArtistRefs(raw: Raw): ArtistRef[] {
  const list: Raw[] = raw.ar || raw.artists || []
  if (!Array.isArray(list)) return []
  return list
    .filter((a) => a && (a.id !== 0 || a.name))
    .map((a) => ({ id: Number(a.id) || 0, name: String(a.name || '未知歌手') }))
}

function toAlbumRef(raw: Raw): AlbumRef {
  const al = raw.al || raw.album || {}
  return {
    id: Number(al.id) || 0,
    name: String(al.name || raw.album || '未知专辑'),
    picUrl: httpsUrl(al.picUrl || al.pic || raw.picimg || raw.picUrl),
  }
}

/**
 * 归一化歌曲对象，兼容三种来源：
 * - 网易云标准结构（ar/al/dt）
 * - 私人 FM 结构（artists/album/duration）
 * - OuterAPI 结构（singer 字符串、duration "m:ss"、picimg）
 */
export function normSong(raw: Raw): Song {
  const artists = toArtistRefs(raw)
  const durationMs = typeof raw.dt === 'number' ? raw.dt : typeof raw.duration === 'number' ? raw.duration : parseDurationText(raw.duration)
  return {
    id: Number(raw.id) || 0,
    name: String(raw.name || '未知歌曲'),
    alias: Array.isArray(raw.alia) ? raw.alia.filter(Boolean).map(String) : Array.isArray(raw.alias) ? raw.alias.filter(Boolean).map(String) : undefined,
    artists: artists.length ? artists : [{ id: 0, name: String(raw.singer || '未知歌手') }],
    album: toAlbumRef(raw),
    duration: durationMs,
    fee: raw.fee,
    mvId: raw.mv && Number(raw.mv) > 0 ? Number(raw.mv) : undefined,
    source: raw.source === 'outer' ? 'outer' : 'netease',
  }
}

/** "3:14" -> 194000；无法解析返回 0 */
export function parseDurationText(text?: string): number {
  if (!text || typeof text !== 'string') return 0
  const parts = text.split(':').map((p) => Number(p))
  if (parts.some((p) => Number.isNaN(p))) return 0
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
  return 0
}

export function normPlaylist(raw: Raw): Playlist {
  const creator = raw.creator || {}
  return {
    id: Number(raw.id),
    name: String(raw.name || '未知歌单'),
    coverUrl: httpsUrl(raw.coverImgUrl || raw.picUrl || raw.coverImage),
    trackCount: Number(raw.trackCount || raw.track_count || raw.songCount || 0),
    playCount: raw.playCount != null ? Number(raw.playCount) : raw.playcount != null ? Number(raw.playcount) : undefined,
    subscribedCount: raw.subscribedCount != null ? Number(raw.subscribedCount) : undefined,
    subscribed: Boolean(raw.subscribed),
    creator: {
      uid: Number(creator.userId || creator.uid || raw.userId || 0),
      name: String(creator.nickname || creator.name || '未知用户'),
      avatar: httpsUrl(creator.avatarUrl || creator.avatar),
    },
    description: raw.description ?? raw.desc ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    copywriter: raw.copywriter,
    extraText: raw.updateFrequency,
  }
}

export function normProfile(raw: Raw): UserProfile {
  return {
    userId: Number(raw.userId ?? raw.uid ?? raw.id ?? 0),
    nickname: String(raw.nickname || raw.name || '未知用户'),
    avatarUrl: httpsUrl(raw.avatarUrl || raw.avatar || raw.picUrl) || '',
    backgroundUrl: httpsUrl(raw.backgroundUrl),
    signature: raw.signature,
    vipType: raw.vipType,
    follows: raw.follows != null ? Number(raw.follows) : undefined,
    followeds: raw.followeds != null ? Number(raw.followeds) : undefined,
    listenSongs: raw.listenSongs != null ? Number(raw.listenSongs) : undefined,
    level: raw.level != null ? Number(raw.level) : undefined,
    createDays: raw.createDays != null ? Number(raw.createDays) : undefined,
  }
}

export function normArtistDetail(raw: Raw): ArtistDetail {
  return {
    id: Number(raw.id),
    name: String(raw.name || '未知歌手'),
    alias: Array.isArray(raw.alias) ? raw.alias.filter(Boolean).map(String) : undefined,
    avatar: withImageSize(httpsUrl(raw.img1v1Url || raw.picUrl || raw.avatar), 300),
    cover: httpsUrl(raw.cover),
    musicSize: raw.musicSize,
    albumSize: raw.albumSize,
    mvSize: raw.mvSize,
    fansCnt: raw.fansCnt,
    briefDesc: raw.briefDesc,
    identifyTag: raw.identifyTag,
  }
}

export function normAlbum(raw: Raw): Album {
  const artistRaw = raw.artist || raw.artists?.[0] || {}
  return {
    id: Number(raw.id),
    name: String(raw.name || '未知专辑'),
    picUrl: withImageSize(httpsUrl(raw.picUrl), 300),
    artist: artistRaw.id ? { id: Number(artistRaw.id), name: String(artistRaw.name || '') } : undefined,
    publishTime: raw.publishTime,
    size: raw.size,
    description: raw.description ?? null,
  }
}

export function artistsText(song: Song): string {
  return song.artists.map((a) => a.name).join(' / ')
}
