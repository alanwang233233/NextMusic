<script setup lang="ts">
withDefaults(defineProps<{ title: string; subtitle?: string; showMore?: boolean }>(), { showMore: false })
const emit = defineEmits<{ more: [] }>()
</script>

<template>
  <div class="mb-4 flex items-end justify-between">
    <div>
      <h2 class="text-lg font-semibold text-white">{{ title }}</h2>
      <p v-if="subtitle" class="mt-0.5 text-xs text-zinc-500">{{ subtitle }}</p>
    </div>
    <button
      v-if="showMore"
      class="flex items-center gap-1 text-xs text-zinc-400 transition hover:text-primary-400"
      @click="emit('more')"
    >
      更多
    </button>
  </div>
</template>
