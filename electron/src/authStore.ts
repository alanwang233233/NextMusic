/**
 * 登录态主进程持久化（userData/nextmusic-auth.json）。
 *
 * 背景：Windows 上杀软/权限问题可能令 Chromium 的 localStorage 每次退出即失
 * （leveldb 写入被拦截时 Chromium 回退内存 profile），登录态需在主进程侧用
 * 普通 fs 写入镜像兜底。渲染层 persist() 经 IPC 镜像到这里，启动时经
 * sendSync 同步回渲染层（desktop:auth-get 必须用 ipcMain.on 实现）。
 */
import { app, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const AUTH_FILE = 'nextmusic-auth.json'
/** 防御性上限：登录态仅 cookie + profile，正常远小于该值（同步注入走单条 IPC 消息） */
const MAX_JSON_LENGTH = 16_000

function authStorePath(): string {
  return path.join(app.getPath('userData'), AUTH_FILE)
}

/** 读取持久化快照（原始 JSON 字符串；无/超限/损坏返回 null） */
function loadAuthStore(): string | null {
  try {
    const raw = fs.readFileSync(authStorePath(), 'utf-8')
    if (!raw || raw.length > MAX_JSON_LENGTH) return null
    // 写入端已校验 JSON，读取端再防御一次
    JSON.parse(raw)
    return raw
  } catch {
    return null
  }
}

/** 原子写入（临时文件 + rename），仅接受合法 JSON 且不超过上限 */
function saveAuthStore(raw: unknown): boolean {
  try {
    if (typeof raw !== 'string' || raw.length > MAX_JSON_LENGTH) return false
    JSON.parse(raw)
    const target = authStorePath()
    const tmp = `${target}.tmp`
    fs.writeFileSync(tmp, raw, 'utf-8')
    fs.renameSync(tmp, target)
    return true
  } catch {
    return false
  }
}

/** 注册登录态持久化 IPC（app ready 后调用一次） */
export function registerAuthStoreIpc(): void {
  // sendSync 要求 ipcMain.on + event.returnValue（preload 启动期同步取快照）
  ipcMain.on('desktop:auth-get', (event) => {
    event.returnValue = loadAuthStore()
  })
  ipcMain.handle('desktop:auth-set', (_event, raw: unknown) => saveAuthStore(raw))
}
