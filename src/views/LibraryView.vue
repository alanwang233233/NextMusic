<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { fetchSubscribedArtists } from '@/api/artist'
import { mainApi } from '@/api/http'
import { normPlaylist } from '@/api/normalize'
import type { ArtistDetail, Playlist } from '@/types/models'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import PageLoading from '@/components/ui/PageLoading.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PlaylistCard from '@/components/music/PlaylistCard.vue'
import ArtistCard from '@/components/music/ArtistCard.vue'

const auth = useAuthStore()
const toast = useToastStore()

const loading = ref(true)
const artists = ref<ArtistDetail[]>([])
const albums = ref<Playlist[]>([])

/** 已收藏专辑（/album/sublist 结构接近歌单） */
async function loadAlbums(): Promise<Playlist[]> {
  const body = await mainApi<{ data: Record<string, any>[] }>('/album/sublist', { limit: 50 })
  return (body.data || []).map((raw) =>
    normPlaylist({
      id: raw.id,
      name: raw.name,
      coverImgUrl: raw.picUrl,
      trackCount: raw.size,
      creator: raw.artist || {},
    }),
  )
}

async function load() {
  loading.value = true
  try {
    if (auth.mode === 'user') {
      const results = await Promise.allSettled([fetchSubscribedArtists(50), loadAlbums()])
      if (results[0].status === 'fulfilled') artists.value = results[0].value
      if (results[1].status === 'fulfilled') albums.value = results[1].value
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '收藏加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="mb-5">
      <h1 class="text-xl font-bold text-white">收藏</h1>
      <p class="mt-1 text-xs text-zinc-500">收藏的歌手与专辑（需要正式登录）</p>
    </div>

    <PageLoading v-if="loading" text="正在加载收藏" />

    <template v-else-if="auth.mode === 'user'">
      <section v-if="albums.length">
        <SectionHeader title="收藏的专辑" :subtitle="`共 ${albums.length} 张`" />
        <div class="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
          <PlaylistCard v-for="pl in albums" :key="pl.id" :playlist="pl" />
        </div>
      </section>
      <section v-if="artists.length" class="mt-8">
        <SectionHeader title="收藏的歌手" :subtitle="`共 ${artists.length} 位`" />
        <div class="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-6 md:grid-cols-8">
          <ArtistCard v-for="a in artists" :key="a.id" :artist="a" />
        </div>
      </section>
      <EmptyState v-if="!albums.length && !artists.length" text="暂无收藏内容" icon="library" />
    </template>

    <EmptyState v-else text="登录后可查看收藏内容" icon="library">
      <RouterLink to="/login" class="btn-primary">去登录</RouterLink>
    </EmptyState>
  </div>
</template>
