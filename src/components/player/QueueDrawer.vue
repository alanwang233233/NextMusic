<script setup lang="ts">
import { usePlayerStore } from '@/stores/player'
import { formatDuration } from '@/utils/format'
import { artistsText } from '@/api/normalize'
import AppIcon from '@/components/ui/AppIcon.vue'
import LazyImage from '@/components/ui/LazyImage.vue'

const player = usePlayerStore()
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="player.showQueue" class="fixed inset-0 z-[105]" @click.self="player.showQueue = false">
        <div class="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-zinc-800 bg-zinc-950/95 shadow-2xl shadow-black/60 backdrop-blur">
          <div class="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <h3 class="text-sm font-semibold text-white">播放队列（{{ player.queue.length }}）</h3>
            <button class="btn-icon" aria-label="关闭队列" @click="player.showQueue = false">
              <AppIcon name="x" :size="18" />
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <div
              v-for="(song, i) in player.queue"
              :key="`${song.id}-${i}`"
              class="flex items-center gap-3 rounded-lg px-2.5 py-2 transition hover:bg-zinc-900"
              :class="i === player.index ? 'bg-primary-950/50' : ''"
            >
              <button class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="player.playAt(i)">
                <LazyImage :src="song.album.picUrl" :size="40" rounded="rounded-md" class="h-9 w-9 shrink-0" />
                <span class="min-w-0">
                  <span class="block truncate text-xs font-medium" :class="i === player.index ? 'text-primary-400' : 'text-zinc-100'">
                    {{ song.name }}
                  </span>
                  <span class="block truncate text-[10px] text-zinc-500">{{ artistsText(song) }}</span>
                </span>
                <span class="shrink-0 text-[10px] tabular-nums text-zinc-600">{{ formatDuration(song.duration) }}</span>
              </button>
              <button
                v-if="i !== player.index"
                class="btn-icon h-7 w-7 shrink-0"
                aria-label="从队列移除"
                @click="player.removeFromQueue(i)"
              >
                <AppIcon name="x" :size="13" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-active > div,
.drawer-leave-active > div {
  transition: transform 0.25s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from > div,
.drawer-leave-to > div {
  transform: translateX(100%);
}
</style>
