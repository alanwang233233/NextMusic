import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import SettingsView from '@/views/SettingsView.vue'
import { useSettingsStore } from '@/stores/settings'
import { useAudioOutput } from '@/composables/useAudioOutput'
import { QUALITY_LEVELS, REPO_URL } from '@/config/constants'

const STORAGE_KEY = 'nextmusic.settings'

vi.mock('@/composables/useAudioOutput', () => ({
  AUDIO_OUTPUT_STORAGE_KEY: 'nextmusic.audioOutput',
  useAudioOutput: vi.fn(),
}))

function stubBridge(mainApiBase = 'http://127.0.0.1:34567'): void {
  ;(globalThis as Record<string, unknown>).nextmusicDesktop = {
    mainApiBase,
    setGeneralUnblock: vi.fn().mockResolvedValue(true),
  }
}

function stubAudioOutput(currentId = 'default'): ReturnType<typeof vi.fn> {
  const select = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)
  vi.mocked(useAudioOutput).mockReset().mockReturnValue({
    devices: ref([
      { deviceId: 'default', label: '系统默认' },
      { deviceId: 'abc', label: 'External Speakers' },
    ]),
    currentId: ref(currentId),
    select,
    refresh: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  })
  return select
}

describe('SettingsView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  function mountView() {
    return mount(SettingsView)
  }

  it('渲染默认音质/默认下载音质/关于三个板块与应用名', () => {
    const wrapper = mountView()
    const text = wrapper.text()
    expect(text).toContain('默认音质')
    expect(text).toContain('默认下载音质')
    expect(text).toContain('关于')
    expect(text).toContain('NextMusic')
  })

  it('播放与下载各渲染 10 个音质档位', () => {
    const wrapper = mountView()
    expect(wrapper.findAll('[data-testid^="play-quality-"]')).toHaveLength(QUALITY_LEVELS.length)
    expect(wrapper.findAll('[data-testid^="download-quality-"]')).toHaveLength(QUALITY_LEVELS.length)
  })

  it('切换下载音质写入 store 并持久化', async () => {
    const wrapper = mountView()
    await wrapper.find('[data-testid="download-quality-lossless"]').trigger('click')
    const store = useSettingsStore()
    expect(store.downloadQuality).toBe('lossless')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).downloadQuality).toBe('lossless')
  })

  it('切换播放音质写入 store', async () => {
    const wrapper = mountView()
    await wrapper.find('[data-testid="play-quality-standard"]').trigger('click')
    expect(useSettingsStore().quality).toBe('standard')
  })

  it('关于板块展示仓库链接与当前提交', () => {
    const wrapper = mountView()
    const repoLink = wrapper.find(`a[href="${REPO_URL}"]`)
    expect(repoLink.exists()).toBe(true)
    expect(repoLink.attributes('target')).toBe('_blank')
    // 当前提交短哈希：vite define 构建期注入（vitest 同样生效），失败时为 unknown 且不渲染 commit 链接
    expect(wrapper.text()).toContain(__APP_COMMIT__)
    const commitLink = wrapper.find(`a[href="${REPO_URL}/commit/${__APP_COMMIT__}"]`)
    expect(commitLink.exists()).toBe(__APP_COMMIT__ !== 'unknown')
  })
})

describe('SettingsView 桌面板块', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    delete (globalThis as Record<string, unknown>).nextmusicDesktop
  })

  it('无桥接（纯 Web）时不渲染桌面板块', () => {
    const wrapper = mount(SettingsView)
    expect(wrapper.find('[data-testid="desktop-section"]').exists()).toBe(false)
    expect(useAudioOutput).not.toHaveBeenCalled()
  })

  it('有桥接时渲染设备/主 API/解灰三块，当前设备带勾', () => {
    stubBridge()
    stubAudioOutput('abc')
    const wrapper = mount(SettingsView)
    const section = wrapper.find('[data-testid="desktop-section"]')
    expect(section.exists()).toBe(true)
    expect(section.text()).toContain('播放设备')
    expect(section.text()).toContain('主 API')
    expect(section.text()).toContain('解灰')
    expect(wrapper.find('[data-testid="audio-device-default"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audio-device-abc"]').exists()).toBe(true)
    // 当前设备行带 check 图标（svg）
    expect(wrapper.find('[data-testid="audio-device-abc"] svg').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audio-device-default"] svg').exists()).toBe(false)
  })

  it('点击设备行调用 select', async () => {
    stubBridge()
    const select = stubAudioOutput('default')
    const wrapper = mount(SettingsView)
    await wrapper.find('[data-testid="audio-device-abc"]').trigger('click')
    expect(select).toHaveBeenCalledWith('abc')
  })

  it('主 API 保存写入 store（覆盖立即生效由 store/http 层保证）', async () => {
    stubBridge()
    stubAudioOutput()
    const wrapper = mount(SettingsView)
    await wrapper.find('[data-testid="main-api-input"]').setValue('https://remote.example.com')
    await wrapper.find('[data-testid="main-api-save"]').trigger('click')
    expect(useSettingsStore().mainApiBaseOverride).toBe('https://remote.example.com')
  })

  it('恢复内置按钮清空覆盖', async () => {
    stubBridge()
    stubAudioOutput()
    const store = useSettingsStore()
    store.setMainApiBaseOverride('https://remote.example.com')
    const wrapper = mount(SettingsView)
    await wrapper.find('[data-testid="main-api-reset"]').trigger('click')
    expect(store.mainApiBaseOverride).toBe('')
  })

  it('解灰开关切换 store 状态', async () => {
    stubBridge()
    stubAudioOutput()
    const wrapper = mount(SettingsView)
    expect(useSettingsStore().generalUnblock).toBe(true)
    await wrapper.find('[data-testid="unblock-toggle"]').trigger('click')
    expect(useSettingsStore().generalUnblock).toBe(false)
  })
})
