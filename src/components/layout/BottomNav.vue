<script setup lang="ts">
import AppIcon from '@/components/ui/AppIcon.vue'

const NAV_ITEMS = [
  { to: '/', label: '发现', icon: 'home' },
  { to: '/search', label: '搜索', icon: 'search' },
  { to: '/daily', label: '日推', icon: 'calendar' },
  { to: '/fm', label: 'FM', icon: 'radio' },
  { to: '/me', label: '我的', icon: 'user' },
]
</script>

<template>
  <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800/70 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
    <div class="flex">
      <RouterLink
        v-for="item in NAV_ITEMS"
        :key="item.to"
        :to="item.to"
        class="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] text-zinc-500 transition active:scale-95"
        exact-active-class="!text-primary-500"
      >
        <AppIcon :name="item.icon" :size="20" />
        {{ item.label }}
      </RouterLink>
    </div>
  </nav>
</template>
