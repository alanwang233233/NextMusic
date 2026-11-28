/**
 * 预加载脚本（sandbox 模式，仅 contextBridge + ipcRenderer）。
 * 经 additionalArguments 接收主进程内嵌 API 地址，同步 string 注入渲染层，
 * 保证渲染层既有同步链路（requireMainApiBase / main302Url）无需异步化。
 */
import { contextBridge, ipcRenderer } from 'electron'

const MAIN_API_BASE_FLAG = '--nextmusic-main-api-base='

const flag = process.argv.find((arg) => arg.startsWith(MAIN_API_BASE_FLAG))
const mainApiBase = flag ? flag.slice(MAIN_API_BASE_FLAG.length) : ''

contextBridge.exposeInMainWorld('nextmusicDesktop', {
  mainApiBase,
  setGeneralUnblock: (enabled: boolean) => ipcRenderer.invoke('desktop:set-general-unblock', enabled),
})
