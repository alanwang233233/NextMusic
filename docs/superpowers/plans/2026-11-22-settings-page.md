# 设置页面实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/settings` 设置页：默认音质、默认下载音质（独立设置）、关于板块（应用名/仓库链接/当前提交），下载链路切到 `/song/download/url/v1` 的 `level` 参数。

**Architecture:** 复用现有 `stores/settings.ts`（localStorage 持久化）扩展 `downloadQuality`；`fetchDownloadUrl` 从旧 `br` 接口换成 v1 `level` 接口；设置页为纯本地偏好页（无新接口依赖，除下载链路外）。入口 = 侧边栏导航项 + 「我的音乐」快捷链接。

**Tech Stack:** Vue 3 `<script setup>` + TS strict + Pinia + vue-router + Tailwind；Vitest（jsdom）+ `@vue/test-utils`；vite `define` 构建期注入提交哈希。

**Spec:** `docs/superpowers/specs/2026-11-22-settings-page-design.md`

## Global Constraints

- 全站禁止 emoji，图标一律 `src/components/ui/AppIcon.vue` 内联 SVG（新增图标在 ICONS 表加静态字符串，lucide 风格描边）。
- UI 文案、提交信息均为中文；Conventional Commits（参照 `git log` 现有风格）。
- TS strict，`npm run typecheck` 即门禁；`npm run build`（vue-tsc -b && vite build）提交推送前必须通过。
- 组件测试一律 `vi.mock('@/player/engine')`（替换 `getEngine` 为 stub）——**SettingsView/SideBar 不引用播放引擎，无需该 mock**，但不得引入对引擎的依赖。
- `vi.mock` 工厂不能引用其下方定义的顶层常量（内联字面量）。
- 测试不产生真实网络请求（vitest env 已注入占位 `VITE_MAIN_API`）；localStorage 由 `tests/setup.ts` polyfill，每个用例前自动清空。
- E2E mock `**/song/url/v1*` 不会拦截新下载端点 `/song/download/url/v1`（路径不同），无需改 `tests/e2e/mocks.ts`；本计划不触碰播放降级链（engine.ts / 302 端点）。
- 下载不属于写操作，不经过 `assertWrite()`。

## Review Focus

1. 旧本地设置数据缺 `downloadQuality` 字段（升级用户）→ 必须回退 `'exhigh'`，且已有的 `quality` / `showTranslation` 不被覆盖。（Task 1 测试钉死）
2. localStorage 内容损坏（非法 JSON）→ 静默回退全部默认值，不抛错。（Task 1 测试钉死）
3. `__APP_COMMIT__` 注入失败（git 不可用/浅克隆）→ 关于板块显示 `unknown` 且不渲染指向 commit 页的死链。（Task 3 测试钉死）
4. 下载音质透传——`downloadSong` 必须把 level 字符串原样传给 `fetchDownloadUrl`，不得再经数字码率折叠。（Task 2 测试钉死）
5. 播放链路不受影响——`stores/player.ts` 对 `settings.quality` 的消费不变；Task 2 的验证步骤跑全量单测确认 `engine-chain` / `precache` / `player-store` 仍绿。

---

### Task 1: settings store 扩展 `downloadQuality` + 文档入库

**Files:**
- Modify: `src/stores/settings.ts`
- Create: `tests/unit/settings-store.spec.ts`
- Commit（步骤 1 一并入库）: `docs/superpowers/specs/2026-11-22-settings-page-design.md`、`docs/superpowers/plans/2026-11-22-settings-page.md`

**Interfaces:**
- Produces: `useSettingsStore().downloadQuality: QualityLevel`（默认 `'exhigh'`）、`setDownloadQuality(quality: QualityLevel): void`；持久化 key 仍为 `nextmusic.settings`，字段 `quality` / `downloadQuality` / `showTranslation`。

- [ ] **Step 1: 提交设计稿与计划**

```bash
git add docs/superpowers
git commit -m "docs: 新增设置页设计稿与实施计划"
```

- [ ] **Step 2: 写失败测试 `tests/unit/settings-store.spec.ts`**

