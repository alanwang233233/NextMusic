import { defineStore } from 'pinia'
import { nextSongPreloader } from '@/player/precache'
import { bindMainApiOverride, normalizeApiBase } from '@/api/http'
import { bindUnblockProvider } from '@/api/song'
import { getDesktopBridge } from '@/utils/desktop'
import type { QualityLevel } from '@/types/models'

const STORAGE_KEY = 'nextmusic.settings'

interface PersistedSettings {
  quality: QualityLevel
  downloadQuality: QualityLevel
  showTranslation: boolean
  /** 桌面端主 API 覆盖地址（'' = 使用内置本地服务；纯 Web 无效） */
  mainApiBaseOverride?: string
  /** 桌面端解灰开关（默认开启） */
  generalUnblock?: boolean
}

function load(): Required<PersistedSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>
      return {
        quality: (parsed.quality as QualityLevel) || 'exhigh',
        downloadQuality: (parsed.downloadQuality as QualityLevel) || 'exhigh',
        showTranslation: parsed.showTranslation !== false,
        mainApiBaseOverride: (parsed.mainApiBaseOverride || '').trim(),
        generalUnblock: parsed.generalUnblock !== false,
      }
    }
  } catch {
    /* 忽略损坏的本地数据 */
  }
  return {
    quality: 'exhigh',
    downloadQuality: 'exhigh',
    showTranslation: true,
    mainApiBaseOverride: '',
    generalUnblock: true,
  }
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
    /** 桌面端主 API 覆盖：规范化（去空白/尾斜杠）后写入，空串即恢复内置本地服务（立即生效，惰性求值） */
    setMainApiBaseOverride(url: string) {
      this.mainApiBaseOverride = normalizeApiBase(url)
      this.persist()
    },
    /** 解灰开关（全平台）：持久化；开启后 /song/url/v1 请求附带 unblock=true（见 song.ts provider） */
    setGeneralUnblock(enabled: boolean) {
      this.generalUnblock = enabled
      this.persist()
    },
    /** App.vue 启动时调用一次：绑定主 API 覆盖 provider（仅桌面环境有实际动作） */
    bindDesktopBridge() {
      if (!getDesktopBridge()) return
      bindMainApiOverride(() => this.mainApiBaseOverride)
    },
    persist() {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            quality: this.quality,
            downloadQuality: this.downloadQuality,
            showTranslation: this.showTranslation,
            mainApiBaseOverride: this.mainApiBaseOverride,
            generalUnblock: this.generalUnblock,
          }),
        )
      } catch {
        /* 存储不可用时静默 */
      }
    },
  },
})

// 解灰开关接入请求层（模块加载即生效，仿 auth.ts bindCookieProvider 的注册模式）
bindUnblockProvider(() => {
  try {
    return useSettingsStore().generalUnblock
  } catch {
    return false
  }
})
