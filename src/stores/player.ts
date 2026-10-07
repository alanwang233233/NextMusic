import { defineStore } from 'pinia'
import { getEngine, type UrlResolution } from '@/player/engine'
import { nextSongPreloader } from '@/player/precache'
import { useAuthStore } from './auth'
import { useSettingsStore } from './settings'
import { useToastStore } from './toast'
import { likeSong } from '@/api/user'
import { scrobble } from '@/api/song'
import type { PlayMode, Song } from '@/types/models'

/**
 * 引擎回调只在首次创建引擎时生效。回调内部每次都通过 usePlayerStore()
 * 惰性获取当前 store（Pinia 单例），避免闭包捕获失效的问题。
 */
let cachedCallbacks: Parameters<typeof getEngine>[0] | null = null

export function buildEngineCallbacks(): Parameters<typeof getEngine>[0] {
  const toast = useToastStore()
  return {
    onResolved: (resolution: UrlResolution) => {
      usePlayerStore().source = resolution.source
    },
    onFailed: (reason: string) => {
      const store = usePlayerStore()
      store.loading = false
      store.playing = false
      toast.error(`播放失败：${reason}`)
    },
    onPlaying: () => {
      usePlayerStore().playing = true
      usePlayerStore().loading = false
    },
    onPaused: () => {
      const store = usePlayerStore()
      store.playing = false
      store.loading = false
    },
    onEnded: () => {
      const store = usePlayerStore()
      store.playing = false
      store.scrobbleIfNeeded()
      if (store.mode === 'loop' && !store.fmMode) {
        void store.playAt(store.index)
      } else {
        store.next(true)
      }
    },
    onTimeUpdate: (currentMs: number, durationMs: number) => {
      const store = usePlayerStore()
      store.currentTimeMs = currentMs
      if (Number.isFinite(durationMs) && durationMs > 0) store.durationMs = durationMs
      store.maybePreloadNext()
    },
    onBufferingChange: (buffering: boolean) => {
      usePlayerStore().buffering = buffering
    },
  }
}

function engineCallbacksForStore(): Parameters<typeof getEngine>[0] {
  if (!cachedCallbacks) cachedCallbacks = buildEngineCallbacks()
  return cachedCallbacks
}