用例（全部内联字面量，`beforeEach` 中 `localStorage.clear()` + `setActivePinia(createPinia())`）：
1. 默认值：`quality === 'exhigh'`、`downloadQuality === 'exhigh'`、`showTranslation === true`。
2. `setDownloadQuality('lossless')` 后 `downloadQuality === 'lossless'`，且 `JSON.parse(localStorage.getItem('nextmusic.settings'))` 含 `"downloadQuality":"lossless"`。
3. `setQuality('standard')` 持久化同理。
4. 预置旧数据 `localStorage.setItem('nextmusic.settings', '{"quality":"standard","showTranslation":false}')` 后新建 store：`downloadQuality === 'exhigh'` 且 `quality === 'standard'`、`showTranslation === false`。
5. 预置损坏数据 `'not-json'` 后新建 store：不抛错且全部为默认值。

- [ ] **Step 3: 运行验证失败**

Run: `npx vitest run tests/unit/settings-store.spec.ts`
Expected: FAIL（`downloadQuality` 不存在 / 断言失败）

- [ ] **Step 4: 实现 `src/stores/settings.ts` 扩展**

`PersistedSettings` 加 `downloadQuality: QualityLevel`；`load()` 对缺失字段回退 `'exhigh'`（沿用现有 `||` 风格）；新增 action `setDownloadQuality`（写 state + `persist()`）；`persist()` 序列化三个字段。

- [ ] **Step 5: 运行验证通过**

Run: `npx vitest run tests/unit/settings-store.spec.ts`
Expected: PASS（5 用例全绿）

- [ ] **Step 6: Commit**

```bash
git add src/stores/settings.ts tests/unit/settings-store.spec.ts
git commit -m "feat(settings): 设置存储新增独立下载音质 downloadQuality"
```

---

### Task 2: 下载链路切 v1 `level` 参数 + 调用点改用 `downloadQuality`

**Files:**
- Modify: `src/api/song.ts:4-15`（`fetchDownloadUrl`）
- Modify: `src/utils/download.ts`（`downloadSong` 签名与透传、注释）
- Modify: `src/config/constants.ts`（删除 `qualityToBr`，新增 `REPO_URL`）
- Modify: `src/components/music/SongList.vue:52`、`src/components/player/PlayerBar.vue:54`、`src/components/player/NowPlaying.vue:115`（`settings.quality` → `settings.downloadQuality`）
- Test: `tests/unit/download.spec.ts`（追加透传用例）

**Interfaces:**
- Consumes: Task 1 的 `settings.downloadQuality`。
- Produces: `fetchDownloadUrl(id: number, level: string): Promise<DownloadUrlResult>`（内部 `mainApi('/song/download/url/v1', { id, level })`，默认 GET，`DownloadUrlResult` 结构不变）；`downloadSong(song: Song, quality: QualityLevel)`（`quality` 类型改为直接 import `QualityLevel`）；`REPO_URL = 'https://github.com/alanwang233233/NextMusic'`（Task 3 关于板块使用）。

- [ ] **Step 1: 追加失败测试到 `tests/unit/download.spec.ts`**

在 `downloadSong` describe 内追加：

```ts
it('音质等级原样透传给 fetchDownloadUrl', async () => {
  vi.mocked(fetchDownloadUrl).mockResolvedValue({ url: 'https://x.com/a.flac' })
  await downloadSong(song, 'lossless')
  expect(fetchDownloadUrl).toHaveBeenCalledWith(1, 'lossless')
})
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run tests/unit/download.spec.ts`
Expected: FAIL（实际调用为 `(1, 999000)`，经 `qualityToBr` 折叠）

- [ ] **Step 3: 实现接口与调用链切换**

