/**
 * 桌面打包编排：强制置空 VITE_MAIN_API（防维护者私有 API 地址进入公开分发产物）
 * → Web 构建 → Electron 主进程/预加载打包 → electron-builder（参数透传）。
 */
import { spawn } from 'node:child_process'
import process from 'node:process'

// 进程 env 优先于 .env.local：置空后 dist 中的回退地址为空（本地服务兜底文案接管）
process.env.VITE_MAIN_API = ''

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} 退出码 ${code}`))))
    child.on('error', reject)
  })
}

await run('npm', ['run', 'build'])
await run('npm', ['run', 'desktop:build:electron'])

const builderArgs = ['electron-builder', '--publish', 'never', ...process.argv.slice(2)]
await run('npx', builderArgs)
