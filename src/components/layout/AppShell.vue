<script setup lang="ts">
import { usePlayerStore } from '@/stores/player'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import SideBar from './SideBar.vue'
import TopBar from './TopBar.vue'
import BottomNav from './BottomNav.vue'
import PlayerBar from '@/components/player/PlayerBar.vue'
import NowPlaying from '@/components/player/NowPlaying.vue'
import QueueDrawer from '@/components/player/QueueDrawer.vue'

// 全局键盘快捷键（空格播放/暂停，Ctrl+左右切歌，Ctrl+上下音量）
useKeyboardShortcuts()
</script>

<template>
  <div class="flex min-h-screen">
    <!-- 侧边栏（桌面） -->
    <SideBar class="hidden lg:flex" />

    <div class="flex min-h-screen min-w-0 flex-1 flex-col">
      <TopBar />
      <main
        class="mx-auto w-full max-w-6xl flex-1 px-4 pb-64 pt-4 sm:px-6 lg:pb-40"
      >
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
    </div>

    <!-- 播放条 -->
    <PlayerBar />
    <!-- 移动端底部导航 -->
    <BottomNav />
    <!-- 全屏正在播放 -->
    <NowPlaying />
    <!-- 播放队列抽屉 -->
    <QueueDrawer />
  </div>
</template>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.15s ease;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}
</style>
