/**
 * NextMusic 桌面主进程。
 *
 * 安全基线：contextIsolation + sandbox + 禁 nodeIntegration；协议处理器防路径穿越；
 * 外链一律走系统浏览器（deny 新窗口）；仅放行 media 权限（音频设备枚举需要）。
 */
import { app, BrowserWindow, ipcMain, protocol, session, shell } from 'electron'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { startApiServer, probeFreePort } from './apiServer'

/** app 协议承载 dist 静态资源（standard+secure 使其成为安全上下文，fetch/媒体可用）；必须 ready 前注册 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

// 桌面端放宽自动播放策略（纯 Web 版依赖用户手势，桌面版无此限制）
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// 单实例：防止双开导致两份内嵌 API 服务与共享 tmpdir 引导文件竞争
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

// dist 定位基于编译产物自身位置（electron/dist/main.cjs 的上两级），
// 打包后 __dirname 位于 app.asar 内同样成立；app.getAppPath() 在非打包直启时
// 返回脚本目录（electron/dist）而非仓库根，会导致 404 白屏
const DIST_DIR = path.resolve(__dirname, '../../dist')
const MAIN_API_BASE_FLAG = '--nextmusic-main-api-base='

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

/** app://nextmusic/<path> → dist/<path>；无扩展名回退 index.html（SPA 路由），防路径穿越 */
function serveDist(request: Request): Promise<Response> {
  let urlPath: string
  try {
    urlPath = decodeURIComponent(new URL(request.url).pathname)
  } catch {
    return Promise.resolve(new Response('Bad Request', { status: 400 }))
  }
  const filePath = path.normalize(path.join(DIST_DIR, urlPath))
  if (!filePath.startsWith(DIST_DIR + path.sep) && filePath !== DIST_DIR) {
    return Promise.resolve(new Response('Forbidden', { status: 403 }))
  }
  const hasExtension = path.extname(filePath) !== ''
  return readFile(filePath)
    .then((body) => new Response(body, { headers: { 'content-type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream' } }))
    .catch(() => {
      if (hasExtension) return new Response('Not Found', { status: 404 })
      // SPA 回退：非资源路径一律交 index.html（等价 vercel rewrites）
      return readFile(path.join(DIST_DIR, 'index.html'))
        .then((body) => new Response(body, { headers: { 'content-type': MIME_TYPES['.html'] } }))
        .catch(() => new Response('Not Found', { status: 404 }))
    })
}

let mainWindow: BrowserWindow | null = null
let quitting = false

function createWindow(mainApiBase: string): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`${MAIN_API_BASE_FLAG}${mainApiBase}`],
    },
  })
  mainWindow = win

  // 外链一律走系统浏览器（含 SettingsView target=_blank 与下载 external 回退）
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  // 阻止页面内导航到外部地址
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('app://') || url === process.env.VITE_DEV_SERVER_URL
    if (!allowed) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  // 仅放行 media 权限：音频输出设备枚举/标签需要；其余默认拒绝
  const appSession = win.webContents.session
  appSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'media'))
  appSession.setPermissionCheckHandler((_wc, permission) => permission === 'media')

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadURL('app://nextmusic/index.html')
  }
  win.once('ready-to-show', () => win.show())
  // mac 关窗隐藏到后台（音乐继续播放），菜单栏/Dock 重新激活时显示
  win.on('close', (event) => {
    if (process.platform === 'darwin' && !quitting) {
      event.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
}

function focusExistingWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

app.on('second-instance', focusExistingWindow)

app.whenReady().then(async () => {
  protocol.handle('app', serveDist)

  ipcMain.handle('desktop:set-general-unblock', (_event, enabled: unknown) => {
    process.env.ENABLE_GENERAL_UNBLOCK = enabled === true ? 'true' : 'false'
    return enabled === true
  })

  let mainApiBase = ''
  try {
    const port = await probeFreePort()
    const handle = await startApiServer(port)
    mainApiBase = `http://127.0.0.1:${handle.port}`
  } catch (err) {
    // 启动失败仍开窗：渲染层三级解析兜底报「本地 API 服务未就绪」
    console.error('[nextmusic] 内嵌 API 服务启动失败', err)
  }
  createWindow(mainApiBase)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(mainApiBase)
    } else {
      focusExistingWindow()
    }
  })
})

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  // darwin 关窗仅隐藏（见 createWindow close 拦截），理论上不触发；其余平台退出
  if (process.platform !== 'darwin') app.quit()
})
