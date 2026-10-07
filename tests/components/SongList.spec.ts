import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SongList from '@/components/music/SongList.vue'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import type { Song } from '@/types/models'

vi.mock('@/router', () => ({
  router: { push: vi.fn() },
}))

vi.mock('@/player/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/player/engine')>()
  return {
    ...actual,
    getEngine: vi.fn(() => ({
      play: vi.fn(async () => undefined),
      togglePlay: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
    })),
  }
})

vi.mock('@/api/user', () => ({
  likeSong: vi.fn(async () => ({ code: 200 })),
  fetchLikeList: vi.fn(async () => []),
}))

vi.mock('@/utils/download', () => ({
  downloadSong: vi.fn(async () => ({ ok: true, mode: 'blob', name: 'a.mp3' })),
}))

function makeSong(id: number, name?: string): Song {
  return {
    id,
    name: name ?? `song-${id}`,
    artists: [
      { id: 100 + id, name: 'artist-a' },
      { id: 200 + id, name: 'artist-b' },
    ],
    album: { id: 10 + id, name: `album-${id}`, picUrl: 'https://p1.music.126.net/x.jpg' },
    duration: 180_000,
  }
}

describe('SongList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  function mountList(songs: Song[] = [makeSong(1), makeSong(2)]) {
    return mount(SongList, {
      props: { songs },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })
  }

  it('渲染全部歌曲与时长', () => {
    const wrapper = mountList()
    expect(wrapper.text()).toContain('song-1')
    expect(wrapper.text()).toContain('song-2')
    expect(wrapper.text()).toContain('3:00')
  })

  it('点击行触发 play 事件并写入播放队列', async () => {
    const wrapper = mountList()
    const rows = wrapper.findAll('button[aria-label^="播放"]')
    await rows[1]!.trigger('click')
    expect(wrapper.emitted('play')).toBeTruthy()
    expect(wrapper.emitted('play')![0]).toEqual([expect.objectContaining({ id: 2 }), 1])
  })

  it('点击歌手跳转歌手页', async () => {
    const { router } = await import('@/router')
    const wrapper = mountList()
    // 排除行首的播放按钮（其副标题同样包含歌手名）
    const artistBtns = wrapper
      .findAll('button')
      .filter((b) => b.text().includes('artist-a') && !b.text().includes('song-'))
    expect(artistBtns.length).toBeGreaterThan(0)
    await artistBtns[0]!.trigger('click')
    expect(router.push).toHaveBeenCalledWith('/artist/101')
  })

  it('当前播放歌曲高亮', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1), makeSong(2)], 0)
    const wrapper = mountList()
    expect(wrapper.text()).toContain('song-1')
    const highlight = wrapper.findAll('.text-primary-400')
    expect(highlight.length).toBeGreaterThan(0)
  })

  it('虚拟登录模式点击喜欢被拦截', async () => {
    const auth = useAuthStore()
    auth.mode = 'virtual'
    auth.virtualUser = { userId: 9, nickname: 'v', avatarUrl: '' }
    const { useToastStore } = await import('@/stores/toast')
    const wrapper = mountList()
    const likeBtn = wrapper.find('button[aria-label="喜欢"]')
    await likeBtn.trigger('click')
    await flushPromises()
    expect(useToastStore().items.some((t) => t.message.includes('虚拟登录'))).toBe(true)
  })

  it('user 模式点击喜欢调用接口并标记', async () => {
    const auth = useAuthStore()
    auth.mode = 'user'
    auth.profile = { userId: 1, nickname: 'u', avatarUrl: '' }
    const wrapper = mountList()
    const likeBtn = wrapper.find('button[aria-label="喜欢"]')
    await likeBtn.trigger('click')
    await flushPromises()
    const { likeSong } = await import('@/api/user')
    expect(likeSong).toHaveBeenCalledWith(1, true)
    expect(auth.isLiked(1)).toBe(true)
    // 已喜欢状态图标变化
    expect(wrapper.find('button[aria-label="取消喜欢"]').exists()).toBe(true)
  })

  it('虚拟登录模式允许下载（下载不属于写操作）', async () => {
    const auth = useAuthStore()
    auth.mode = 'virtual'
    auth.virtualUser = { userId: 9, nickname: 'v', avatarUrl: '' }
    const { downloadSong } = await import('@/utils/download')
    const { useToastStore } = await import('@/stores/toast')
    const wrapper = mountList()
    const downloadBtn = wrapper.find('button[aria-label="下载"]')
    await downloadBtn.trigger('click')
    await flushPromises()
    expect(downloadSong).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), expect.anything())
    expect(useToastStore().items.some((t) => t.message.includes('虚拟登录'))).toBe(false)
  })

  it('removable 时显示移除按钮并触发事件', async () => {
    const wrapper = mount(SongList, {
      props: { songs: [makeSong(1)], removable: true },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    const removeBtn = wrapper.find('button[aria-label="从歌单移除"]')
    expect(removeBtn.exists()).toBe(true)
    await removeBtn.trigger('click')
    expect(wrapper.emitted('remove')).toBeTruthy()
  })

  it('心动模式按钮触发事件', async () => {
    const wrapper = mountList()
    const heartBtn = wrapper.find('button[aria-label="心动模式"]')
    expect(heartBtn.exists()).toBe(true)
    await heartBtn.trigger('click')
    expect(wrapper.emitted('heart-mode')).toBeTruthy()
  })
})
