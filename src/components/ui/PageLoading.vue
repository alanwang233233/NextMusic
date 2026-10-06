<script setup lang="ts">
withDefaults(defineProps<{ text?: string }>(), { text: '加载中' })
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-20">
    <div class="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-primary-500" />
    <p class="text-xs text-zinc-500">{{ text }}</p>
  </div>
</template>
