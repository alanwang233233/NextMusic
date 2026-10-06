import { defineStore } from 'pinia'
import type { QualityLevel } from '@/types/models'

const STORAGE_KEY = 'nextmusic.settings'

interface PersistedSettings {
  quality: QualityLevel
  showTranslation: boolean
}

function load(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>
      return {
        quality: (parsed.quality as QualityLevel) || 'exhigh',
        showTranslation: parsed.showTranslation !== false,
      }
    }
  } catch {
    /* 忽略损坏的本地数据 */
  }
  return { quality: 'exhigh', showTranslation: true }
}

export const useSettingsStore = defineStore('settings', {
  state: () => load(),
  actions: {
    setQuality(quality: QualityLevel) {
      this.quality = quality
      this.persist()
    },
    toggleTranslation() {
      this.showTranslation = !this.showTranslation
      this.persist()
    },
    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ quality: this.quality, showTranslation: this.showTranslation }))
      } catch {
        /* 存储不可用时静默 */
      }
    },
  },
})