- `src/api/song.ts`：`fetchDownloadUrl(id: number, level: string)` → `mainApi('/song/download/url/v1', { id, level })`；注释改为「获取歌曲下载直链（需登录）；v1 接口按 level 请求音质（standard…sky 全 10 档）」。
- `src/utils/download.ts`：`downloadSong(song: Song, quality: QualityLevel)`（`import type { QualityLevel } from '@/types/models'`，移除 `qualityToBr` import），`fetchDownloadUrl(song.id, quality)`；注释同步为 v1 + level。
- `src/config/constants.ts`：删除 `qualityToBr`；新增 `export const REPO_URL = 'https://github.com/alanwang233233/NextMusic'`。
- 三处调用点：`downloadSong(song, settings.quality)` → `downloadSong(song, settings.downloadQuality)`。

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run tests/unit/download.spec.ts tests/unit/settings-store.spec.ts`
Expected: PASS（含既有用例不回归）

- [ ] **Step 5: 全量单测确认播放链路无回归**

Run: `npx vitest run tests/unit`
Expected: PASS（`engine-chain` / `precache` / `player-store` 仍绿——播放仍消费 `settings.quality`）

- [ ] **Step 6: 确认无残留引用后 Commit**

Run: `grep -rn "qualityToBr" src/ tests/` → Expected: 无输出

```bash
git add src/api/song.ts src/utils/download.ts src/config/constants.ts src/components/music/SongList.vue src/components/player/PlayerBar.vue src/components/player/NowPlaying.vue tests/unit/download.spec.ts
git commit -m "feat(download): 下载接口切换 v1 按 level 取直链，下载音质独立于播放"
```

---

### Task 3: 构建期注入提交哈希 + `/settings` 路由 + SettingsView

**Files:**
- Modify: `vite.config.ts`（`define: { __APP_COMMIT__: JSON.stringify(gitShortHash()) }`，`execSync('git rev-parse --short HEAD')` 失败回退 `'unknown'`）
- Modify: `src/vite-env.d.ts`（`declare const __APP_COMMIT__: string`）
- Modify: `src/router/index.ts`（catch-all 之前插入 `/settings` 路由，`meta: { title: '设置' }`，无 `requiresUser`）
- Create: `src/views/SettingsView.vue`
- Create: `tests/components/SettingsView.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `setQuality` / `setDownloadQuality`；Task 2 的 `REPO_URL`；`QUALITY_LEVELS` / `qualityLabel`（`@/config/constants`）；`SectionHeader`、`AppIcon`。
- Produces: 路由 `/settings`（name `settings`）；组件内常量 `commit = __APP_COMMIT__`（构建期替换，vitest 同样应用 vite `define`，测试里可直接引用该全局常量断言）。

- [ ] **Step 1: 写失败测试 `tests/components/SettingsView.spec.ts`**

挂载：`setActivePinia(createPinia())` + `mount(SettingsView)`（无 engine/router 依赖，不需 stub RouterLink）。用例：
1. 渲染三板块：文本含「默认音质」「默认下载音质」「关于」，且「NextMusic」出现。
2. 点击 `data-testid="download-quality-lossless"` → `useSettingsStore().downloadQuality === 'lossless'` 且 localStorage 持久化；点击 `data-testid="play-quality-standard"` → `store.quality === 'standard'`。
3. 渲染 10 个播放档位与 10 个下载档位按钮（`data-testid` 前缀 `play-quality-` / `download-quality-`，共 20 个）。
4. 关于板块：存在 `href="${REPO_URL}"` 的外链（含 `external` 图标与 `target="_blank"`）；存在文本为 `__APP_COMMIT__` 当前值的元素；当 `__APP_COMMIT__ === 'unknown'` 时不渲染 commit 页链接（`href="${REPO_URL}/commit/..."` 不存在）。

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run tests/components/SettingsView.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 vite define、类型声明、路由、SettingsView**