export const usePlayerStore = defineStore('player', {
  state: () => ({
    queue: [] as Song[],
    index: -1,
    playing: false,
    loading: false,
    currentTimeMs: 0,
    durationMs: 0,
    volume: 0.9,
    muted: false,
    mode: 'order' as PlayMode,
    /** 正在播放的音源（main302 / main302-unblock / outer） */
    source: null as null | UrlResolution['source'],
    showNowPlaying: false,
    showQueue: false,
    /** FM 模式：end 事件后自动下一曲但不重置队列 */
    fmMode: false,
    _scrobbled: false,
    /** 音频缓冲中（waiting 未恢复） */
    buffering: false,
    /** 已成功预缓存的“下一曲”所属的当前曲 songId（用于指示与防重） */
    preloadedNextFor: 0,
    _preloadTriggeredFor: 0,
    _preloading: false,
  }),
  getters: {
    currentSong: (s): Song | null => s.queue[s.index] ?? null,
    hasCurrent(): boolean {
      return this.currentSong !== null
    },
    progress(): number {
      if (!this.durationMs) return 0
      return Math.min(1, this.currentTimeMs / this.durationMs)
    },
  },
  actions: {
    /** 替换队列并播放指定曲目 */
    playQueue(songs: Song[], startIndex = 0) {
      if (!songs.length) return
      this.queue = [...songs]
      this.fmMode = false
      void this.playAt(startIndex)
    },

    /** 追加到队列尾部并播放 */
    playSongNow(song: Song) {
      const existing = this.queue.findIndex((s) => s.id === song.id)
      if (existing >= 0) {
        this.fmMode = false
        void this.playAt(existing)
        return
      }
      const insertAt = this.index + 1
      this.queue.splice(insertAt, 0, song)
      this.fmMode = false
      void this.playAt(insertAt)
    },

    async playAt(index: number) {
      const song = this.queue[index]
      if (!song) return
      this.index = index
      this.loading = true
      this.currentTimeMs = 0
      this.durationMs = song.duration
      this._scrobbled = false
      this.buffering = false
      this.preloadedNextFor = 0
      this._preloadTriggeredFor = 0
      const settings = useSettingsStore()
      const engine = getEngine(engineCallbacksForStore())
      engine.setVolume(this.volume)
      try {
        // 命中预缓存则直接使用已缓冲的地址（第 0 步），失败后引擎继续常规降级链
        const preloaded = nextSongPreloader.take(song.id) ?? undefined
        await engine.play(song, settings.quality, preloaded)
      } catch {
        this.loading = false
      }
    },

    togglePlay() {
      if (!this.hasCurrent) return
      getEngine(engineCallbacksForStore()).togglePlay()
    },

    next(auto = false) {
      if (!this.queue.length) return
      let target: number
      if (this.fmMode) {
        target = this.index + 1
        if (target >= this.queue.length) {
          // FM 队列耗尽由 FM 页面负责续播
          this.playing = false
          return
        }
      } else if (this.mode === 'shuffle') {
        target = this.pickShuffle(auto)
      } else {
        target = this.index + 1
        if (target >= this.queue.length) {
          if (auto) target = 0
          else {
            this.playing = false
            return
          }
        }
      }
      void this.playAt(target)
    },

    prev() {
      if (!this.queue.length) return
      const target = this.index <= 0 ? this.queue.length - 1 : this.index - 1
      void this.playAt(target)
    },

    pickShuffle(auto: boolean): number {
      if (this.queue.length === 1) return this.index
      let target = this.index
      while (target === this.index) {
        target = Math.floor(Math.random() * this.queue.length)
      }
      void auto
      return target
    },

    seekTo(ratio: number) {
      getEngine(engineCallbacksForStore()).seek(ratio * (this.durationMs || 0))
    },

    setVolume(v: number) {
      this.volume = Math.min(Math.max(v, 0), 1)
      this.muted = this.volume === 0
      getEngine(engineCallbacksForStore()).setVolume(this.volume)
    },

    setMode(mode: PlayMode) {
      this.mode = mode
    },

    removeFromQueue(songIndex: number) {
      if (songIndex === this.index) return
      this.queue.splice(songIndex, 1)
      if (songIndex < this.index) this.index--
    },

    scrobbleIfNeeded() {
      if (this._scrobbled) return
      this._scrobbled = true
      const auth = useAuthStore()
      const song = this.currentSong
      if (auth.mode === 'user' && song) {
        scrobble(song.id, song.album.id, Math.round(this.currentTimeMs / 1000)).catch(() => undefined)
      }
    },

    /** 播放进度过半（>=50%）时自动预缓存下一曲（默认行为，每首歌只触发一次） */
    maybePreloadNext() {
      if (!this.playing || !this.durationMs) return
      const currentId = this.currentSong?.id ?? 0
      if (this.currentTimeMs < this.durationMs / 2) return
      if (this._preloadTriggeredFor === currentId || this._preloading) return
      this._preloadTriggeredFor = currentId
      void this.preloadNext()
    },

    /** 预缓存下一曲（按当前播放模式预测） */
    async preloadNext() {
      const song = this.peekNextSong()
      if (!song) return
      if (nextSongPreloader.peek(song.id)) {
        this.preloadedNextFor = this.currentSong?.id ?? 0
        return
      }
      if (this._preloading) return
      this._preloading = true
      try {
        const settings = useSettingsStore()
        const outcome = await nextSongPreloader.preload(song, settings.quality)
        if (outcome) this.preloadedNextFor = this.currentSong?.id ?? 0
      } finally {
        this._preloading = false
      }
    },

    /** 按播放模式预测下一曲（loop 重复当前曲无需预载；shuffle 无法预测） */
    peekNextSong(): Song | null {
      if (!this.queue.length) return null
      if (this.fmMode) return this.queue[this.index + 1] ?? null
      if (this.mode === 'order') {
        const nextIndex = this.index + 1 < this.queue.length ? this.index + 1 : 0
        return this.queue[nextIndex] ?? null
      }
      return null
    },

    /** 喜欢 / 取消喜欢当前歌曲（写守卫） */
    async likeCurrent() {
      const song = this.currentSong
      if (!song) return
      await this.likeSongById(song.id)
    },

    async likeSongById(songId: number) {
      const auth = useAuthStore()
      const toast = useToastStore()
      try {
        if (!auth.assertWrite()) return
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '写入操作不可用')
        return
      }
      const liked = auth.isLiked(songId)
      try {
        await likeSong(songId, !liked)
        if (liked) {
          auth.likedIds = auth.likedIds.filter((id) => id !== songId)
        } else {
          auth.likedIds = [...auth.likedIds, songId]
        }
        toast.success(liked ? '已取消喜欢' : '已加入喜欢的音乐')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '操作失败')
      }
    },
  },
})
