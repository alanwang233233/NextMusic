<script setup lang="ts">
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { formatDuration } from '@/utils/format'
import { downloadSong } from '@/utils/download'
import { useSettingsStore } from '@/stores/settings'
import { artistsText } from '@/api/normalize'
import { router } from '@/router'
import type { Song } from '@/types/models'
import AppIcon from '@/components/ui/AppIcon.vue'
import LazyImage from '@/components/ui/LazyImage.vue'

const props = withDefaults(
  defineProps<{
    songs: Song[]
    /** 列表序号从几开始（默认 1） */
    startIndex?: number
    showAlbum?: boolean
    showActions?: boolean
    /** 提供时显示“从歌单移除”按钮（仅歌单所有者使用） */
    removable?: boolean
  }>(),
  { startIndex: 1, showAlbum: true, showActions: true, removable: false },
)

const emit = defineEmits<{
  play: [song: Song, index: number]
  'heart-mode': [song: Song]
  remove: [song: Song]
}>()

const player = usePlayerStore()
const auth = useAuthStore()
const settings = useSettingsStore()
const toast = useToastStore()

function isCurrent(song: Song): boolean {
  return player.currentSong?.id === song.id
}

function onRowClick(song: Song, index: number) {
  emit('play', song, index)
}

function onLike(song: Song) {
  void player.likeSongById(song.id)
}

async function onDownload(song: Song) {
  toast.info('开始下载')
  const result = await downloadSong(song, settings.quality)
  if (!result.ok) toast.error(result.reason || '下载失败')
  else if (result.mode === 'external') toast.success('已在新标签页打开音频')
}

function openArtist(artistId: number) {
  if (artistId > 0) router.push(`/artist/${artistId}`)
}
</script>

<template>
  <div class="divide-y divide-zinc-800/60">
    <div
      v-for="(song, i) in props.songs"
      :key="`${song.id}-${i}`"
      class="group flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-zinc-800/50"
      :class="isCurrent(song) ? 'bg-primary-950/40' : ''"
      @dblclick="onRowClick(song, i)"
    >
      <!-- 序号 / 播放状态 -->
      <button
        class="w-8 shrink-0 text-center text-sm text-zinc-500 tabular-nums"
        :aria-label="`播放 ${song.name}`"
        @click="onRowClick(song, i)"
      >
        <AppIcon v-if="isCurrent(song) && player.playing" name="audio-lines" :size="16" class="mx-auto text-primary-500" />
        <span v-else :class="isCurrent(song) ? 'text-primary-500' : ''">{{ props.startIndex + i }}</span>
      </button>

      <!-- 封面 + 标题 -->
      <button class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="onRowClick(song, i)">
        <LazyImage :src="song.album.picUrl" :size="44" rounded="rounded-md" class="h-11 w-11 shrink-0" />
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium" :class="isCurrent(song) ? 'text-primary-400' : 'text-zinc-100'">
            {{ song.name }}
          </span>
          <span class="block truncate text-xs text-zinc-500">
            <template v-if="song.alias?.length">{{ song.alias.join(' / ') }} - </template>
            {{ artistsText(song) }}
          </span>
        </span>
      </button>

      <!-- 歌手（宽屏） -->
      <div v-if="props.showAlbum" class="hidden min-w-0 flex-1 lg:block">
        <button
          v-for="(artist, ai) in song.artists.slice(0, 3)"
          :key="`${artist.id}-${ai}`"
          class="truncate text-xs text-zinc-400 transition hover:text-primary-400"
          @click.stop="openArtist(artist.id)"
        >
          {{ artist.name }}<span v-if="ai < Math.min(song.artists.length, 3) - 1" class="text-zinc-600"> / </span>
        </button>
      </div>

      <!-- 专辑（宽屏） -->
      <div v-if="props.showAlbum" class="hidden min-w-0 flex-1 xl:block">
        <span class="block truncate text-xs text-zinc-400">{{ song.album.name }}</span>
      </div>

      <span class="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-500">{{ formatDuration(song.duration) }}</span>

      <!-- 操作区 -->
      <div v-if="props.showActions" class="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
        <button
          class="btn-icon h-8 w-8"
          :class="auth.isLiked(song.id) ? 'text-primary-500' : ''"
          :aria-label="auth.isLiked(song.id) ? '取消喜欢' : '喜欢'"
          @click.stop="onLike(song)"
        >
          <AppIcon :name="auth.isLiked(song.id) ? 'heart-solid' : 'heart'" :size="16" />
        </button>
        <button
          class="btn-icon hidden h-8 w-8 sm:inline-flex"
          aria-label="心动模式"
          title="心动模式"
          @click.stop="emit('heart-mode', song)"
        >
          <AppIcon name="infinity" :size="16" />
        </button>
        <button class="btn-icon h-8 w-8" aria-label="下载" title="下载" @click.stop="onDownload(song)">
          <AppIcon name="download" :size="16" />
        </button>
        <button v-if="props.removable" class="btn-icon h-8 w-8" aria-label="从歌单移除" title="从歌单移除" @click.stop="emit('remove', song)">
          <AppIcon name="trash" :size="15" />
        </button>
      </div>
    </div>
  </div>
</template>
