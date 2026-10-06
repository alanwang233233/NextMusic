<script setup lang="ts">
import { ref, watch } from 'vue'
import { httpsUrl, withImageSize } from '@/api/normalize'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    src?: string | null
    alt?: string
    size?: number
    rounded?: string
  }>(),
  { alt: '', size: 0, rounded: 'rounded-lg' },
)

const failed = ref(false)
const loaded = ref(false)

const resolved = () => (props.size > 0 ? withImageSize(httpsUrl(props.src) || undefined, props.size) : httpsUrl(props.src))

watch(
  () => props.src,
  () => {
    failed.value = false
    loaded.value = false
  },
)
</script>

<template>
  <div class="relative overflow-hidden bg-zinc-800" :class="rounded">
    <img
      v-if="resolved() && !failed"
      :src="resolved()"
      :alt="props.alt"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      class="h-full w-full object-cover"
      @load="loaded = true"
      @error="failed = true"
    />
    <div
      v-if="failed || !resolved()"
      class="absolute inset-0 flex items-center justify-center text-zinc-600"
    >
      <AppIcon name="image-placeholder" :size="22" />
    </div>
    <div v-else-if="!loaded" class="absolute inset-0 animate-pulse bg-zinc-800" />
  </div>
</template>
