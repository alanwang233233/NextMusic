# Electron 桌面版实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 NextMusic 增加 Electron 桌面版：主进程内嵌 api-enhanced 本地服务（127.0.0.1）、设置页桌面板块（播放设备切换/主 API 覆盖/解灰开关）、electron-builder 三平台打包 + GH Actions CI，纯 Web 版零回归。

**Architecture:** 渲染层通过 preload 注入的 `window.nextmusicDesktop` 桥接检测桌面环境（纯 Web 不存在该对象，行为不变）；主 API 地址三级惰性解析（设置覆盖 → 桥接注入 → 构建期 env）；Electron 代码在 `electron/` 独立目录用 esbuild 打成 CJS，不触碰 vite/tailwind/playwright 配置。

**Tech Stack:** Electron（执行时装最新稳定版）+ electron-builder + esbuild + `@neteasecloudmusicapienhanced/api@^4.41.1`；渲染层沿用 Vue 3 / Pinia / Tailwind。

**Spec:** `docs/superpowers/specs/2026-11-28-electron-desktop-design.md`

## Global Constraints

- 纯 Web 零回归：`vite.config.ts`、`tailwind.config.cjs`、`postcss.config.cjs`、`playwright.config.ts`、根 `tsconfig.json` 一律不改；每任务收尾 `npm run typecheck && npm run test` 全绿
- 禁止 emoji；新图标进 `src/components/ui/AppIcon.vue` ICONS 表（内联 SVG 静态字符串）
- 根 package.json `"type": "module"` → Electron 主进程/预加载产物必须是 `.cjs`（esbuild `--format=cjs --out-extension:.js=.cjs`）
- 提交信息 Conventional Commits 中文
- npm 包名固定 `@neteasecloudmusicapienhanced/api`（^4.41.1，main.js 已预建空 `anonymous_token`，`/generateConfig` 深路径可 require）
- 桌面构建强制 `process.env.VITE_MAIN_API = ''`（防私有地址入包）
- Electron 进程安全基线：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`setWindowOpenHandler` deny + `shell.openExternal`、协议处理器防路径穿越
- OuterAPI 用途不变（仅播放降级/预缓存），不得新增调用点

## Review Focus

1. **纯 Web 回归**：`window.nextmusicDesktop` 不存在时，http/engine/设置行为必须与改动前逐字节一致 → Task 1 `tests/unit/desktop-api-base.spec.ts` + 每任务全量既有测试绿 + Task 9 最终门槛
2. **本地实例引导缺失**：干净机器上 `/song/url/v1`（预缓存 JSON 直链）因缺 `xeapi_public_key` 必然 404 → Task 8 冒烟断言 `GET /` 200（离线安全）、`DESKTOP_NET_CHECK=1` 时断言 `/song/url/v1` 200
3. **override 改后不生效或污染**：必须每请求惰性求值、trim 尾斜杠、清空即回退内置 → Task 1 测试钉死
4. **设备消失后播放中断**：`devicechange` 时所选设备不在列表 → 回退默认设备并重应用 → Task 4 测试钉死
5. **私有 API 地址泄漏进分发包**：`VITE_MAIN_API` 带标记值跑桌面构建后 dist 中不得出现 → Task 7 验证步骤钉死

---

### Task 1: 桌面桥接类型 + 主 API 地址三级解析

**Files:**
- Modify: `src/vite-env.d.ts`
- Create: `src/utils/desktop.ts`
- Modify: `src/api/http.ts`
- Test: `tests/unit/desktop-api-base.spec.ts`

