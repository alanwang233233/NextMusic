<script setup lang="ts">
import { formatCount } from '@/utils/format'
import type { Playlist } from '@/types/models'
import LazyImage from '@/components/ui/LazyImage.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

defineProps<{ playlist: Playlist }>()
</script>

<template>
  <RouterLink
    :to="`/playlist/${playlist.id}`"
    class="group block"
  >
    <div class="relative">
      <LazyImage
        :src="playlist.coverUrl"
        :size="300"
        :alt="playlist.name"
        rounded="rounded-lg"
        class="aspect-square w-full transition group-hover:opacity-80"
      />
      <span
        v-if="playlist.playCount"
        class="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-zinc-100 backdrop-blur"
      >
        <AppIcon name="play" :size="10" />
        {{ formatCount(playlist.playCount) }}
      </span>
      <div class="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
        <span class="flex h-11 w-11 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg shadow-black/40">
          <AppIcon name="play" :size="18" />
        </span>
      </div>
    </div>
    <p class="mt-2 line-clamp-2 text-xs leading-5 text-zinc-300 group-hover:text-white">{{ playlist.name }}</p>
  </RouterLink>
</template>
