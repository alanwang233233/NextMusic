import { defineStore } from 'pinia'
import { nextSongPreloader } from '@/player/precache'
import type { QualityLevel } from '@/types/models'

const STORAGE_KEY = 'nextmusic.settings'

interface PersistedSettings {
  quality: QualityLevel
  downloadQuality: QualityLevel
  showTranslation: boolean
}

function load(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>
      return {
        quality: (parsed.quality as QualityLevel) || 'exhigh',
        downloadQuality: (parsed.downloadQuality as QualityLevel) || 'exhigh',
        showTranslation: parsed.showTranslation !== false,
      }
    }
  } catch {
    /* 忽略损坏的本地数据 */
  }
  return { quality: 'exhigh', downloadQuality: 'exhigh', showTranslation: true }
}

export const useSettingsStore = defineStore('settings', {
  state: () => load(),
  actions: {
    setQuality(quality: QualityLevel) {
      this.quality = quality
      // 已预缓存的音频按旧音质解析（loop 当前曲 blob 与下一曲 blob 均受影响），切换后全部作废
      nextSongPreloader.clear()
      this.persist()
    },
    setDownloadQuality(quality: QualityLevel) {
      this.downloadQuality = quality
      this.persist()
    },
    toggleTranslation() {
      this.showTranslation = !this.showTranslation
      this.persist()
    },
    persist() {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ quality: this.quality, downloadQuality: this.downloadQuality, showTranslation: this.showTranslation }),
        )
      } catch {
        /* 存储不可用时静默 */
      }
    },
  },
})
