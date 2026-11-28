/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_MAIN_API?: string
  readonly VITE_OUTER_API?: string
  /** OuterAPI 必带的 ip 参数（缺省为会话内随机中国 IP） */
  readonly VITE_OUTER_IP?: string
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
}

interface Window {
  nextmusicDesktop?: DesktopBridge
}
