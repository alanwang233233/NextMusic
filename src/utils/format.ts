/** 毫秒 -> "m:ss" */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** 数量格式化：12000 -> 1.2万 */
export function formatCount(n?: number): string {
  if (n == null || !Number.isFinite(n)) return ''
  if (n >= 100000000) return `${(n / 100000000).toFixed(1).replace(/\.0$/, '')}亿`
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万`
  return String(n)
}
