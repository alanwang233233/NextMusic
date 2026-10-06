<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { qrKey, qrCreate, qrCheck } from '@/api/auth'
import type { UserProfile } from '@/types/models'
import AppIcon from '@/components/ui/AppIcon.vue'
import LazyImage from '@/components/ui/LazyImage.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const toast = useToastStore()

type Tab = 'phone' | 'email' | 'qr' | 'virtual'

const tab = ref<Tab>('phone')
const submitting = ref(false)

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'phone', label: '手机登录', icon: 'phone' },
  { key: 'email', label: '邮箱登录', icon: 'mail' },
  { key: 'qr', label: '扫码登录', icon: 'qr-code' },
  { key: 'virtual', label: '虚拟登录', icon: 'user' },
]

// 手机登录
const phoneMethod = ref<'password' | 'captcha'>('password')
const phone = ref('')
const phonePassword = ref('')
const phoneCaptcha = ref('')
const countrycode = ref('86')
const captchaCountdown = ref(0)
let captchaTimer: number | undefined

// 邮箱登录
const email = ref('')
const emailPassword = ref('')

// 二维码
const qrImg = ref('')
const qrStatus = ref<'idle' | 'loading' | 'waiting' | 'confirmed' | 'expired' | 'success'>('idle')
let qrTimer: number | undefined

// 虚拟登录
const virtualNickname = ref('')
const virtualSearching = ref(false)
const virtualCandidates = ref<UserProfile[]>([])
const virtualChosen = ref<UserProfile | null>(null)

const redirectTarget = computed(() => {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') ? target : '/'
})

function afterLogin(message: string) {
  toast.success(message)
  void router.replace(redirectTarget.value)
}

/* ---------- 手机登录 ---------- */
function selectTab(t: Tab) {
  tab.value = t
  if (t === 'qr' && qrStatus.value === 'idle') void refreshQr()
}

const captchaSending = ref(false)

async function sendCaptcha() {
  if (captchaSending.value || captchaCountdown.value > 0) return
  if (!/^1\d{10}$/.test(phone.value.trim())) {
    toast.error('请输入正确的手机号码')
    return
  }
  captchaSending.value = true
  try {
    await import('@/api/auth').then(({ captchaSent }) => captchaSent(phone.value.trim(), countrycode.value))
    toast.success('验证码已发送')
    captchaCountdown.value = 60
    captchaTimer = window.setInterval(() => {
      captchaCountdown.value--
      if (captchaCountdown.value <= 0) window.clearInterval(captchaTimer)
    }, 1000)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '验证码发送失败')
  } finally {
    captchaSending.value = false
  }
}

async function submitPhone() {
  if (!phone.value.trim()) {
    toast.error('请输入手机号码')
    return
  }
  if (!/^1\d{10}$/.test(phone.value.trim())) {
    toast.error('请输入正确的手机号码')
    return
  }
  if (phoneMethod.value === 'password' && !phonePassword.value) {
    toast.error('请输入密码')
    return
  }
  if (phoneMethod.value === 'captcha' && !phoneCaptcha.value) {
    toast.error('请输入验证码')
    return
  }
  submitting.value = true
  try {
    await auth.loginCellphone({
      phone: phone.value.trim(),
      countrycode: countrycode.value,
      password: phoneMethod.value === 'password' ? phonePassword.value : undefined,
      captcha: phoneMethod.value === 'captcha' ? phoneCaptcha.value.trim() : undefined,
    })
    afterLogin(`欢迎回来，${auth.profile?.nickname || '用户'}`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '登录失败')
  } finally {
    submitting.value = false
  }
}

/* ---------- 邮箱登录 ---------- */
async function submitEmail() {
  if (!email.value.trim() || !emailPassword.value) {
    toast.error('请输入邮箱和密码')
    return
  }
  submitting.value = true
  try {
    await auth.loginEmail({ email: email.value.trim(), password: emailPassword.value })
    afterLogin(`欢迎回来，${auth.profile?.nickname || '用户'}`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '登录失败')
  } finally {
    submitting.value = false
  }
}

