<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { cloudSearch, fetchHotSearches, fetchSearchSuggest } from '@/api/search'
import { formatCount } from '@/utils/format'
import type { Album, ArtistDetail, Playlist, Song } from '@/types/models'
import SongList from '@/components/music/SongList.vue'
import PlaylistCard from '@/components/music/PlaylistCard.vue'
import ArtistCard from '@/components/music/ArtistCard.vue'
import LazyImage from '@/components/ui/LazyImage.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageLoading from '@/components/ui/PageLoading.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useToastStore } from '@/stores/toast'
import { useHeartMode } from '@/composables/useHeartMode'

const route = useRoute()
const router = useRouter()
const player = usePlayerStore()
const toast = useToastStore()
const heart = useHeartMode()

type SearchTab = 'song' | 'artist' | 'album' | 'playlist'
const TAB_DEFS: { key: SearchTab; label: string; type: number }[] = [
  { key: 'song', label: '单曲', type: 1 },
  { key: 'artist', label: '歌手', type: 100 },
  { key: 'album', label: '专辑', type: 10 },
  { key: 'playlist', label: '歌单', type: 1000 },
]

const keyword = ref(String(route.query.q || ''))
const tab = ref<SearchTab>('song')
const loading = ref(false)
const searched = ref(false)

const songs = ref<Song[]>([])
const artists = ref<ArtistDetail[]>([])
const albums = ref<Album[]>([])
const playlists = ref<Playlist[]>([])
const total = ref(0)
const offset = ref(0)
const LIMIT = 30

let requestSeq = 0

const hots = ref<{ searchWord: string; content?: string }[]>([])
const suggests = ref<Song[]>([])
const suggestVisible = ref(false)
let suggestTimer: number | undefined

const hasMore = computed(() => songs.value.length < total.value)

onMounted(async () => {
  try {
    hots.value = (await fetchHotSearches()).slice(0, 10)
  } catch {
    /* 热搜失败不影响搜索 */
  }
  if (keyword.value) void doSearch()
})

watch(
  () => route.query.q,
  (q) => {
    const next = String(q || '')
    if (next && next !== keyword.value) {
      keyword.value = next
      void doSearch()
    }
  },
)

watch(keyword, (kw) => {
  window.clearTimeout(suggestTimer)
  if (!kw.trim()) {
    suggestVisible.value = false
    suggests.value = []
    return
  }
  suggestTimer = window.setTimeout(async () => {
    try {
      const res = await fetchSearchSuggest(kw.trim())
      // 输入已变化时丢弃过期建议
      if (kw.trim() !== keyword.value.trim()) return
      suggests.value = res.songs.slice(0, 6)
      suggestVisible.value = true
    } catch {
      suggestVisible.value = false
    }
  }, 300)
})