**Interfaces:**
- Produces（供 Task 2/3/4/5/6 使用）:
  - `src/vite-env.d.ts`: `interface DesktopBridge { mainApiBase: string; setGeneralUnblock(enabled: boolean): Promise<boolean> }`，`Window.nextmusicDesktop?: DesktopBridge`
  - `src/utils/desktop.ts`: `export function getDesktopBridge(): DesktopBridge | null` —— `globalThis.nextmusicDesktop` 为对象且 `mainApiBase` 为 string 时返回之（允许空串，服务启动失败场景），否则 null
  - `src/api/http.ts`: `MAIN_API_BASE` 由 `const` 改 `let`（模块加载时求值：`getDesktopBridge()?.mainApiBase || import.meta.env.VITE_MAIN_API || ''`，无桥接时值与今天完全一致）；新增 `bindMainApiOverride(fn: (() => string | undefined | null) | null): void`（仿 `bindCookieProvider`）；`requireMainApiBase()` 每请求求值：override（trim 后非空）优先，值 trim 去尾斜杠；两者皆空时抛 `ApiError(-1, …)`，文案：有桥接 → `本地 API 服务未就绪，请重启应用`，无桥接 → 原文案逐字节不变

- [ ] **Step 1: 写失败测试 `tests/unit/desktop-api-base.spec.ts`**

```ts
// 用 vi.resetModules() + 动态 import 控制模块加载期的桥接可见性
// 用例1：无桥接 → MAIN_API_BASE === env 值 'https://mainapi.test'，requireMainApiBase() 返回原值（现文案）
// 用例2：globalThis.nextmusicDesktop = { mainApiBase: 'http://127.0.0.1:34567', setGeneralUnblock: async () => true }
//        → 动态 import 后 MAIN_API_BASE === 'http://127.0.0.1:34567'（桥接优先于 env）
// 用例3：override 'https://remote.example.com/'（带尾斜杠）→ requireMainApiBase() === 'https://remote.example.com'
// 用例4：override 改为 undefined → 立即（不 resetModules）回退 'http://127.0.0.1:34567'（惰性求值）
// 用例5：override '' 且无桥接 mainApiBase '' → 抛 ApiError code -1 message '本地 API 服务未就绪，请重启应用'
// 用例6：无桥接、无 env（import.meta.env 无法改 → 用 vi.stubGlobal 不适用；改为：桥接空串 + override 空）→ 原文案 '主 API 地址未配置：请复制 .env.example 为 .env.local 并填入 VITE_MAIN_API'
// afterEach: delete (globalThis as any).nextmusicDesktop
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/unit/desktop-api-base.spec.ts`
Expected: FAIL（getDesktopBridge/bindMainApiOverride 不存在）

- [ ] **Step 3: 实现** `src/vite-env.d.ts` 增 `DesktopBridge` 与 `Window.nextmusicDesktop`；新建 `src/utils/desktop.ts`；`src/api/http.ts` 按 Interfaces 改 `MAIN_API_BASE` 求值、加 `bindMainApiOverride`、改 `requireMainApiBase`（保持其余逻辑/导出不动）

- [ ] **Step 4: 跑本任务测试 + 全量回归**

Run: `npx vitest run tests/unit/desktop-api-base.spec.ts && npm run test && npm run typecheck`
Expected: 全部 PASS（既有 http/engine-chain/auth-store/LoginView 用例不改动即应通过——它们引用的 `MAIN_API_BASE` 字符串值未变）

- [ ] **Step 5: Commit**

```bash
git add src/vite-env.d.ts src/utils/desktop.ts src/api/http.ts tests/unit/desktop-api-base.spec.ts
git commit -m "feat(api): 主 API 地址支持桌面桥接与设置覆盖的三级惰性解析"
```

---

### Task 2: settings store 扩展 + App.vue 桌面绑定

**Files:**
- Modify: `src/stores/settings.ts`
- Modify: `src/App.vue`
- Test: `tests/unit/settings-store.spec.ts`（追加用例）

