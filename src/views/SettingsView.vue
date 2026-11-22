<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { QUALITY_LEVELS, REPO_URL } from '@/config/constants'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

const settings = useSettingsStore()
const commit = __APP_COMMIT__
const repoHost = computed(() => REPO_URL.replace(/^https?:\/\//, ''))
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <!-- 播放 -->
    <section>
      <SectionHeader title="默认音质" subtitle="在线播放音质，播放条上可临时切换" />
      <div class="card-surface divide-y divide-zinc-800/70 overflow-hidden">
        <button
          v-for="q in QUALITY_LEVELS"
          :key="`play-${q.value}`"
          class="flex w-full items-center justify-between px-4 py-3 text-sm transition hover:bg-zinc-800/60"
          :class="settings.quality === q.value ? 'text-primary-400' : 'text-zinc-300'"
          :data-testid="`play-quality-${q.value}`"
          @click="settings.setQuality(q.value)"
        >
          <span>{{ q.label }}</span>
          <span class="flex items-center gap-2">
            <span v-if="q.vip" class="text-[10px] text-zinc-500">VIP</span>
            <AppIcon v-if="settings.quality === q.value" name="check" :size="15" />
          </span>
        </button>
      </div>
    </section>

    <!-- 下载 -->
    <section class="mt-8">
      <SectionHeader title="默认下载音质" subtitle="下载接口按音质等级获取直链，超出账号权限的档位可能拿不到链接" />
      <div class="card-surface divide-y divide-zinc-800/70 overflow-hidden">
        <button
          v-for="q in QUALITY_LEVELS"
          :key="`download-${q.value}`"
          class="flex w-full items-center justify-between px-4 py-3 text-sm transition hover:bg-zinc-800/60"
          :class="settings.downloadQuality === q.value ? 'text-primary-400' : 'text-zinc-300'"
          :data-testid="`download-quality-${q.value}`"
          @click="settings.setDownloadQuality(q.value)"
        >
          <span>{{ q.label }}</span>
          <span class="flex items-center gap-2">
            <span v-if="q.vip" class="text-[10px] text-zinc-500">VIP</span>
            <AppIcon v-if="settings.downloadQuality === q.value" name="check" :size="15" />
          </span>
        </button>
      </div>
    </section>

    <!-- 关于 -->
    <section class="mt-8">
      <SectionHeader title="关于" />
      <div class="card-surface space-y-4 p-4 text-sm">
        <div class="flex items-center gap-2.5">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white shadow-lg shadow-primary-950/60">
            <AppIcon name="disc" :size="17" />
          </span>
          <span class="text-base font-bold text-white">NextMusic</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-zinc-500">仓库</span>
          <a
            :href="REPO_URL"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-1 text-primary-400 transition hover:text-primary-300"
          >
            {{ repoHost }}
            <AppIcon name="external" :size="13" />
          </a>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-zinc-500">当前提交</span>
          <a
            v-if="commit !== 'unknown'"
            :href="`${REPO_URL}/commit/${commit}`"
            target="_blank"
            rel="noopener"
            class="font-mono text-xs text-primary-400 transition hover:text-primary-300"
          >
            {{ commit }}
          </a>
          <span v-else class="font-mono text-xs text-zinc-400">{{ commit }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
