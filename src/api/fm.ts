import { mainApi } from './http'
import { normSong } from './normalize'
import type { Song } from '@/types/models'

/** 私人 FM（需登录），每次返回约 2 首歌曲 */
export async function fetchPersonalFm(): Promise<Song[]> {
  const body = await mainApi<{ data: Record<string, any>[] }>('/personal_fm')
  return (body.data || []).map(normSong)
}

/** 把歌曲移到私人 FM 垃圾桶（跳过） */
export function fmTrash(id: number): Promise<{ code: number }> {
  return mainApi('/fm_trash', { id }, { method: 'POST' })
}
