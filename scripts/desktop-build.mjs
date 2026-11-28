/**
 * 桌面打包编排：强制置空 VITE_MAIN_API（防维护者私有 API 地址进入公开分发产物）
 * → Web 构建 → Electron 主进程/预加载打包 → electron-builder（参数透传）。
 */
import { spawn } from 'node:child_process'
import process from 'node:process'

// 进程 env 优先于 .env.local：置空后 dist 中的回退地址为空（本地服务兜底文案接管）
process.env.VITE_MAIN_API = ''

// Windows 上 npm/npx 是 .cmd shim：Node ≥20.12（CVE-2024-27980 缓解）对 .cmd
// 无 shell spawn 直接抛 EINVAL，必须 shell:true 由 shell 走 PATHEXT 解析裸名。
// 全参数均为本脚本内固定字面量，无 shell 注入面。
const shell = true
const npmCmd = 'npm'
const npxCmd = 'npx'

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env, shell })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} 退出码 ${code}`))))
    child.on('error', reject)
  })
}

await run(npmCmd, ['run', 'build'])
await run(npmCmd, ['run', 'desktop:build:electron'])

const builderArgs = ['electron-builder', '--publish', 'never', ...process.argv.slice(2)]
await run(npxCmd, builderArgs)
