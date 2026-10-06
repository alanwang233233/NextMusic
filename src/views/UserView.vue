<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchUserDetail, fetchUserPlaylists } from '@/api/user'
import { normPlaylist } from '@/api/normalize'
import { formatCount } from '@/utils/format'
import type { Playlist, UserProfile } from '@/types/models'
import PageLoading from '@/components/ui/PageLoading.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LazyImage from '@/components/ui/LazyImage.vue'
import PlaylistCard from '@/components/music/PlaylistCard.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'

const route = useRoute()
const uid = computed(() => Number(route.params.id))

const loading = ref(true)
const profile = ref<UserProfile | null>(null)
const playlists = ref<Playlist[]>([])

const created = computed(() => playlists.value.filter((p) => p.creator.uid === uid.value))
const subscribed = computed(() => playlists.value.filter((p) => p.creator.uid !== uid.value))

async function load() {
  loading.value = true
  try {
    const [detailRes, playlistRes] = await Promise.allSettled([fetchUserDetail(uid.value), fetchUserPlaylists(uid.value)])
    if (detailRes.status === 'fulfilled') profile.value = detailRes.value
    if (playlistRes.status === 'fulfilled') playlists.value = playlistRes.value.playlists.map(normPlaylist)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(uid, () => void load())
</script>

<template>
  <div>
    <PageLoading v-if="loading" text="正在加载用户信息" />

    <template v-else-if="profile">
      <!-- 用户信息卡 -->
      <div
        class="relative overflow-hidden rounded-2xl border border-zinc-800/70"
        data-testid="user-header"
      >
        <div
          class="absolute inset-0 bg-cover bg-center opacity-20 blur-2xl"
          :style="profile.backgroundUrl ? { backgroundImage: `url(${profile.backgroundUrl})` } : {}"
        />
        <div class="relative flex flex-col items-center gap-5 bg-zinc-950/40 p-6 sm:flex-row sm:p-8">
          <LazyImage :src="profile.avatarUrl" :size="200" rounded="rounded-full" class="h-24 w-24 shadow-xl shadow-black/50" />
          <div class="min-w-0 text-center sm:text-left">
            <h1 class="text-xl font-bold text-white sm:text-2xl">{{ profile.nickname }}</h1>
            <p v-if="profile.signature" class="mt-1.5 max-w-lg text-xs leading-5 text-zinc-400">{{ profile.signature }}</p>
            <div class="mt-2.5 flex flex-wrap justify-center gap-3 text-xs text-zinc-500 sm:justify-start">
              <span v-if="profile.level != null">等级 Lv.{{ profile.level }}</span>
              <span v-if="profile.follows != null">关注 {{ formatCount(profile.follows) }}</span>
              <span v-if="profile.followeds != null">粉丝 {{ formatCount(profile.followeds) }}</span>
              <span v-if="profile.listenSongs != null">听歌 {{ formatCount(profile.listenSongs) }} 首</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 创建的歌单 -->
      <section v-if="created.length" class="mt-8">
        <SectionHeader title="创建的歌单" :subtitle="`共 ${created.length} 个`" />
        <div class="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
          <PlaylistCard v-for="pl in created" :key="pl.id" :playlist="pl" />
        </div>
      </section>

      <!-- 收藏的歌单 -->
      <section v-if="subscribed.length" class="mt-8">
        <SectionHeader title="收藏的歌单" :subtitle="`共 ${subscribed.length} 个`" />
        <div class="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
          <PlaylistCard v-for="pl in subscribed" :key="pl.id" :playlist="pl" />
        </div>
      </section>

      <EmptyState v-if="!playlists.length" text="没有公开歌单" icon="library" />
    </template>

    <EmptyState v-else text="用户信息加载失败" icon="user">
      <button class="btn-primary" @click="load">重新加载</button>
    </EmptyState>
  </div>
</template>
