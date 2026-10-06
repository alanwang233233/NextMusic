<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { guardWrite } from '@/composables/useWriteAction'
import { fetchLyric } from '@/api/song'
import { findActiveLine, parseLyrics, type ParsedLyrics } from '@/utils/lyric'
import { downloadSong } from '@/utils/download'
import { qualityLabel } from '@/config/constants'
import { formatDuration } from '@/utils/format'
import { artistsText } from '@/api/normalize'
import AppIcon from '@/components/ui/AppIcon.vue'
import LazyImage from '@/components/ui/LazyImage.vue'

const player = usePlayerStore()
const settings = useSettingsStore()
const auth = useAuthStore()
const toast = useToastStore()

const lyrics = ref<ParsedLyrics>({ lines: [], hasWordTiming: false })
const lyricsLoading = ref(false)
const lyricsError = ref(false)
const activeLine = ref(-1)
const lyricsBox = ref<HTMLElement | null>(null)
const userScrolled = ref(false)
let scrollResetTimer: number | undefined
let programmaticScroll = false

async function loadLyrics(songId: number) {
  lyrics.value = { lines: [], hasWordTiming: false }
  activeLine.value = -1
  lyricsError.value = false
  if (!songId) return
  lyricsLoading.value = true
  try {
    const payload = await fetchLyric(songId)
    // 快速切歌时丢弃过期响应，避免旧歌词渲染到新歌上
    if (player.currentSong?.id !== songId) return
    lyrics.value = parseLyrics(payload, settings.showTranslation)
    if (!lyrics.value.lines.length) lyricsError.value = true
  } catch {
    if (player.currentSong?.id === songId) lyricsError.value = true
  } finally {
    if (player.currentSong?.id === songId) lyricsLoading.value = false
  }
}

watch(
  () => player.currentSong?.id,
  (id) => {
    userScrolled.value = false
    void loadLyrics(id ?? 0)
  },
  { immediate: true },
)

watch(
  () => settings.showTranslation,
  () => {
    if (player.currentSong) void loadLyrics(player.currentSong.id)
  },
)

watch(
  () => player.currentTimeMs,
  (t) => {
    const idx = findActiveLine(lyrics.value.lines, t)
    if (idx !== activeLine.value) {
      activeLine.value = idx
      if (!userScrolled.value) void scrollToActive()
    }
  },
)

async function scrollToActive() {
  await nextTick()
  const box = lyricsBox.value
  if (!box || activeLine.value < 0) return
  const el = box.querySelector<HTMLElement>(`[data-line-index="${activeLine.value}"]`)
  if (el) {
    // 程序滚动触发的 scroll 事件不应被误判为用户手动滚动
    programmaticScroll = true
    window.setTimeout(() => (programmaticScroll = false), 600)
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 2, behavior: 'smooth' })
  }
}

function onLyricsScroll() {
  if (programmaticScroll) return
  userScrolled.value = true
  window.clearTimeout(scrollResetTimer)
  scrollResetTimer = window.setTimeout(() => (userScrolled.value = false), 4000)
}

const cover = computed(() => player.currentSong?.album.picUrl)

function onClose() {
  player.showNowPlaying = false
}

