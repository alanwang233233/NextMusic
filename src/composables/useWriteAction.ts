import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

/**
 * 包一层写操作：游客 / 虚拟登录模式下拦截并弹出提示。
 * 返回 true 表示已放行（可继续执行真正的写请求）。
 */
export function guardWrite(): boolean {
  const auth = useAuthStore()
  const toast = useToastStore()
  try {
    return auth.assertWrite()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '写入操作不可用')
    return false
  }
}