- `vite.config.ts` 顶部 `import { execSync } from 'node:child_process'`，`gitShortHash()` try/catch，`define: { __APP_COMMIT__: JSON.stringify(gitShortHash()) }`。
- `src/vite-env.d.ts` 追加 `declare const __APP_COMMIT__: string`。
- 路由插在 not-found 之前。
- `SettingsView.vue`（根 `<div class="mx-auto max-w-2xl">`）：
  - script：`useSettingsStore`；`import { QUALITY_LEVELS, REPO_URL } from '@/config/constants'`；`const commit = __APP_COMMIT__`；无其他依赖。
  - 「播放」区：`SectionHeader`（title「默认音质」，subtitle 提示播放条可临时切换）+ `card-surface` 列表，行样式沿用 `PlayerBar.vue:176-188` 音质菜单行（`flex items-center justify-between`，label 左、VIP 标记与选中 `check` 图标右，选中行 `text-primary-400`）；行按钮 `data-testid="play-quality-${q.value}"`，点击 `settings.setQuality(q.value)`。
  - 「下载」区：同构，title「默认下载音质」，subtitle 说明「下载接口按音质等级获取直链，超出账号权限的档位可能拿不到链接」，`data-testid="download-quality-${q.value}"`，点击 `settings.setDownloadQuality(q.value)`。
  - 「关于」区：`SectionHeader`（title「关于」）+ `card-surface` 信息行：应用名行（`disc` 图标 + NextMusic）；仓库行（label「仓库」+ `<a :href="REPO_URL" target="_blank" rel="noopener" class="text-primary-400 ...">github.com/alanwang233233/NextMusic</a>` + `external` 图标）；提交行（label「当前提交」+ `commit !== 'unknown'` 时 `<a :href="`${REPO_URL}/commit/${commit}`" ...>{{ commit }}</a>`，否则纯文本 `{{ commit }}`）。

- [ ] **Step 4: 运行验证通过 + 类型检查**

Run: `npx vitest run tests/components/SettingsView.spec.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts src/vite-env.d.ts src/router/index.ts src/views/SettingsView.vue tests/components/SettingsView.spec.ts
git commit -m "feat(settings): 新增设置页（默认音质/下载音质/关于）"
```

---

### Task 4: 导航入口（齿轮图标 + 侧边栏 + 我的音乐快捷入口）

**Files:**
- Modify: `src/components/ui/AppIcon.vue`（ICONS 表新增 `settings`）
- Modify: `src/components/layout/SideBar.vue:12-21`（NAV_ITEMS 追加）
- Modify: `src/views/MeView.vue:54-59,100`（QUICK_LINKS 追加 + 网格列数）
- Create: `tests/components/SideBar.spec.ts`

**Interfaces:**
- Consumes: Task 3 的 `/settings` 路由。
- Produces: 图标名 `'settings'`（lucide 齿轮：外圈齿盘 path + `<circle cx="12" cy="12" r="3"/>`）；侧边栏末项 `{ to: '/settings', label: '设置', icon: 'settings' }`；MeView 快捷入口 `{ to: '/settings', label: '设置', icon: 'settings', requiresUser: false }`。

- [ ] **Step 1: 写失败测试 `tests/components/SideBar.spec.ts`**

`setActivePinia(createPinia())`，`mount(SideBar, { global: { stubs: { RouterLink: true, LazyImage: true } } })`，断言 `wrapper.html()` 包含 `to="/settings"` 与文本「设置」。

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run tests/components/SideBar.spec.ts`
Expected: FAIL（html 中无 `/settings`）

- [ ] **Step 3: 实现图标与两处入口**

- `AppIcon.vue` ICONS 表加 `settings`（lucide settings 齿轮完整 path + 中心圆）。
- `SideBar.vue` NAV_ITEMS 末尾追加设置项。
- `MeView.vue` QUICK_LINKS 末尾追加设置项（`requiresUser: false`，不触发 `onQuickLink` 拦截）；快捷入口网格 `sm:grid-cols-4` → `sm:grid-cols-5`。

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run tests/components/SideBar.spec.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/AppIcon.vue src/components/layout/SideBar.vue src/views/MeView.vue tests/components/SideBar.spec.ts
git commit -m "feat(nav): 侧边栏与我的页新增设置入口"
```

---

### Task 5: 全量验证 + 推送

**Files:** 无新改动（仅验证与推送；失败时修复并 amend/追加 fixup 提交）

- [ ] **Step 1: 全量门禁**

Run: `npm run typecheck && npm run test && npm run build`
Expected: 三者全部通过（build 先于推送，AGENTS.md 硬性要求）

- [ ] **Step 2: 推送**

Run: `git push origin master`
Expected: 推送成功（远端 github.com/alanwang233233/NextMusic master 分支）

- [ ] **Step 3: 汇报**

列出提交记录（`git log --oneline origin/master..master` 之前为空，推送后核对最近 5 条）与测试/构建结果。
