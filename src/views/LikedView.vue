<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePlayerStore } from '@/stores/player'
import { useToastStore } from '@/stores/toast'
import { fetchSongsDetail } from '@/api/playlist'
import { fetchLikeList } from '@/api/user'
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
const userId = computed(() => auth.displayUid)

async function load() {
  if (!userId.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    let ids: number[] = []
    if (auth.mode === 'user') {
      await auth.loadLikedIds()
      ids = auth.likedIds
    } else {
      ids = await fetchLikeList(userId.value)
    }
    // 最多展示前 300 首，避免超长请求
    songs.value = await fetchSongsDetail(ids.slice(0, 300))
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '喜欢列表加载失败')
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
    <div class="mb-5 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-white">喜欢的音乐</h1>
        <p v-if="auth.mode === 'user' && auth.likedIds.length" class="mt-1 text-xs text-zinc-500">共 {{ auth.likedIds.length }} 首</p>
      </div>
      <button v-if="songs.length" class="btn-primary" @click="player.playQueue(songs, 0)">
        <AppIcon name="play" :size="15" />
        播放全部
      </button>
    </div>

    <PageLoading v-if="loading" text="正在加载喜欢的音乐" />
    <EmptyState v-else-if="!auth.canWrite && !userId" text="登录后可查看喜欢的音乐" icon="heart">
      <RouterLink to="/login" class="btn-primary">去登录</RouterLink>
    </EmptyState>
    <EmptyState v-else-if="!songs.length" text="还没有喜欢的歌曲" icon="heart" />
    <SongList v-else :songs="songs" @play="onPlay" @heart-mode="(song: Song) => heart.start(song)" />
  </div>
</template>