**Interfaces:**
- Consumes: Task 1 的 `bindMainApiOverride`、`getDesktopBridge`
- Produces（供 Task 5 使用）:
  - state: `mainApiBaseOverride: string`（`''` = 使用内置本地服务；load() 对旧数据缺字段归一为 `''`）、`generalUnblock: boolean`（默认 `true`，旧数据缺字段按 `!== false` 归 true）
  - actions: `setMainApiBaseOverride(url: string): void`（trim，空串即清除，persist）、`setGeneralUnblock(enabled: boolean): void`（persist + 桥接存在时 fire-and-forget `setGeneralUnblock(enabled)`，失败静默）、`bindDesktopBridge(): void`（`bindMainApiOverride(() => this.mainApiBaseOverride)` + 把当前 `generalUnblock` 同步给主进程）
  - `persist()` JSON 增写 `mainApiBaseOverride`、`generalUnblock`

- [ ] **Step 1: 追加失败测试**（`tests/unit/settings-store.spec.ts` 新 describe）：旧数据无新字段 → `mainApiBaseOverride === ''` 且 `generalUnblock === true`；`setMainApiBaseOverride(' https://x.example.com/ ')` → store 值 `'https://x.example.com'` 且 localStorage 已写；`setMainApiBaseOverride('')` → 回 `''`；`setGeneralUnblock(false)` → persist 且调用了 `globalThis.nextmusicDesktop.setGeneralUnblock(false)`（有桥接桩）/ 桥接缺失时不抛错；`bindDesktopBridge()` 后改 override → `requireMainApiBase()`（真实 http 模块）立即返回新值
- [ ] **Step 2: 跑测试确认失败**：`npx vitest run tests/unit/settings-store.spec.ts` → FAIL（字段/动作不存在）
- [ ] **Step 3: 实现** settings store（注意 `bindMainApiOverride` 仅在 `bindDesktopBridge` 里绑定，避免纯 Web 引入空 provider）+ `src/App.vue` 在 `useAuthStore()` 之后加 `useSettingsStore().bindDesktopBridge()`（仅当 `getDesktopBridge()` 非空时才有实际动作，action 内部自行判断）
- [ ] **Step 4: 跑测试 + 回归**：`npx vitest run tests/unit/settings-store.spec.ts && npm run test && npm run typecheck` → 全绿
- [ ] **Step 5: Commit**

```bash
git add src/stores/settings.ts src/App.vue tests/unit/settings-store.spec.ts
git commit -m "feat(settings): 主 API 覆盖与解灰开关设置项（桌面端）"
```

---

### Task 3: 引擎 setOutputDevice + 播放时应用持久化设备

**Files:**
- Modify: `src/player/engine.ts`
- Modify: `src/stores/player.ts`（引擎创建处，约 186 行）
- Test: `tests/unit/engine-output-device.spec.ts`

**Interfaces:**
- Consumes: Task 4 的 `applyPersistedAudioOutput`（Task 3 先只留调用点会编译失败 → 实施顺序改为本任务与 Task 4 同分支顺序执行但 Task 3 仅实现 engine，player store 调用点放在 Task 4）
- Produces:
  - `src/player/engine.ts`: `async setOutputDevice(deviceId: string): Promise<void>`（`'default'` 或空串映射为 `''`；`typeof this.audio.setSinkId !== 'function'` 时抛 `Error('当前环境不支持切换播放设备')`；成功后 sink 持久于 audio 元素）
  - `getExistingEngine(): PlayerEngine | null`（新导出，不创建引擎）

- [ ] **Step 1: 写失败测试**：`tests/unit/engine-output-device.spec.ts` —— jsdom 无 `setSinkId`：用例1 未 stub 时 `setOutputDevice('x')` reject 且 message 为不支持文案；用例2 stub `HTMLMediaElement.prototype.setSinkId = vi.fn().mockResolvedValue(undefined)` → `setOutputDevice('default')` 以 `''` 调用、`setOutputDevice('abc')` 以 `'abc'` 调用；用例3 `getExistingEngine()` 在未创建时返回 null、`getEngine(cb)` 后返回同实例
- [ ] **Step 2: 跑测试确认失败**：`npx vitest run tests/unit/engine-output-device.spec.ts` → FAIL
- [ ] **Step 3: 实现** `setOutputDevice` + `getExistingEngine`（`resetEngineForTest` 已有，模式照抄）
- [ ] **Step 4: 跑测试 + 回归**：`npx vitest run tests/unit/engine-output-device.spec.ts tests/unit/engine-chain.spec.ts && npm run typecheck` → PASS
- [ ] **Step 5: Commit**

