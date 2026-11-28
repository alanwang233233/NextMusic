<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import AppShell from '@/components/layout/AppShell.vue'
import ToastHost from '@/components/ui/ToastHost.vue'

// 尽早初始化 auth（将 cookie 提供函数接入 http 层）
useAuthStore()
// 桌面环境绑定主 API 覆盖 provider 并同步解灰初值（纯 Web 无桥接，空操作）
useSettingsStore().bindDesktopBridge()

const route = useRoute()
const isLoginRoute = computed(() => route.name === 'login')
</script>

<template>
  <RouterView v-if="isLoginRoute" />
  <AppShell v-else />
  <ToastHost />
</template>
