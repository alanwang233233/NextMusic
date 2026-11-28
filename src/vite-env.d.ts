/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_MAIN_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** 构建期注入的当前提交短哈希（vite define；git 不可用时为 unknown） */
declare const __APP_COMMIT__: string

/**
 * Electron 桌面版由 preload 注入的桥接（纯 Web 环境不存在该对象）。
 * mainApiBase 为本地 api-enhanced 服务地址；服务启动失败时为空串。
 */
interface DesktopBridge {
  mainApiBase: string
  setGeneralUnblock(enabled: boolean): Promise<boolean>
  /** 主进程持久化的登录态快照（启动期同步注入；纯 Web / 无快照时为 undefined） */
  persistedAuth?: unknown
  /** 登录态镜像到主进程文件（userData/nextmusic-auth.json）；载荷为 JSON 字符串 */
  setPersistedAuth(raw: string): Promise<boolean>
}

interface Window {
  nextmusicDesktop?: DesktopBridge
}
