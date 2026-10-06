import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDownloadName, downloadSong } from '@/utils/download'
import type { Song } from '@/types/models'

vi.mock('@/api/song', () => ({
  fetchDownloadUrl: vi.fn(),
}))

import { fetchDownloadUrl } from '@/api/song'

const song: Song = {
  id: 1,
  name: '晴天',
  artists: [{ id: 1, name: '周杰伦' }],
  album: { id: 2, name: '叶惠美' },
  duration: 269_000,
}

describe('buildDownloadName', () => {
  it('按 歌手 - 标题.ext 命名', () => {
    expect(buildDownloadName(song, 'https://m7.music.126.net/x/abc.mp3?vuutv=1')).toBe('周杰伦 - 晴天.mp3')
  })

  it('识别 flac 扩展名', () => {
    expect(buildDownloadName(song, 'https://m7.music.126.net/x/abc.flac')).toBe('周杰伦 - 晴天.flac')
  })

  it('无法识别扩展名时回退 mp3', () => {
    expect(buildDownloadName(song, 'https://m7.music.126.net/x/abc')).toBe('周杰伦 - 晴天.mp3')
  })

  it('非法文件名字符替换为下划线', () => {
    const bad: Song = { ...song, name: 'a/b:c*d' }
    expect(buildDownloadName(bad, 'https://x.com/f.mp3')).toBe('周杰伦 - a_b_c_d.mp3')
  })
})

describe('downloadSong', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('登录接口无 url 时返回失败', async () => {
    vi.mocked(fetchDownloadUrl).mockResolvedValue({ url: null })
    const res = await downloadSong(song, 'exhigh')
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('登录')
  })

  it('下载接口失败时返回失败', async () => {
    vi.mocked(fetchDownloadUrl).mockRejectedValue(new Error('301'))
    const res = await downloadSong(song, 'exhigh')
    expect(res.ok).toBe(false)
  })

  it('Blob 下载成功', async () => {
    vi.mocked(fetchDownloadUrl).mockResolvedValue({ url: 'https://m7.music.126.net/a.mp3' })
    const blobParts = [new Blob(['x'])]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(blobParts) }) as Response))
    const click = vi.fn()
    const anchorSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation(((tag: string) => {
        if (tag === 'a') {
          return { href: '', download: '', click, remove: () => undefined } as unknown as HTMLAnchorElement
        }
        return document.createElement(tag)
      }) as unknown as typeof document.createElement)
    // jsdom 未实现 createObjectURL / revokeObjectURL，直接挂到 URL 构造器上
    const realUrl = URL
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })

    const res = await downloadSong(song, 'exhigh')
    expect(res.ok).toBe(true)
    expect(res.mode).toBe('blob')
    expect(res.name).toBe('周杰伦 - 晴天.mp3')
    expect(click).toHaveBeenCalled()
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.anything())

    Object.defineProperty(URL, 'createObjectURL', { value: undefined, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: undefined, configurable: true })
    void realUrl
    anchorSpy.mockRestore()
  })

  it('fetch 失败时回退打开新标签页', async () => {
    vi.mocked(fetchDownloadUrl).mockResolvedValue({ url: 'https://m7.music.126.net/a.mp3' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 }) as Response))
    const open = vi.fn()
    vi.stubGlobal('window', Object.assign(new EventTarget(), { open }))
    const res = await downloadSong(song, 'exhigh')
    expect(res.ok).toBe(true)
    expect(res.mode).toBe('external')
    expect(open).toHaveBeenCalled()
  })
})
