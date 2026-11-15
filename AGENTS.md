# AGENTS.md — NextMusic

纯客户端（无自建后端）网易云音乐 SPA：Vue 3 `<script setup>` + TypeScript strict + Tailwind CSS 3.4 + Pinia + vue-router，Vite 构建，部署于 Vercel（`vercel.json` 含 SPA rewrites）。UI 文案、提交信息、README 均为中文。

## 常用命令

```bash
npm run dev          # 开发服务器
npm run build        # vue-tsc -b && vite build（提交前必须通过）
npm run typecheck    # 仅类型检查
npm run test         # Vitest：tests/unit + tests/components
npm run test:e2e     # Playwright E2E（先 npm run build！preview 服务的是 dist）
npm run test:visual  # 视觉截图（同样依赖最新 dist）
```

- 环境变量：复制 `.env.example` 为 `.env.local`。`VITE_MAIN_API` **必填**（缺失时 `requireMainApiBase()` 直接抛错）；`VITE_OUTER_API`、`VITE_OUTER_IP` 可选。
- 无 ESLint/Prettier 配置，`vue-tsc` 即代码质量门禁。

## 分层与边界

- `src/api/` 是唯一网络层。`mainApi()`：GET 参数进 query、POST 参数进 **JSON body**（密码不得出现在 URL）；**所有请求都追加 `timestamp`**（主 API 有 2 分钟同 URL 缓存）；登录 cookie 由 `bindCookieProvider` 注入（GET 走 query、POST 走 body），因为主 API 的 CORS 是 `origin: *` + allow-credentials 的矛盾组合，浏览器拒绝携带凭据。
- 非业务 200 的 code 一律抛 `ApiError`——例外用 `mainApi` 的 `acceptCodes` 选项放行（如 `/login/qr/check` 用 body.code 800/801/802/803 表达扫码状态且 HTTP 仍为 200；漏放行会丢掉 803 返回的 cookie，表现为“提示登录成功但不跳转”）。
- `src/player/engine.ts` 播放降级链：预缓存命中 → `/song/url/v1/302`（302 端点，携带 cookie 与 timestamp）→ OuterAPI。改动链路必须同步 `tests/unit/engine-chain.spec.ts` 与 `tests/e2e/mocks.ts`。
- `src/api/outer.ts`：OuterAPI 全部为 POST JSON，**必带 `ip` 参数**（缺失即 400）、**不带 timestamp**；限流严格，失败按 1s/2s/4s/8s/16s 指数退避最多重试 5 次。OuterAPI 仅允许用于播放降级（及预缓存），其他功能未经用户确认不得引入。
- `src/player/precache.ts` 下一曲预缓存：store 在播放进度 ≥50% 时触发一次。候选链为「主 API JSON 直链（fetch 整段音频为 Blob，数据级缓存）→ 302 端点（媒体元素流兜底，fetch 会被风控拒绝 -460）→ OuterAPI 直链（同样 Blob 化）」；命中后引擎第 0 步直接用 blob: URL——**切歌零网络请求**。JSON 返回试听片段（freeTrialInfo）直接跳过该候选；blob 最多保留 2 代（播放中 + 刚切走的），更早的自动 revoke。
- **播放列表语义**（易错）：`playQueue(list, index)` 只用于显式“以该列表为上下文”（播放全部按钮、心动模式、FM）；歌单详情等处**单击歌曲走 `playSongNow(song, context)`（就位播放，不替换既有队列）**，但**空队列时必须传入浏览上下文**以上下文建立整个列表——否则单曲队列回绕自预载当前曲，预缓存失效（曾有此回归）；上一首/下一首跟随 `player.queue`（QueueDrawer 内容），不得被浏览中的歌单静默替换。
- `fetchSongsDetail`（`src/api/playlist.ts`）按 `SONG_DETAIL_CHUNK_SIZE`（500）分块请求 `/song/detail`；歌单全量歌曲按 trackIds 分块渐进加载，**不得加 slice 截断**（曾有 >1000 首只显示前 1000 的缺陷）。
- 键盘快捷键在 `src/composables/useKeyboardShortcuts.ts`（AppShell 注册）：**捕获阶段**监听 window；空格按 code/key/keyCode 三重匹配（输入法环境 code 缺失）；输入框/可编辑元素聚焦时全部让位。
- 相似歌手接口 `/simi/artist` 需**正式登录**（游客 cookie 同样 301）；未登录态由 ArtistView 展示登录引导，勿改为匿名调用。
- `src/stores/auth.ts`：登录态 `user | guest | virtual | none`；写操作（喜欢/收藏/歌单编辑/FM 垃圾桶）必须先过 `assertWrite()` / `guardWrite()`（`src/composables/useWriteAction.ts`），游客与虚拟模式一律拦截；**下载不属于写操作**，各模式均放行。
- 路由守卫在 `src/router/index.ts`（`meta.requiresUser` → 跳登录页）。

## 硬性约定

- **禁止 emoji**：所有图标走 `src/components/ui/AppIcon.vue` 的内联 SVG（新增图标在其 ICONS 表中加静态字符串）。
- 红色主题：Tailwind `primary` 色阶（红），深色 zinc 背景；主题扩展在 `tailwind.config.cjs`。
- 提交信息用 Conventional Commits（中文描述），参照 `git log` 现有风格；破坏性改动加 `!` 与 BREAKING CHANGE。

## 测试要点（易踩坑）

- `tests/setup.ts` 内存 polyfill 了 localStorage——Node ≥22 的实验性全局 localStorage 会遮蔽 jsdom 的实现，不要删除该 polyfill。
- 组件测试一律 `vi.mock('@/player/engine')`（替换 `getEngine` 为 stub），否则 jsdom 的 HTMLMediaElement 会报未实现噪音。
- `vi.mock` 工厂会被提升到文件顶部：工厂内**不能引用其下方定义的顶层常量**（内联字面量）；需要保留真实模块时用 `importOriginal` 部分 mock（如 mock `vue-router` 的 useRoute/useRouter 时保留 createRouter）。工厂 mock 的实现会跨用例残留，多个用例用不同数据时在 `beforeEach` 显式重置 `mockImplementation`。
- Playwright E2E 在 `tests/e2e/mocks.ts` mock 了全部 API 域名（无真实外呼）：
  - 路由匹配是**后注册优先**：兜底 catch-all 必须最先注册。
  - 302 mock 的 `Location` 必须用**页面 origin**（`route.request().frame().url()`）；用被拦截请求的 origin（API 域名）会让媒体加载落进 catch-all 而降级。
  - Playwright `route.fulfill` 的 302 不会被媒体元素跟随（生产浏览器会），mock 下 main302 一律升级到 OuterAPI——断言请按 `outerCallsById` 分歌曲 id 统计。
  - `**/song/url/v1*`（JSON 直链，供预缓存 Blob 化）须**先注册**，`**/song/url/v1/302*` 后注册以更高优先级接管 302 路径；切歌零请求的断言按 `songJsonCallsById` / `outerCallsById` 分歌曲 id 统计。
  - `fixtures/tone.wav` 为 10 秒；mock 歌曲的 `dt` 必须保持 <30s，否则 `isTooShort` 试听判定会推进降级链。
- E2E/视觉测试跑的是 `vite preview` 服务的 `dist`，改完源码先 `npm run build` 再跑，否则测的是旧构建。

## 参考文档

- `docs/mainAPI.md` — 主 API 全量接口文档（登录/歌单/播放/歌词等）。
- `docs/OuterAPI.md` + `docs/OuterAPI-openapi.yaml` — OuterAPI（getSongUrl/getSongInfo 等）。
