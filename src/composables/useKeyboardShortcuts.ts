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

/** 空格匹配：兼容部分浏览器 / 输入法环境下 code 缺失的情况 */
function isSpaceKey(e: KeyboardEvent): boolean {
  return e.code === 'Space' || e.key === ' ' || e.keyCode === 32
}

/** 全局键盘快捷键（捕获阶段注册，避免被其他 handler 拦截）：
 *  - 空格：播放/暂停
 *  - ←/→ 与 Ctrl/⌘+←/→：上一曲/下一曲
 *  - Ctrl/⌘+↑/↓：音量 ±10%
 *  - 输入框聚焦时不劫持；Alt+方向键保留浏览器原生（前进/后退）
 */
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

    // 空格：播放 / 暂停。preventDefault 同时抑制聚焦按钮的原生激活与页面滚动
    if (isSpaceKey(e) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      if (e.repeat) return
      player.togglePlay()
      return
    }

    // ←/→ 与 Ctrl/⌘+←/→：切歌
    const isLeft = e.key === 'ArrowLeft' || e.code === 'ArrowLeft'
    const isRight = e.key === 'ArrowRight' || e.code === 'ArrowRight'
    if (isLeft || isRight) {
      if (e.altKey || e.shiftKey) return
      e.preventDefault()
      if (!e.repeat) {
        if (isRight) player.next()
        else player.prev()
      }
      return
    }

    // Ctrl/⌘+↑/↓：音量
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const isUp = e.key === 'ArrowUp' || e.code === 'ArrowUp'
      const isDown = e.key === 'ArrowDown' || e.code === 'ArrowDown'
      if (isUp) {
        e.preventDefault()
        adjustVolume(VOLUME_STEP)
        return
      }
      if (isDown) {
        e.preventDefault()
        adjustVolume(-VOLUME_STEP)
        return
      }
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
}
