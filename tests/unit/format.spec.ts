import { describe, expect, it } from 'vitest'
import { formatCount, formatDuration } from '@/utils/format'
import { httpsUrl, normSong, parseDurationText, withImageSize } from '@/api/normalize'

describe('formatDuration', () => {
  it('毫秒转 m:ss', () => {
    expect(formatDuration(194_000)).toBe('3:14')
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(0)).toBe('--:--')
    expect(formatDuration(-1)).toBe('--:--')
  })
})

describe('formatCount', () => {
  it('格式化万 / 亿', () => {
    expect(formatCount(9500)).toBe('9500')
    expect(formatCount(12_000)).toBe('1.2万')
    expect(formatCount(1_200_000_000)).toBe('12亿')
    expect(formatCount(undefined)).toBe('')
  })
})

describe('httpsUrl / withImageSize', () => {
  it('http 改写为 https', () => {
    expect(httpsUrl('http://p1.music.126.net/a.jpg')).toBe('https://p1.music.126.net/a.jpg')
    expect(httpsUrl('https://p1.music.126.net/a.jpg')).toBe('https://p1.music.126.net/a.jpg')
  })

  it('网易云图片追加 param 尺寸', () => {
    expect(withImageSize('https://p1.music.126.net/a.jpg', 300)).toBe('https://p1.music.126.net/a.jpg?param=300y300')
  })

  it('非网易 CDN 不追加 param', () => {
    expect(withImageSize('https://example.com/a.jpg', 300)).toBe('https://example.com/a.jpg')
  })

  it('空值安全', () => {
    expect(withImageSize(undefined, 300)).toBeUndefined()
  })
})

describe('parseDurationText', () => {
  it('解析 m:ss 与 h:mm:ss', () => {
    expect(parseDurationText('3:14')).toBe(194_000)
    expect(parseDurationText('1:02:03')).toBe(3_723_000)
    expect(parseDurationText('abc')).toBe(0)
    expect(parseDurationText(undefined)).toBe(0)
  })
})

describe('normSong', () => {
  it('归一化网易云标准结构（ar/al/dt）', () => {
    const song = normSong({
      id: 1,
      name: '晴天',
      alia: ['Sunny'],
      ar: [{ id: 10, name: '周杰伦' }],
      al: { id: 100, name: '叶惠美', picUrl: 'http://p1.music.126.net/x.jpg' },
      dt: 269_000,
      fee: 8,
      mv: 5,
    })
    expect(song.artists).toEqual([{ id: 10, name: '周杰伦' }])
    expect(song.album.name).toBe('叶惠美')
    expect(song.album.picUrl).toBe('https://p1.music.126.net/x.jpg')
    expect(song.duration).toBe(269_000)
    expect(song.mvId).toBe(5)
    expect(song.source).toBe('netease')
  })

  it('归一化私人 FM 结构（artists/album/duration）', () => {
    const song = normSong({
      id: 2,
      name: 'song',
      artists: [{ id: 20, name: 'A' }],
      album: { id: 200, name: 'album', picUrl: 'https://p1.music.126.net/y.jpg' },
      duration: 180_000,
    })
    expect(song.duration).toBe(180_000)
    expect(song.artists[0].name).toBe('A')
  })

  it('归一化 OuterAPI 结构（singer 字符串 + duration 文本）', () => {
    const song = normSong({
      id: 3,
      name: 'outer',
      singer: 'A/B',
      album: 'album-name',
      picimg: 'https://p1.music.126.net/z.jpg',
      duration: '3:03',
      source: 'outer',
    })
    expect(song.artists.map((a) => a.name).join('/')).toBe('A/B')
    expect(song.duration).toBe(183_000)
    expect(song.source).toBe('outer')
  })

  it('无歌手时兜底未知歌手', () => {
    const song = normSong({ id: 4, name: 'x' })
    expect(song.artists).toEqual([{ id: 0, name: '未知歌手' }])
  })
})