```bash
git add src/player/engine.ts tests/unit/engine-output-device.spec.ts
git commit -m "feat(player): 引擎支持切换音频输出设备（setSinkId）"
```

---

### Task 4: useAudioOutput composable + player store 接线

**Files:**
- Create: `src/composables/useAudioOutput.ts`
- Modify: `src/stores/player.ts`（引擎创建处：`engine.setVolume(this.volume)` 之后追加 `void applyPersistedAudioOutput(engine)`）
- Test: `tests/unit/use-audio-output.spec.ts`

**Interfaces:**
- Consumes: Task 3 的 `setOutputDevice`/`getExistingEngine`
- Produces（供 Task 5 使用）:
  - `export interface AudioOutputDevice { deviceId: string; label: string }`
  - `export const AUDIO_OUTPUT_STORAGE_KEY = 'nextmusic.audioOutput'`
  - `readPersistedAudioOutput(): string`（无值 → `'default'`）
  - `persistAudioOutput(id: string): void`
  - `applyPersistedAudioOutput(engine: PlayerEngine): Promise<void>`（读持久值调 `engine.setOutputDevice`，catch 静默 `console.warn`）
  - `useAudioOutput(): { devices: Ref<AudioOutputDevice[]>; currentId: Ref<string>; select(id: string): Promise<void>; refresh(): Promise<void> }`
    - `refresh()`：`navigator.mediaDevices.enumerateDevices()` 过滤 `kind === 'audiooutput'`；label 为空 → `` `扬声器 ${序号}` ``（`deviceId === 'default'` → `'系统默认'`）
    - `select(id)`：`getExistingEngine()?.setOutputDevice(id)`（引擎未创建则仅持久化，创建时由 player store 应用）、`persistAudioOutput(id)`、更新 `currentId`
    - `refresh()` 后若 `currentId` 不在设备列表 → `select('default')`（设备消失回退）
    - composable 挂 `devicechange` 监听，`onScopeDispose` 清理

- [ ] **Step 1: 写失败测试**：stub `navigator.mediaDevices`（`enumerateDevices` 返回构造设备数组、`addEventListener`/`removeEventListener` 为 vi.fn()）；mock `@/player/engine`（`getExistingEngine` 返回 `{ setOutputDevice: vi.fn().mockResolvedValue(undefined) }`，注意 AGENTS 约定：工厂不引用外部常量，`beforeEach` 重置）——用例1 refresh 得到含空 label 兜底名的列表；用例2 select('abc') → engine.setOutputDevice('abc') + localStorage 写入 + currentId 更新；用例3 持久值设备不在新列表 → 自动 select('default') 且 engine 收到 `''`；用例4 scope dispose 后 removeEventListener 被调
- [ ] **Step 2: 跑测试确认失败**：`npx vitest run tests/unit/use-audio-output.spec.ts` → FAIL
- [ ] **Step 3: 实现** composable；player store 创建引擎处接线
- [ ] **Step 4: 跑测试 + 回归**：`npx vitest run tests/unit/use-audio-output.spec.ts tests/unit/engine-chain.spec.ts && npm run test && npm run typecheck` → 全绿（player store 接线不得破坏现有 player 相关用例）
- [ ] **Step 5: Commit**

```bash
git add src/composables/useAudioOutput.ts src/stores/player.ts tests/unit/use-audio-output.spec.ts
git commit -m "feat(player): 播放设备枚举/持久化/回退 composable 并接入播放引擎"
```

---

### Task 5: SettingsView 桌面板块（设备/主 API/解灰）

