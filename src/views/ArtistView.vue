<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { guardWrite } from '@/composables/useWriteAction'
import { fetchArtistDetail, fetchArtistTopSongs, fetchArtistAlbums, fetchArtistDesc, fetchSimilarArtists, subscribeArtist, fetchSubscribedArtists } from '@/api/artist'
import { ApiError } from '@/api/http'
import { formatCount } from '@/utils/format'
import type { Album, ArtistDetail, Song } from '@/types/models'
import PageLoading from '@/components/ui/PageLoading.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LazyImage from '@/components/ui/LazyImage.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import SongList from '@/components/music/SongList.vue'
import { useHeartMode } from '@/composables/useHeartMode'
import ArtistCard from '@/components/music/ArtistCard.vue'

const route = useRoute()
const player = usePlayerStore()
const heart = useHeartMode()
const auth = useAuthStore()
const toast = useToastStore()

type Tab = 'songs' | 'albums' | 'desc' | 'similar'

const artistId = computed(() => Number(route.params.id))
const loading = ref(true)
const error = ref(false)
const artist = ref<ArtistDetail | null>(null)
const topSongs = ref<Song[]>([])
const albums = ref<Album[]>([])
const desc = ref<{ briefDesc: string; introduction: { ti: string; txt: string }[] }>({ briefDesc: '', introduction: [] })
const similar = ref<ArtistDetail[]>([])
/** /simi/artist 需要正式登录（游客 cookie 也不可用），未登录时给出提示 */
const similarNeedsLogin = ref(false)
const tab = ref<Tab>('songs')
const subscribed = ref(false)
const subscribing = ref(false)

async function load() {
  loading.value = true
  error.value = false
  try {
    const results = await Promise.allSettled([
      fetchArtistDetail(artistId.value),
      fetchArtistTopSongs(artistId.value),
      fetchArtistAlbums(artistId.value),
      fetchArtistDesc(artistId.value),
      fetchSimilarArtists(artistId.value),
    ])
    if (results[0].status === 'fulfilled') artist.value = results[0].value
    if (results[1].status === 'fulfilled') topSongs.value = results[1].value
    if (results[2].status === 'fulfilled') albums.value = results[2].value.albums
    if (results[3].status === 'fulfilled') desc.value = results[3].value
    if (results[4].status === 'fulfilled') {
      similar.value = results[4].value
      similarNeedsLogin.value = false
    } else {
      similar.value = []
      const reason = results[4].reason
      similarNeedsLogin.value = reason instanceof ApiError && reason.code === 301
    }
    if (!artist.value && !topSongs.value.length) throw new Error('歌手信息加载失败')
    // 已登录时同步收藏状态
    if (auth.canWrite && artist.value) {
      try {
        const subs = await fetchSubscribedArtists(100)
        subscribed.value = subs.some((a) => a.id === artist.value!.id)
      } catch {
        /* 收藏状态获取失败不影响主流程 */
      }
    }
  } catch (err) {
    error.value = true
    toast.error(err instanceof Error ? err.message : '歌手加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(artistId, () => {
  if (artistId.value) void load()
})

function playAll() {
  if (!topSongs.value.length) return
  player.playQueue(topSongs.value, 0)
}

function onPlay(song: Song, index: number) {
  player.playQueue(topSongs.value, index)
}

async function toggleSubscribe() {
  if (!artist.value) return
  if (!guardWrite()) return
  subscribing.value = true
  try {
    await subscribeArtist(artist.value.id, !subscribed.value)
    subscribed.value = !subscribed.value
    toast.success(subscribed.value ? '已收藏歌手' : '已取消收藏')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '操作失败')
  } finally {
    subscribing.value = false
  }
}

const TAB_DEFS: { key: Tab; label: string }[] = [
  { key: 'songs', label: '热门歌曲' },
  { key: 'albums', label: '专辑' },
  { key: 'desc', label: '简介' },
  { key: 'similar', label: '相似歌手' },
]
</script>

