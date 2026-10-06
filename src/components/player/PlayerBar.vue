<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { guardWrite } from '@/composables/useWriteAction'
import { downloadSong } from '@/utils/download'
import { QUALITY_LEVELS, qualityLabel } from '@/config/constants'
import { formatDuration } from '@/utils/format'
import { artistsText } from '@/api/normalize'
import type { PlayMode, QualityLevel } from '@/types/models'
import AppIcon from '@/components/ui/AppIcon.vue'
import LazyImage from '@/components/ui/LazyImage.vue'

const player = usePlayerStore()
const settings = useSettingsStore()
const auth = useAuthStore()
const toast = useToastStore()

const qualityMenuOpen = ref(false)
const volumeOpen = ref(false)
const seeking = ref(false)
const seekValue = ref(0)

const progressPct = computed(() => (seeking.value ? seekValue.value : Math.round(player.progress * 1000)))

const MODE_ICON: Record<PlayMode, string> = { order: 'repeat', loop: 'repeat-1', shuffle: 'shuffle' }
const MODE_NEXT: Record<PlayMode, PlayMode> = { order: 'loop', loop: 'shuffle', shuffle: 'order' }

function onSeekStart() {
  seeking.value = true
  seekValue.value = Math.round(player.progress * 1000)
}

function onSeek() {
  player.seekTo(seekValue.value / 1000)
  seeking.value = false
}

function toggleMode() {
  const next = MODE_NEXT[player.mode]
  player.setMode(next)
  toast.info(`已切换为${{ order: '顺序播放', loop: '单曲循环', shuffle: '随机播放' }[next]}`)
}

function toggleLike() {
  void player.likeCurrent()
}

async function onDownload() {
  const song = player.currentSong
  if (!song) return
  if (!guardWrite()) return
  toast.info('开始下载')
  const result = await downloadSong(song, settings.quality)
  if (!result.ok) toast.error(result.reason || '下载失败')
  else if (result.mode === 'external') toast.success('已在新标签页打开音频')
}

function pickQuality(level: QualityLevel) {
  settings.setQuality(level)
  qualityMenuOpen.value = false
  if (player.hasCurrent && player.currentSong) {
    const song = player.currentSong
    const index = player.index
    toast.info(`音质已切换为${qualityLabel(level)}`)
    void player.playAt(index >= 0 ? index : player.queue.indexOf(song))
  }
}

function setVolume(v: number) {
  player.setVolume(v)
}
</script>

