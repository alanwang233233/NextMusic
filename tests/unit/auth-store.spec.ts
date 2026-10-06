import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore, VIRTUAL_BLOCK_MESSAGE } from '@/stores/auth'
import { WriteBlockedError } from '@/api/http'

vi.mock('@/api/auth', () => ({
  loginCellphone: vi.fn(),
  loginEmail: vi.fn(),
  registerAnonymous: vi.fn(),
  logoutApi: vi.fn(async () => ({ code: 200 })),
  qrKey: vi.fn(),
  qrCreate: vi.fn(),
  qrCheck: vi.fn(),
  fetchAccount: vi.fn(),
}))

vi.mock('@/api/user', () => ({
  fetchUserDetail: vi.fn(async () => ({
    userId: 777,
    nickname: '虚拟用户',
    avatarUrl: 'https://p1.music.126.net/avatar.jpg',
    level: 8,
    listenSongs: 1234,
  })),
  fetchLikeList: vi.fn(async () => [11, 22, 33]),
}))

/** 虚拟登录用户搜索（type=1002 返回 users 字段） */
vi.mock('@/api/http', () => ({
  mainApi: vi.fn(async (path: string) => {
    if (path === '/cloudsearch') {
      return { result: { userprofiles: [ { userId: 777, nickname: '虚拟用户', avatarUrl: 'http://p1.music.126.net/avatar.jpg' }, { userId: 888, nickname: '其他用户', avatarUrl: '' } ] } }
    }
    return { code: 200 }
  }),
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

const PROFILE = { userId: 100, nickname: '测试用户', avatarUrl: 'https://p1.music.126.net/a.jpg' }

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('手机登录后进入 user 模式并持久化', async () => {
    const { loginCellphone } = await import('@/api/auth')
    vi.mocked(loginCellphone).mockResolvedValue({ cookie: 'MUSIC_U=xyz', profile: PROFILE as never })

    const auth = useAuthStore()
    await auth.loginCellphone({ phone: '13800138000', password: 'pw' })

    expect(auth.mode).toBe('user')
    expect(auth.cookie).toBe('MUSIC_U=xyz')
    expect(auth.profile?.nickname).toBe('测试用户')
    expect(auth.canWrite).toBe(true)
    expect(JSON.parse(localStorage.getItem('nextmusic.auth')!)).toMatchObject({ mode: 'user' })
  })

  it('游客登录保存游客 cookie，写操作被拦截', async () => {
    const { registerAnonymous } = await import('@/api/auth')
    vi.mocked(registerAnonymous).mockResolvedValue({ code: 200, cookie: 'GUEST=1' })
    const auth = useAuthStore()
    await auth.guestLogin()

    expect(auth.mode).toBe('guest')
    expect(auth.canWrite).toBe(false)
    expect(() => auth.assertWrite()).toThrow(WriteBlockedError)
  })

  it('虚拟登录走搜索 + 详情，写操作提示不可用', async () => {
    const auth = useAuthStore()
    const candidates = await auth.searchVirtualCandidates('虚拟用户')
    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toMatchObject({ userId: 777, nickname: '虚拟用户' })
    expect(candidates[0]!.avatarUrl).toBe('https://p1.music.126.net/avatar.jpg')

    await auth.chooseVirtualUser(candidates[0]!)
    expect(auth.mode).toBe('virtual')
    expect(auth.virtualUser?.nickname).toBe('虚拟用户')
    expect(auth.virtualUser?.level).toBe(8)
    expect(auth.cookie).toBeUndefined()
    expect(() => auth.assertWrite()).toThrow(VIRTUAL_BLOCK_MESSAGE)
  })

  it('虚拟登录用户详情失败时回退搜索信息', async () => {
    const { fetchUserDetail } = await import('@/api/user')
    vi.mocked(fetchUserDetail).mockRejectedValueOnce(new Error('boom'))

    const auth = useAuthStore()
    const candidates = await auth.searchVirtualCandidates('虚拟用户')
    await auth.chooseVirtualUser(candidates[0]!)
    expect(auth.mode).toBe('virtual')
    expect(auth.virtualUser?.nickname).toBe('虚拟用户')
  })

  it('user 模式加载喜欢列表', async () => {
    const { loginCellphone } = await import('@/api/auth')
    vi.mocked(loginCellphone).mockResolvedValue({ cookie: 'MUSIC_U=xyz', profile: PROFILE as never })
    const auth = useAuthStore()
    await auth.loginCellphone({ phone: '13800138000', password: 'pw' })
    await auth.loadLikedIds()
    expect(auth.likedIds).toEqual([11, 22, 33])
    expect(auth.isLiked(22)).toBe(true)
  })

  it('退出登录清空全部状态', async () => {
    const { registerAnonymous } = await import('@/api/auth')
    vi.mocked(registerAnonymous).mockResolvedValue({ code: 200, cookie: 'GUEST=1' })
    const auth = useAuthStore()
    await auth.guestLogin()
    await auth.logout()
    expect(auth.mode).toBe('none')
    expect(auth.cookie).toBeUndefined()
    expect(localStorage.getItem('nextmusic.auth')).toBe(JSON.stringify({ mode: 'none' }))
  })

  it('localStorage 数据损坏时回退到未登录', async () => {
    localStorage.setItem('nextmusic.auth', '{broken json')
    setActivePinia(createPinia())
    const auth = useAuthStore()
    expect(auth.mode).toBe('none')
    expect(auth.displayProfile).toBeNull()
  })

  it('localStorage 模式值非法时回退到未登录', async () => {
    localStorage.setItem('nextmusic.auth', JSON.stringify({ mode: 'hacked' }))
    setActivePinia(createPinia())
    const auth = useAuthStore()
    expect(auth.mode).toBe('none')
  })

  it('从 localStorage 恢复登录态', async () => {
    localStorage.setItem(
      'nextmusic.auth',
      JSON.stringify({ mode: 'virtual', virtualUser: { userId: 9, nickname: '恢复用户', avatarUrl: '' } }),
    )
    setActivePinia(createPinia())
    const auth = useAuthStore()
    expect(auth.mode).toBe('virtual')
    expect(auth.displayProfile?.nickname).toBe('恢复用户')
  })
})
