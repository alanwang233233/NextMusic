import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PlayerBar from '@/components/player/PlayerBar.vue'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import type { Song } from '@/types/models'

vi.mock('@/player/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/player/engine')>()
  return { ...actual, getEngine: vi.fn(() => fakeEngine) }
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

vi.mock('@/utils/download', () => ({
  downloadSong: vi.fn(async () => ({ ok: true, mode: 'blob', name: 'a.mp3' })),
}))

function makeSong(id: number): Song {
  return { id, name: `song-${id}`, artists: [{ id: 1, name: 'artist-a' }], album: { id: 10, name: 'album-a', picUrl: 'https://p1.music.126.net/x.jpg' }, duration: 200_000 }
}

describe('PlayerBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  function mountBar() {
    return mount(PlayerBar, {
      global: {
        stubs: {
          Transition: { template: '<div><slot /></div>' },
          Teleport: { template: '<div><slot /></div>' },
        },
      },
    })
  }

  it('队列为空时不渲染', () => {
    const wrapper = mountBar()
    expect(wrapper.find('[data-testid="player-bar"]').exists()).toBe(false)
  })

  it('有当前歌曲时展示标题与歌手', () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    const wrapper = mountBar()
    expect(wrapper.find('[data-testid="player-bar"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('song-1')
    expect(wrapper.text()).toContain('artist-a')
  })

  it('点击播放按钮切换播放状态', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    const wrapper = mountBar()
    await wrapper.find('[data-testid="play-toggle"]').trigger('click')
    expect(fakeEngine.togglePlay).toHaveBeenCalled()
  })

  it('音质菜单打开并选择后更新设置', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    const settings = useSettingsStore()
    const wrapper = mountBar()
    await wrapper.find('[data-testid="quality-button"]').trigger('click')
    // 选择无损
    const buttons = wrapper.findAll('button').filter((b) => b.text().includes('无损'))
    expect(buttons.length).toBeGreaterThan(0)
    await buttons[0]!.trigger('click')
    expect(settings.quality).toBe('lossless')
  })

  it('虚拟登录模式下点击喜欢被拦截并提示', async () => {
    const auth = useAuthStore()
    auth.mode = 'virtual'
    auth.virtualUser = { userId: 9, nickname: 'v', avatarUrl: '' }
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    const { useToastStore } = await import('@/stores/toast')
    const wrapper = mountBar()
    const likeBtn = wrapper.findAll('button').find((b) => b.attributes('aria-label') === '喜欢')
    await likeBtn!.trigger('click')
    await flushPromises()
    expect(useToastStore().items.some((t) => t.message.includes('虚拟登录'))).toBe(true)
    const { likeSong } = await import('@/api/user')
    expect(likeSong).not.toHaveBeenCalled()
  })

  it('user 模式点击喜欢调用接口', async () => {
    const auth = useAuthStore()
    auth.mode = 'user'
    auth.profile = { userId: 1, nickname: 'u', avatarUrl: '' }
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    const wrapper = mountBar()
    const likeBtn = wrapper.findAll('button').find((b) => b.attributes('aria-label') === '喜欢')
    await likeBtn!.trigger('click')
    await flushPromises()
    const { likeSong } = await import('@/api/user')
    expect(likeSong).toHaveBeenCalledWith(1, true)
  })

  it('上一曲 / 下一曲按钮', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2), makeSong(3)], 1)
    const wrapper = mountBar()
    await wrapper.find('button[aria-label="下一曲"]').trigger('click')
    expect(player.currentSong?.id).toBe(3)
    await wrapper.find('button[aria-label="上一曲"]').trigger('click')
    expect(player.currentSong?.id).toBe(2)
  })

  it('播放模式循环切换', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    const wrapper = mountBar()
    const modeBtn = wrapper.find('button[aria-label="播放模式"]')
    await modeBtn.trigger('click')
    expect(player.mode).toBe('loop')
  })
})
