import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import NowPlaying from '@/components/player/NowPlaying.vue'
import { usePlayerStore } from '@/stores/player'
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

vi.mock('@/api/song', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/song')>()
  return { ...actual, fetchLyric: vi.fn(async () => ({ lrc: { lyric: '' } })) }
})

function makeSong(id: number): Song {
  return { id, name: `song-${id}`, artists: [{ id: 1, name: 'artist-a' }], album: { id: 10, name: 'album-a', picUrl: 'https://p1.music.126.net/x.jpg' }, duration: 200_000 }
}

describe('NowPlaying', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  function mountView() {
    return mount(NowPlaying, {
      global: {
        stubs: {
          Transition: { template: '<div><slot /></div>' },
          Teleport: { template: '<div><slot /></div>' },
        },
      },
    })
  }

  function openWithSong() {
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    player.showNowPlaying = true
    return mountView()
  }

  it('全屏页渲染进度滑杆行（时间在两端）', () => {
    const wrapper = openWithSong()
    const slider = wrapper.find('input[aria-label="播放进度"]')
    expect(slider.exists()).toBe(true)
    // 两端时间标签存在，且旧「m:ss / m:ss」复合文本已移除
    expect(wrapper.text()).toMatch(/\d:\d\d/)
    expect(wrapper.text()).not.toMatch(/\d:\d\d \/ \d:\d\d/)
  })

  it('拖动提交后按比例 seek', async () => {
    const wrapper = openWithSong()
    const slider = wrapper.find('input[aria-label="播放进度"]')
    await slider.setValue(500)
    await slider.trigger('change')
    expect(fakeEngine.seek).toHaveBeenCalledWith(100_000) // 0.5 × 200000ms
  })

  it('durationMs 为 0 时拖动 seek 0 不产生 NaN', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    player.showNowPlaying = true
    player.durationMs = 0
    const wrapper = mountView()
    const slider = wrapper.find('input[aria-label="播放进度"]')
    await slider.setValue(500)
    await slider.trigger('change')
    expect(fakeEngine.seek).toHaveBeenCalledWith(0)
  })
})
