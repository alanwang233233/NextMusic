/**
 * 内嵌 api-enhanced 本地服务（主进程）。
 *
 * 端口由 main 进程先行探测后传入（serveNcmApi 内部 `Number(options.port || …)`
 * 对 0 falsy 回退 3000，绝不能传 0）。启动顺序对齐上游 app.js：
 * 设解灰 env → 加载包主入口（其 main.js 会在模块加载期预建空 anonymous_token，
 * 避免 server.js 加载期 ENOENT）→ generateConfig 引导（匿名 token / xeapi key /
 * neapiKey，各自内部 try/catch，离线不阻塞启动）→ serveNcmApi。
 */
import net from 'node:net'
import { createRequire } from 'node:module'
import type { Server } from 'node:http'

export interface ApiServerHandle {
  port: number
  close(): Promise<void>
}

interface NcmApiModule {
  serveNcmApi(options: { port: number; host?: string; checkVersion?: boolean }): Promise<{
    server: Server
  }>
}

/** createRequire 走 CJS 加载（包为 CJS，module.exports 含 getter，ESM 命名导出检测不可靠） */
const requireCjs = createRequire(__filename)

/** 等待 server 进入 listening（serveNcmApi 返回时 listen 已调用但未必就绪） */
function waitForListening(server: Server, timeoutMs = 10_000): Promise<void> {
  if (server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('本地 API 服务监听超时'))
    }, timeoutMs)
    const onListening = (): void => {
      cleanup()
      resolve()
    }
    const onError = (err: Error): void => {
      cleanup()
      reject(err)
    }
    function cleanup(): void {
      clearTimeout(timer)
      server.off('listening', onListening)
      server.off('error', onError)
    }
    server.once('listening', onListening)
    server.once('error', onError)
  })
}

async function startOnce(port: number): Promise<ApiServerHandle> {
  // 解灰开关：server.js 每请求读取该 env，IPC 可运行时热切换
  process.env.ENABLE_GENERAL_UNBLOCK = 'true'

  const ncmApi = requireCjs('@neteasecloudmusicapienhanced/api') as NcmApiModule
  const generateConfig = requireCjs('@neteasecloudmusicapienhanced/api/generateConfig') as () => Promise<void>
  // 上游 app.js 同源引导；失败不阻塞（文件可能已存在或离线）
  await generateConfig().catch((err: unknown) => console.warn('[nextmusic] API 引导失败（将继续启动）', err))

  const appExt = await ncmApi.serveNcmApi({ port, host: '127.0.0.1', checkVersion: false })
  await waitForListening(appExt.server)
  const address = appExt.server.address()
  if (!address || typeof address === 'string') {
    throw new Error('本地 API 服务地址异常')
  }
  const realPort = address.port
  console.info(`[nextmusic] 本地 API 服务已启动：http://127.0.0.1:${realPort}`)
  return {
    port: realPort,
    close: () =>
      new Promise<void>((resolve) => {
        appExt.server.close(() => resolve())
      }),
  }
}

/** 启动内嵌 API 服务（失败重试 1 次，仍失败抛出由调用方决定降级） */
export async function startApiServer(port: number): Promise<ApiServerHandle> {
  try {
    return await startOnce(port)
  } catch (err) {
    console.warn('[nextmusic] 本地 API 服务启动失败，重试一次', err)
    return startOnce(port)
  }
}

/** 探测空闲回环端口（不可给 serveNcmApi 传 0：其内部 falsy 回退 3000） */
export function probeFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = address && typeof address !== 'string' ? address.port : 0
      server.close(() => (port ? resolve(port) : reject(new Error('端口探测失败'))))
    })
  })
}
