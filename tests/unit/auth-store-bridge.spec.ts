import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

const STORAGE_KEY = 'nextmusic.auth'

function stubBridge(persistedAuth?: unknown): { setPersistedAuth: ReturnType<typeof vi.fn> } {
  const setPersistedAuth = vi.fn<(data: unknown) => Promise<boolean>>().mockResolvedValue(true)
  ;(globalThis as Record<string, unknown>).nextmusicDesktop = {
    mainApiBase: 'http://127.0.0.1:34567',
    setGeneralUnblock: vi.fn().mockResolvedValue(true),
    persistedAuth,
    setPersistedAuth,
  }
  return { setPersistedAuth }
}

function bridgeValue(): unknown {
  return (globalThis as Record<string, unknown>).nextmusicDesktop
}

const USER_AUTH = {
  mode: 'user',
  cookie: 'MUSIC_U=xyz',
  profile: { userId: 100, nickname: '测试用户', avatarUrl: 'https://p1.music.126.net/a.jpg' },
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  delete (globalThis as Record<string, unknown>).nextmusicDesktop
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).nextmusicDesktop
  vi.restoreAllMocks()
})

describe('auth store 桌面持久化（主进程文件镜像）', () => {
  it('无桥接（纯 Web）：localStorage 行为完全不变（回归钉）', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(USER_AUTH))
    const store = useAuthStore()
    expect(store.mode).toBe('user')
    expect(store.cookie).toBe('MUSIC_U=xyz')
    store.persist()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).mode).toBe('user')
  })

  it('恢复优先级：桥接注入的主进程快照优先于 localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'none' }))
    stubBridge({ ...USER_AUTH })
    const store = useAuthStore()
    expect(store.mode).toBe('user')
    expect(store.cookie).toBe('MUSIC_U=xyz')
    expect(store.profile?.nickname).toBe('测试用户')
    // 快照同步回写 localStorage，保证同源数据一致
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).mode).toBe('user')
  })

  it('桥接快照无效时回退 localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(USER_AUTH))
    stubBridge({ mode: 'bogus' })
    const store = useAuthStore()
    expect(store.mode).toBe('user')
    expect(store.cookie).toBe('MUSIC_U=xyz')
  })

  it('persist() 镜像写入主进程（桥接存在时）', async () => {
    const { setPersistedAuth } = stubBridge(undefined)
    const store = useAuthStore()
    store.mode = 'user'
    store.cookie = 'MUSIC_U=abc'
    store.persist()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).cookie).toBe('MUSIC_U=abc')
    expect(setPersistedAuth).toHaveBeenCalledTimes(1)
    const mirrored = setPersistedAuth.mock.calls[0]?.[0] as { mode: string; cookie?: string }
    expect(mirrored.mode).toBe('user')
    expect(mirrored.cookie).toBe('MUSIC_U=abc')
  })

  it('persist() 镜像失败不阻塞本地持久化', () => {
    stubBridge(undefined)
    const store = useAuthStore()
    ;(bridgeValue() as { setPersistedAuth: ReturnType<typeof vi.fn> }).setPersistedAuth.mockRejectedValue(new Error('盘满'))
    store.mode = 'guest'
    expect(() => store.persist()).not.toThrow()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).mode).toBe('guest')
  })

  it('无桥接时 persist() 不触碰镜像通道', () => {
    const store = useAuthStore()
    store.mode = 'user'
    store.persist()
    expect(bridgeValue()).toBeUndefined()
  })
})
