/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/** 构建期取当前提交短哈希，git 不可用（如浅克隆/无 git 环境）时回退 unknown */
function gitShortHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_COMMIT__: JSON.stringify(gitShortHash()),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.spec.ts', 'tests/components/**/*.spec.ts'],
    setupFiles: ['tests/setup.ts'],
    // 测试不产生真实网络请求，主 API 地址用无害占位符（真实地址仅存在于本地 .env.local）
    env: { VITE_MAIN_API: 'https://mainapi.test' },
  },
})
