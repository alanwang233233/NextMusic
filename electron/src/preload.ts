/**
 * 预加载脚本（sandbox 模式，仅 contextBridge + ipcRenderer）。
 * 经 additionalArguments 接收主进程内嵌 API 地址，同步 string 注入渲染层，
 * 保证渲染层既有同步链路（requireMainApiBase / main302Url）无需异步化。
 * 登录态快照在 preload 阶段经 sendSync 一次性取回（早于任何渲染层脚本执行）。
 */
import { contextBridge, ipcRenderer } from 'electron'

const MAIN_API_BASE_FLAG = '--nextmusic-main-api-base='

const flag = process.argv.find((arg) => arg.startsWith(MAIN_API_BASE_FLAG))
const mainApiBase = flag ? flag.slice(MAIN_API_BASE_FLAG.length) : ''

const persistedAuthRaw = (() => {
  try {
    return ipcRenderer.sendSync('desktop:auth-get') as unknown
  } catch {
    return null
  }
})()

const persistedAuth = (() => {
  if (typeof persistedAuthRaw !== 'string' || !persistedAuthRaw) return undefined
  try {
    return JSON.parse(persistedAuthRaw)
  } catch {
    return undefined
  }
})()

contextBridge.exposeInMainWorld('nextmusicDesktop', {
  mainApiBase,
  persistedAuth,
  setGeneralUnblock: (enabled: boolean) => ipcRenderer.invoke('desktop:set-general-unblock', enabled),
  setPersistedAuth: (data: unknown) => ipcRenderer.invoke('desktop:auth-set', JSON.stringify(data)),
})
