import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SideBar from '@/components/layout/SideBar.vue'

/** 渲染插槽并把 to 落到 data-to 上，便于断言路由目标（避免运行时模板编译依赖） */
const RouterLinkStub = defineComponent({
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('a', { 'data-to': props.to }, slots.default?.())
  },
})

describe('SideBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function mountBar() {
    return mount(SideBar, {
      global: {
        stubs: { RouterLink: RouterLinkStub, LazyImage: true },
      },
    })
  }

  it('导航包含设置入口且指向 /settings', () => {
    const wrapper = mountBar()
    expect(wrapper.text()).toContain('设置')
    expect(wrapper.find('[data-to="/settings"]').exists()).toBe(true)
  })
})
