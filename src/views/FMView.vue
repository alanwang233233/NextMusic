<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { guardWrite } from '@/composables/useWriteAction'
import { fetchPersonalFm, fmTrash } from '@/api/fm'
import { artistsText } from '@/api/normalize'
import { formatDuration } from '@/utils/format'
import type { Song } from '@/types/models'
import PageLoading from '@/components/ui/PageLoading.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LazyImage from '@/components/ui/LazyImage.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

const player = usePlayerStore()
const auth = useAuthStore()
const toast = useToastStore()

const loading = ref(true)
const fmQueue = ref<Song[]>([])

async function fetchMore(): Promise<Song[]> {
  const songs = await fetchPersonalFm()
  return songs
}

/** 启动 FM：进入页面即播放 */
async function start() {
  loading.value = true
  try {
    fmQueue.value = await fetchMore()
    if (!fmQueue.value.length) {
      toast.error('私人 FM 暂无内容')
      return
    }
    player.fmMode = true
    player.queue = [...fmQueue.value]
    await player.playAt(0)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '私人 FM 加载失败')
  } finally {
    loading.value = false
  }
}

/** FM 队列接近尾部时自动续播 */
async function ensureQueue() {
  if (player.fmMode && player.index >= player.queue.length - 1) {
    try {
      const more = await fetchMore()
      fmQueue.value = [...fmQueue.value, ...more]
      player.queue = [...player.queue, ...more]
    } catch {
      toast.error('获取下一首失败')
    }
  }
}

async function fmNext() {
  await ensureQueue()
  player.next()
}

/** 不喜欢：移入垃圾桶并下一首 */
async function fmTrashAndNext() {
  const song = player.currentSong
  if (!song) return
  if (!guardWrite()) return
  try {
    await fmTrash(song.id)
    toast.success('已减少此类歌曲推荐')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '操作失败')
  }
  await fmNext()
}

onMounted(() => {
  if (auth.mode !== 'user') return
  void start()
})

// FM 队列临近耗尽时自动续播（最后一首开始播放时就预取，保证无缝衔接）
watch(
  () => [player.fmMode, player.index, player.playing] as const,
  ([fm, index, playing]) => {
    if (!fm || !playing) return
    if (index >= player.queue.length - 1) void ensureQueue()
  },
)

onBeforeUnmount(() => {
  player.fmMode = false
})
</script>

<template>
  <div>
    <div class="mb-5">
      <h1 class="text-xl font-bold text-white">私人 FM</h1>
      <p class="mt-1 text-xs text-zinc-500">根据你的喜好不间断播放</p>
    </div>

    <!-- 未登录提示（路由守卫一般会拦截） -->
    <EmptyState v-if="auth.mode !== 'user'" text="私人 FM 需要登录后使用" icon="radio">
      <RouterLink to="/login" class="btn-primary">去登录</RouterLink>
    </EmptyState>

    <PageLoading v-else-if="loading" text="正在连接私人 FM" />

    <template v-else-if="player.currentSong">
      <div class="mx-auto max-w-lg" data-testid="fm-view">
        <div class="card-surface border-zinc-800 p-5 sm:p-7">
          <LazyImage
            :src="player.currentSong.album.picUrl"
            :size="500"
            :alt="player.currentSong.name"
            rounded="rounded-2xl"
            class="aspect-square w-full shadow-2xl shadow-black/50"
          />
          <div class="mt-5 text-center">
            <h2 class="truncate text-lg font-bold text-white">{{ player.currentSong.name }}</h2>
            <p class="mt-1 truncate text-sm text-zinc-400">{{ artistsText(player.currentSong) }} · {{ player.currentSong.album.name }}</p>
          </div>

          <!-- FM 控制条 -->
          <div class="mt-5">
            <input
              type="range"
              class="player-range w-full"
              min="0"
              max="1000"
              :value="Math.round(player.progress * 1000)"
              :style="{ '--progress': `${Math.round(player.progress * 100)}%` }"
              aria-label="播放进度"
              @change="player.seekTo(Number(($event.target as HTMLInputElement).value) / 1000)"
            />
            <div class="mt-1 flex justify-between text-[10px] tabular-nums text-zinc-500">
              <span>{{ formatDuration(player.currentTimeMs) }}</span>
              <span>{{ formatDuration(player.durationMs) }}</span>
            </div>
          </div>

          <div class="mt-4 flex items-center justify-center gap-3">
            <button class="btn-icon h-11 w-11" aria-label="不喜欢" title="不再播放" @click="fmTrashAndNext">
              <AppIcon name="trash" :size="18" />
            </button>
            <button class="btn-icon h-11 w-11" aria-label="上一曲" @click="player.prev()">
              <AppIcon name="skip-back" :size="20" />
            </button>
            <button
              class="flex h-13 w-13 items-center justify-center rounded-full bg-primary-600 p-4 text-white shadow-lg shadow-primary-950/60 transition hover:bg-primary-500 active:scale-90"
              :aria-label="player.playing ? '暂停' : '播放'"
              data-testid="fm-toggle"
              @click="player.togglePlay()"
            >
              <AppIcon :name="player.playing ? 'pause' : 'play'" :size="22" />
            </button>
            <button class="btn-icon h-11 w-11" aria-label="下一曲" data-testid="fm-next" @click="fmNext">
              <AppIcon name="skip-forward" :size="20" />
            </button>
            <button
              class="btn-icon h-11 w-11"
              :class="auth.isLiked(player.currentSong.id) ? 'text-primary-500' : ''"
              aria-label="喜欢"
              @click="player.likeCurrent()"
            >
              <AppIcon :name="auth.isLiked(player.currentSong.id) ? 'heart-solid' : 'heart'" :size="18" />
            </button>
          </div>
        </div>
      </div>
    </template>

    <EmptyState v-else text="私人 FM 暂无内容，请稍后重试" icon="radio">
      <button class="btn-primary" @click="start">重试</button>
    </EmptyState>
  </div>
</template>
