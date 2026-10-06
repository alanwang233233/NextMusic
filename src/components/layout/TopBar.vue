<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import AppIcon from '@/components/ui/AppIcon.vue'
import LazyImage from '@/components/ui/LazyImage.vue'

const router = useRouter()
const auth = useAuthStore()
const toast = useToastStore()

const keyword = ref('')
const menuOpen = ref(false)
const menuRoot = ref<HTMLElement | null>(null)

function onDocumentClick(e: MouseEvent) {
  if (menuOpen.value && menuRoot.value && !menuRoot.value.contains(e.target as Node)) {
    menuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))

function doSearch() {
  const q = keyword.value.trim()
  if (q) router.push({ path: '/search', query: { q } })
}

async function onLogout() {
  menuOpen.value = false
  await auth.logout()
  toast.info('已退出登录')
  router.push('/login')
}
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-zinc-800/70 bg-zinc-950/90 backdrop-blur">
    <div class="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
      <!-- 移动端 logo -->
      <RouterLink to="/" class="flex items-center gap-2 lg:hidden">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
          <AppIcon name="disc" :size="17" />
        </span>
        <span class="text-base font-bold text-white">NextMusic</span>
      </RouterLink>

      <!-- 搜索框 -->
      <form class="ml-auto flex max-w-sm flex-1 items-center lg:ml-0" @submit.prevent="doSearch">
        <div class="relative w-full">
          <AppIcon name="search" :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            v-model="keyword"
            type="search"
            placeholder="搜索歌曲、歌手、歌单"
            class="field-input !rounded-full !py-2 pl-9 text-xs"
            aria-label="搜索"
          />
        </div>
      </form>

      <!-- 用户 -->
      <div ref="menuRoot" class="relative">
        <button
          v-if="auth.displayProfile"
          class="flex items-center gap-2"
          aria-label="用户菜单"
          @click="menuOpen = !menuOpen"
        >
          <LazyImage :src="auth.displayProfile.avatarUrl" :size="60" rounded="rounded-full" class="h-8 w-8" />
        </button>
        <RouterLink v-else to="/login" class="btn-primary !px-4 !py-1.5 text-xs">
          <AppIcon name="log-in" :size="14" />
          登录
        </RouterLink>

        <Transition name="menu">
          <div
            v-if="menuOpen && auth.displayProfile"
            class="card-surface absolute right-0 top-11 w-44 border-zinc-700 py-1.5 shadow-xl shadow-black/50"
          >
            <RouterLink
              v-if="auth.mode !== 'none'"
              to="/me"
              class="flex items-center gap-2.5 px-3.5 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
              @click="menuOpen = false"
            >
              <AppIcon name="user" :size="14" />
              个人主页
            </RouterLink>
            <button
              v-if="auth.mode !== 'none'"
              class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800"
              @click="onLogout"
            >
              <AppIcon name="logout" :size="14" />
              退出登录
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.menu-enter-active,
.menu-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
