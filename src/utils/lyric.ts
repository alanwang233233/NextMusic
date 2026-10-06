import type { LyricLine } from '@/types/models'

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/**
 * 解析 LRC 歌词。
 * - 支持一行多个时间标签
 * - 跳过网易云导出的 JSON 元数据行（以 { 开头）
 * - 跳过 [ti:/ar:/al:/by:/offset:] 等标签行
 */
export function parseLrc(text?: string | null): LyricLine[] {
  if (!text) return []
  const lines: LyricLine[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('{')) continue
    TIME_TAG.lastIndex = 0
    const stamps: number[] = []
    let match: RegExpExecArray | null
    let lastIndex = 0
    while ((match = TIME_TAG.exec(line)) !== null) {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fractionRaw = match[3] || '0'
      // [10:00.50] -> 500ms；[10:00.050] -> 50ms
      const fraction = Number(fractionRaw) / Math.pow(10, fractionRaw.length)
      stamps.push(minutes * 60_000 + seconds * 1000 + Math.round(fraction * 1000))
      lastIndex = TIME_TAG.lastIndex
    }
    if (!stamps.length) continue
    const textPart = line.slice(lastIndex).trim()
    for (const time of stamps) {
      lines.push({ time, end: Number.POSITIVE_INFINITY, text: textPart })
    }
  }
  lines.sort((a, b) => a.time - b.time)
  for (let i = 0; i < lines.length - 1; i++) {
    lines[i].end = lines[i + 1].time
  }
  return lines
}

/**
 * 解析逐字歌词（yrc）：
 *   [16210,3460](16210,670,0)还(16880,410,0)没...
 * 行首 JSON 元数据行（{"t":...}）跳过。
 */
export function parseYrc(text?: string | null): LyricLine[] {
  if (!text) return []
  const lines: LyricLine[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('{')) continue
    const header = /^\[(\d+),(\d+)\](.*)$/.exec(line)
    if (!header) continue
    const time = Number(header[1])
    const duration = Number(header[2])
    const body = header[3]
    const words: { start: number; duration: number; text: string }[] = []
    const wordRe = /\((\d+),(\d+),\d+\)([^(]*)/g
    let wm: RegExpExecArray | null
    while ((wm = wordRe.exec(body)) !== null) {
      const wordText = wm[3].replace(/<\d+,\d+,\d+>/g, '')
      if (wordText) words.push({ start: Number(wm[1]), duration: Number(wm[2]), text: wordText })
    }
    lines.push({
      time,
      end: time + duration,
      text: words.map((w) => w.text).join('') || body.replace(/\(\d+,\d+,\d+\)/g, ''),
      words: words.length ? words : undefined,
    })
  }
  lines.sort((a, b) => a.time - b.time)
  return lines
}

/** 将翻译按时间对齐到主歌词行（时间差小于 800ms 视为同一行） */
export function mergeTranslation(lines: LyricLine[], translation?: string | null): LyricLine[] {
  if (!translation) return lines
  const trans = parseLrc(translation)
  if (!trans.length) return lines
  const byTime = new Map<number, string>()
  for (const t of trans) byTime.set(t.time, t.text)
  return lines.map((line) => {
    const t = byTime.get(line.time)
    if (t) return { ...line, text: `${line.text}\n${t}` }
    return line
  })
}

/** 二分查找当前播放行下标；无匹配返回 -1 */
export function findActiveLine(lines: LyricLine[], currentTimeMs: number): number {
  if (!lines.length) return -1
  let low = 0
  let high = lines.length - 1
  let result = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    const line = lines[mid]
    if (line.time <= currentTimeMs) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result
}

export interface ParsedLyrics {
  /** 展示用主歌词（已合并翻译，若开启） */
  lines: LyricLine[]
  /** 是否为逐字歌词 */
  hasWordTiming: boolean
}

/** 汇总解析入口：优先逐字歌词，其次 LRC + 翻译 */
export function parseLyrics(payload: { lrc?: string; yrc?: string; tlyric?: string }, withTranslation: boolean): ParsedLyrics {
  const yrcLines = parseYrc(payload.yrc)
  if (yrcLines.length) {
    const merged = withTranslation ? mergeTranslation(yrcLines, payload.tlyric) : yrcLines
    return { lines: merged, hasWordTiming: true }
  }
  const lrcLines = parseLrc(payload.lrc)
  const merged = withTranslation ? mergeTranslation(lrcLines, payload.tlyric) : lrcLines
  return { lines: merged, hasWordTiming: false }
}
