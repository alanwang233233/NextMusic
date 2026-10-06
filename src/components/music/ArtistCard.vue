<script setup lang="ts">
import type { ArtistDetail } from '@/types/models'
import LazyImage from '@/components/ui/LazyImage.vue'

defineProps<{ artist: ArtistDetail }>()
</script>

<template>
  <RouterLink
    :to="`/artist/${artist.id}`"
    class="group flex flex-col items-center gap-2 text-center"
  >
    <LazyImage
      :src="artist.avatar || artist.cover"
      :size="160"
      :alt="artist.name"
      rounded="rounded-full"
      class="h-20 w-20 transition group-hover:opacity-80 sm:h-24 sm:w-24"
    />
    <span class="line-clamp-1 text-xs text-zinc-400 group-hover:text-primary-400">{{ artist.name }}</span>
  </RouterLink>
</template>