async function doSearch(reset = true) {
  const kw = keyword.value.trim()
  if (!kw) return
  const seq = ++requestSeq
  const activeTab = tab.value
  if (reset) {
    offset.value = 0
    songs.value = []
    artists.value = []
    albums.value = []
    playlists.value = []
    total.value = 0
  }
  loading.value = true
  searched.value = true
  suggestVisible.value = false
  try {
    const typeDef = TAB_DEFS.find((t) => t.key === activeTab)!
    const res = await cloudSearch({ keywords: kw, type: typeDef.type, limit: LIMIT, offset: offset.value })
    // 请求发起后又发生了新的搜索或切换 Tab：丢弃过期响应
    if (seq !== requestSeq || activeTab !== tab.value) return
    total.value = res.count
    if (activeTab === 'song') songs.value = reset ? res.songs : [...songs.value, ...res.songs]
    if (activeTab === 'artist') artists.value = res.artists
    if (activeTab === 'album') albums.value = res.albums
    if (activeTab === 'playlist') playlists.value = res.playlists
  } catch (err) {
    if (seq === requestSeq) toast.error(err instanceof Error ? err.message : '搜索失败')
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function switchTab(next: SearchTab) {
  tab.value = next
  void doSearch()
}

function loadMore() {
  offset.value += LIMIT
  void doSearch(false)
}

function searchHot(word: string) {
  keyword.value = word
  suggestVisible.value = false
  void doSearch()
  router.replace({ query: { q: word } })
}

function pickSuggest(song: Song) {
  suggestVisible.value = false
  player.playSongNow(song)
}

function hideSuggestDelayed() {
  window.clearTimeout(suggestTimer)
  suggestTimer = window.setTimeout(() => (suggestVisible.value = false), 150)
}

function submitSearch() {
  window.clearTimeout(suggestTimer)
  suggestVisible.value = false
  void doSearch()
  router.replace({ query: { q: keyword.value.trim() } })
}

function focusInput() {
  if (suggests.value.length) suggestVisible.value = true
}

function onPlay(song: Song, index: number) {
  player.playQueue(songs.value, index)
}
</script>

<template>
  <div>
    <!-- 搜索框 -->
    <div class="relative mb-6">
      <form @submit.prevent="submitSearch">
        <div class="relative">
          <AppIcon name="search" :size="16" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            v-model="keyword"
            type="search"
            class="field-input !rounded-full !py-2.5 pl-10"
            placeholder="搜索歌曲、歌手、专辑、歌单"
            aria-label="搜索关键词"
            @focus="focusInput"
            @blur="hideSuggestDelayed"
          />
        </div>
      </form>
      <!-- 搜索建议 -->
      <div
        v-if="suggestVisible && suggests.length"
        class="card-surface absolute inset-x-0 top-12 z-20 border-zinc-700 py-1.5 shadow-xl shadow-black/50"
      >
        <button
          v-for="s in suggests"
          :key="s.id"
          class="flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800"
          @mousedown.prevent="pickSuggest(s)"
        >
          <AppIcon name="play" :size="12" class="text-primary-500" />
          <span class="truncate">{{ s.name }} - {{ s.artists.map((a) => a.name).join('/') }}</span>
        </button>
      </div>
    </div>

    <!-- 热搜 -->
    <div v-if="!searched && hots.length" class="mb-8">
      <SectionHeader title="热门搜索" />
      <div class="flex flex-wrap gap-2">
        <button
          v-for="(hot, i) in hots"
          :key="hot.searchWord"
          class="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3.5 py-1.5 text-xs text-zinc-300 transition hover:border-primary-600 hover:text-primary-400"
          @click="searchHot(hot.searchWord)"
        >
          <span class="font-semibold" :class="i < 3 ? 'text-primary-500' : 'text-zinc-600'">{{ i + 1 }}</span>
          {{ hot.searchWord }}
        </button>
      </div>
    </div>

    <!-- 结果 -->
    <template v-if="searched">
      <!-- tabs -->
      <div class="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-zinc-900 p-1">
        <button
          v-for="t in TAB_DEFS"
          :key="t.key"
          class="shrink-0 rounded-lg px-4 py-1.5 text-xs transition"
          :class="tab === t.key ? 'bg-primary-600 text-white' : 'text-zinc-400 hover:text-white'"
          @click="switchTab(t.key)"
        >
          {{ t.label }}
        </button>
      </div>

      <PageLoading v-if="loading" text="搜索中" />

      <template v-else>
        <!-- 单曲 -->
        <template v-if="tab === 'song'">
          <EmptyState v-if="!songs.length" text="没有找到相关歌曲" icon="search" />
          <template v-else>
            <SongList :songs="songs" @play="onPlay" @heart-mode="(song: Song) => heart.start(song)" />
            <div v-if="hasMore" class="mt-4 text-center">
              <button class="btn-secondary" :disabled="loading" @click="loadMore">加载更多</button>
            </div>
          </template>
        </template>

        <!-- 歌手 -->
        <template v-else-if="tab === 'artist'">
          <EmptyState v-if="!artists.length" text="没有找到相关歌手" icon="user" />
          <div v-else class="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-6 md:grid-cols-8">
            <ArtistCard v-for="a in artists" :key="a.id" :artist="a" />
          </div>
        </template>

        <!-- 专辑 -->
        <template v-else-if="tab === 'album'">
          <EmptyState v-if="!albums.length" text="没有找到相关专辑" icon="disc" />
          <div v-else class="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
            <RouterLink v-for="al in albums" :key="al.id" :to="`/album/${al.id}`" class="group">
              <LazyImage :src="al.picUrl" :size="300" rounded="rounded-lg" class="aspect-square w-full" />
              <p class="mt-2 line-clamp-1 text-xs text-zinc-300 group-hover:text-white">{{ al.name }}</p>
              <p class="line-clamp-1 text-[11px] text-zinc-500">{{ al.artist?.name }}</p>
            </RouterLink>
          </div>
        </template>

        <!-- 歌单 -->
        <template v-else>
          <EmptyState v-if="!playlists.length" text="没有找到相关歌单" icon="library" />
          <div v-else class="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
            <PlaylistCard v-for="pl in playlists" :key="pl.id" :playlist="pl" />
            <p v-if="total" class="sr-only">共 {{ formatCount(total) }} 个</p>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>
