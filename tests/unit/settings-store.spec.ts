import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'

const STORAGE_KEY = 'nextmusic.settings'

describe('settings store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('默认值：播放/下载音质 exhigh，歌词翻译开启', () => {
    const store = useSettingsStore()
    expect(store.quality).toBe('exhigh')
    expect(store.downloadQuality).toBe('exhigh')
    expect(store.showTranslation).toBe(true)
  })

  it('setDownloadQuality 更新并持久化', () => {
    const store = useSettingsStore()
    store.setDownloadQuality('lossless')
    expect(store.downloadQuality).toBe('lossless')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).downloadQuality).toBe('lossless')
  })

  it('setQuality 更新并持久化', () => {
    const store = useSettingsStore()
    store.setQuality('standard')
    expect(store.quality).toBe('standard')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).quality).toBe('standard')
  })

  it('旧数据缺 downloadQuality 字段时回退 exhigh 且不覆盖已有字段', () => {
    localStorage.setItem(STORAGE_KEY, '{"quality":"standard","showTranslation":false}')
    const store = useSettingsStore()
    expect(store.downloadQuality).toBe('exhigh')
    expect(store.quality).toBe('standard')
    expect(store.showTranslation).toBe(false)
  })

  it('损坏的本地数据不抛错并回退全部默认值', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json')
    expect(() => useSettingsStore()).not.toThrow()
    const store = useSettingsStore()
    expect(store.quality).toBe('exhigh')
    expect(store.downloadQuality).toBe('exhigh')
    expect(store.showTranslation).toBe(true)
  })
})
