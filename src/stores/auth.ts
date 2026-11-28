import { defineStore } from 'pinia'
import { ApiError, WriteBlockedError, bindCookieProvider } from '@/api/http'
import * as authApi from '@/api/auth'
import { fetchUserDetail } from '@/api/user'
import { getDesktopBridge } from '@/utils/desktop'
import type { AuthMode, UserProfile } from '@/types/models'

const STORAGE_KEY = 'nextmusic.auth'

interface PersistedAuth {
  mode: AuthMode
  cookie?: string
  profile?: UserProfile
  virtualUser?: UserProfile
}

export const GUEST_BLOCK_MESSAGE = '游客模式不支持该操作，请先登录'
export const VIRTUAL_BLOCK_MESSAGE = '虚拟登录为只读模式，写入操作不可用'

const VALID_MODES: AuthMode[] = ['none', 'user', 'guest', 'virtual']

function parsePersisted(raw: unknown): PersistedAuth | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = raw as Partial<PersistedAuth>
  if (!parsed.mode || !VALID_MODES.includes(parsed.mode)) return null
  return {
    mode: parsed.mode,
    cookie: parsed.cookie,
    profile: parsed.profile,
    virtualUser: parsed.virtualUser,
  }
}

function loadPersisted(): PersistedAuth {
  // 桌面环境：主进程文件快照优先（userData 下 JSON，免疫 Chromium 存储层异常——
  // Windows 上杀软/权限问题可能令 localStorage 每次退出即失），并回写 localStorage 保持一致
  const snapshot = getDesktopBridge()?.persistedAuth
  const fromBridge = parsePersisted(snapshot)
  if (fromBridge) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fromBridge))
    } catch {
      /* 存储异常时跳过回写 */
    }
    return fromBridge
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = parsePersisted(JSON.parse(raw))
      if (parsed) return parsed
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return { mode: 'none' }
}

export const useAuthStore = defineStore('auth', {
  state: () => {
    const persisted = loadPersisted()
    return {
      mode: persisted.mode,
      cookie: persisted.cookie,
      profile: persisted.profile ?? null,
      virtualUser: persisted.virtualUser ?? null,
      /** 喜欢的音乐 id 集合（user 模式） */
      likedIds: [] as number[],
      likedLoaded: false,
    }
  },
  getters: {
    isLoggedIn: (s) => s.mode === 'user',
    canWrite(): boolean {
      return this.mode === 'user'
    },
    displayProfile(): UserProfile | null {
      return this.profile || this.virtualUser
    },
    displayUid(): number | null {
      return this.displayProfile?.userId ?? null
    },
  },
  actions: {
    persist() {
      const data: PersistedAuth = {
        mode: this.mode,
        cookie: this.cookie,
        profile: this.profile ?? undefined,
        virtualUser: this.virtualUser ?? undefined,
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch {
        /* 忽略存储异常 */
      }
      // 桌面环境镜像到主进程文件（异步、失败不阻塞本地持久化）。
      // 必须在本侧序列化成字符串再过桥：data.profile 是 Vue reactive Proxy，
      // contextBridge 的结构化克隆无法处理（"An object could not be cloned."）
      void getDesktopBridge()
        ?.setPersistedAuth(JSON.stringify(data))
        .catch(() => undefined)
    },

    /** 登录成功后应用账号信息 */
    applyLoginResult(result: authApi.LoginResult) {
      this.mode = 'user'
      this.cookie = result.cookie || undefined
      this.profile = result.profile ?? null
      this.virtualUser = null
      this.likedIds = []
      this.likedLoaded = false
      this.persist()
    },

    /** 手机 / 邮箱 / 二维码登录共用 */
    async loginWithCookieAndProfile(cookie: string | undefined, profile: UserProfile | null | undefined) {
      if (!cookie) throw new ApiError(-1, '登录未返回凭证，请重试')
      this.applyLoginResult({ cookie, profile: profile ?? undefined })
      await this.loadLikedIds().catch(() => undefined)
    },

    async loginCellphone(params: { phone: string; password?: string; captcha?: string; countrycode?: string }) {
      const result = await authApi.loginCellphone(params)
      await this.loginWithCookieAndProfile(result.cookie, result.profile)
    },

    async loginEmail(params: { email: string; password: string }) {
      const result = await authApi.loginEmail(params)
      await this.loginWithCookieAndProfile(result.cookie, result.profile)
    },

    /** 游客登录 */
    async guestLogin() {
      const body = await authApi.registerAnonymous()
      if (!body.cookie) throw new ApiError(-1, '游客登录失败')
      this.mode = 'guest'
      this.cookie = body.cookie
      this.profile = null
      this.virtualUser = null
      this.likedIds = []
      this.likedLoaded = false
      this.persist()
    },

    /**
     * 虚拟登录：输入昵称搜索用户，返回候选列表
     * 选取后调用 chooseVirtualUser 完成登录
     */
    async searchVirtualCandidates(nickname: string): Promise<UserProfile[]> {
      const { mainApi } = await import('@/api/http')
      const body = await mainApi<{ result?: { userprofiles?: Record<string, any>[] } }>('/cloudsearch', {
        keywords: nickname,
        type: 1002,
        limit: 10,
      })
      // type=1002 的返回字段是 userprofiles（实测，非 users）
      return (body.result?.userprofiles || []).map((u) => ({
        userId: Number(u.userId),
        nickname: String(u.nickname || ''),
        avatarUrl: String(u.avatarUrl || '').replace(/^http:\/\//, 'https://'),
      }))
    },

    /** 选定虚拟用户并拉取公开资料（只读） */
    async chooseVirtualUser(candidate: UserProfile) {
      let detail = candidate
      try {
        detail = await fetchUserDetail(candidate.userId)
      } catch {
        /* 用户详情失败时退回搜索结果中的信息 */
      }
      this.mode = 'virtual'
      this.cookie = undefined
      this.profile = null
      this.virtualUser = detail
      this.likedIds = []
      this.likedLoaded = false
      this.persist()
    },

    /** 拉取喜欢列表 id（仅 user 模式） */
    async loadLikedIds() {
      if (this.mode !== 'user' || !this.displayUid) return
      const { fetchLikeList } = await import('@/api/user')
      this.likedIds = await fetchLikeList(this.displayUid)
      this.likedLoaded = true
    },

    isLiked(songId: number): boolean {
      return this.likedIds.includes(songId)
    },

    /** 退出登录（清空本地状态） */
    async logout() {
      if (this.mode === 'user' && this.cookie) {
        await authApi.logoutApi().catch(() => undefined)
      }
      this.mode = 'none'
      this.cookie = undefined
      this.profile = null
      this.virtualUser = null
      this.likedIds = []
      this.likedLoaded = false
      this.persist()
    },

    /**
     * 写操作守卫：游客 / 虚拟模式抛出 WriteBlockedError 并返回 false
     * 返回 true 表示允许继续执行写操作
     */
    assertWrite(): boolean {
      if (this.mode === 'user') return true
      throw new WriteBlockedError(this.mode === 'virtual' ? VIRTUAL_BLOCK_MESSAGE : GUEST_BLOCK_MESSAGE)
    },
  },
})

// 将 cookie 读取接入 http 层（模块加载即生效）
bindCookieProvider(() => {
  try {
    const store = useAuthStore()
    return store.cookie
  } catch {
    return undefined
  }
})
