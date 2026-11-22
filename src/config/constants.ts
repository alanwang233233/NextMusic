import type { QualityLevel } from '@/types/models'

export const QUALITY_LEVELS: { value: QualityLevel; label: string; vip?: boolean }[] = [
  { value: 'standard', label: '标准' },
  { value: 'higher', label: '较高' },
  { value: 'exhigh', label: '极高' },
  { value: 'lossless', label: '无损' },
  { value: 'hires', label: 'Hi-Res' },
  { value: 'jyeffect', label: '高清臻音', vip: true },
  { value: 'dolby', label: '杜比全景声', vip: true },
  { value: 'vivid', label: '臻音全景声', vip: true },
  { value: 'jymaster', label: '超清母带', vip: true },
  { value: 'sky', label: '沉浸环绕声', vip: true },
]

export function qualityLabel(level: QualityLevel): string {
  return QUALITY_LEVELS.find((q) => q.value === level)?.label ?? level
}

/** 项目仓库地址（关于页展示） */
export const REPO_URL = 'https://github.com/alanwang233233/NextMusic'
