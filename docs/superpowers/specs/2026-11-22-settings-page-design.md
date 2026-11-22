# 设置页面设计（2026-11-22）

## 背景与目标

现状：`src/stores/settings.ts` 已持久化播放音质 `quality`（默认 exhigh）与歌词翻译开关；下载复用播放音质（SongList / PlayerBar / NowPlaying 三处调用）；没有设置页面，也没有任何设置入口。

目标：新增 `/settings` 设置页面，包含三项功能：

1. 设置默认音质（播放音质）
2. 设置默认下载音质（新增独立设置，下载不再复用播放音质）
3. 关于：仅展示应用名、仓库链接、当前提交

## 已确认的决策

1. **入口**：桌面侧边栏新增「设置」项；移动端 BottomNav 保持 5 项不变，从「我的音乐」页快捷入口进入。
2. **关于形态**：设置页内「关于」板块（非独立路由页），内容仅应用名 + 仓库链接 + 当前提交。
3. **默认下载音质默认值**：极高 320k（`exhigh`，与当前实际行为一致）。

## 方案取舍

- **下载音质档位**：仅 4 档（现有 `qualityToBr` 折叠映射的产物）vs 全 10 档 → 选全 10 档。依据 `docs/mainAPI.md`，新版下载接口 `/song/download/url/v1` 直接接受与播放一致的 `level` 参数（standard … sky 全部 10 档），现有代码走的旧接口 `/song/download/url` 只接受数字 `br` 才导致档位折叠。用户已确认不应只支持四档。
- **下载接口**：旧 `/song/download/url`（数字 `br`）vs 新 `/song/download/url/v1`（`level`）→ 选 v1，与播放音质等级语义对齐；`qualityToBr` 随之删除（无其他调用方）。
- **关于内容**：完整版（版本号/技术栈/许可等）vs 精简版 → 选精简版（用户指定只留应用名、仓库链接、当前提交）。
- **移动端入口**：BottomNav 加第 6 项 vs 「我的音乐」快捷入口 → 选后者（底栏 6 项拥挤）。
- **当前提交的注入方式**：构建期 vite `define` 注入 `__APP_COMMIT__`（`git rev-parse --short HEAD`，失败回退 `unknown`）vs 运行时获取 → 选前者（纯客户端无自建后端，构建期注入零运行时成本）。

## 实现要点

- `src/stores/settings.ts`：新增 `downloadQuality: QualityLevel`（默认 `'exhigh'`）与 `setDownloadQuality`；持久化字段扩展，兼容旧本地数据缺字段的情况。
- `src/api/song.ts`：`fetchDownloadUrl` 改走 `/song/download/url/v1`，参数由 `br` 改为 `level`（仍走 mainApi POST JSON body）。
- `src/utils/download.ts`：`downloadSong` 直接把音质等级传给 `fetchDownloadUrl`，不再经 `qualityToBr`；`src/config/constants.ts` 删除 `qualityToBr`。
- 下载调用点改用 `settings.downloadQuality`：`SongList.vue`、`PlayerBar.vue`、`NowPlaying.vue` 三处。
- `src/views/SettingsView.vue`（新）：
  - 「默认音质」：沿用 `QUALITY_LEVELS` 全 10 档，VIP 档标注，样式与播放条音质菜单一致（选中打勾）。
  - 「默认下载音质」：同样复用 `QUALITY_LEVELS` 全 10 档（VIP 标注），不再单独定义下载档位常量。
  - 「关于」：应用名 NextMusic、仓库链接（github.com/alanwang233233/NextMusic）、当前提交短哈希（`__APP_COMMIT__`，链到对应 commit 页）。
- `src/router/index.ts`：新增 `/settings` 路由（title「设置」，不设 `requiresUser`——本地偏好所有模式可用）。
- 入口：`SideBar.vue` NAV_ITEMS 加「设置」；`MeView.vue` QUICK_LINKS 加设置；新齿轮图标加入 `AppIcon.vue` ICONS 表（项目禁止 emoji）。
- `vite.config.ts`：`define` 注入 `__APP_COMMIT__`；`src/vite-env.d.ts` 补声明。

## 测试

- 新增 `tests/unit/settings-store.spec.ts`：默认值、`setQuality` / `setDownloadQuality` 持久化、旧数据缺 `downloadQuality` 字段时的兼容。
- `tests/unit/download.spec.ts`：现有用例 mock 了 `fetchDownloadUrl`，签名变化不受影响；补充「音质等级原样透传给 `fetchDownloadUrl`」断言。
- 新增 `tests/components/SettingsView.spec.ts`：三个板块渲染、切换音质写入 store、关于板块展示提交哈希。
- 门槛：`npm run typecheck`、`npm run test`、`npm run build` 全部通过。

## 非目标

- 不改移动端 BottomNav；不新增歌词翻译开关的页面展示（原入口在全屏播放页保留）；不为设置页引入任何新接口调用。
