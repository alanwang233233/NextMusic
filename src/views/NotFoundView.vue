<script setup lang="ts">
import AppIcon from '@/components/ui/AppIcon.vue'
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 py-24 text-center">
    <span class="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-500">
      <AppIcon name="search" :size="30" />
    </span>
    <h1 class="text-xl font-bold text-white">页面不存在</h1>
    <p class="text-xs text-zinc-500">你访问的页面可能已被移除或地址有误</p>
    <RouterLink to="/" class="btn-primary">返回首页</RouterLink>
  </div>
</template>
