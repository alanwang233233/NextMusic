<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { guardWrite } from '@/composables/useWriteAction'
import { fetchPlaylistDetail, fetchSongsDetail, subscribePlaylist, updatePlaylist, manipulatePlaylistTracks } from '@/api/playlist'
import { formatCount } from '@/utils/format'
import type { Playlist, Song } from '@/types/models'
import PageLoading from '@/components/ui/PageLoading.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LazyImage from '@/components/ui/LazyImage.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import Modal from '@/components/ui/Modal.vue'
import SongList from '@/components/music/SongList.vue'
import { useHeartMode } from '@/composables/useHeartMode'

const route = useRoute()
const player = usePlayerStore()
const auth = useAuthStore()
const toast = useToastStore()
const heart = useHeartMode()

const loading = ref(true)
const error = ref(false)
const info = ref<Playlist | null>(null)
const songs = ref<Song[]>([])
const subscribing = ref(false)

const editOpen = ref(false)
const editName = ref('')
const editDesc = ref('')
const editTags = ref('')
const savingEdit = ref(false)

const playlistId = computed(() => Number(route.params.id))

const isOwner = computed(
  () => auth.displayUid != null && info.value?.creator.uid === auth.displayUid,
)

async function load() {
  loading.value = true
  error.value = false
  try {
    const detail = await fetchPlaylistDetail(playlistId.value)
    info.value = detail.info
    editName.value = detail.info.name
    editDesc.value = detail.info.description || ''
    editTags.value = (detail.info.tags || []).join(';')

    // tracks 可能不完整（未登录仅返回部分），用 trackIds 补全
    if (detail.trackIds.length > detail.tracks.length) {
      const full = await fetchSongsDetail(detail.trackIds.slice(0, 1000))
      songs.value = full
    } else {
      songs.value = detail.tracks
    }
  } catch (err) {
    error.value = true
    toast.error(err instanceof Error ? err.message : '歌单加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(playlistId, () => {
  if (playlistId.value) void load()
})

function playAll() {
  if (!songs.value.length) return
  player.playQueue(songs.value, 0)
}

function onPlay(song: Song, index: number) {
  player.playQueue(songs.value, index)
}

async function toggleSubscribe() {
  if (!info.value) return
  if (!guardWrite()) return
  subscribing.value = true
  try {
    await subscribePlaylist(info.value.id, !info.value.subscribed)
    info.value = { ...info.value, subscribed: !info.value.subscribed }
    toast.success(info.value.subscribed ? '已收藏歌单' : '已取消收藏')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '操作失败')
  } finally {
    subscribing.value = false
  }
}

async function saveEdit() {
  if (!info.value) return
  if (!guardWrite()) return
  const name = editName.value.trim()
  if (!name) {
    toast.error('歌单名不能为空')
    return
  }
  savingEdit.value = true
  try {
    await updatePlaylist({
      id: info.value.id,
      name,
      desc: editDesc.value.trim(),
      tags: editTags.value.split(/[;；,，]/).map((t) => t.trim()).filter(Boolean).join(';'),
    })
    info.value = {
      ...info.value,
      name,
      description: editDesc.value.trim(),
      tags: editTags.value.split(/[;；,，]/).map((t) => t.trim()).filter(Boolean),
    }
    editOpen.value = false
    toast.success('歌单信息已更新')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '更新失败')
  } finally {
    savingEdit.value = false
  }
}

async function removeSong(song: Song) {
  if (!info.value) return
  if (!guardWrite()) return
  try {
    await manipulatePlaylistTracks('del', info.value.id, [song.id])
    songs.value = songs.value.filter((s) => s.id !== song.id)
    toast.success('已从歌单移除')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '移除失败')
  }
}
</script>

