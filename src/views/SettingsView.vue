<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { getDesktopBridge } from '@/utils/desktop'
import { useAudioOutput } from '@/composables/useAudioOutput'
import { QUALITY_LEVELS, REPO_URL } from '@/config/constants'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

const settings = useSettingsStore()
const toast = useToastStore()
const commit = __APP_COMMIT__
const repoHost = computed(() => REPO_URL.replace(/^https?:\/\//, ''))

/** 桌面板块（仅 Electron preload 注入桥接时渲染；纯 Web 全部跳过） */
const isDesktop = getDesktopBridge() !== null
let audioState: ReturnType<typeof useAudioOutput> | null = null
if (isDesktop) {
  audioState = useAudioOutput()
}
const audioDevices = computed(() => audioState?.devices.value ?? [])
const currentDeviceId = computed(() => audioState?.currentId.value ?? 'default')

function chooseDevice(deviceId: string): void {
  void audioState?.select(deviceId)
}

const mainApiDraft = ref('')
onMounted(() => {
  mainApiDraft.value = settings.mainApiBaseOverride
  if (audioState) void audioState.refresh()
})

function saveMainApi(): void {
  settings.setMainApiBaseOverride(mainApiDraft.value)
  mainApiDraft.value = settings.mainApiBaseOverride
  toast.info('已保存，立即生效')
}

function resetMainApi(): void {
  settings.setMainApiBaseOverride('')
  mainApiDraft.value = ''
  toast.info('已恢复内置主 API')
}

function toggleUnblock(): void {
  settings.setGeneralUnblock(!settings.generalUnblock)
}
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

    <!-- 解灰（全平台）：开启后 /song/url/v1 请求附带 unblock=true（主 API 需支持解灰） -->
    <section class="mt-8">
      <SectionHeader title="解灰" subtitle="对 VIP/灰色歌曲尝试自动解锁；主 API 不支持时自动回退试听片段" />
      <div class="card-surface overflow-hidden">
        <button
          class="flex w-full items-center justify-between px-4 py-3 text-sm transition hover:bg-zinc-800/60"
          data-testid="unblock-toggle"
          @click="toggleUnblock"
        >
          <span class="text-left">
            <span class="block text-zinc-300">启用解灰</span>
            <span class="mt-0.5 block text-xs text-zinc-500">歌曲请求附带解灰参数，尝试获取完整音频</span>
          </span>
          <span
            class="relative h-5 w-9 shrink-0 rounded-full transition"
            :class="settings.generalUnblock ? 'bg-primary-600' : 'bg-zinc-700'"
          >
            <span
              class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
              :class="settings.generalUnblock ? 'left-[18px]' : 'left-0.5'"
            ></span>
          </span>
        </button>
      </div>
    </section>

    <!-- 桌面版（仅 Electron 环境渲染） -->
    <section v-if="isDesktop" class="mt-8" data-testid="desktop-section">
      <SectionHeader title="桌面版" subtitle="NextMusic 桌面客户端专属设置" />
      <div class="card-surface divide-y divide-zinc-800/70 overflow-hidden">
        <!-- 播放设备 -->
        <div class="px-4 py-3">
          <div class="mb-2 flex items-center gap-1.5 text-sm text-zinc-400">
            <AppIcon name="speaker" :size="15" />
            <span>播放设备</span>
          </div>
          <button
            v-for="d in audioDevices"
            :key="d.deviceId"
            class="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm transition hover:bg-zinc-800/60"
            :data-testid="`audio-device-${d.deviceId}`"
            @click="chooseDevice(d.deviceId)"
          >
            <span :class="currentDeviceId === d.deviceId ? 'text-primary-400' : 'text-zinc-300'">{{ d.label }}</span>
            <AppIcon v-if="currentDeviceId === d.deviceId" name="check" :size="15" />
          </button>
          <p v-if="audioDevices.length === 0" class="px-2 py-1 text-xs text-zinc-500">未枚举到音频输出设备</p>
        </div>
        <!-- 主 API -->
        <div class="px-4 py-3">
          <div class="mb-2 text-sm text-zinc-400">主 API</div>
          <div class="flex gap-2">
            <input
              v-model="mainApiDraft"
              data-testid="main-api-input"
              placeholder="http://your-api.example.com"
              class="h-9 min-w-0 flex-1 rounded-lg bg-zinc-800/70 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:ring-1 focus:ring-primary-600"
            />
            <button
              data-testid="main-api-save"
              class="shrink-0 rounded-lg bg-primary-600 px-3 text-sm text-white transition hover:bg-primary-500"
              @click="saveMainApi"
            >
              保存
            </button>
            <button
              data-testid="main-api-reset"
              class="shrink-0 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-300 transition hover:bg-zinc-800/60"
              @click="resetMainApi"
            >
              恢复内置
            </button>
          </div>
          <p class="mt-1.5 text-xs text-zinc-500">留空使用应用内置的本地 API 服务；自定义地址保存后立即生效</p>
        </div>
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