/* ---------- 二维码登录 ---------- */
async function refreshQr() {
  qrStatus.value = 'loading'
  qrImg.value = ''
  window.clearInterval(qrTimer)
  try {
    const key = await qrKey()
    const { qrimg } = await qrCreate(key)
    qrImg.value = qrimg || ''
    qrStatus.value = 'waiting'
    qrTimer = window.setInterval(async () => {
      const check = await qrCheck(key)
      if (check.code === 803) {
        window.clearInterval(qrTimer)
        qrStatus.value = 'success'
        await auth.loginWithCookieAndProfile(check.cookie, undefined)
        const { fetchAccount } = await import('@/api/auth')
        await fetchAccount().then((acc) => {
          if (acc.profile) auth.profile = acc.profile
        }).catch(() => undefined)
        afterLogin(`扫码成功，${auth.profile?.nickname || '欢迎回来'}`)
      } else if (check.code === 802) {
        qrStatus.value = 'confirmed'
      } else if (check.code === 800) {
        window.clearInterval(qrTimer)
        qrStatus.value = 'expired'
      }
    }, 2500)
  } catch (err) {
    qrStatus.value = 'expired'
    toast.error(err instanceof Error ? err.message : '二维码生成失败')
  }
}

/* ---------- 虚拟登录 ---------- */
async function searchVirtual() {
  const nickname = virtualNickname.value.trim()
  if (!nickname) {
    toast.error('请输入用户昵称')
    return
  }
  virtualSearching.value = true
  virtualCandidates.value = []
  virtualChosen.value = null
  try {
    const candidates = await auth.searchVirtualCandidates(nickname)
    if (!candidates.length) {
      toast.error('未找到该用户，请确认昵称')
      return
    }
    virtualCandidates.value = candidates
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '搜索失败')
  } finally {
    virtualSearching.value = false
  }
}

async function confirmVirtual(candidate: UserProfile) {
  try {
    await auth.chooseVirtualUser(candidate)
    toast.success(`已以「${auth.virtualUser?.nickname}」的公开数据浏览（只读）`)
    void router.replace(redirectTarget.value)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '虚拟登录失败')
  }
}

/* ---------- 游客登录 ---------- */
async function guestLogin() {
  submitting.value = true
  try {
    await auth.guestLogin()
    toast.success('已进入游客模式（部分功能不可用）')
    void router.replace(redirectTarget.value)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '游客登录失败')
  } finally {
    submitting.value = false
  }
}

