import { mainApi } from './http'
import { normProfile } from './normalize'
import type { UserProfile } from '@/types/models'

export interface LoginResult {
  cookie?: string
  profile?: UserProfile
}

/** 手机号 + 密码 / 验证码登录 */
export function loginCellphone(params: {
  phone: string
  password?: string
  captcha?: string
  countrycode?: string
}): Promise<LoginResult> {
  return mainApi<LoginResult & { code: number }>('/login/cellphone', params, { method: 'POST' })
}

/** 邮箱登录 */
export function loginEmail(params: { email: string; password: string }): Promise<LoginResult> {
  return mainApi<LoginResult & { code: number }>('/login', params, { method: 'POST' })
}

/** 发送验证码 */
export function captchaSent(phone: string, ctcode = '86'): Promise<{ code: number }> {
  return mainApi('/captcha/sent', { phone, ctcode })
}

/** 游客登录，返回游客 cookie */
export function registerAnonymous(): Promise<{ code: number; cookie?: string }> {
  return mainApi('/register/anonimous')
}

/** 二维码登录：key 生成 */
export async function qrKey(): Promise<string> {
  const body = await mainApi<{ data: { unikey: string } }>('/login/qr/key', { noCacheTs: Date.now() }, { noCache: true })
  return body.data.unikey
}

/** 二维码生成（返回 base64 图片） */
export async function qrCreate(key: string): Promise<{ qrimg?: string; qrurl: string }> {
  const body = await mainApi<{ data: { qrimg?: string; qrurl: string } }>('/login/qr/create', { key, qrimg: true }, { noCache: true })
  return body.data
}

export interface QrCheckResult {
  code: number
  cookie?: string
  message?: string
}

/** 二维码状态检测：800 过期 801 等待 802 待确认 803 成功 */
export async function qrCheck(key: string): Promise<QrCheckResult> {
  try {
    const body = await mainApi<{ code: number; cookie?: string; message?: string }>('/login/qr/check', { key }, { noCache: true })
    return { code: body.code, cookie: body.cookie, message: body.message }
  } catch (err) {
    // 800 过期时接口可能直接抛出非 200 code
    if (err && typeof err === 'object' && 'code' in err) {
      const apiErr = err as { code: number; message?: string }
      return { code: apiErr.code, message: apiErr.message }
    }
    throw err
  }
}

/** 退出登录 */
export function logoutApi(): Promise<{ code: number }> {
  return mainApi('/logout')
}

/** 获取账号信息（判断登录态） */
export async function fetchAccount(): Promise<{ profile?: UserProfile; accountId: number }> {
  const body = await mainApi<{ profile?: Record<string, unknown>; account?: { id: number } }>('/user/account')
  return {
    profile: body.profile ? normProfile(body.profile) : undefined,
    accountId: Number(body.account?.id ?? body.profile?.userId ?? 0),
  }
}