<template>
  <div>
    <PageLoading v-if="loading" text="正在加载歌单" />

    <EmptyState v-else-if="error" text="歌单加载失败" icon="disc">
      <button class="btn-primary" @click="load">重新加载</button>
    </EmptyState>

    <template v-else-if="info">
      <!-- 头部 -->
      <div class="flex flex-col gap-5 sm:flex-row" data-testid="playlist-header">
        <LazyImage
          :src="info.coverUrl"
          :size="400"
          :alt="info.name"
          rounded="rounded-2xl"
          class="h-44 w-44 shrink-0 shadow-2xl shadow-black/50 sm:h-48 sm:w-48"
        />
        <div class="min-w-0 flex-1">
          <h1 class="text-xl font-bold text-white sm:text-2xl">{{ info.name }}</h1>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <RouterLink v-if="info.creator.uid" :to="`/user/${info.creator.uid}`" class="flex items-center gap-1.5 hover:text-primary-400">
              <LazyImage :src="info.creator.avatar" :size="40" rounded="rounded-full" class="h-5 w-5" />
              {{ info.creator.name }}
            </RouterLink>
            <span v-if="info.trackCount" class="text-zinc-600">|</span>
            <span v-if="info.trackCount">{{ info.trackCount }} 首</span>
            <span v-if="info.playCount" class="text-zinc-600">|</span>
            <span v-if="info.playCount">{{ formatCount(info.playCount) }} 次播放</span>
            <span v-if="info.subscribedCount" class="text-zinc-600">|</span>
            <span v-if="info.subscribedCount">{{ formatCount(info.subscribedCount) }} 人收藏</span>
          </div>
          <div v-if="info.tags?.length" class="mt-2.5 flex flex-wrap gap-1.5">
            <span
              v-for="tag in info.tags"
              :key="tag"
              class="rounded-full border border-zinc-700 px-2.5 py-0.5 text-[11px] text-zinc-400"
            >
              {{ tag }}
            </span>
          </div>
          <p
            v-if="info.description"
            class="mt-3 line-clamp-2 whitespace-pre-line text-xs leading-5 text-zinc-500"
          >
            {{ info.description }}
          </p>

          <div class="mt-4 flex flex-wrap items-center gap-2">
            <button class="btn-primary" data-testid="play-all" @click="playAll">
              <AppIcon name="play" :size="15" />
              播放全部
            </button>
            <button
              v-if="auth.canWrite && !isOwner"
              class="btn-secondary"
              :class="info.subscribed ? 'text-primary-400' : ''"
              :disabled="subscribing"
              data-testid="subscribe-playlist"
              @click="toggleSubscribe"
            >
              <AppIcon :name="info.subscribed ? 'check' : 'plus'" :size="15" />
              {{ info.subscribed ? '已收藏' : '收藏' }}
            </button>
            <button v-if="isOwner" class="btn-secondary" data-testid="edit-playlist" @click="editOpen = true">
              <AppIcon name="edit" :size="14" />
              编辑歌单
            </button>
          </div>
        </div>
      </div>

      <!-- 歌曲列表 -->
      <div class="mt-8">
        <EmptyState v-if="!songs.length" text="歌单暂无歌曲" icon="music" />
        <SongList
          v-else
          :songs="songs"
          :removable="isOwner"
          @play="onPlay"
          @heart-mode="(song: Song) => heart.start(song, playlistId)"
          @remove="removeSong"
        />
      </div>

      <!-- 编辑弹窗 -->
      <Modal :open="editOpen" title="编辑歌单" @close="editOpen = false">
        <div class="space-y-3.5">
          <div>
            <label class="mb-1.5 block text-xs text-zinc-400">歌单名</label>
            <input v-model="editName" class="field-input" aria-label="歌单名" />
          </div>
          <div>
            <label class="mb-1.5 block text-xs text-zinc-400">描述</label>
            <textarea v-model="editDesc" class="field-input min-h-20" aria-label="描述" />
          </div>
          <div>
            <label class="mb-1.5 block text-xs text-zinc-400">标签（多个用分号分隔）</label>
            <input v-model="editTags" class="field-input" aria-label="标签" />
          </div>
          <button class="btn-primary w-full" :disabled="savingEdit" @click="saveEdit">
            {{ savingEdit ? '保存中' : '保存' }}
          </button>
        </div>
      </Modal>
    </template>
  </div>
</template>
