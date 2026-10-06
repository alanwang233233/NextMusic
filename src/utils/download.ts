import type { Song } from '@/types/models'
import { qualityToBr } from '@/config/constants'
import { fetchDownloadUrl } from '@/api/song'
import { artistsText } from '@/api/normalize'

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名'
}

/** 下载文件名：歌手 - 标题.ext */
export function buildDownloadName(song: Song, url: string): string {
  const extMatch = /\.(\w{2,5})(?:\?|$)/.exec(new URL(url, 'https://example.invalid').pathname)
  const ext = extMatch ? extMatch[1] : 'mp3'
  return `${safeFileName(artistsText(song))} - ${safeFileName(song.name)}.${ext}`
}

export interface DownloadResult {
  ok: boolean
  /** 回退方式：blob 直接下载；external 打开新标签页 */
  mode: 'blob' | 'external'
  name?: string
  reason?: string
}

/**
 * 下载音乐：
 * 1. 优先 /song/download/url 获取下载直链（需登录，非会员可拿无损）
 * 2. 失败时回退为打开新标签页由浏览器处理
 */
export async function downloadSong(song: Song, quality: Parameters<typeof qualityToBr>[0]): Promise<DownloadResult> {
  let url: string | null | undefined
  try {
    const dl = await fetchDownloadUrl(song.id, qualityToBr(quality))
    url = dl.url
  } catch {
    url = null
  }
  if (!url) {
    return { ok: false, mode: 'external', reason: '未获取到下载链接，可能需要登录' }
  }
  // 防御性校验：仅接受 http(s) 直链
  const scheme = new URL(url, 'https://example.invalid').protocol
  if (scheme !== 'https:' && scheme !== 'http:') {
    return { ok: false, mode: 'external', reason: '无效的下载链接' }
  }
  const name = buildDownloadName(song, url)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    // 分离的 anchor 同样能触发浏览器下载
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = name
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
    return { ok: true, mode: 'blob', name }
  } catch {
    window.open(url, '_blank', 'noopener')
    return { ok: true, mode: 'external', name }
  }
}
