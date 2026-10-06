<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchBanners, fetchToplistDetail } from '@/api/recommend'
import { fetchPersonalizedPlaylists } from '@/api/playlist'
import { fetchTopArtists } from '@/api/artist'
import type { ArtistDetail, Playlist } from '@/types/models'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import PageLoading from '@/components/ui/PageLoading.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import BannerCarousel from '@/components/music/BannerCarousel.vue'
import PlaylistCard from '@/components/music/PlaylistCard.vue'
import ArtistCard from '@/components/music/ArtistCard.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

const auth = useAuthStore()

const loading = ref(true)
const banners = ref<Playlist[]>([])
const recommendPlaylists = ref<Playlist[]>([])
const toplists = ref<Playlist[]>([])
const artists = ref<ArtistDetail[]>([])

async function loadAll() {
  loading.value = true
  const results = await Promise.allSettled([
    fetchPersonalizedPlaylists(15),
    fetchTopArtists(16),
    fetchToplistDetail(),
    fetchBanners(),
  ])
  if (results[0].status === 'fulfilled') {
    recommendPlaylists.value = results[0].value
    banners.value = results[0].value.slice(0, 6)
  }
  if (results[1].status === 'fulfilled') artists.value = results[1].value.artists
  if (results[2].status === 'fulfilled') toplists.value = results[2].value.slice(0, 10)
  if (results[3].status === 'fulfilled') {
    banners.value = results[3].value.map((b) => ({
      id: b.targetId,
      name: b.typeTitle || '推荐',
      copywriter: b.url || '',
      coverUrl: b.imageUrl,
      trackCount: 0,
      creator: { uid: 0, name: '' },
    }))
  }
  loading.value = false
}

onMounted(loadAll)

// 登录态变化后刷新（游客 -> 用户可见内容差异）
watch(
  () => auth.mode,
  () => void loadAll(),
)

const greeting = (): string => {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

const todayText = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
</script>

<template>
  <div class="space-y-10">
    <!-- 欢迎区 -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold text-white sm:text-2xl">
          {{ greeting() }}{{ auth.displayProfile ? `，${auth.displayProfile.nickname}` : '' }}
        </h1>
        <p class="mt-1 text-xs text-zinc-500">{{ todayText }}</p>
      </div>
      <RouterLink
        v-if="auth.canWrite"
        to="/daily"
        class="group relative hidden overflow-hidden rounded-2xl bg-gradient-to-br from-primary-700 to-primary-950 px-6 py-4 text-white shadow-lg shadow-primary-950/50 transition hover:from-primary-600 sm:flex"
      >
        <span>
          <span class="flex items-center gap-2 text-sm font-semibold">
            <AppIcon name="calendar" :size="16" />
            每日推荐
          </span>
          <span class="mt-1 block text-xs text-primary-200">根据你的口味生成专属推荐</span>
        </span>
      </RouterLink>
    </div>

    <template v-if="loading">
      <PageLoading text="正在加载首页" />
    </template>

    <template v-else>
      <EmptyState
        v-if="!recommendPlaylists.length && !artists.length"
        text="内容加载失败，请检查网络后刷新"
        icon="refresh"
      >
        <button class="btn-primary" @click="loadAll">重新加载</button>
      </EmptyState>

      <!-- 轮播推荐 -->
      <BannerCarousel v-if="banners.length" :playlists="banners" />

      <!-- 推荐歌单 -->
      <section v-if="recommendPlaylists.length">
        <SectionHeader title="推荐歌单" subtitle="为你精选的优质内容" />
        <div class="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
          <PlaylistCard v-for="pl in recommendPlaylists" :key="pl.id" :playlist="pl" />
        </div>
      </section>

      <!-- 热门歌手 -->
      <section v-if="artists.length">
        <SectionHeader title="热门歌手" />
        <div class="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-6 md:grid-cols-8">
          <ArtistCard v-for="a in artists" :key="a.id" :artist="a" />
        </div>
      </section>

      <!-- 排行榜 -->
      <section v-if="toplists.length">
        <SectionHeader title="排行榜" subtitle="全网最热榜单" />
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <RouterLink
            v-for="(pl, i) in toplists"
            :key="pl.id"
            :to="`/playlist/${pl.id}`"
            class="group flex items-center gap-3 rounded-xl border border-zinc-800/70 bg-zinc-900/50 p-2.5 transition hover:border-primary-700"
          >
            <span class="w-5 text-center text-sm font-bold text-zinc-600 group-hover:text-primary-500">{{ i + 1 }}</span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium text-zinc-200">{{ pl.name }}</p>
              <p class="truncate text-[10px] text-zinc-500">{{ pl.extraText || pl.creator.name }}</p>
            </div>
          </RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>
