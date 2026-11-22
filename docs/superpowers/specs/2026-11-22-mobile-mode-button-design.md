# 移动端播放模式按钮设计（2026-11-22）

## 背景

`PlayerBar.vue:135` 播放模式按钮（顺序/单曲循环/随机）带 `hidden sm:inline-flex`，640px 以下不可见；移动端想切模式只能进全屏页（全屏页无此按钮）或桌面。

## 目标

播放模式按钮在移动端可见、可点。

## 已确认的决策（用户三选一）

- **仅去掉 `hidden` 前缀，接受挤压**：不改右侧功能区（下载/音质 pill 保留）。代价：390px 及以下屏（含 iPhone SE/mini 与 390px 标准款）歌名区被压缩到只剩封面缩略图甚至不可见。用户知情选定。
  - **实施修正（终审实测）**：原稿「390px 屏勉强放下」与实测不符——390px 下歌名/歌手文本同样压缩至不可见，且歌名区封面缩略图（`relative shrink-0`）会绘制在控制区按钮之上拦截点击。已随本次改动给歌名区按钮加 `overflow-hidden` 裁剪溢出，全视口命中测试恢复通过（代价为超窄屏封面被裁剪为细条，与已接受的取舍一致）。
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