function toggleTranslation() {
  settings.toggleTranslation()
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

function toggleLike() {
  void player.likeCurrent()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="nowplaying">
      <div
        v-if="player.showNowPlaying && player.hasCurrent"
        class="fixed inset-0 z-[100] overflow-hidden bg-zinc-950"
        data-testid="now-playing"
      >
        <!-- 模糊背景 -->
        <div class="absolute inset-0">
          <img
            v-if="cover"
            :src="cover"
            alt=""
            referrerpolicy="no-referrer"
            class="h-full w-full scale-125 object-cover opacity-20 blur-3xl"
          />
          <div class="absolute inset-0 bg-gradient-to-b from-zinc-950/40 via-zinc-950/70 to-zinc-950" />
        </div>

        <div class="relative flex h-full flex-col">
          <!-- 顶栏 -->
          <div class="flex items-center justify-between px-4 py-3.5 sm:px-6">
            <button class="btn-icon" aria-label="收起" data-testid="close-now-playing" @click="onClose">
              <AppIcon name="chevron-down" :size="22" />
            </button>
            <div class="text-center">
              <p class="text-xs font-medium text-zinc-400">正在播放</p>
              <p class="text-sm font-semibold text-white">{{ player.currentSong?.name }}</p>
            </div>
            <button
              class="btn-icon"
              :class="settings.showTranslation ? 'text-primary-400' : ''"
              aria-label="翻译开关"
              @click="toggleTranslation"
            >
              <AppIcon name="sliders" :size="19" />
            </button>
          </div>

          <div class="flex min-h-0 flex-1 flex-col gap-6 px-6 pb-6 lg:flex-row lg:items-center lg:gap-14 lg:px-16">
            <!-- 封面 -->
            <div class="mx-auto w-full max-w-xs shrink-0 lg:mx-0 lg:w-[340px]">
              <LazyImage
                :src="cover"
                :size="600"
                :alt="player.currentSong?.name || ''"
                rounded="rounded-2xl"
                class="aspect-square w-full shadow-2xl shadow-black/60"
              />
              <div class="mt-5 text-center lg:text-left">
                <h2 class="truncate text-xl font-bold text-white">{{ player.currentSong?.name }}</h2>
                <p class="mt-1 truncate text-sm text-zinc-400">{{ player.currentSong ? artistsText(player.currentSong) : '' }}</p>
              </div>
              <!-- 控制区 -->
              <div class="mt-4 flex items-center justify-center gap-2 lg:justify-start">
                <button
                  class="btn-icon"
                  :class="auth.isLiked(player.currentSong?.id ?? -1) ? 'text-primary-500' : ''"
                  aria-label="喜欢"
                  @click="toggleLike"
                >
                  <AppIcon :name="auth.isLiked(player.currentSong?.id ?? -1) ? 'heart-solid' : 'heart'" :size="20" />
                </button>
                <button class="btn-icon" aria-label="下载" @click="onDownload">
                  <AppIcon name="download" :size="20" />
                </button>
                <span class="rounded-full border border-primary-700/70 px-2.5 py-1 text-[10px] font-medium text-primary-400">
                  {{ qualityLabel(settings.quality) }}
                </span>
                <span class="ml-auto text-[11px] tabular-nums text-zinc-500">
                  {{ formatDuration(player.currentTimeMs) }} / {{ formatDuration(player.durationMs) }}
                </span>
              </div>
            </div>

            <!-- 歌词 -->
            <div class="min-h-0 flex-1 lg:h-full">
              <div
                ref="lyricsBox"
                class="h-full max-h-[46vh] overflow-y-auto pr-2 lg:max-h-full lg:py-[35vh]"
                @scroll.passive="onLyricsScroll"
                data-testid="lyrics-box"
              >
                <p v-if="lyricsLoading" class="py-10 text-center text-sm text-zinc-500">歌词加载中</p>
                <p v-else-if="lyricsError || !lyrics.lines.length" class="py-10 text-center text-sm text-zinc-500">
                  暂无歌词
                </p>
                <template v-else>
                  <p
                    v-for="(line, i) in lyrics.lines"
                    :key="i"
                    :data-line-index="i"
                    class="whitespace-pre-line py-2.5 text-sm leading-relaxed transition-all duration-300 sm:text-base"
                    :class="i === activeLine ? 'scale-105 font-semibold text-white' : 'text-zinc-500'"
                    @click="player.seekTo(Math.min(line.time / (player.durationMs || 1), 1))"
                  >
                    {{ line.text }}
                  </p>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.nowplaying-enter-active,
.nowplaying-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.nowplaying-enter-from,
.nowplaying-leave-to {
  opacity: 0;
  transform: translateY(24px);
}
</style>
