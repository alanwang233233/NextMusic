<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useToastStore } from '@/stores/toast'
import { mainApi } from '@/api/http'
import { normAlbum, normSong } from '@/api/normalize'
import type { Album, Song } from '@/types/models'
import PageLoading from '@/components/ui/PageLoading.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LazyImage from '@/components/ui/LazyImage.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import SongList from '@/components/music/SongList.vue'
import { useHeartMode } from '@/composables/useHeartMode'

const route = useRoute()
const player = usePlayerStore()
const heart = useHeartMode()
const toast = useToastStore()

const albumId = computed(() => Number(route.params.id))
const loading = ref(true)
const album = ref<Album | null>(null)
const songs = ref<Song[]>([])

async function load() {
  loading.value = true
  try {
    const body = await mainApi<{ album: Record<string, any>; songs: Record<string, any>[] }>('/album', { id: albumId.value })
    album.value = normAlbum(body.album || {})
    songs.value = (body.songs || []).map(normSong)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '专辑加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(albumId, () => void load())

function onPlay(song: Song, index: number) {
  player.playQueue(songs.value, index)
}
</script>

<template>
  <div>
    <PageLoading v-if="loading" text="正在加载专辑" />
    <template v-else-if="album">
      <div class="flex flex-col gap-5 sm:flex-row">
        <LazyImage :src="album.picUrl" :size="400" rounded="rounded-2xl" class="h-44 w-44 shrink-0 shadow-2xl shadow-black/50 sm:h-48 sm:w-48" />
        <div class="min-w-0 flex-1">
          <h1 class="text-xl font-bold text-white sm:text-2xl">{{ album.name }}</h1>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <RouterLink v-if="album.artist" :to="`/artist/${album.artist.id}`" class="hover:text-primary-400">
              {{ album.artist.name }}
            </RouterLink>
            <span v-if="album.publishTime" class="text-zinc-600">|</span>
            <span v-if="album.publishTime">{{ new Date(album.publishTime).toLocaleDateString('zh-CN') }}</span>
            <span v-if="songs.length" class="text-zinc-600">|</span>
            <span v-if="songs.length">{{ songs.length }} 首</span>
          </div>
          <p v-if="album.description" class="mt-3 line-clamp-3 whitespace-pre-line text-xs leading-5 text-zinc-500">
            {{ album.description }}
          </p>
          <button v-if="songs.length" class="btn-primary mt-4" @click="player.playQueue(songs, 0)">
            <AppIcon name="play" :size="15" />
            播放全部
          </button>
        </div>
      </div>

      <div class="mt-8">
        <EmptyState v-if="!songs.length" text="专辑暂无歌曲" icon="music" />
        <SongList v-else :songs="songs" @play="onPlay" @heart-mode="(song: Song) => heart.start(song, albumId)" />
      </div>
    </template>
    <EmptyState v-else text="专辑加载失败" icon="disc">
      <button class="btn-primary" @click="load">重新加载</button>
    </EmptyState>
  </div>
</template>
