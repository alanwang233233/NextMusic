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
