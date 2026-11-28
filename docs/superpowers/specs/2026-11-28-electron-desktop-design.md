# Electron 桌面版设计（2026-11-28）

## 背景与目标

现状：NextMusic 是纯客户端 SPA（Vue 3 + Vite + Pinia），主 API 地址构建期经 `VITE_MAIN_API` 注入（`src/api/http.ts:31`），部署于 Vercel；播放引擎持有唯一 `new Audio()`（`src/player/engine.ts`），降级链为预缓存 → 主 API 302 端点 → OuterAPI。

目标：新增 Electron 桌面版，要求：

1. 纯 Web 版完全不受影响：vite/tailwind/playwright 配置零改动，Web 构建产物与运行行为不变
2. Electron 版在本地运行 api-enhanced（npm 包 `@neteasecloudmusicapienhanced/api`，已确认存在 v4.41.1，其 `server.js` 导出 `serveNcmApi({ port, host, checkVersion })` 支持编程式启动），并允许用户在设置中覆盖为远程主 API 地址
3. 新增音频输出设备（扬声器/耳机）切换功能
4. 支持 Windows、macOS、Linux 打包

## 已确认的决策

1. **api-enhanced 嵌入方式**：主进程内嵌 `serveNcmApi`，监听 `127.0.0.1` 随机端口，无需系统 Node、无子进程管理；用户补充要求：设置中可覆盖为远程主 API 地址。本地实例始终启动（即使 override 指向远程），作为渲染层回退。
2. **打包深度**：本地打包脚本 + GitHub Actions CI 三平台产物；签名/公证/自动更新不做（后续增强）。
3. **桌面独有功能统一入口在设置页**（用户指定）：SettingsView 新增桌面板块，包含播放设备切换、主 API 覆盖、解灰开关三项；检测 `window.nextmusicDesktop` 注入，纯 Web 零 UI 变化；PlayerBar 不加任何入口。
4. **解灰开关**：默认开启（主进程启动 api-enhanced 时设 `ENABLE_GENERAL_UNBLOCK=true`，该 env 为每请求读取，可运行时热切换），与该项目 Docker 文档默认行为对齐；设置页桌面板块提供开关，经 IPC 翻转主进程 env。

### builder-check 实测修正（已验证，直接采纳）

- `serveNcmApi({ port: 0 })` 拿不到随机端口：`Number(options.port || …)` 中 `0` 是 falsy，会静默回退 3000。主进程必须先用 `net.createServer().listen(0)` 探测空闲端口，再把具体端口传给 `serveNcmApi`；`app.server.address()` 需在 listening 后读取。
- 包的 `main.js` 在模块加载期同步读 `${os.tmpdir()}/anonymous_token`，不存在即 ENOENT 崩溃（上游 CLI `app.js` 负责创建）。require 前必须补建该文件。
- 本地 `/song/url/v1`（预缓存第一候选的 JSON 直链）在干净机器上必然 404：该模块硬编码 `crypto: 'xeapi'`，而 `${os.tmpdir()}/xeapi_public_key` 只有上游 `generateConfig` CLI 生成，`serveNcmApi` 不管。apiServer 启动时必须做一次 generateConfig 式引导（拉取并持久化 xeapi key + anonymous_token），否则桌面版预缓存「切歌零请求」路径形同虚设。文件位于共享 tmpdir，多开有单实例锁兜底。
- `MAIN_API_BASE` 并非只有 `requireMainApiBase` 一个引用方：`tests/unit/http.spec.ts`、`tests/unit/engine-chain.spec.ts`、`tests/unit/auth-store.spec.ts`、`tests/components/LoginView.spec.ts` 直接断言/mock 其形状。改为惰性求值需同步调整这 4 个测试文件（列入实现清单）。

## 方案取舍

