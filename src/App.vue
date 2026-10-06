<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppShell from '@/components/layout/AppShell.vue'
import ToastHost from '@/components/ui/ToastHost.vue'

// 尽早初始化 auth（将 cookie 提供函数接入 http 层）
useAuthStore()

const route = useRoute()
const isLoginRoute = computed(() => route.name === 'login')
</script>

<template>
  <RouterView v-if="isLoginRoute" />
  <AppShell v-else />
  <ToastHost />
</template>
