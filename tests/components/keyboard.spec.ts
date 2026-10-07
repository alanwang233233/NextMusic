import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, onMounted } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { usePlayerStore } from '@/stores/player'
import { useToastStore } from '@/stores/toast'

vi.mock('@/player/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/player/engine')>()
  return {
    ...actual,
    getEngine: vi.fn(() => fakeEngine),
  }
})

const fakeEngine = {
  play: vi.fn(async () => undefined),
  togglePlay: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
}

vi.mock('@/api/user', () => ({
  likeSong: vi.fn(async () => ({ code: 200 })),
  fetchLikeList: vi.fn(async () => []),
}))

function makeSong(id: number) {
  return { id, name: `song-${id}`, artists: [{ id: 1, name: 'a' }], album: { id: 10, name: 'al' }, duration: 100_000 }
}

/** 挂载一个注册了快捷键的宿主组件 */
function mountHost() {
  const Host = defineComponent({
    setup() {
      useKeyboardShortcuts()
      return () => null
    },
  })
  return mount(Host, { attachTo: document.body })
}

function pressKey(init: { code: string; key: string; ctrlKey?: boolean; repeat?: boolean; target?: HTMLElement }) {
  const event = new KeyboardEvent('keydown', {
    code: init.code,
    key: init.key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: false,
    repeat: init.repeat ?? false,
    bubbles: true,
    cancelable: true,
  })
  ;(init.target ?? document.body).dispatchEvent(event)
  return event
}

describe('全局键盘快捷键', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('空格切换播放/暂停并阻止页面滚动', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    const wrapper = mountHost()

    const event = pressKey({ code: 'Space', key: ' ' })
    expect(event.defaultPrevented).toBe(true)
    expect(fakeEngine.togglePlay).toHaveBeenCalledTimes(1)

    // 按住重复触发只切换一次
    pressKey({ code: 'Space', key: ' ', repeat: true })
    expect(fakeEngine.togglePlay).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('输入框聚焦时空格不劫持（打字优先）', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    const wrapper = mountHost()

    const input = document.createElement('input')
    document.body.appendChild(input)
    const event = pressKey({ code: 'Space', key: ' ', target: input })
    expect(event.defaultPrevented).toBe(false)
    expect(fakeEngine.togglePlay).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('按钮聚焦时空格仍切换播放（preventDefault 抑制双重触发）', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    const wrapper = mountHost()

    const button = document.createElement('button')
    document.body.appendChild(button)
    const event = pressKey({ code: 'Space', key: ' ', target: button })
    expect(event.defaultPrevented).toBe(true)
    expect(fakeEngine.togglePlay).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('Ctrl+Right 下一曲，Ctrl+Left 上一曲，按住重复不连跳', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2), makeSong(3)], 0)
    const wrapper = mountHost()

    pressKey({ code: 'ArrowRight', key: 'ArrowRight', ctrlKey: true })
    expect(player.currentSong?.id).toBe(2)

    pressKey({ code: 'ArrowRight', key: 'ArrowRight', ctrlKey: true, repeat: true })
    expect(player.currentSong?.id).toBe(2)

    pressKey({ code: 'ArrowLeft', key: 'ArrowLeft', ctrlKey: true })
    expect(player.currentSong?.id).toBe(1)
    wrapper.unmount()
  })

  it('Ctrl+Up/Down 以 10% 步长调节音量并提示，按住可连续调节', async () => {
    const player = usePlayerStore()
    player.setVolume(0.5)
    const toast = useToastStore()
    const wrapper = mountHost()

    pressKey({ code: 'ArrowUp', key: 'ArrowUp', ctrlKey: true })
    expect(player.volume).toBeCloseTo(0.6)
    pressKey({ code: 'ArrowUp', key: 'ArrowUp', ctrlKey: true, repeat: true })
    expect(player.volume).toBeCloseTo(0.7)

    pressKey({ code: 'ArrowDown', key: 'ArrowDown', ctrlKey: true })
    pressKey({ code: 'ArrowDown', key: 'ArrowDown', ctrlKey: true })
    expect(player.volume).toBeCloseTo(0.5)
    await flushPromises()
    expect(toast.items.some((t) => t.message.includes('音量'))).toBe(true)

    // 边界钳制
    for (let i = 0; i < 12; i++) pressKey({ code: 'ArrowUp', key: 'ArrowUp', ctrlKey: true, repeat: true })
    expect(player.volume).toBe(1)
    for (let i = 0; i < 15; i++) pressKey({ code: 'ArrowDown', key: 'ArrowDown', ctrlKey: true, repeat: true })
    expect(player.volume).toBe(0)
    expect(player.muted).toBe(true)
    wrapper.unmount()
  })

  it('音量提示有节流（400ms 内不重复弹出）', async () => {
    vi.useFakeTimers({ now: Date.now() })
    try {
      const player = usePlayerStore()
      player.setVolume(0.5)
      const toast = useToastStore()
      const wrapper = mountHost()

      pressKey({ code: 'ArrowUp', key: 'ArrowUp', ctrlKey: true })
      expect(player.volume).toBeCloseTo(0.6)
      pressKey({ code: 'ArrowUp', key: 'ArrowUp', ctrlKey: true })
      expect(player.volume).toBeCloseTo(0.7)
      const volumeToasts = toast.items.filter((t) => t.message.includes('音量'))
      expect(volumeToasts).toHaveLength(1)

      // 超过节流间隔后再次提示
      vi.advanceTimersByTime(450)
      pressKey({ code: 'ArrowDown', key: 'ArrowDown', ctrlKey: true })
      expect(toast.items.filter((t) => t.message.includes('音量')).length).toBeGreaterThanOrEqual(1)
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('队列/当前曲为空时切歌与播放切换安全无操作', async () => {
    const player = usePlayerStore()
    const wrapper = mountHost()

    expect(() => pressKey({ code: 'Space', key: ' ' })).not.toThrow()
    expect(() => pressKey({ code: 'ArrowRight', key: 'ArrowRight', ctrlKey: true })).not.toThrow()
    expect(() => pressKey({ code: 'ArrowLeft', key: 'ArrowLeft', ctrlKey: true })).not.toThrow()
    expect(player.playing).toBe(false)
    wrapper.unmount()
  })
})
