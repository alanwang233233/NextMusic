import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ToastHost from '@/components/ui/ToastHost.vue'
import { useToastStore } from '@/stores/toast'

describe('ToastHost', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function mountHost() {
    return mount(ToastHost, {
      global: {
        stubs: {
          Teleport: { template: '<div><slot /></div>' },
          TransitionGroup: { template: '<div><slot /></div>' },
          Transition: { template: '<div><slot /></div>' },
        },
      },
    })
  }

  it('push 后渲染消息并自动消失', async () => {
    const toast = useToastStore()
    const wrapper = mountHost()
    toast.success('操作成功')
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.text()).toContain('操作成功')

    await vi.advanceTimersByTimeAsync(2600)
    expect(toast.items).toHaveLength(0)
  })

  it('错误消息渲染 error 类型', async () => {
    const toast = useToastStore()
    const wrapper = mountHost()
    toast.error('出错了')
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.text()).toContain('出错了')
    expect(wrapper.find('[role="status"]').classes().join(' ')).toContain('text-red-200')
  })

  it('超过 4 条时移除最早的', async () => {
    const toast = useToastStore()
    const wrapper = mountHost()
    for (let i = 0; i < 6; i++) toast.info(`消息${i}`)
    await vi.advanceTimersByTimeAsync(0)
    expect(toast.items).toHaveLength(4)
    expect(wrapper.text()).not.toContain('消息0')
    expect(wrapper.text()).toContain('消息5')
  })
})