**Files:**
- Modify: `src/views/SettingsView.vue`
- Modify: `src/components/ui/AppIcon.vue`（ICONS 表加 `speaker`：`'<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M19.5 9.5a6 6 0 0 1 0 5"/><path d="M22.5 7a10 10 0 0 1 0 10"/>'` 风格与 volume 一致）
- Test: `tests/components/SettingsView.spec.ts`（追加用例；若已有该文件沿用其结构，否则新建——先读现有文件）

**Interfaces:**
- Consumes: Task 2 store 动作、Task 4 `useAudioOutput`、`getDesktopBridge`
- Produces（供冒烟/回归确认）:
  - 桌面板块仅 `getDesktopBridge()` 非空时渲染，根容器 `data-testid="desktop-section"`
  - 播放设备行：`data-testid="audio-device-default"` / `audio-device-<deviceId>`，当前项带 `check` 图标（沿用音质行样式）
  - 主 API：`data-testid="main-api-input"`（文本输入，占位 `http://your-api.example.com`）、`main-api-save`（保存按钮 → `settings.setMainApiBaseOverride(draft)` + toast「已保存，立即生效」）、`main-api-reset`（恢复内置 → 写入 `''`）
  - 解灰：`data-testid="unblock-toggle"`（按钮式开关 → `settings.setGeneralUnblock(!settings.generalUnblock)`），副文案「对 VIP/灰色歌曲尝试自动解锁」

- [ ] **Step 1: 写失败测试**（组件测试，`globalThis.nextmusicDesktop` 桩注入/afterEach 删除；mock `@/composables/useAudioOutput` 返回固定 devices/currentId/select）——用例1 无桥接 → 查询 `desktop-section` 为 null；用例2 有桥接 → 三块齐全且当前设备带勾；用例3 点击 `audio-device-<id>` → select 被调；用例4 `main-api-save` → `setMainApiBaseOverride` 收到输入值；用例5 `unblock-toggle` → `setGeneralUnblock(false)`（初始 true）
- [ ] **Step 2: 跑测试确认失败**：`npx vitest run tests/components/SettingsView.spec.ts` → FAIL
- [ ] **Step 3: 实现** SettingsView 桌面板块（纯 Web 渲染路径不动；样式复用 `card-surface`/`SectionHeader`/音质行模式）+ AppIcon 新图标
- [ ] **Step 4: 跑测试 + 回归**：`npx vitest run tests/components/SettingsView.spec.ts && npm run test && npm run typecheck && npm run build` → 全绿（`npm run build` 证明 Web 构建产物管线不受影响）
- [ ] **Step 5: Commit**

```bash
git add src/views/SettingsView.vue src/components/ui/AppIcon.vue tests/components/SettingsView.spec.ts
git commit -m "feat(settings): 桌面板块——播放设备切换、主 API 覆盖、解灰开关"
```

---

### Task 6: Electron 骨架（main/preload/apiServer + esbuild + 类型检查）

**Files:**
- Create: `electron/src/apiServer.ts`、`electron/src/main.ts`、`electron/src/preload.ts`
- Create: `electron/tsconfig.json`
- Modify: `package.json`（devDeps：electron、electron-builder、esbuild；deps：`@neteasecloudmusicapienhanced/api`；scripts：`typecheck:electron`、`desktop:build:electron`）