<template>
  <div>
    <PageLoading v-if="loading" text="正在加载歌手信息" />

    <EmptyState v-else-if="error" text="歌手信息加载失败" icon="user">
      <button class="btn-primary" @click="load">重新加载</button>
    </EmptyState>

    <template v-else-if="artist">
      <!-- 歌手头部 -->
      <div class="relative overflow-hidden rounded-2xl border border-zinc-800/70" data-testid="artist-header">
        <div
          class="absolute inset-0 bg-cover bg-center opacity-25 blur-2xl"
          :style="artist.cover ? { backgroundImage: `url(${artist.cover})` } : {}"
        />
        <div class="relative flex flex-col items-center gap-5 bg-zinc-950/40 p-6 sm:flex-row sm:p-8">
          <LazyImage
            :src="artist.avatar"
            :size="300"
            :alt="artist.name"
            rounded="rounded-full"
            class="h-28 w-28 shadow-xl shadow-black/50 sm:h-32 sm:w-32"
          />
          <div class="min-w-0 text-center sm:text-left">
            <h1 class="text-xl font-bold text-white sm:text-2xl">
              {{ artist.name }}
              <span v-if="artist.alias?.length" class="ml-2 text-sm font-normal text-zinc-400">{{ artist.alias.join(' / ') }}</span>
            </h1>
            <p v-if="artist.identifyTag" class="mt-1 text-xs text-primary-400">{{ artist.identifyTag }}</p>
            <div class="mt-2.5 flex flex-wrap justify-center gap-3 text-xs text-zinc-400 sm:justify-start">
              <span v-if="artist.musicSize != null">歌曲 {{ artist.musicSize }}</span>
              <span v-if="artist.albumSize != null">专辑 {{ artist.albumSize }}</span>
              <span v-if="artist.mvSize != null">MV {{ artist.mvSize }}</span>
              <span v-if="artist.fansCnt">{{ formatCount(artist.fansCnt) }} 粉丝</span>
            </div>
            <div class="mt-4 flex justify-center gap-2 sm:justify-start">
              <button class="btn-primary" @click="playAll">
                <AppIcon name="play" :size="15" />
                播放热门
              </button>
              <button
                v-if="auth.canWrite"
                class="btn-secondary"
                :disabled="subscribing"
                @click="toggleSubscribe"
              >
                <AppIcon :name="subscribed ? 'check' : 'plus'" :size="15" />
                {{ subscribed ? '已收藏' : '收藏歌手' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="mb-5 mt-6 flex gap-1 overflow-x-auto rounded-xl bg-zinc-900 p-1">
        <button
          v-for="t in TAB_DEFS"
          :key="t.key"
          class="shrink-0 rounded-lg px-4 py-1.5 text-xs transition"
          :class="tab === t.key ? 'bg-primary-600 text-white' : 'text-zinc-400 hover:text-white'"
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- 热门歌曲 -->
      <template v-if="tab === 'songs'">
        <EmptyState v-if="!topSongs.length" text="暂无热门歌曲" icon="music" />
        <SongList v-else :songs="topSongs" @play="onPlay" @heart-mode="(song: Song) => heart.start(song)" />
      </template>

      <!-- 专辑 -->
      <template v-else-if="tab === 'albums'">
        <EmptyState v-if="!albums.length" text="暂无专辑" icon="disc" />
        <div v-else class="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
          <RouterLink v-for="al in albums" :key="al.id" :to="`/album/${al.id}`" class="group">
            <LazyImage :src="al.picUrl" :size="300" rounded="rounded-lg" class="aspect-square w-full" />
            <p class="mt-2 line-clamp-1 text-xs text-zinc-300 group-hover:text-white">{{ al.name }}</p>
            <p class="text-[11px] text-zinc-500">{{ al.publishTime ? new Date(al.publishTime).toLocaleDateString('zh-CN') : '' }}</p>
          </RouterLink>
        </div>
      </template>

      <!-- 简介 -->
      <template v-else-if="tab === 'desc'">
        <EmptyState v-if="!desc.briefDesc && !desc.introduction.length" text="暂无简介" icon="user" />
        <div v-else class="max-w-3xl space-y-5 text-sm leading-7 text-zinc-400">
          <p v-if="desc.briefDesc" class="whitespace-pre-line">{{ desc.briefDesc }}</p>
          <div v-for="sec in desc.introduction" :key="sec.ti">
            <h3 class="mb-1.5 font-semibold text-zinc-200">{{ sec.ti }}</h3>
            <p class="whitespace-pre-line text-xs leading-6">{{ sec.txt }}</p>
          </div>
        </div>
      </template>

      <!-- 相似歌手 -->
      <template v-else>
        <EmptyState
          v-if="similarNeedsLogin"
          text="相似歌手仅对正式登录用户开放"
          icon="log-in"
          data-testid="similar-needs-login"
        >
          <RouterLink to="/login" class="btn-primary">去登录</RouterLink>
        </EmptyState>
        <EmptyState v-else-if="!similar.length" text="暂无相似歌手" icon="user" />
        <div v-else class="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-6 md:grid-cols-8">
          <ArtistCard v-for="a in similar" :key="a.id" :artist="a" />
        </div>
      </template>
    </template>
  </div>
</template>
