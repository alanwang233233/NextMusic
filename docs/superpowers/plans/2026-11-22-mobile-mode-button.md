# 移动端播放模式按钮实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 播放条播放模式按钮在移动端可见可点（去 `hidden sm:inline-flex`）。

**Architecture:** 单类名改动 + 测试断言；无 script/store 改动（`toggleMode` 已存在）。

**Tech Stack:** Vue 3 + Tailwind；Vitest/jsdom（类名断言）+ Playwright E2E 门禁。

**Spec:** `docs/superpowers/specs/2026-11-22-mobile-mode-button-design.md`

## Global Constraints

- 组件测试断言 jsdom 可达边界（类名/存在性）；Conventional Commits 中文。
- UI 改动门禁：`npm run typecheck` / `npm run test` / `npm run build` / `npm run test:e2e`（E2E 需先 build）。
- 用户知情接受窄屏挤压（375px 及以下歌名区被压缩、轻微溢出可能）——不得为消除挤压而隐藏其他按钮。

## Review Focus

1. 去掉 `hidden` 后桌面端（≥sm）布局零变化——类名仅删 `hidden sm:inline-flex` 前缀，其余不动（Task 1 断言 + 既有回归）。
2. E2E 现有用例不受新模式按钮影响（无定位器冲突）——Task 2 全量 E2E 钉住。

---

### Task 1: 模式按钮移动端可见

**Files:**
- Modify: `src/components/player/PlayerBar.vue:135`
- Test: `tests/components/PlayerBar.spec.ts`（追加用例）
- Commit（步骤 1 一并入库）: 设计稿与计划 docs

**Interfaces:**
- Consumes: 现有 `toggleMode` / `MODE_ICON`（无改动）。
- Produces: 无新接口。

- [ ] **Step 1: 提交设计稿与计划**

```bash
git add docs/superpowers
git commit -m "docs: 新增移动端播放模式按钮设计稿与实施计划"
```

- [ ] **Step 2: 追加失败测试到 `tests/components/PlayerBar.spec.ts`**

```ts
it('播放模式按钮在移动端可见（不再带 hidden）', () => {
  const player = usePlayerStore()
  player.playQueue([makeSong(1)], 0)
  const wrapper = mountBar()
  const modeBtn = wrapper.find('button[aria-label="播放模式"]')
  expect(modeBtn.exists()).toBe(true)
  expect(modeBtn.classes()).not.toContain('hidden')
})
```

- [ ] **Step 3: 运行验证失败**

Run: `npx vitest run tests/components/PlayerBar.spec.ts`
Expected: FAIL 1 条新用例（含 hidden），既有用例全绿

- [ ] **Step 4: 实现**

`class="btn-icon hidden sm:inline-flex"` → `class="btn-icon"`（仅模式按钮这一处）。

- [ ] **Step 5: 运行验证通过**

Run: `npx vitest run tests/components/PlayerBar.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/player/PlayerBar.vue tests/components/PlayerBar.spec.ts
git commit -m "feat(player): 播放模式按钮移动端可见"
```

---

### Task 2: 全量门禁（含 E2E）+ 终审 + 推送

**Files:** 无新改动（验证与推送）

- [ ] **Step 1: 门禁**

Run: `npm run typecheck && npm run test && npm run build && npm run test:e2e`
Expected: 全部通过（E2E 跑的是 dist，必须先 build）

- [ ] **Step 2: 终审 → 处理 Critical/Important → 推送**

fresh reviewer 读 review package；Critical/Important 一遍修复（TDD）；Minor 记台账；`git push origin master`；汇报裁决与遗留项。