**Interfaces:**
- Consumes: 无渲染层依赖（桥接形状须与 Task 1 类型一致）
- Produces:
  - `electron/src/apiServer.ts`: `export interface ApiServerHandle { port: number; close(): Promise<void> }`、`export async function startApiServer(port: number): Promise<ApiServerHandle>`（port 由 main 先探测后传入，不允许内部探测）
    - 顺序：`process.env.ENABLE_GENERAL_UNBLOCK = 'true'` → `require('@neteasecloudmusicapienhanced/api')`（其 main.js 预建空 anonymous_token）→ `require('@neteasecloudmusicapienhanced/api/generateConfig')` 并 `await`（上游 `app.js` 同源引导：匿名 token + xeapi key + neapiKey，各自 try/catch，离线不阻塞）→ `serveNcmApi({ port, host: '127.0.0.1', checkVersion: false })` → listening 后从 `appExt.server.address()` 读真实端口回填 handle（失败重试 1 次，仍失败抛出）
  - `electron/src/main.ts`:
    - `registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])`（模块顶层，ready 前）
    - `probeFreePort(): Promise<number>`（`net.createServer().listen(0, '127.0.0.1')` → `address().port` → close）——**不可传 port 0 给 serveNcmApi**（falsy 回退 3000）
    - `protocol.handle('app', …)`：URL 形如 `app://nextmusic/<path>`；`path.normalize` 后必须仍在 `dist/` 内（防穿越）；无扩展名/`/` → `index.html`（SPA 回退）；MIME 按 `.js/.css/.html/.svg/.png/.ico/.woff2` 映射
    - `createWindow(mainApiBase: string)`：1200×800 min 960×640、`contextIsolation`/`sandbox`/`nodeIntegration` 按安全基线、`additionalArguments: ['--nextmusic-main-api-base=' + mainApiBase]`、`setWindowOpenHandler` deny + `shell.openExternal`、permission request/check handler 均对 `media` 放行；dev（`process.env.VITE_DEV_SERVER_URL`）loadURL，prod loadURL(`app://nextmusic/index.html`)
    - 生命周期：`requestSingleInstanceLock`（非首实例退出）；`window-all-closed` 非 mac 退出、mac `activate` 重建；`app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')`
    - `ipcMain.handle('desktop:set-general-unblock', (e, enabled: unknown) => { process.env.ENABLE_GENERAL_UNBLOCK = enabled === true ? 'true' : 'false'; return enabled === true })`
    - 启动序：ready → probeFreePort → `startApiServer()`（失败重试后仍失败：`mainApiBase` 传空串并照常开窗，窗口内报错走渲染层兜底文案）
  - `electron/src/preload.ts`: `process.argv` 解析 `--nextmusic-main-api-base=` → `contextBridge.exposeInMainWorld('nextmusicDesktop', { mainApiBase, setGeneralUnblock: (enabled: boolean) => ipcRenderer.invoke('desktop:set-general-unblock', enabled) })`
  - `electron/tsconfig.json`: `extends: ../tsconfig.node.json`，`include: ["src/**/*.ts"]`（noEmit，仅类型检查）
  - scripts：`"typecheck:electron": "tsc -p electron/tsconfig.json"`；`"desktop:build:electron": "esbuild electron/src/main.ts electron/src/preload.ts --bundle --platform=node --format=cjs --target=node20 --outdir=electron/dist --out-extension:.js=.cjs --external:electron --external:@neteasecloudmusicapienhanced/api"`

