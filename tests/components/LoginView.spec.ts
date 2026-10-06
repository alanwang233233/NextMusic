import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LoginView from '@/views/LoginView.vue'
import { useAuthStore } from '@/stores/auth'

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}))

vi.mock('@/api/auth', () => ({
  loginCellphone: vi.fn(),
  loginEmail: vi.fn(),
  registerAnonymous: vi.fn(async () => ({ code: 200, cookie: 'GUEST=1' })),
  logoutApi: vi.fn(),
  qrKey: vi.fn(),
  qrCreate: vi.fn(),
  qrCheck: vi.fn(),
  fetchAccount: vi.fn(),
}))

vi.mock('@/api/user', () => ({
  fetchUserDetail: vi.fn(async () => ({ userId: 777, nickname: '虚拟用户', avatarUrl: '', level: 5 })),
  fetchLikeList: vi.fn(async () => []),
}))

/** 虚拟登录用户搜索（type=1002 返回 users 字段） */
const mainApiMock = vi.fn(async (path: string) => {
  if (path === '/cloudsearch') {
    return {
      result: {
        userprofiles: [{ userId: 777, nickname: '虚拟用户', avatarUrl: 'https://p1.music.126.net/avatar.jpg' }],
      },
    }
  }
  return { code: 200 }
})

vi.mock('@/api/http', () => ({
  mainApi: (...args: unknown[]) => mainApiMock(...(args as [string])),
  outerApi: vi.fn(),
  ApiError: class extends Error {
    code: number
    constructor(code: number, message: string) {
      super(message)
      this.code = code
    }
  },
  WriteBlockedError: class extends Error {},
  bindCookieProvider: vi.fn(),
  MAIN_API_BASE: 'https://mainapi.test',
  OUTER_API_BASE: 'https://nextmusic.toubiec.cn',
}))

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mainApiMock.mockClear()
  })

  function mountView() {
    return mount(LoginView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          Transition: { template: '<div><slot /></div>' },
          Teleport: { template: '<div><slot /></div>' },
        },
      },
    })
  }

  it('默认展示手机登录 Tab', () => {
    const wrapper = mountView()
    expect(wrapper.find('[data-testid="tab-phone"]').classes()).toContain('bg-primary-600')
    expect(wrapper.text()).toContain('密码登录')
  })

  it('切换到邮箱 Tab 显示邮箱输入框', async () => {
    const wrapper = mountView()
    await wrapper.find('[data-testid="tab-email"]').trigger('click')
    expect(wrapper.find('input[type="email"]').exists()).toBe(true)
    expect(wrapper.find('input[aria-label="密码"]').exists()).toBe(true)
  })

  it('切换到扫码 Tab 生成二维码', async () => {
    const { qrKey, qrCreate } = await import('@/api/auth')
    vi.mocked(qrKey).mockResolvedValue('unikey-1')
    vi.mocked(qrCreate).mockResolvedValue({ qrimg: 'data:image/png;base64,xxx', qrurl: 'https://music.163.com/qr' })
    const wrapper = mountView()
    await wrapper.find('[data-testid="tab-qr"]').trigger('click')
    await flushPromises()
    expect(qrKey).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="qr-status"]').text()).toContain('扫码')
  })

  it('游客登录调用 store 并跳转', async () => {
    const wrapper = mountView()
    await wrapper.find('[data-testid="guest-login"]').trigger('click')
    await flushPromises()
    const auth = useAuthStore()
    expect(auth.mode).toBe('guest')
    expect(auth.cookie).toBe('GUEST=1')
  })

  it('虚拟登录：搜索到候选用户后确认进入只读模式', async () => {
    const wrapper = mountView()
    await wrapper.find('[data-testid="tab-virtual"]').trigger('click')
    await wrapper.find('input[aria-label="用户昵称"]').setValue('虚拟用户')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // 候选列表渲染
    expect(wrapper.text()).toContain('虚拟用户')
    expect(wrapper.text()).toContain('ID: 777')

    // 点击候选用户（包含 ID 文本的按钮）
    const candidate = wrapper.findAll('button').find((b) => b.text().includes('ID: 777'))
    expect(candidate).toBeTruthy()
    await candidate!.trigger('click')
    await flushPromises()
    const auth = useAuthStore()
    expect(auth.mode).toBe('virtual')
    expect(auth.virtualUser?.userId).toBe(777)
  })

  it('虚拟登录：搜索无结果时给出提示', async () => {
    mainApiMock.mockImplementation(async (path: string) => {
      if (path === '/cloudsearch') return { result: { userprofiles: [] } }
      return { code: 200 }
    })
    const { useToastStore } = await import('@/stores/toast')
    const wrapper = mountView()
    await wrapper.find('[data-testid="tab-virtual"]').trigger('click')
    await wrapper.find('input[aria-label="用户昵称"]').setValue('不存在')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(useToastStore().items.some((t) => t.message.includes('未找到'))).toBe(true)
  })

  it('手机号格式错误时提示且不提交', async () => {
    const { loginCellphone } = await import('@/api/auth')
    const { useToastStore } = await import('@/stores/toast')
    const wrapper = mountView()
    await wrapper.find('input[aria-label="手机号码"]').setValue('123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(loginCellphone).not.toHaveBeenCalled()
    expect(useToastStore().items.some((t) => t.message.includes('手机号'))).toBe(true)
  })

  it('游客/虚拟模式下有游客入口按钮', () => {
    const wrapper = mountView()
    expect(wrapper.find('[data-testid="guest-login"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('游客模式进入')
  })
})
