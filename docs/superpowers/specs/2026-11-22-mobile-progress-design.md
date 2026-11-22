# 移动端播放进度与收藏按钮修复设计（2026-11-22）

## 背景

- `PlayerBar.vue:85` 进度行 `hidden lg:flex`：仅桌面（≥1024px）显示，移动端完全无进度显示。
- `PlayerBar.vue:154` 喜欢按钮 `hidden sm:inline-flex`：640px 以下隐藏，手机上不可见。
- `NowPlaying.vue` 全屏播放页**所有断点**均无进度条，仅控制行尾部一段 `currentTime / duration` 文本。

## 目标

1. PlayerBar 的完整滑杆行（时间 + 可拖动滑杆 + 时间）在移动端同样显示。
2. PlayerBar 喜欢（收藏）按钮在移动端可见。
3. NowPlaying 全屏页新增可拖动进度滑杆行，所有断点统一。

## 已确认的决策

- **小条进度形态**：完整滑杆行（用户三选一选定：细进度线不可拖 / 细进度线可拖 / 完整滑杆行）——播放条整体增高约 28px，歌曲信息区相应变窄（truncate 已有）。
- **NowPlaying 滑杆范围**：所有断点统一（同一组件，桌面全屏同样只有文本读数，顺带补齐）；时间读数并入滑杆行两端，删除控制行尾部原有时间文本，避免重复。

## 实现要点

- `PlayerBar.vue`：进度行容器 `hidden items-center gap-2 px-5 pt-2.5 lg:flex` → `flex items-center gap-2 px-5 pt-2.5`（桌面样式不变，移动端直接复用现有 seeking/seekValue/onSeekStart/onSeek 状态与 `player-range` 全局样式）；喜欢按钮去掉 `hidden sm:inline-flex` 前缀。
- `NowPlaying.vue`：新增 `seeking` / `seekValue` 状态与 `onSeekStart` / `onSeek` / `progressPct`（与 PlayerBar 同款逻辑，`player.progress` 0-1 → 0-1000 档位）；在封面块「控制区」上方新增滑杆行（时间 + range + 时间）；删除控制行尾部 `ml-auto` 的时间文本 span。
- 播放模式按钮在移动端保持隐藏（不在本次范围）；BottomNav、音质/下载/队列按钮布局不动。

## 测试

- `tests/components/PlayerBar.spec.ts`：现有用例不回归；新增断言——进度行与喜欢按钮不再带 `hidden` 类（jsdom 无响应式视口，以类名断言）。
- 新增 `tests/components/NowPlaying.spec.ts`：mock `@/api/song`（fetchLyric）与 `@/player/engine`（组件测试硬性要求），stub teleport；断言全屏页渲染滑杆行、拖动 change 后 `player.seekTo` 被以正确秒数调用、时间读数文本不再单独出现在控制行。
- 门禁：`npm run typecheck` / `npm run test` / `npm run build` 全过，Conventional Commits 中文提交后推送（沿用既定工作流）。

## 非目标

- 不改播放降级链、预缓存与 E2E mock；不新增任何接口调用。
- 不调整 BottomNav 与桌面播放条既有布局语义。