- **嵌入方式**：主进程内嵌 `serveNcmApi` vs 子进程 `ELECTRON_RUN_AS_NODE` vs 仅允许自备实例 → 选内嵌（无进程守护/端口交接复杂度，express 足够稳定；YesPlayMusic 等同类项目同款）+ 远程覆盖兜底。
- **Web 构建兼容**：改 vite `base: './'` 直接 `file://` 加载 vs 自定义 `app://` 协议服务 `dist/` → 选后者，前者会动到 Web 版构建配置（违反硬约束）。`app://` 注册为 standard + secure + supportFetchAPI + stream，处理器带 SPA 路由回退（等价 vercel rewrites）与路径穿越防护。
- **主 API 地址解析**：`src/api/http.ts` 的 `requireMainApiBase()` 改为三级优先：设置覆盖（localStorage，仅桌面 UI 暴露）→ preload 注入的本地服务地址 → `import.meta.env.VITE_MAIN_API`。纯 Web 下前两级不存在，行为逐字节不变。`MAIN_API_BASE` 静态常量改为惰性求值（见下方「我的拍板」），并同步调整引用其形状的 4 个测试文件。
- **注入通道（同步 string）**：preload 用 `webPreferences.additionalArguments`（`--nextmusic-main-api-base=…`）传入同步 string，渲染层从 `process.argv` 读取。不用 `ipcRenderer.invoke`（返回 Promise，会把同步的 `requireMainApiBase()`/`main302Url()` 整条链路异步化重构，违反最小改动原则）。
- **覆盖生效时机**：立即生效（每请求惰性求值）。http.ts 采用与 `bindCookieProvider` 相同的注册式 provider 模式（`bindMainApiOverride`），由 settings store 注册读取函数并调用 `persist()` 后生效；不做「重启生效」。
- **桌面功能入口**（用户指定）：设备切换、解灰开关与主 API 覆盖统一放 SettingsView 桌面板块；PlayerBar 保持零改动。设备切换即时生效（切 sink 不打断播放），窗口最小尺寸维持 960×640。
- **桌面构建剥离 `VITE_MAIN_API`**：`desktop:build` 脚本在 spawn vite 前强制 `process.env.VITE_MAIN_API = ''`（进程 env 优先于 .env.local，避免把维护者私有 API 地址烤进公开分发产物）。桥接存在时 `requireMainApiBase` 的兜底报错文案改为「本地 API 服务未就绪，请重启应用」。
- **外链安全**：`setWindowOpenHandler` 一律 deny 并转 `shell.openExternal`（SettingsView 两处 `target="_blank"` 与下载 external 回退否则会开出 Electron 子窗口）。
- **Electron 代码构建**：esbuild 打包 `electron/src/{main,preload}.ts` 为 CJS（`.cjs`，根 package.json 是 `"type": "module"`，且 api-enhanced 是 CJS 包，其 `module.exports` 含 getter + `Object.assign`，ESM 命名导出检测不可靠）→ `electron/dist/`；独立 `tsconfig.electron.json` + `npm run typecheck:electron`，不并入根 typecheck（保持 Web 门槛不变）。
- **依赖放置**：`@neteasecloudmusicapienhanced/api` 挂根 `dependencies`（electron-builder 自动打包其传递闭包进 asar；Web 构建不引用它，产物不受影响）。`desktop:dev` 编排用零依赖 node 脚本（spawn vite → 轮询就绪 → spawn electron），不引入 concurrently/wait-on。
- **设备切换实现**：`navigator.mediaDevices.enumerateDevices()` + `audio.setSinkId(deviceId)`（Chromium 原生，三平台一致；Linux 需 PulseAudio，纯 ALSA 环境仅默认设备，可接受）。引擎新增 `setOutputDevice()`；选择持久化于 localStorage；监听 `devicechange`，所选设备消失自动回退默认。

## 实现要点

