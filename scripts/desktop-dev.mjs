/**
 * 桌面开发编排（零依赖）：起 vite dev server → 轮询就绪 → 以 electron 启动主进程。
 * 退出/信号时联动清理两个子进程。
 */
import { spawn } from 'node:child_process'
import process from 'node:process'

const VITE_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
const vitePort = new URL(VITE_URL).port || '5173'
const children = []

function run(command, args, env = {}) {
  const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env } })
  children.push(child)
  return child
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* 未就绪继续轮询 */
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`vite dev server 未在 ${timeoutMs}ms 内就绪：${url}`)
}

function cleanup() {
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
  }
}

process.on('SIGINT', () => {
  cleanup()
  process.exit(130)
})
process.on('SIGTERM', () => {
  cleanup()
  process.exit(143)
})

const vite = run('npx', ['vite', '--port', vitePort, '--strictPort'])
try {
  await waitForServer(VITE_URL)
} catch (err) {
  console.error(err)
  cleanup()
  process.exit(1)
}

// electron 在 node_modules devDependencies 中，直接用其可执行文件启动主进程
run('npx', ['electron', 'electron/dist/main.cjs'], { VITE_DEV_SERVER_URL: VITE_URL })

vite.on('exit', (code) => {
  cleanup()
  process.exit(code ?? 0)
})
