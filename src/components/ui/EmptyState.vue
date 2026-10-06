<script setup lang="ts">
import AppIcon from './AppIcon.vue'

withDefaults(defineProps<{ text?: string; icon?: string }>(), { text: '暂无内容', icon: 'disc' })
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-16 text-zinc-500">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900">
      <AppIcon :name="icon" :size="26" />
    </div>
    <p class="text-sm">{{ text }}</p>
    <slot />
  </div>
</template>
