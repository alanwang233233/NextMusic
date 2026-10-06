<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePlayerStore } from '@/stores/player'
import { useToastStore } from '@/stores/toast'
import { fetchRecentSongs, fetchUserRecord } from '@/api/user'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageLoading from '@/components/ui/PageLoading.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import SongList from '@/components/music/SongList.vue'
import { useHeartMode } from '@/composables/useHeartMode'
import type { Song } from '@/types/models'

const auth = useAuthStore()
const player = usePlayerStore()
const heart = useHeartMode()
const toast = useToastStore()

const loading = ref(true)
const songs = ref<Song[]>([])
const showPlayCount = computed(() => auth.mode === 'virtual')

async function load() {
  loading.value = true
  try {
    if (auth.mode === 'user') {
      const recent = await fetchRecentSongs(100)
      songs.value = recent.map((r) => r.song)
    } else if (auth.displayUid) {
      // 虚拟登录 / 其他用户：用听歌排行兜底
      const record = await fetchUserRecord(auth.displayUid, 1)
      songs.value = record.map((r) => r.song)
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '最近播放加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function onPlay(song: Song, index: number) {
  player.playQueue(songs.value, index)
}
</script>

<template>
  <div>
    <div class="mb-5">
      <h1 class="text-xl font-bold text-white">最近播放</h1>
      <p class="mt-1 text-xs text-zinc-500">
        {{ auth.mode === 'user' ? '你最近听过的 100 首歌曲' : auth.displayUid ? '该用户近一周的听歌排行' : '登录后可查看最近播放' }}
      </p>
    </div>

    <PageLoading v-if="loading" text="正在加载最近播放" />
    <EmptyState v-else-if="!auth.displayUid" text="登录后可查看最近播放" icon="clock">
      <RouterLink to="/login" class="btn-primary">去登录</RouterLink>
    </EmptyState>
    <EmptyState v-else-if="!songs.length" text="暂无播放记录" icon="clock" />
    <SongList v-else :songs="songs" @play="onPlay" @heart-mode="(song: Song) => heart.start(song)" />
  </div>
</template>
