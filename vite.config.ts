/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
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
