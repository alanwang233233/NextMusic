import { onBeforeUnmount, onMounted } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useToastStore } from '@/stores/toast'

/** 这些元素聚焦时不劫持按键（打字 / 原生交互优先） */
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

const VOLUME_STEP = 0.1
/** 音量提示节流间隔（按住方向键连续调节时防刷屏） */
const VOLUME_TOAST_INTERVAL_MS = 400

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable
}

/** 全局键盘快捷键：空格 播放/暂停；Ctrl+←/→ 切歌；Ctrl+↑/↓ 音量 */
export function useKeyboardShortcuts(): void {
  const player = usePlayerStore()
  const toast = useToastStore()
  let lastVolumeToastAt = 0

  function adjustVolume(delta: number): void {
    // 量化到 0.1 步长，避免浮点漂移
    const next = Math.min(1, Math.max(0, Math.round((player.volume + delta) * 10) / 10))
    if (next === player.volume) return
    player.setVolume(next)
    const now = Date.now()
    if (now - lastVolumeToastAt >= VOLUME_TOAST_INTERVAL_MS) {
      lastVolumeToastAt = now
      toast.info(next === 0 ? '已静音' : `音量 ${Math.round(next * 100)}%`)
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    if (isEditableTarget(e.target)) return

    // 空格：播放 / 暂停。preventDefault 同时抑制聚焦按钮的原生激活，避免双重切换
    if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      if (e.repeat) return
      player.togglePlay()
      return
    }

    if (!e.ctrlKey && !e.metaKey) return
    switch (e.code) {
      case 'ArrowLeft':
        e.preventDefault()
        if (!e.repeat) player.prev()
        return
      case 'ArrowRight':
        e.preventDefault()
        if (!e.repeat) player.next()
        return
      case 'ArrowUp':
        e.preventDefault()
        adjustVolume(VOLUME_STEP)
        return
      case 'ArrowDown':
        e.preventDefault()
        adjustVolume(-VOLUME_STEP)
        return
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