onBeforeUnmount(() => {
  window.clearInterval(qrTimer)
  window.clearInterval(captchaTimer)
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-gradient-to-b from-zinc-950 via-primary-950/20 to-zinc-950 px-4 py-10">
    <div class="w-full max-w-md">
      <!-- 品牌区 -->
      <div class="mb-8 text-center">
        <span class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-xl shadow-primary-950/70">
          <AppIcon name="disc" :size="30" />
        </span>
        <h1 class="text-2xl font-bold tracking-wide text-white">NextMusic</h1>
        <p class="mt-1.5 text-xs text-zinc-500">支持手机、邮箱、扫码、虚拟登录与游客模式</p>
      </div>

      <div class="card-surface border-zinc-800 p-6 shadow-2xl shadow-black/40" data-testid="login-card">
        <!-- Tab 切换 -->
        <div class="mb-5 grid grid-cols-4 gap-1 rounded-xl bg-zinc-900 p-1">
          <button
            v-for="t in TABS"
            :key="t.key"
            class="flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] transition"
            :class="tab === t.key ? 'bg-primary-600 text-white shadow' : 'text-zinc-400 hover:text-white'"
            :data-testid="`tab-${t.key}`"
            @click="selectTab(t.key)"
          >
            <AppIcon :name="t.icon" :size="16" />
            {{ t.label }}
          </button>
        </div>

        <!-- 手机登录 -->
        <form v-if="tab === 'phone'" class="space-y-3.5" @submit.prevent="submitPhone">
          <div class="flex gap-2 text-xs">
            <button
              type="button"
              class="flex-1 rounded-full py-1.5 transition"
              :class="phoneMethod === 'password' ? 'bg-primary-600/20 text-primary-400' : 'bg-zinc-900 text-zinc-500'"
              @click="phoneMethod = 'password'"
            >
              密码登录
            </button>
            <button
              type="button"
              class="flex-1 rounded-full py-1.5 transition"
              :class="phoneMethod === 'captcha' ? 'bg-primary-600/20 text-primary-400' : 'bg-zinc-900 text-zinc-500'"
              @click="phoneMethod = 'captcha'"
            >
              验证码登录
            </button>
          </div>
          <div class="flex gap-2">
            <input v-model="countrycode" class="field-input !w-20 text-center" placeholder="+86" aria-label="国家码" />
            <input v-model="phone" class="field-input flex-1" placeholder="手机号码" inputmode="numeric" aria-label="手机号码" />
          </div>
          <input
            v-if="phoneMethod === 'password'"
            v-model="phonePassword"
            type="password"
            class="field-input"
            placeholder="密码"
            aria-label="密码"
          />
          <div v-else class="flex gap-2">
            <input v-model="phoneCaptcha" class="field-input flex-1" placeholder="验证码" inputmode="numeric" aria-label="验证码" />
            <button
              type="button"
              class="btn-secondary shrink-0 !px-4 text-xs"
              :disabled="captchaCountdown > 0 || captchaSending"
              @click="sendCaptcha"
            >
              {{ captchaCountdown > 0 ? `${captchaCountdown}s` : captchaSending ? '发送中' : '发送验证码' }}
            </button>
          </div>
          <button type="submit" class="btn-primary w-full" :disabled="submitting" data-testid="submit-phone">
            {{ submitting ? '登录中' : '登 录' }}
          </button>
        </form>

        <!-- 邮箱登录 -->
        <form v-else-if="tab === 'email'" class="space-y-3.5" @submit.prevent="submitEmail">
          <input v-model="email" type="email" class="field-input" placeholder="网易邮箱" aria-label="邮箱" />
          <input v-model="emailPassword" type="password" class="field-input" placeholder="密码" aria-label="密码" />
          <button type="submit" class="btn-primary w-full" :disabled="submitting" data-testid="submit-email">
            {{ submitting ? '登录中' : '登 录' }}
          </button>
        </form>

        <!-- 扫码登录 -->
        <div v-else-if="tab === 'qr'" class="flex flex-col items-center gap-3 py-2" data-testid="qr-panel">
          <div class="flex h-44 w-44 items-center justify-center rounded-xl bg-white p-2">
            <img v-if="qrImg && qrStatus !== 'expired'" :src="qrImg" alt="登录二维码" class="h-full w-full" />
            <div v-else-if="qrStatus === 'expired'" class="flex flex-col items-center gap-2 text-zinc-500">
              <AppIcon name="refresh" :size="22" />
              <span class="text-xs">二维码已过期</span>
            </div>
            <div v-else class="h-full w-full animate-pulse rounded bg-zinc-200" />
          </div>
          <p class="text-xs text-zinc-400" data-testid="qr-status">
            {{
              qrStatus === 'success'
                ? '登录成功'
                : qrStatus === 'confirmed'
                  ? '已扫码，请在手机上确认'
                  : qrStatus === 'expired'
                    ? '二维码已过期'
                    : qrStatus === 'loading'
                      ? '正在生成二维码'
                      : '请使用网易云音乐 APP 扫码'
            }}
          </p>
          <button class="btn-secondary !px-4 !py-1.5 text-xs" @click="refreshQr">
            <AppIcon name="refresh" :size="13" />
            刷新二维码
          </button>
        </div>

        <!-- 虚拟登录 -->
        <div v-else class="space-y-3.5" data-testid="virtual-panel">
          <p class="rounded-lg bg-zinc-900 px-3 py-2 text-[11px] leading-5 text-zinc-400">
            输入昵称获取该用户的公开信息与歌单，仅可浏览；所有写入操作不可用。
          </p>
          <form class="flex gap-2" @submit.prevent="searchVirtual">
            <input v-model="virtualNickname" class="field-input flex-1" placeholder="用户昵称" aria-label="用户昵称" />
            <button type="submit" class="btn-primary shrink-0 !px-4 text-xs" :disabled="virtualSearching">
              {{ virtualSearching ? '搜索中' : '搜索' }}
            </button>
          </form>
          <div v-if="virtualCandidates.length" class="max-h-56 space-y-2 overflow-y-auto pr-1">
            <button
              v-for="c in virtualCandidates"
              :key="c.userId"
              class="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-left transition hover:border-primary-600"
              @click="confirmVirtual(c)"
            >
              <LazyImage :src="c.avatarUrl" :size="60" rounded="rounded-full" class="h-10 w-10" />
              <span class="min-w-0">
                <span class="block truncate text-sm text-white">{{ c.nickname }}</span>
                <span class="text-[11px] text-zinc-500">ID: {{ c.userId }}</span>
              </span>
              <AppIcon name="chevron-right" :size="16" class="ml-auto text-zinc-600" />
            </button>
          </div>
        </div>
      </div>

      <!-- 游客登录 -->
      <button
        class="btn-secondary mt-4 w-full"
        :disabled="submitting"
        data-testid="guest-login"
        @click="guestLogin"
      >
        <AppIcon name="log-in" :size="15" />
        游客模式进入
      </button>

      <p class="mt-5 text-center text-[11px] leading-5 text-zinc-600">
        本应用为纯客户端应用，登录凭证仅保存在本地浏览器。<br />请勿使用他人设备登录重要账号。
      </p>
    </div>
  </div>
</template>
