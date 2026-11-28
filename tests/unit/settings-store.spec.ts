import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { nextSongPreloader } from '@/player/precache'

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

  it('setQuality 清空预缓存：避免旧音质 blob 被复用（loop 跨轮复用与下一曲预载均受影响）', () => {
    const spy = vi.spyOn(nextSongPreloader, 'clear')
    const store = useSettingsStore()
    store.setQuality('standard')
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
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

describe('settings store 桌面端设置', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    delete (globalThis as Record<string, unknown>).nextmusicDesktop
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).nextmusicDesktop
    vi.restoreAllMocks()
  })

  it('旧数据无桌面字段：override 归一为空串，解灰默认开启', () => {
    localStorage.setItem(STORAGE_KEY, '{"quality":"standard"}')
    const store = useSettingsStore()
    expect(store.mainApiBaseOverride).toBe('')
    expect(store.generalUnblock).toBe(true)
  })

  it('setMainApiBaseOverride：trim 尾斜杠并持久化', () => {
    const store = useSettingsStore()
    store.setMainApiBaseOverride(' https://x.example.com/ ')
    expect(store.mainApiBaseOverride).toBe('https://x.example.com')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).mainApiBaseOverride).toBe('https://x.example.com')
  })

  it('setMainApiBaseOverride 空串即恢复内置', () => {
    const store = useSettingsStore()
    store.setMainApiBaseOverride('https://x.example.com')
    store.setMainApiBaseOverride('')
    expect(store.mainApiBaseOverride).toBe('')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).mainApiBaseOverride).toBe('')
  })

  it('setGeneralUnblock：持久化并同步给桌面桥接', () => {
    const bridgeSpy = vi.fn().mockResolvedValue(true)
    ;(globalThis as Record<string, unknown>).nextmusicDesktop = {
      mainApiBase: 'http://127.0.0.1:34567',
      setGeneralUnblock: bridgeSpy,
    }
    const store = useSettingsStore()
    store.setGeneralUnblock(false)
    expect(store.generalUnblock).toBe(false)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).generalUnblock).toBe(false)
    expect(bridgeSpy).toHaveBeenCalledWith(false)
  })

  it('无桥接时桌面动作不抛错（纯 Web 安全）', () => {
    const store = useSettingsStore()
    expect(() => {
      store.setGeneralUnblock(false)
      store.bindDesktopBridge()
    }).not.toThrow()
    expect(store.generalUnblock).toBe(false)
  })

  it('bindDesktopBridge 绑定后改 override：requireMainApiBase 立即生效', async () => {
    ;(globalThis as Record<string, unknown>).nextmusicDesktop = {
      mainApiBase: 'http://127.0.0.1:34567',
      setGeneralUnblock: vi.fn().mockResolvedValue(true),
    }
    // 桥接须在 http 模块加载前可见（MAIN_API_BASE 为模块加载期求值），故动态导入两模块
    vi.resetModules()
    const { requireMainApiBase } = await import('@/api/http')
    const { useSettingsStore: useSettings } = await import('@/stores/settings')
    const store = useSettings()
    store.bindDesktopBridge()
    expect(requireMainApiBase()).toBe('http://127.0.0.1:34567')
    store.setMainApiBaseOverride('https://remote.example.com')
    expect(requireMainApiBase()).toBe('https://remote.example.com')
  })

  it('无桥接时不绑定 override provider：requireMainApiBase 仍取 env', async () => {
    // 重置模块注册表：隔离上一用例动态导入的 http 实例及其绑定的 provider
    vi.resetModules()
    const { requireMainApiBase } = await import('@/api/http')
    const store = useSettingsStore()
    store.bindDesktopBridge()
    store.setMainApiBaseOverride('https://remote.example.com')
    // 纯 Web 下 override 不参与解析（bindDesktopBridge 未注册 provider），行为不变
    expect(requireMainApiBase()).toBe('https://mainapi.test')
  })
})
