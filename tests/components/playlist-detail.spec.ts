import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PlaylistDetailView from '@/views/PlaylistDetailView.vue'
import { usePlayerStore } from '@/stores/player'

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRoute: () => ({ params: { id: '1' } }),
    useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  }
})

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

const PLAYLIST_SONGS = [101, 102, 103]

vi.mock('@/api/playlist', () => ({
  SONG_DETAIL_CHUNK_SIZE: 500,
  fetchPlaylistDetail: vi.fn(async () => ({
    info: {
      id: 1,
      name: '测试歌单',
      coverUrl: 'https://p1.music.126.net/c.svg',
      trackCount: 3,
      creator: { uid: 1, name: '作者' },
      tags: [],
      description: '',
    },
    tracks: [],
    trackIds: [101, 102, 103],
  })),
  // 分块补全：按传入 ids 返回
  fetchSongsDetail: vi.fn(async (ids: number[]) =>
    ids.map((id) => ({
      id,
      name: `歌单歌曲-${id}`,
      artists: [{ id: 1, name: 'a' }],
      album: { id: 2, name: 'al' },
      duration: 100_000,
    })),
  ),
  subscribePlaylist: vi.fn(async () => ({ code: 200 })),
  updatePlaylist: vi.fn(async () => ({ code: 200 })),
  manipulatePlaylistTracks: vi.fn(async () => ({ code: 200 })),
  fetchPersonalizedPlaylists: vi.fn(async () => []),
}))

function makeSong(id: number) {
  return { id, name: `song-${id}`, artists: [{ id: 1, name: 'a' }], album: { id: 10, name: 'al' }, duration: 100_000 }
}

const defaultDetailImpl = async () => ({
  info: {
    id: 1,
    name: '测试歌单',
    coverUrl: 'https://p1.music.126.net/c.svg',
    trackCount: 3,
    creator: { uid: 1, name: '作者' },
    tags: [],
    description: '',
  },
  tracks: [],
  trackIds: [101, 102, 103],
})

const defaultSongsImpl = async (ids: number[]) =>
  ids.map((id) => ({
    id,
    name: `歌单歌曲-${id}`,
    artists: [{ id: 1, name: 'a' }] as { id: number; name: string }[],
    album: { id: 2, name: 'al' },
    duration: 100_000,
  }))

describe('PlaylistDetailView 播放行为', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    // 工厂 mock 的实现会跨测试残留，每个用例前显式重置
    const { fetchPlaylistDetail, fetchSongsDetail } = await import('@/api/playlist')
    vi.mocked(fetchPlaylistDetail).mockImplementation(defaultDetailImpl)
    vi.mocked(fetchSongsDetail).mockImplementation(defaultSongsImpl)
  })

  function mountView() {
    return mount(PlaylistDetailView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          Transition: { template: '<div><slot /></div>' },
          Teleport: { template: '<div><slot /></div>' },
        },
      },
    })
  }

  it('按 trackIds 全量加载歌曲（不再有 1000 首截断），分块请求顺序与 trackIds 一致', async () => {
    const { fetchSongsDetail } = await import('@/api/playlist')
    // 超过单块 500 上限的场景：600 首需要 2 块（500 + 100）
    const { fetchPlaylistDetail } = await import('@/api/playlist')
    const bigIds = Array.from({ length: 600 }, (_, i) => i + 1)
    vi.mocked(fetchPlaylistDetail).mockImplementation(async () => ({
      info: {
        id: 1,
        name: '大歌单',
        coverUrl: '',
        trackCount: 600,
        creator: { uid: 1, name: '作者' },
        tags: [],
        description: '',
      },
      tracks: [],
      trackIds: bigIds,
    }))

    const wrapper = mountView()
    await flushPromises()
    await flushPromises()

    const player = usePlayerStore()
    // 600 首全部就位，无 1000/500 截断
    expect(wrapper.findAll('button[aria-label^="播放 歌单歌曲-"]')).toHaveLength(600)
    const called = vi.mocked(fetchSongsDetail).mock.calls.map((c) => c[0])
    expect(called).toHaveLength(2)
    expect(called[0]).toHaveLength(500)
    expect(called[0]![0]).toBe(1)
    expect(called[1]).toHaveLength(100)
    expect(called[1]![0]).toBe(501)
    // 顺序与 trackIds 一致
    expect(player.queue).toHaveLength(0)
    expect(wrapper.text()).toContain('歌单歌曲-600')
  })

  it('空队列单击歌曲：以整个歌单建立播放列表（预缓存回归：下一曲须有真实下一首）', async () => {
    const wrapper = mountView()
    await flushPromises()
    await flushPromises()

    const player = usePlayerStore()
    expect(player.queue).toHaveLength(0)
    // 空播放列表时单击歌曲 101：应以整个歌单建立播放列表
    await wrapper.find('button[aria-label="播放 歌单歌曲-101"]').trigger('click')
    await flushPromises()

    expect(player.queue.map((s) => s.id)).toEqual([101, 102, 103])
    expect(player.currentSong?.id).toBe(101)
    // 下一曲 = 歌单里的下一首 102（而不是回绕到自己）
    player.next()
    expect(player.currentSong?.id).toBe(102)
  })

  it('单曲点击就位播放：不替换既有播放列表（上一首/下一首跟随播放列表）', async () => {
    const wrapper = mountView()
    await flushPromises()
    await flushPromises()

    const player = usePlayerStore()
    // 预置既有播放列表：900, 901（当前 900）
    player.playQueue([makeSong(900), makeSong(901)], 0)

    // 点击歌单中的歌曲 101
    await wrapper.find('button[aria-label="播放 歌单歌曲-101"]').trigger('click')
    await flushPromises()

    // 就位插入到当前曲目之后，播放列表没有被整个歌单替换
    expect(player.queue.map((s) => s.id)).toEqual([900, 101, 901])
    expect(player.currentSong?.id).toBe(101)
    // 下一首跟随播放列表 → 901，而不是歌单里的 102
    player.next()
    expect(player.currentSong?.id).toBe(901)
  })

  it('播放全部显式以整个歌单重建播放列表', async () => {
    const wrapper = mountView()
    await flushPromises()
    await flushPromises()

    const player = usePlayerStore()
    player.playQueue([makeSong(900)], 0)

    await wrapper.find('[data-testid="play-all"]').trigger('click')
    await flushPromises()

    expect(player.queue.map((s) => s.id)).toEqual(PLAYLIST_SONGS)
    expect(player.currentSong?.id).toBe(101)
  })
})
