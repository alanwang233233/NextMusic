# 移动端播放模式按钮设计（2026-11-22）

## 背景

`PlayerBar.vue:135` 播放模式按钮（顺序/单曲循环/随机）带 `hidden sm:inline-flex`，640px 以下不可见；移动端想切模式只能进全屏页（全屏页无此按钮）或桌面。

## 目标

播放模式按钮在移动端可见、可点。

## 已确认的决策（用户三选一）

- **仅去掉 `hidden` 前缀，接受挤压**：不改右侧功能区（下载/音质 pill 保留）。代价：375px 及以下屏（iPhone SE/mini、360px Android）歌名区被压缩到只剩封面缩略图、可能有轻微溢出；390px 屏勉强放下。用户知情选定。
- 备选被否：移动端隐藏下载按钮（省 38px）、隐藏下载+音质（省 84px）。

## 实现要点

- `PlayerBar.vue:135`：`class="btn-icon hidden sm:inline-flex"` → `class="btn-icon"`。其余不动。
- 模式切换逻辑（`toggleMode` + `MODE_ICON`/`MODE_NEXT`）已存在，无 script 改动。

## 测试

- `tests/components/PlayerBar.spec.ts`：追加断言——模式按钮不含 `hidden` 类（jsdom 无视口，类名断言；现有「播放模式循环切换」用例已覆盖点击行为）。
- 门禁：`npm run typecheck` / `npm run test` / `npm run build` / `npm run test:e2e`（UI 改动，按上轮终审采纳的改进把 E2E 纳入门禁；E2E 需先 build）。
- 终审（fresh reviewer）后推送 `origin/master`（既定工作流）。

## 非目标

- 不改右侧功能区布局；不为模式按钮做长按菜单或下拉；不动 BottomNav 与全屏页。
