import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { fetchIntelligenceList } from '@/api/song'
import { fetchUserPlaylists } from '@/api/user'
import type { Song } from '@/types/models'

/** 心动模式兜底歌单 id（用户歌单列表第一个），进程内缓存 */
let fallbackPid: number | null = null

async function resolveFallbackPid(): Promise<number> {
  if (fallbackPid != null) return fallbackPid
  const auth = useAuthStore()
  if (auth.displayUid) {
    try {
      const { playlists } = await fetchUserPlaylists(auth.displayUid, 1)
      fallbackPid = playlists[0]?.id ?? 0
    } catch {
      fallbackPid = 0
    }
  }
  return fallbackPid ?? 0
}

/**
 * 心动模式：以某首歌为种子生成智能播放列表。
 * 调用方有歌单上下文时传入 pid；否则回退到用户歌单列表的第一个歌单。
 */
export function useHeartMode() {
  const player = usePlayerStore()
  const toast = useToastStore()

  async function start(song: Song, pid?: number) {
    toast.info('正在生成心动模式歌单')
    try {
      const contextPid = pid || (await resolveFallbackPid())
      const list = await fetchIntelligenceList({ id: song.id, pid: contextPid, sid: song.id })
      if (!list.length) {
        toast.error('心动模式暂时没有推荐歌曲')
        return
      }
      player.playQueue([song, ...list.filter((s) => s.id !== song.id)], 0)
      toast.success('已开启心动模式')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '心动模式开启失败')
    }
  }

  return { start }
}
