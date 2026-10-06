<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { router } from '@/router'
import type { Playlist } from '@/types/models'
import LazyImage from '@/components/ui/LazyImage.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

const props = defineProps<{ playlists: Playlist[] }>()

const active = ref(0)
let timer: number | undefined

const visible = computed(() => props.playlists.slice(0, 6))

function go(i: number) {
  active.value = (i + visible.value.length) % Math.max(visible.value.length, 1)
}

function pauseAuto() {
  window.clearInterval(timer)
}

function resumeAuto() {
  window.clearInterval(timer)
  timer = window.setInterval(() => go(active.value + 1), 5000)
}

function open(playlist: Playlist) {
  if (playlist.id > 0) router.push(`/playlist/${playlist.id}`)
}

onMounted(() => {
  timer = window.setInterval(() => go(active.value + 1), 5000)
})
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <div
    v-if="visible.length"
    class="relative h-44 overflow-hidden rounded-2xl sm:h-56 lg:h-64"
    @mouseenter="pauseAuto"
    @mouseleave="resumeAuto"
  >
    <div class="flex h-full transition-transform duration-500" :style="{ transform: `translateX(-${active * 100}%)` }">
      <div v-for="pl in visible" :key="pl.id" class="relative h-full w-full shrink-0 cursor-pointer" @click="open(pl)">
        <LazyImage :src="pl.coverUrl" :size="640" :alt="pl.name" rounded="rounded-2xl" class="h-full w-full" />
        <div class="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div class="absolute bottom-0 left-0 right-0 p-4">
          <p class="line-clamp-1 text-sm font-semibold text-white sm:text-base">{{ pl.name }}</p>
          <p v-if="pl.copywriter" class="mt-0.5 line-clamp-1 text-xs text-zinc-300">{{ pl.copywriter }}</p>
        </div>
      </div>
    </div>
    <div class="absolute bottom-3 right-4 flex gap-1.5">
      <button
        v-for="(pl, i) in visible"
        :key="pl.id"
        class="h-1.5 rounded-full transition-all"
        :class="i === active ? 'w-5 bg-primary-500' : 'w-1.5 bg-zinc-400/60 hover:bg-zinc-300'"
        :aria-label="`第 ${i + 1} 张`"
        @click.stop="go(i)"
      />
    </div>
    <button
      class="btn-icon absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white max-md:hidden"
      aria-label="上一张"
      @click.stop="go(active - 1)"
    >
      <AppIcon name="chevron-left" :size="18" />
    </button>
    <button
      class="btn-icon absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white max-md:hidden"
      aria-label="下一张"
      @click.stop="go(active + 1)"
    >
      <AppIcon name="chevron-right" :size="18" />
    </button>
  </div>
</template>
