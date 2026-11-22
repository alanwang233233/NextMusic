import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import MeView from '@/views/MeView.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import type { UserProfile } from '@/types/models'

vi.mock('@/api/user', () => ({
  fetchUserPlaylists: vi.fn(async () => ({ playlists: [] })),
  fetchUserDetail: vi.fn(async () => null),
  fetchLikeList: vi.fn(async () => []),
}))

/** 渲染插槽并把 to 落到 data-to 上，便于断言路由目标（避免运行时模板编译依赖） */
const RouterLinkStub = defineComponent({
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('a', { 'data-to': props.to }, slots.default?.())
  },
})

const profile: UserProfile = { userId: 1, nickname: 'tester', avatarUrl: 'https://avatar.test/a.jpg' }

function mountView() {
  return mount(MeView, {
    global: { stubs: { RouterLink: RouterLinkStub, LazyImage: true } },
  })
}

describe('MeView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('未登录（none 模式）仍渲染快捷入口，可进入设置', () => {
    const wrapper = mountView()
    expect(wrapper.text()).toContain('登录后可查看个人主页')
    expect(wrapper.find('[data-to="/settings"]').exists()).toBe(true)
    // 未登录不渲染歌单区
    expect(wrapper.text()).not.toContain('创建的歌单')
  })

  it('none 模式点击需登录入口提示登录且不跳转', async () => {
    const wrapper = mountView()
    const like = wrapper.find('[data-to="/liked"]')
    expect(like.exists()).toBe(true)
    await like.trigger('click')
    expect(useToastStore().items.some((t) => t.type === 'error' && t.message === '该功能需要登录后使用')).toBe(true)
  })

  it('正式登录仍渲染个人资料卡与快捷入口', async () => {
    const auth = useAuthStore()
    auth.mode = 'user'
    auth.profile = { ...profile }
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('tester')
    expect(wrapper.find('[data-to="/settings"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('登录后可查看个人主页')
  })
})
