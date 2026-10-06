<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useToastStore } from '@/stores/toast'
import { fetchRecommendPlaylists, fetchRecommendSongs } from '@/api/recommend'
import type { Playlist, Song } from '@/types/models'
import PageLoading from '@/components/ui/PageLoading.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import PlaylistCard from '@/components/music/PlaylistCard.vue'
import SongList from '@/components/music/SongList.vue'
import { useHeartMode } from '@/composables/useHeartMode'
import AppIcon from '@/components/ui/AppIcon.vue'

const player = usePlayerStore()
const heart = useHeartMode()
const toast = useToastStore()

const loading = ref(true)
const playlists = ref<Playlist[]>([])
const songs = ref<Song[]>([])

async function load() {
  loading.value = true
  const results = await Promise.allSettled([fetchRecommendPlaylists(), fetchRecommendSongs()])
  if (results[0].status === 'fulfilled') playlists.value = results[0].value
  if (results[1].status === 'fulfilled') songs.value = results[1].value
  loading.value = false
}

onMounted(load)

function onPlay(song: Song, index: number) {
  player.playQueue(songs.value, index)
}

function playSongs() {
  if (!songs.value.length) {
    toast.error('今日推荐歌曲暂不可用')
    return
  }
  player.playQueue(songs.value, 0)
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-white sm:text-2xl">每日推荐</h1>
        <p class="mt-1 text-xs text-zinc-500">
          {{ new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) }} · 根据你的音乐口味生成
        </p>
      </div>
      <button v-if="songs.length" class="btn-primary" data-testid="daily-play" @click="playSongs">
        <AppIcon name="play" :size="15" />
        播放推荐歌曲
      </button>
    </div>

    <PageLoading v-if="loading" text="正在获取每日推荐" />

    <template v-else>
      <!-- 推荐歌曲 -->
      <section v-if="songs.length">
        <SectionHeader title="推荐歌曲" :subtitle="`今日 ${songs.length} 首`" />
        <SongList :songs="songs" @play="onPlay" @heart-mode="(song: Song) => heart.start(song)" />
      </section>

      <!-- 推荐歌单 -->
      <section v-if="playlists.length" class="mt-10">
        <SectionHeader title="推荐歌单" subtitle="根据口味为你挑选" />
        <div class="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
          <PlaylistCard v-for="pl in playlists" :key="pl.id" :playlist="pl" />
        </div>
      </section>

      <EmptyState v-if="!songs.length && !playlists.length" text="每日推荐加载失败，请稍后重试" icon="calendar">
        <button class="btn-primary" @click="load">重新加载</button>
      </EmptyState>
    </template>
  </div>
</template>