- `electron/src/main.ts`：app 生命周期（`requestSingleInstanceLock` 防双开——兼作共享 tmpdir 引导文件竞争兜底；mac 关窗隐藏、activate 重建，其余平台 window-all-closed 退出）、`app://` 协议注册与处理、`BrowserWindow`（1200×800，min 960×640，`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`additionalArguments` 传 API base）、`autoplay-policy=no-user-gesture-required`、`session.setPermissionRequestHandler` 仅放行 `media`（音频设备枚举需要）、`setWindowOpenHandler` deny + `shell.openExternal`。开发模式读 `VITE_DEV_SERVER_URL` 加载 vite dev server。
- `electron/src/apiServer.ts`：启动引导（预建 `${os.tmpdir()}/anonymous_token`；内联实现 generateConfig 式 xeapi key 拉取与持久化，缺少即预缓存 JSON 直链 404）→ 设置 env（`ENABLE_GENERAL_UNBLOCK=true`）→ `net` 探测空闲端口 → `serveNcmApi({ port, host: '127.0.0.1', checkVersion: false })`；listening 后从 `app.server.address()` 取真实端口，`GET /` 健康检查；失败捕获后重试一次，仍失败则照常开窗（渲染层现有主 API 错误提示兜底）。
- `electron/src/preload.ts`：从 `process.argv` 解析 `--nextmusic-main-api-base`，`contextBridge.exposeInMainWorld('nextmusicDesktop', { mainApiBase, setGeneralUnblock(enabled) })`（mainApiBase 为同步 string；setGeneralUnblock 经 `ipcRenderer.invoke` 翻转主进程 `process.env.ENABLE_GENERAL_UNBLOCK` 并回传最终布尔值）。
- `src/vite-env.d.ts`：声明 `Window.nextmusicDesktop?: { mainApiBase: string; setGeneralUnblock(enabled: boolean): Promise<boolean> }`。
- `src/stores/settings.ts`：新增 `mainApiBaseOverride?: string` 与 `generalUnblock: boolean`（默认 true；持久化，兼容旧数据缺字段；桌面环境下 store 初始化后把 generalUnblock 同步给主进程）。
- `src/player/engine.ts`：新增 `setOutputDevice(deviceId: string): Promise<void>`（`'default'` 传空串；setSinkId 持久于唯一 audio 元素，切歌无需重设）。
- `src/composables/useAudioOutput.ts`（新）：设备枚举、`devicechange`、选择持久化与回退。
- UI（用户指定，全在设置页）：`SettingsView.vue` 新增桌面板块，仅桌面渲染：①「播放设备」列表（`AppIcon.vue` ICONS 表加内联 SVG，禁止 emoji）选中即时生效；②「主 API」本地内置 / 自定义 URL + 恢复默认，保存立即生效；③「解灰」开关（说明文案：对 VIP/灰色歌曲尝试解锁，重启应用后保持）。
- 打包：electron-builder；appId `cn.nextmusic.app`、productName `NextMusic`（占位值）；`files: ["dist/**", "electron/dist/**", "package.json"]`；mac dmg+zip（arm64+x64）、win NSIS（x64）、linux AppImage+deb（x64）；占位应用图标（红色主题音符静态资源，后续可替换）。
- 脚本：`desktop:dev`（scripts/desktop-dev.mjs 编排）、`desktop:build`（剥离 `VITE_MAIN_API` 的 web build → esbuild electron → electron-builder）、`desktop:build:mac|win|linux`、`typecheck:electron`。
- CI：`.github/workflows/desktop.yml`，tag `desktop-v*` 触发，matrix 三平台构建并上传 artifact / release。

## 测试

- 单测：主 API base 三级优先（desktop 注入 / override / env 回退，mock `globalThis.nextmusicDesktop`）与惰性求值（改 override 后无需重建模块）；同步调整引用 `MAIN_API_BASE` 形状的 4 个既有文件（`tests/unit/http.spec.ts`、`tests/unit/engine-chain.spec.ts`、`tests/unit/auth-store.spec.ts`、`tests/components/LoginView.spec.ts`）；engine `setOutputDevice`（jsdom 无 setSinkId，mock）；settings store override / generalUnblock 持久化与旧数据兼容；`useAudioOutput` 枚举/选择/设备消失回退（mock `navigator.mediaDevices`）。
- 组件测试：SettingsView 桌面板块仅桌面渲染（纯 Web 快照不变），覆盖设备列表交互、主 API 覆盖写入、解灰开关调用桥接。
- 桌面冒烟（`tests/e2e/desktop.smoke.spec.ts`，Playwright `_electron`，默认 CI 启用、本地可选）：窗口打开、本地 API 健康检查 200、渲染层 `mainApiBase` 指向 `127.0.0.1`、`/song/url/v1` JSON 直链返回 200（验证 xeapi 引导）。
- 回归门槛：`npm run typecheck`、`npm run test`、`npm run build`、现有 e2e/visual 全绿（证明纯 Web 未受影响）。

## 风险（实现时需逐一验证）

- api-enhanced 在 asar 内 `readdir`/`require` module 目录：Electron 的 asar fs 补丁理论上支持，冒烟验证；失败则 `asarUnpack` 整包。
- 本地实例 302 端点行为需与远程一致（实现早期用 node 脚本直连验证 `/song/url/v1/302`）；解灰是否覆盖 302 路由（builder-check 本机受 NCM -460 风控未能端到端确认）。
- `@neteasecloudmusicapienhanced/unblockmusic-utils` 是否含原生模块/外部二进制。
- Linux `setSinkId` 依赖 PulseAudio；纯 ALSA 仅默认设备。

## 我的拍板（审批时可否决）

1. 注入通道用 `additionalArguments` 同步 string（保渲染层全同步链路）
2. 主 API 覆盖立即生效：注册式 provider（仿 `bindCookieProvider`）+ 每请求惰性求值
3. ~~设备入口放 PlayerBar 音质按钮旁~~ **用户改定：桌面独有功能（设备切换/主 API 覆盖/解灰开关）统一放设置页**
4. 桌面构建强制置空 `VITE_MAIN_API`（防私有地址入包）+ 桌面专属兜底报错文案
5. 外链一律 `shell.openExternal`（deny 窗口打开）
6. appId/productName 占位值 `cn.nextmusic.app` / `NextMusic`；设备选择存独立 localStorage 键

## 非目标

- 签名/公证、自动更新、自定义标题栏、系统托盘、媒体键（SMTC/MPRIS）、桌面歌词
- OuterAPI 仍走远程（本地 api-enhanced 不含 OuterAPI 服务）
- 移动端/纯 Web 任何可见变化