- [ ] **Step 1: 安装依赖**：`npm i @neteasecloudmusicapienhanced/api@^4.41.1 && npm i -D electron electron-builder esbuild`（安装记录版本即为锁定量；Electron 下载约 100MB）
- [ ] **Step 2: 写三个源文件 + tsconfig + scripts**（按 Interfaces；不写渲染层代码）
- [ ] **Step 3: 验证类型与产物**：`npm run typecheck:electron && npm run desktop:build:electron` → `electron/dist/main.cjs`、`electron/dist/preload.cjs` 存在；`node --check electron/dist/main.cjs` 无语法错
- [ ] **Step 4: 回归确认**：`npm run typecheck && npm run test && npm run build` → 全绿（Web 管线未被依赖安装影响）
- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron/ 
git commit -m "feat(electron): 主进程内嵌 api-enhanced 本地服务与应用骨架"
```

---

### Task 7: desktop dev/build 脚本 + electron-builder 配置 + 占位图标

**Files:**
- Create: `scripts/desktop-dev.mjs`、`scripts/desktop-build.mjs`、`scripts/generate-icon.mjs`、`assets/icon.png`（生成物）、`electron-builder.yml`
- Modify: `package.json`（scripts：`desktop:dev`、`desktop:build`、`desktop:build:mac|win|linux`）

**Interfaces:**
- Consumes: Task 6 的 `desktop:build:electron`、`dist/`（Web 构建产物）
- Produces（供 Task 8/9 使用）:
  - `scripts/desktop-dev.mjs`：spawn `vite`（默认 5173）→ 轮询 `http://localhost:5173` 就绪 → spawn `electron electron/dist/main.cjs`，注入 `VITE_DEV_SERVER_URL=http://localhost:5173`；退出时清理子进程（信号转发）
  - `scripts/desktop-build.mjs`：**强制 `process.env.VITE_MAIN_API = ''`** → spawn `npm run build` → spawn `npm run desktop:build:electron` → spawn `electron-builder --publish never` 透传参数（`--mac|--win|--linux|--dir`）
  - `scripts/generate-icon.mjs`：零依赖生成 512×512 纯色（primary 红 #dc2626）PNG → `assets/icon.png`（zlib deflate + PNG chunk 手写，占位图标后续可替换）
  - `electron-builder.yml`：`appId: cn.nextmusic.app`、`productName: NextMusic`、`directories.output: desktop-release`、`files: [dist/**, electron/dist/**, package.json]`、`asar: true`、mac dmg+zip / win nsis / linux AppImage+deb、三平台 `icon: assets/icon.png`、nsis `oneClick: false`

- [ ] **Step 1: 写脚本与配置**；`node scripts/generate-icon.mjs` 生成 `assets/icon.png`（用 `file assets/icon.png` 验证 PNG 512×512）
- [ ] **Step 2: package.json scripts**：`desktop:dev: node scripts/desktop-dev.mjs`；`desktop:build: node scripts/desktop-build.mjs`；`desktop:build:mac|win|linux: node scripts/desktop-build.mjs --mac|--win|--linux`
- [ ] **Step 3: 本机可打包验证**：`npm run desktop:build -- --dir` → `desktop-release/` 出现未打包应用目录；`npx asar list desktop-release/*.asar` 或对应 app 包内 `app.asar` 应含 `dist/index.html`、`electron/dist/main.cjs`、`node_modules/@neteasecloudmusicapienhanced/api/main.js`（asar 内 require 的关键前提）
- [ ] **Step 4: 私有地址泄漏验证（Review Focus 5）**：`VITE_MAIN_API=https://leak-marker.example npm run desktop:build -- --dir && ! grep -r "leak-marker.example" dist/` → grep 无命中（脚本置空生效）
- [ ] **Step 5: 回归 + Commit**：`npm run typecheck && npm run test` 全绿

```bash
git add scripts/ assets/icon.png electron-builder.yml package.json package-lock.json
git commit -m "feat(electron): 三平台打包脚本、electron-builder 配置与占位图标"
```

---

### Task 8: 桌面冒烟测试（Playwright _electron）

**Files:**
- Create: `tests/e2e/desktop.smoke.spec.ts`

**Interfaces:**
- Consumes: Task 6/7 产物（`electron/dist/main.cjs`、`dist/`、electron 二进制）；可选环境变量 `DESKTOP_NET_CHECK=1`（有网时加深断言）、`DESKTOP_EXECUTABLE=<路径>`（打包后可执行文件，走 asar 内主进程）

- [ ] **Step 1: 写冒烟测试**：