<template>
  <Transition name="player">
    <div
      v-if="player.hasCurrent"
      class="fixed inset-x-0 bottom-[3.4rem] z-50 lg:inset-x-auto lg:right-0 lg:bottom-0 lg:left-56"
      data-testid="player-bar"
    >
      <div class="mx-auto max-w-6xl px-2 sm:px-4">
        <div class="card-surface mb-2 border-zinc-700/80 bg-zinc-900/95 shadow-2xl shadow-black/50 backdrop-blur lg:mb-3">
          <!-- 进度条（桌面） -->
          <div class="hidden items-center gap-2 px-5 pt-2.5 lg:flex">
            <span class="w-10 text-right text-[11px] tabular-nums text-zinc-500">{{ formatDuration(player.currentTimeMs) }}</span>
            <input
              type="range"
              class="player-range flex-1"
              min="0"
              max="1000"
              :value="progressPct"
              :style="{ '--progress': `${progressPct / 10}%` }"
              aria-label="播放进度"
              @pointerdown="onSeekStart"
              @input="seekValue = Number(($event.target as HTMLInputElement).value)"
              @change="onSeek"
            />
            <span class="w-10 text-[11px] tabular-nums text-zinc-500">{{ formatDuration(player.durationMs) }}</span>
          </div>

          <div class="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <!-- 歌曲信息 -->
            <button class="flex min-w-0 flex-1 items-center gap-3 text-left lg:w-64 lg:flex-none" aria-label="打开播放页" @click="player.showNowPlaying = true">
              <div class="relative shrink-0">
                <LazyImage :src="player.currentSong?.album.picUrl" :size="80" rounded="rounded-lg" class="h-11 w-11" />
                <div class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition hover:opacity-100">
                  <AppIcon name="chevron-up" :size="16" class="text-white" />
                </div>
              </div>
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium text-white">{{ player.currentSong?.name }}</span>
                <span class="block truncate text-[11px] text-zinc-500">
                  {{ player.currentSong ? artistsText(player.currentSong) : '' }}
                  <span v-if="player.source" class="ml-1 hidden text-zinc-600 sm:inline">
                    [{{ player.source === 'outer' ? '外部音源' : player.source === 'main302-unblock' ? '已解锁' : '主音源' }}]
                  </span>
                </span>
              </span>
            </button>

            <!-- 控制区 -->
            <div class="flex flex-none items-center justify-center gap-1 sm:gap-2">
              <button class="btn-icon hidden sm:inline-flex" aria-label="播放模式" @click="toggleMode">
                <AppIcon :name="MODE_ICON[player.mode]" :size="17" />
              </button>
              <button class="btn-icon" aria-label="上一曲" :disabled="!player.queue.length" @click="player.prev()">
                <AppIcon name="skip-back" :size="18" />
              </button>
              <button
                class="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg shadow-primary-950/60 transition hover:bg-primary-500 active:scale-90"
                :aria-label="player.playing ? '暂停' : '播放'"
                data-testid="play-toggle"
                @click="player.togglePlay()"
              >
                <span v-if="player.loading" class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                <AppIcon v-else :name="player.playing ? 'pause' : 'play'" :size="18" />
              </button>
              <button class="btn-icon" aria-label="下一曲" :disabled="!player.queue.length" @click="player.next()">
                <AppIcon name="skip-forward" :size="18" />
              </button>
              <button
                class="btn-icon hidden sm:inline-flex"
                :class="auth.isLiked(player.currentSong?.id ?? -1) ? 'text-primary-500' : ''"
                aria-label="喜欢"
                @click="toggleLike"
              >
                <AppIcon :name="auth.isLiked(player.currentSong?.id ?? -1) ? 'heart-solid' : 'heart'" :size="17" />
              </button>
            </div>

            <!-- 右侧功能 -->
            <div class="flex flex-none items-center justify-end gap-0.5 sm:gap-1">
              <!-- 音质 -->
              <div class="relative">
                <button
                  class="rounded-full border border-primary-700/70 px-2 py-0.5 text-[10px] font-medium text-primary-400 transition hover:bg-primary-950 whitespace-nowrap"
                  aria-label="音质选择"
                  data-testid="quality-button"
                  @click="qualityMenuOpen = !qualityMenuOpen"
                >
                  {{ qualityLabel(settings.quality) }}
                </button>
                <Transition name="menu">
                  <div v-if="qualityMenuOpen" class="card-surface absolute bottom-11 right-0 z-10 w-44 border-zinc-700 py-1.5 shadow-xl shadow-black/50">
                    <button
                      v-for="q in QUALITY_LEVELS"
                      :key="q.value"
                      class="flex w-full items-center justify-between px-3.5 py-2 text-xs transition hover:bg-zinc-800"
                      :class="settings.quality === q.value ? 'text-primary-400' : 'text-zinc-300'"
                      @click="pickQuality(q.value)"
                    >
                      <span>{{ q.label }}</span>
                      <span v-if="q.vip" class="text-[9px] text-zinc-500">VIP</span>
                      <AppIcon v-if="settings.quality === q.value" name="check" :size="13" />
                    </button>
                  </div>
                </Transition>
              </div>

              <button class="btn-icon" aria-label="下载" @click="onDownload">
                <AppIcon name="download" :size="17" />
              </button>

              <!-- 音量（桌面） -->
              <div class="relative hidden lg:block">
                <button class="btn-icon" aria-label="音量" @click="volumeOpen = !volumeOpen">
                  <AppIcon :name="player.volume === 0 ? 'volume-x' : 'volume'" :size="17" />
                </button>
                <Transition name="menu">
                  <div v-if="volumeOpen" class="card-surface absolute bottom-11 right-0 border-zinc-700 p-3 shadow-xl shadow-black/50">
                    <input
                      type="range"
                      class="player-range w-28"
                      min="0"
                      max="100"
                      :value="Math.round(player.volume * 100)"
                      :style="{ '--progress': `${Math.round(player.volume * 100)}%` }"
                      aria-label="音量"
                      @input="setVolume(Number(($event.target as HTMLInputElement).value) / 100)"
                    />
                  </div>
                </Transition>
              </div>

              <button class="btn-icon" aria-label="播放队列" @click="player.showQueue = !player.showQueue">
                <AppIcon name="queue" :size="17" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.player-enter-active,
.player-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.player-enter-from,
.player-leave-to {
  transform: translateY(16px);
  opacity: 0;
}
.menu-enter-active,
.menu-leave-active {
  transition: opacity 0.15s ease;
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
}
</style>
