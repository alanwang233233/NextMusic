/** 领域模型：全站统一的归一化数据结构 */

export interface ArtistRef {
  id: number
  name: string
}

export interface AlbumRef {
  id: number
  name: string
  picUrl?: string
}

export interface Song {
  id: number
  name: string
  alias?: string[]
  artists: ArtistRef[]
  album: AlbumRef
  /** 时长（毫秒），未知为 0 */
  duration: number
  /** 0 免费或无版权 1 VIP 4 购买专辑 8 非会员可播低音质 */
  fee?: number
  mvId?: number
  source?: 'netease' | 'outer'
}

export interface PlaylistCreator {
  uid: number
  name: string
  avatar?: string
}

export interface Playlist {
  id: number
  name: string
  coverUrl?: string
  trackCount: number
  playCount?: number
  subscribedCount?: number
  subscribed?: boolean
  creator: PlaylistCreator
  description?: string | null
  tags?: string[]
  copywriter?: string
  /** 榜单更新频率等附加描述 */
  extraText?: string
}

export interface UserProfile {
  userId: number
  nickname: string
  avatarUrl: string
  backgroundUrl?: string
  signature?: string
  vipType?: number
  follows?: number
  followeds?: number
  /** 累计听歌数量 */
  listenSongs?: number
  level?: number
  createDays?: number
}

export interface UserSubcount {
  createdPlaylistCount?: number
  subPlaylistCount?: number
  artistCount?: number
  mvCount?: number
  djRadioCount?: number
  programCount?: number
}

export interface ArtistDetail {
  id: number
  name: string
  alias?: string[]
  avatar?: string
  cover?: string
  musicSize?: number
  albumSize?: number
  mvSize?: number
  fansCnt?: number
  briefDesc?: string
  identifyTag?: string
}

export interface Album {
  id: number
  name: string
  picUrl?: string
  artist?: ArtistRef
  publishTime?: number
  size?: number
  description?: string | null
}

export interface LyricPayload {
  lrc: string
  tlyric?: string
  romalrc?: string
  yrc?: string
}

export interface LyricLine {
  /** 行起始时间（毫秒） */
  time: number
  /** 行结束时间（毫秒），未知为 Infinity */
  end: number
  text: string
  /** 逐字歌词的字级时间（可选） */
  words?: { start: number; duration: number; text: string }[]
}

export type AuthMode = 'none' | 'user' | 'guest' | 'virtual'

export type PlayMode = 'order' | 'loop' | 'shuffle'

export type QualityLevel =
  | 'standard'
  | 'higher'
  | 'exhigh'
  | 'lossless'
  | 'hires'
  | 'jyeffect'
  | 'dolby'
  | 'vivid'
  | 'jymaster'
  | 'sky'

export type UrlSource = 'main302' | 'main302-unblock' | 'outer'
