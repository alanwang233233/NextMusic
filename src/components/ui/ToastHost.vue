<script setup lang="ts">
import { useToastStore } from '@/stores/toast'
import AppIcon from './AppIcon.vue'

const toast = useToastStore()

const ICON_MAP = { info: 'disc', success: 'check', error: 'x' } as const
const COLOR_MAP = {
  info: 'border-zinc-700 text-zinc-100',
  success: 'border-primary-600/60 text-primary-200',
  error: 'border-red-900/70 text-red-200',
} as const
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-x-0 top-4 z-[120] flex flex-col items-center gap-2 px-4">
      <TransitionGroup name="toast">
        <div
          v-for="item in toast.items"
          :key="item.id"
          class="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full border bg-zinc-900/95 px-4 py-2.5 text-sm shadow-xl shadow-black/40 backdrop-blur"
          :class="COLOR_MAP[item.type]"
          role="status"
        >
          <AppIcon :name="ICON_MAP[item.type]" :size="16" />
          <span>{{ item.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
