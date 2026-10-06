import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录' } },
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: '发现' } },
  { path: '/search', name: 'search', component: () => import('@/views/SearchView.vue'), meta: { title: '搜索' } },
  { path: '/daily', name: 'daily', component: () => import('@/views/DailyView.vue'), meta: { title: '每日推荐', requiresUser: true } },
  { path: '/fm', name: 'fm', component: () => import('@/views/FMView.vue'), meta: { title: '私人FM', requiresUser: true } },
  { path: '/playlist/:id(\\d+)', name: 'playlist', component: () => import('@/views/PlaylistDetailView.vue'), meta: { title: '歌单' } },
  { path: '/album/:id(\\d+)', name: 'album', component: () => import('@/views/AlbumDetailView.vue'), meta: { title: '专辑' } },
  { path: '/artist/:id(\\d+)', name: 'artist', component: () => import('@/views/ArtistView.vue'), meta: { title: '歌手' } },
  { path: '/user/:id(\\d+)', name: 'user', component: () => import('@/views/UserView.vue'), meta: { title: '用户' } },
  { path: '/me', name: 'me', component: () => import('@/views/MeView.vue'), meta: { title: '我的音乐' } },
  { path: '/liked', name: 'liked', component: () => import('@/views/LikedView.vue'), meta: { title: '喜欢的音乐' } },
  { path: '/recent', name: 'recent', component: () => import('@/views/RecentView.vue'), meta: { title: '最近播放' } },
  { path: '/library', name: 'library', component: () => import('@/views/LibraryView.vue'), meta: { title: '收藏' } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { title: '页面不存在' } },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${String(to.meta.title)} - NextMusic` : 'NextMusic'
})

router.beforeEach((to) => {
  if (to.meta.requiresUser) {
    const auth = useAuthStore()
    if (auth.mode !== 'user') {
      const toast = useToastStore()
      toast.info('该功能需要登录后使用')
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  }
  return true
})