```ts
// 门控：electron/dist/main.cjs 与 dist/index.html 均存在才执行，否则 test.skip（纯 Web CI/本地不受影响）
// 默认模式：_electron.launch({ args: ['electron/dist/main.cjs'] })
// DESKTOP_EXECUTABLE 模式：_electron.launch({ executablePath })（验证 asar 内 require/引导）
// 断言1：firstWindow() 打开；evaluate(() => window.nextmusicDesktop?.mainApiBase) 匹配 /^http:\/\/127\.0\.0\.1:\d+$/
// 断言2：page.request.get(mainApiBase + '/') 状态 200（离线安全，不触发 NCM 外呼）
// 断言3（DESKTOP_NET_CHECK=1 时）：GET mainApiBase + '/song/url/v1?id=347230&level=exhigh&timestamp=<now>' HTTP 状态 200 且 body.code === 200（xeapi 引导生效 → 预缓存 JSON 直链可用）
// 断言4：evaluate(() => !!window.nextmusicDesktop?.setGeneralUnblock) 为 true 且调用后返回 true（IPC 通）
// 全程超时放宽（首启引导含网络尝试）：launch timeout 60_000
```

- [ ] **Step 2: 本机验证**：`npx playwright test tests/e2e/desktop.smoke.spec.ts` → PASS（默认模式）；`npm run desktop:build -- --dir` 后以 `DESKTOP_EXECUTABLE=<app 二进制路径> npx playwright test tests/e2e/desktop.smoke.spec.ts` → PASS（asar 模式，Review Focus 2 落地）
- [ ] **Step 3: 纯 Web 无关性确认**：`npm run test:e2e` → 既有 e2e/visual 全绿 + 冒烟在无 `electron/dist` 时 skip（先临时改名 `electron/dist` 验证一次 skip 路径后改回）
- [ ] **Step 4: Commit**

```bash
git add tests/e2e/desktop.smoke.spec.ts
git commit -m "test(e2e): Electron 桌面冒烟（本地服务/桥接/引导可选网检）"
```

---

### Task 9: CI workflow + 文档 + 最终门槛

**Files:**
- Create: `.github/workflows/desktop.yml`
- Modify: `README.md`（桌面版使用说明）、`AGENTS.md`（常用命令/分层增补 Electron 段落）

**Interfaces:**
- Consumes: Task 7 脚本名、Task 8 冒烟

- [ ] **Step 1: 写 workflow**：`on: push: tags: ['desktop-v*']` + `workflow_dispatch`；matrix `[macos-latest, windows-latest, ubuntu-latest]`；steps：checkout → setup-node 22（npm 缓存）→ `npm ci` → 平台映射构建（macos: `npm run desktop:build:mac`、windows: `desktop:build:win`、ubuntu: `desktop:build:linux`）→ `actions/upload-artifact@v4`（按平台上传 `desktop-release/` 产物）；`workflow_dispatch`/tag 追加 release 步骤（`softprops/action-gh-release`，`files: desktop-release/*`，tag 触发时自动建 release）
- [ ] **Step 2: ubuntu job 增加验证步骤**：`npm run typecheck:electron`、`npx playwright test tests/e2e/desktop.smoke.spec.ts`（npm ci 已装 electron 二进制，无需浏览器安装；webServer preview 自动起）
- [ ] **Step 3: 文档**：README 加「桌面版」小节（`npm run desktop:dev` / `desktop:build`、三平台产物、设置页桌面板块功能说明）；AGENTS.md 常用命令加桌面脚本、分层边界加 electron/ 段落（内嵌 api 引导、CJS 产物、桥接约定，标注「改 electron/src 后先 typecheck:electron」）
- [ ] **Step 4: 最终门槛（Review Focus 1 落地）**：`npm run typecheck && npm run typecheck:electron && npm run test && npm run build && npm run test:e2e` 全绿
- [ ] **Step 5: Commit**

```bash
git add .github/workflows/desktop.yml README.md AGENTS.md
git commit -m "ci(electron): 三平台打包流水线与桌面版文档"
```

---

## 任务依赖

Task 1 → 2 → 5；Task 3 → 4 → 5；Task 6 → 7 → 8；Task 9 收尾。渲染层任务（1-5）与 Electron 任务（6-8）互不依赖，可并行；Task 5 依赖 1-4 全部。
