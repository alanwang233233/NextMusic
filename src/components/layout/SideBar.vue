<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import LazyImage from '@/components/ui/LazyImage.vue'

const auth = useAuthStore()
const toast = useToastStore()
const router = useRouter()

const NAV_ITEMS = [
  { to: '/', label: '发现', icon: 'home' },
  { to: '/search', label: '搜索', icon: 'search' },
  { to: '/daily', label: '每日推荐', icon: 'calendar' },
  { to: '/fm', label: '私人FM', icon: 'radio' },
  { to: '/recent', label: '最近播放', icon: 'clock' },
  { to: '/liked', label: '喜欢的音乐', icon: 'heart' },
  { to: '/library', label: '收藏', icon: 'library' },
  { to: '/me', label: '我的音乐', icon: 'user' },
]

const MODE_BADGE = {
  user: '正式登录',
  guest: '游客模式',
  virtual: '虚拟登录',
  none: '未登录',
} as const

async function onLogout() {
  await auth.logout()
  toast.info('已退出登录')
  router.push('/login')
}
</script>

<template>
  <aside class="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-zinc-800/70 bg-zinc-950">
    <div class="flex items-center gap-2.5 px-5 py-5">
      <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white shadow-lg shadow-primary-950/60">
        <AppIcon name="disc" :size="20" />
      </span>
      <span class="text-lg font-bold tracking-wide text-white">NextMusic</span>
    </div>

    <nav class="flex-1 space-y-1 px-3">
      <RouterLink
        v-for="item in NAV_ITEMS"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
        exact-active-class="!bg-primary-950/60 !text-primary-400"
      >
        <AppIcon :name="item.icon" :size="18" />
        {{ item.label }}
      </RouterLink>
    </nav>

    <!-- 登录卡片 -->
    <div class="m-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3.5">
      <template v-if="auth.displayProfile">
        <RouterLink to="/me" class="flex items-center gap-3">
          <LazyImage :src="auth.displayProfile.avatarUrl" :size="80" rounded="rounded-full" class="h-10 w-10" />
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium text-white">{{ auth.displayProfile.nickname }}</span>
            <span class="text-[11px] text-zinc-500">{{ MODE_BADGE[auth.mode] }}</span>
          </span>
        </RouterLink>
        <button
          v-if="auth.mode !== 'none'"
          class="btn-secondary mt-3 w-full !px-3 !py-1.5 text-xs"
          @click="onLogout"
        >
          <AppIcon name="logout" :size="14" />
          退出登录
        </button>
      </template>
      <template v-else>
        <p class="text-xs text-zinc-500">登录后可同步歌单与喜欢</p>
        <RouterLink to="/login" class="btn-primary mt-3 w-full !px-3 !py-1.5 text-xs">
          <AppIcon name="log-in" :size="14" />
          立即登录
        </RouterLink>
      </template>
    </div>
  </aside>
</template>
