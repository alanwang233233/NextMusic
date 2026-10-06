<script setup lang="ts">
import AppIcon from './AppIcon.vue'

defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <div class="card-surface w-full max-w-md animate-slide-up border-zinc-700 p-6 shadow-2xl shadow-black/50">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-base font-semibold text-white">{{ title }}</h3>
            <button class="btn-icon" aria-label="关闭" @click="emit('close')">
              <AppIcon name="x" :size="18" />
            </button>
          </div>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
