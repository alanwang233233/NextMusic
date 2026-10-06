<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore, VIRTUAL_BLOCK_MESSAGE } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { fetchUserPlaylists, fetchUserDetail } from '@/api/user'
import { normPlaylist } from '@/api/normalize'
import { formatCount } from '@/utils/format'
import type { Playlist, UserProfile } from '@/types/models'
import LazyImage from '@/components/ui/LazyImage.vue'
import PlaylistCard from '@/components/music/PlaylistCard.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

const auth = useAuthStore()
const toast = useToastStore()

const profile = computed<UserProfile | null>(() => auth.displayProfile)
const uid = computed(() => profile.value?.userId ?? 0)
const playlists = ref<Playlist[]>([])
const loading = ref(false)

const created = computed(() => playlists.value.filter((p) => p.creator.uid === uid.value))
const subscribed = computed(() => playlists.value.filter((p) => p.creator.uid !== uid.value))

const MODE_BADGE = {
  user: '正式登录',
  guest: '游客模式',
  virtual: '虚拟登录（只读）',
  none: '未登录',
} as const

async function load() {
  if (!uid.value) return
  loading.value = true
  try {
    if (auth.mode === 'virtual' && !profile.value?.level) {
      await fetchUserDetail(uid.value).then((detail) => {
        if (auth.virtualUser) auth.virtualUser = detail
      }).catch(() => undefined)
    }
    const res = await fetchUserPlaylists(uid.value)
    playlists.value = res.playlists.map(normPlaylist)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '歌单加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(uid, () => void load())

const QUICK_LINKS = [
  { to: '/liked', label: '喜欢的音乐', icon: 'heart', requiresUser: true },
  { to: '/recent', label: '最近播放', icon: 'clock', requiresUser: false },
  { to: '/library', label: '收藏', icon: 'library', requiresUser: false },
  { to: '/daily', label: '每日推荐', icon: 'calendar', requiresUser: true },
]

function onQuickLink(link: (typeof QUICK_LINKS)[number], event: Event) {
  if (link.requiresUser && !auth.canWrite) {
    event.preventDefault()
    toast.error(auth.mode === 'virtual' ? VIRTUAL_BLOCK_MESSAGE : '游客模式不支持该操作，请先登录')
  }
}
</script>

<template>
  <div>
    <!-- 未登录 -->
    <EmptyState v-if="!profile" text="登录后可查看个人主页" icon="user">
      <RouterLink to="/login" class="btn-primary">
        <AppIcon name="log-in" :size="15" />
        去登录
      </RouterLink>
    </EmptyState>

    <template v-else>
      <!-- 个人信息卡 -->
      <div class="flex flex-col items-center gap-4 rounded-2xl border border-zinc-800/70 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 sm:flex-row sm:p-8">
        <LazyImage :src="profile.avatarUrl" :size="200" rounded="rounded-full" class="h-24 w-24 shadow-xl shadow-black/50" />
        <div class="min-w-0 text-center sm:text-left">
          <h1 class="text-xl font-bold text-white sm:text-2xl">{{ profile.nickname }}</h1>
          <p class="mt-1 text-xs text-zinc-500">{{ MODE_BADGE[auth.mode] }} · ID: {{ profile.userId }}</p>
          <div class="mt-2.5 flex flex-wrap justify-center gap-3 text-xs text-zinc-500 sm:justify-start">
            <span v-if="profile.level != null">等级 Lv.{{ profile.level }}</span>
            <span v-if="profile.listenSongs != null">累计听歌 {{ formatCount(profile.listenSongs) }} 首</span>
            <span v-if="profile.follows != null">关注 {{ formatCount(profile.follows) }}</span>
            <span v-if="profile.followeds != null">粉丝 {{ formatCount(profile.followeds) }}</span>
          </div>
          <p v-if="auth.mode === 'virtual'" class="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-primary-950/60 px-3 py-1 text-[11px] text-primary-300">
            <AppIcon name="x" :size="11" />
            虚拟登录仅可浏览公开信息，写入操作不可用
          </p>
        </div>
      </div>

      <!-- 快捷入口 -->
      <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RouterLink
          v-for="link in QUICK_LINKS"
          :key="link.to"
          :to="link.to"
          class="card-surface flex items-center gap-3 p-4 transition hover:border-primary-700"
          @click="onQuickLink(link, $event)"
        >
          <span class="flex h-9 w-9 items-center justify-center rounded-full bg-primary-950/70 text-primary-400">
            <AppIcon :name="link.icon" :size="17" />
          </span>
          <span class="text-xs text-zinc-300">{{ link.label }}</span>
        </RouterLink>
      </div>

      <!-- 我的歌单 -->
      <section v-if="created.length" class="mt-8">
        <SectionHeader title="创建的歌单" :subtitle="`共 ${created.length} 个`" />
        <div class="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
          <PlaylistCard v-for="pl in created" :key="pl.id" :playlist="pl" />
        </div>
      </section>
      <section v-if="subscribed.length" class="mt-8">
        <SectionHeader title="收藏的歌单" :subtitle="`共 ${subscribed.length} 个`" />
        <div class="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
          <PlaylistCard v-for="pl in subscribed" :key="pl.id" :playlist="pl" />
        </div>
      </section>
    </template>
  </div>
</template>
