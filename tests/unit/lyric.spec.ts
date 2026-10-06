import { describe, expect, it } from 'vitest'
import { findActiveLine, mergeTranslation, parseLrc, parseLyrics, parseYrc } from '@/utils/lyric'

describe('parseLrc', () => {
  it('解析标准 LRC 行', () => {
    const lines = parseLrc('[00:10.00]第一行\n[01:02.30]第二行')
    expect(lines).toHaveLength(2)
    expect(lines[0].time).toBe(10_000)
    expect(lines[0].text).toBe('第一行')
    expect(lines[1].time).toBe(62_300)
  })

  it('支持一行多个时间标签', () => {
    const lines = parseLrc('[00:01.00][00:05.00]重复行')
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.time)).toEqual([1000, 5000])
    expect(lines.every((l) => l.text === '重复行')).toBe(true)
  })

  it('跳过 JSON 元数据行与空行', () => {
    const lines = parseLrc('{"t":0,"c":[{"tx":"作词: "}]}\n[00:01.00]正文\n\n')
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('正文')
  })

  it('毫秒位数不同的时间标签', () => {
    expect(parseLrc('[00:01.5]x')[0].time).toBe(1500)
    expect(parseLrc('[00:01.05]x')[0].time).toBe(1050)
    expect(parseLrc('[00:01.005]x')[0].time).toBe(1005)
  })

  it('空输入返回空数组', () => {
    expect(parseLrc('')).toEqual([])
    expect(parseLrc(null)).toEqual([])
  })

  it('相邻行 end 时间正确', () => {
    const lines = parseLrc('[00:01.00]a\n[00:03.00]b')
    expect(lines[0].end).toBe(3000)
    expect(lines[1].end).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('parseYrc', () => {
  it('解析逐字歌词', () => {
    const input = '[16210,3460](16210,670,0)还(16880,410,0)没'
    const lines = parseYrc(input)
    expect(lines).toHaveLength(1)
    expect(lines[0].time).toBe(16_210)
    expect(lines[0].end).toBe(19_670)
    expect(lines[0].text).toBe('还没')
    expect(lines[0].words).toHaveLength(2)
    expect(lines[0].words![0]).toEqual({ start: 16_210, duration: 670, text: '还' })
  })

  it('跳过元数据 JSON 行', () => {
    const input = '{"t":0,"c":[{"tx":"作曲"}]}\n[1000,500](1000,500,0)歌'
    const lines = parseYrc(input)
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('歌')
  })
})

describe('mergeTranslation', () => {
  it('按时间合并翻译行', () => {
    const main = parseLrc('[00:01.00]hello\n[00:05.00]world')
    const merged = mergeTranslation(main, '[00:01.00]你好\n[00:05.00]世界')
    expect(merged[0].text).toBe('hello\n你好')
    expect(merged[1].text).toBe('world\n世界')
  })

  it('无匹配翻译时保留原文', () => {
    const main = parseLrc('[00:01.00]hello')
    const merged = mergeTranslation(main, '[00:09.00]无对应')
    expect(merged[0].text).toBe('hello')
  })
})

describe('findActiveLine', () => {
  const lines = parseLrc('[00:10.00]a\n[00:20.00]b\n[00:30.00]c')

  it('落在行区间内返回该行', () => {
    expect(findActiveLine(lines, 10_000)).toBe(0)
    expect(findActiveLine(lines, 15_000)).toBe(0)
    expect(findActiveLine(lines, 20_000)).toBe(1)
    expect(findActiveLine(lines, 31_000)).toBe(2)
  })

  it('早于第一行返回 -1', () => {
    expect(findActiveLine(lines, 5_000)).toBe(-1)
  })

  it('空歌词返回 -1', () => {
    expect(findActiveLine([], 1000)).toBe(-1)
  })
})

describe('parseLyrics', () => {
  it('优先使用逐字歌词', () => {
    const res = parseLyrics({ yrc: '[1000,500](1000,500,0)逐字', lrc: '[00:01.00]普通' }, false)
    expect(res.hasWordTiming).toBe(true)
    expect(res.lines[0].text).toBe('逐字')
  })

  it('无逐字歌词时退回 LRC 并合并翻译', () => {
    const res = parseLyrics({ lrc: '[00:01.00]hello', tlyric: '[00:01.00]你好' }, true)
    expect(res.hasWordTiming).toBe(false)
    expect(res.lines[0].text).toContain('hello')
    expect(res.lines[0].text).toContain('你好')
  })

  it('关闭翻译时不合并', () => {
    const res = parseLyrics({ lrc: '[00:01.00]hello', tlyric: '[00:01.00]你好' }, false)
    expect(res.lines[0].text).toBe('hello')
  })
})
