/**
 * HTTP 层。
 *
 * 主 API 虽然返回 `Access-Control-Allow-Credentials: true`，但同时返回
 * `Access-Control-Allow-Origin: *`，浏览器会拒绝携带凭据的跨域请求，
 * 因此登录态统一通过 `?cookie=encodeURIComponent(...)` 查询参数传递
 * （POST 请求则放在 JSON body 中，避免凭证/密码出现在 URL 日志里）。
 */

export class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/** 写入操作在游客 / 虚拟登录模式下被拦截时抛出 */
export class WriteBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WriteBlockedError'
  }
}

/**
 * 主 API 地址从环境变量读取（构建时注入），源码与仓库中不保留具体地址。
 * 本地开发复制 .env.example 为 .env.local 并填入 VITE_MAIN_API。
 */
export const MAIN_API_BASE: string = import.meta.env.VITE_MAIN_API || ''
export const OUTER_API_BASE = import.meta.env.VITE_OUTER_API || 'https://nextmusic.toubiec.cn'

/** 未配置主 API 地址时给出明确的运行时错误 */
export function requireMainApiBase(): string {
  if (!MAIN_API_BASE) {
    throw new ApiError(-1, '主 API 地址未配置：请复制 .env.example 为 .env.local 并填入 VITE_MAIN_API')
  }
  return MAIN_API_BASE
}

/**
 * OuterAPI 必须携带 ip 参数（缺失时报 400「当前非法提交参数」）。
 * 客户端无法可靠获知公网 IP，按接口约定在会话内生成一个随机中国 IP（可通过 env 覆盖）。
 */
const OUTER_IP = import.meta.env.VITE_OUTER_IP || randomChinaIp()

function randomChinaIp(): string {
  const segment = () => 1 + Math.floor(Math.random() * 254)
  return `116.25.${segment()}.${segment()}`
}

type CookieProvider = () => string | undefined

let cookieProvider: CookieProvider = () => undefined

/** 由 auth store 注入 cookie 读取函数 */
export function bindCookieProvider(fn: CookieProvider): void {
  cookieProvider = fn
}

export function getCookie(): string | undefined {
  return cookieProvider()
}

const DEFAULT_TIMEOUT = 15000

function buildQuery(params: Record<string, unknown> = {}, withCookie = true): string {
  const search = new URLSearchParams()
  const merged: Record<string, unknown> = { ...params }

  if (withCookie) {
    const cookie = getCookie()
    if (cookie) merged.cookie = cookie
  }

  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  return search.toString()
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  /** 追加时间戳防缓存（POST 与轮询接口必需） */
  noCache?: boolean
}

async function parseBody(res: Response): Promise<Record<string, unknown>> {
  let body: Record<string, unknown>
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch {
    throw new ApiError(res.status, `接口返回了无法解析的内容（HTTP ${res.status}）`)
  }
  const code = typeof body.code === 'number' ? body.code : res.status
  if (code !== 200) {
    // 301 表示未登录；501/502 等为接口错误。统一抛出，由调用方决定如何降级
    const defaultMsg = code === 301 ? '请先登录' : `请求失败（${code}）`
    throw new ApiError(code, String(body.message || body.msg || defaultMsg))
  }
  return body
}

/** 主 API GET/POST 请求。POST 的参数放入 JSON body，避免敏感信息进入 URL */
export async function mainApi<T = Record<string, unknown>>(
  path: string,
  params: Record<string, unknown> = {},
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)
  try {
    const base = requireMainApiBase()
    // 接口缓存 2 分钟：所有请求都追加时间戳保证 URL 唯一，避免拿到过期缓存
    let url: string
    let init: RequestInit
    if (method === 'POST') {
      const body: Record<string, unknown> = { ...params }
      const cookie = getCookie()
      if (cookie) body.cookie = cookie
      body.timestamp = Date.now()
      url = `${base}${path}`
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    } else {
      const finalParams: Record<string, unknown> = { ...params, timestamp: Date.now() }
      const query = buildQuery(finalParams)
      url = `${base}${path}${query ? `?${query}` : ''}`
      init = { method: 'GET', signal: controller.signal }
    }
    const res = await fetch(url, init)
    return (await parseBody(res)) as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(-1, '请求超时，请检查网络后重试')
    }
    throw new ApiError(-1, '网络异常，请稍后重试')
  } finally {
    clearTimeout(timer)
  }
}

/** OuterAPI 请求（全部为 POST JSON；必带 ip，不带 timestamp） */
export async function outerApi<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const payload: Record<string, unknown> = { ip: OUTER_IP, ...body }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)
  try {
    const res = await fetch(`${OUTER_API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const json = (await res.json()) as Record<string, unknown>
    const code = typeof json.code === 'number' ? json.code : res.status
    if (code !== 200) {
      throw new ApiError(code, String(json.message || `OuterAPI 请求失败（${code}）`))
    }
    return json as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(-1, 'OuterAPI 请求超时')
    }
    throw new ApiError(-1, 'OuterAPI 网络异常')
  } finally {
    clearTimeout(timer)
  }
}
