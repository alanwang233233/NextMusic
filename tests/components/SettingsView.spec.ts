import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SettingsView from '@/views/SettingsView.vue'
import { useSettingsStore } from '@/stores/settings'
import { QUALITY_LEVELS, REPO_URL } from '@/config/constants'

const STORAGE_KEY = 'nextmusic.settings'

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
