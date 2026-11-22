# 移动端播放进度与收藏按钮实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 播放条进度行与喜欢按钮在移动端可见（完整滑杆行形态），全屏播放页新增统一断点的可拖动进度滑杆行。

**Architecture:** 纯 UI 层改动：PlayerBar 复用现有桌面进度行（去响应式隐藏）与 seeking 状态机；NowPlaying 复制同款滑杆行与状态机（时间读数并入滑杆两端，删控制行尾旧文本）。无 store/接口层改动。

**Tech Stack:** Vue 3 `<script setup>` + Tailwind 3.4（`player-range` 全局样式已存在）+ Vitest/jsdom（无响应式视口，以类名与事件断言）。

**Spec:** `docs/superpowers/specs/2026-11-22-mobile-progress-design.md`

## Global Constraints

- 禁止 emoji，图标走 AppIcon；UI 文案与提交信息中文，Conventional Commits。
- 组件测试一律 `vi.mock('@/player/engine')` 替换 `getEngine`；`vi.mock` 工厂用内联字面量；部分保留用 `importOriginal`。
- jsdom 无响应式视口：移动端可见性以「不含 `hidden` 类 + 存在性」断言。
- 不触碰播放降级链、预缓存、E2E mocks；不新增接口调用。
- 门禁 `npm run typecheck` / `npm run test` / `npm run build` 全过后提交推送 `origin/master`（本会话既定工作流，用户已在设计确认时同意）。

## Review Focus

1. PlayerBar 进度行取消 `lg:flex` 后桌面端样式不变——行容器仅去掉 `hidden` 与 `lg:flex`，其余类保持原样（Task 1 类名断言 + 既有用例回归）。
2. NowPlaying 拖动必须走 `change` 事件提交（`seeking` 置位期间 `progressPct` 锁定 `seekValue`，`timeupdate` 不抖动）——Task 2 的 change 用例钉住提交流程。
3. `durationMs` 为 0（元数据未就绪）时拖动不得产生 NaN——`seekTo` 内部 `durationMs || 0` 兜底，Task 2 钉住 engine.seek(0)。
4. 控制行尾部旧时间文本删除后，「喜欢/下载/音质」行布局不塌陷（时间并入滑杆行）——Task 2 断言文本不再含 `m:ss / m:ss` 模式。
5. 条变高后遮挡：main 移动端 `pb-64` 预留充分，桌面 `lg` 布局不变——不属测试可达范围，人工冒烟项（终审提醒）。

---

### Task 1: PlayerBar 进度行与喜欢按钮移动端可见

**Files:**
- Modify: `src/components/player/PlayerBar.vue:85`（行容器类）、`:154`（喜欢按钮类）、进度行加 `data-testid="progress-row"`
- Test: `tests/components/PlayerBar.spec.ts`（追加用例）
- Commit（步骤 1 一并入库）: `docs/superpowers/specs/2026-11-22-mobile-progress-design.md`、`docs/superpowers/plans/2026-11-22-mobile-progress.md`

**Interfaces:**
- Consumes: 现有 `progressPct` / `seeking` / `onSeekStart` / `onSeek`（PlayerBar 内部，无改动）。
- Produces: `data-testid="progress-row"`（进度行容器，供测试定位）。

- [ ] **Step 1: 提交设计稿与计划**

```bash
git add docs/superpowers
git commit -m "docs: 新增移动端进度条与收藏按钮设计稿与实施计划"
```

- [ ] **Step 2: 追加失败测试到 `tests/components/PlayerBar.spec.ts`**

挂载方式沿用文件内 `mountBar()`（`player.playQueue([makeSong(1)], 0)` 后挂载）。追加用例：

```ts
it('移动端渲染进度行（不再隐藏）', () => {
  const player = usePlayerStore()
  player.playQueue([makeSong(1)], 0)
  const wrapper = mountBar()
  const row = wrapper.find('[data-testid="progress-row"]')
  expect(row.exists()).toBe(true)
  expect(row.classes()).not.toContain('hidden')
})

it('喜欢按钮在移动端可见（不再带 hidden）', () => {
  const player = usePlayerStore()
  player.playQueue([makeSong(1)], 0)
  const wrapper = mountBar()
  const like = wrapper.find('button[aria-label="喜欢"]')
  expect(like.exists()).toBe(true)
  expect(like.classes()).not.toContain('hidden')
})
```

- [ ] **Step 3: 运行验证失败**

Run: `npx vitest run tests/components/PlayerBar.spec.ts`
Expected: FAIL 2 条新用例（`progress-row` 不存在 / 喜欢按钮含 `hidden`），既有用例全绿

- [ ] **Step 4: 实现 PlayerBar 改动**

- 进度行容器：`class="hidden items-center gap-2 px-5 pt-2.5 lg:flex"` → `class="flex items-center gap-2 px-5 pt-2.5"`，并加 `data-testid="progress-row"`。
- 喜欢按钮：`class="btn-icon hidden sm:inline-flex"` → `class="btn-icon"`。
- 其余（播放模式按钮的 `hidden sm:inline-flex`、右侧功能区）不动。

- [ ] **Step 5: 运行验证通过**

Run: `npx vitest run tests/components/PlayerBar.spec.ts`
Expected: PASS（全部用例）

- [ ] **Step 6: Commit**

```bash
git add src/components/player/PlayerBar.vue tests/components/PlayerBar.spec.ts
git commit -m "feat(player): 移动端播放条显示进度滑杆行与喜欢按钮"
```

---

### Task 2: NowPlaying 新增全屏进度滑杆行

**Files:**
- Modify: `src/components/player/NowPlaying.vue`（script 增 seeking 状态机；封面块控制区上方加滑杆行；删控制行尾时间文本）
- Create: `tests/components/NowPlaying.spec.ts`

**Interfaces:**
- Consumes: `player.progress`（0-1 getter）、`player.seekTo(ratio)`、`player.durationMs`、`formatDuration`（均已存在）；`input.player-range` 全局样式。
- Produces: 全屏页滑杆行（时间 + `input[aria-label="播放进度"]` + 时间）；测试依赖 `data-testid="now-playing"` 已有。

- [ ] **Step 1: 写失败测试 `tests/components/NowPlaying.spec.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import NowPlaying from '@/components/player/NowPlaying.vue'
import { usePlayerStore } from '@/stores/player'
import type { Song } from '@/types/models'

vi.mock('@/player/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/player/engine')>()
  return { ...actual, getEngine: vi.fn(() => fakeEngine) }
})

const fakeEngine = {
  play: vi.fn(async () => undefined),
  togglePlay: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
}

vi.mock('@/api/song', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/song')>()
  return { ...actual, fetchLyric: vi.fn(async () => ({ lrc: { lyric: '' } })) }
})

function makeSong(id: number): Song {
  return { id, name: `song-${id}`, artists: [{ id: 1, name: 'artist-a' }], album: { id: 10, name: 'album-a', picUrl: 'https://p1.music.126.net/x.jpg' }, duration: 200_000 }
}

describe('NowPlaying', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  function mountView() {
    return mount(NowPlaying, {
      global: {
        stubs: {
          Transition: { template: '<div><slot /></div>' },
          Teleport: { template: '<div><slot /></div>' },
        },
      },
    })
  }

  function openWithSong() {
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    player.showNowPlaying = true
    return mountView()
  }

  it('全屏页渲染进度滑杆行（时间在两端）', () => {
    const wrapper = openWithSong()
    const slider = wrapper.find('input[aria-label="播放进度"]')
    expect(slider.exists()).toBe(true)
    // 两端时间标签存在，且旧「m:ss / m:ss」复合文本已移除
    expect(wrapper.text()).toMatch(/\d:\d\d/)
    expect(wrapper.text()).not.toMatch(/\d:\d\d \/ \d:\d\d/)
  })

  it('拖动提交后按比例 seek', async () => {
    const wrapper = openWithSong()
    const slider = wrapper.find('input[aria-label="播放进度"]')
    await slider.setValue(500)
    await slider.trigger('change')
    expect(fakeEngine.seek).toHaveBeenCalledWith(100_000) // 0.5 × 200000ms
  })

  it('durationMs 为 0 时拖动 seek 0 不产生 NaN', async () => {
    const player = usePlayerStore()
    player.playQueue([makeSong(1)], 0)
    player.showNowPlaying = true
    player.durationMs = 0
    const wrapper = mountView()
    const slider = wrapper.find('input[aria-label="播放进度"]')
    await slider.setValue(500)
    await slider.trigger('change')
    expect(fakeEngine.seek).toHaveBeenCalledWith(0)
  })
})
```

断言边界为 `fakeEngine.seek`（engine mock 是可观察边界，store 内部不直接断言）。

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run tests/components/NowPlaying.spec.ts`
Expected: FAIL（滑杆不存在 / 旧复合文本仍存在 → `toMatch` 失败）

- [ ] **Step 3: 实现 NowPlaying 滑杆行**

script 追加（与 PlayerBar 同款）：

```ts
const seeking = ref(false)
const seekValue = ref(0)
const progressPct = computed(() => (seeking.value ? seekValue.value : Math.round(player.progress * 1000)))
function onSeekStart() {
  seeking.value = true
  seekValue.value = Math.round(player.progress * 1000)
}
function onSeek() {
  player.seekTo(seekValue.value / 1000)
  seeking.value = false
}
```

模板：封面块中 `<h2>/<p>` 歌名歌手之后、`<!-- 控制区 -->` div 之前插入：

```html
<!-- 进度 -->
<div class="mt-4 flex items-center gap-2">
  <span class="w-10 text-right text-[11px] tabular-nums text-zinc-500">{{ formatDuration(player.currentTimeMs) }}</span>
  <input
    type="range"
    class="player-range flex-1"
    min="0"
    max="1000"
    :value="progressPct"
    :style="{ '--progress': `${progressPct / 10}%` }"
    aria-label="播放进度"
    @pointerdown="onSeekStart"
    @input="seekValue = Number(($event.target as HTMLInputElement).value)"
    @change="onSeek"
  />
  <span class="w-10 text-[11px] tabular-nums text-zinc-500">{{ formatDuration(player.durationMs) }}</span>
</div>
```

同时删除控制区内 `<span class="ml-auto text-[11px] tabular-nums text-zinc-500">{{ formatDuration(...) }} / {{ formatDuration(...) }}</span>` 整个元素。

- [ ] **Step 4: 运行验证通过 + 类型检查**

Run: `npx vitest run tests/components/NowPlaying.spec.ts tests/components/PlayerBar.spec.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/player/NowPlaying.vue tests/components/NowPlaying.spec.ts
git commit -m "feat(player): 全屏播放页新增可拖动进度滑杆行"
```

---

### Task 3: 全量门禁 + 推送

**Files:** 无新改动（验证与推送；失败时修复并追加提交）

- [ ] **Step 1: 全量门禁**

Run: `npm run typecheck && npm run test && npm run build`
Expected: 全部通过

- [ ] **Step 2: 终审后推送**

终审（fresh reviewer，读 review package）→ 处理 Critical/Important（一遍修复，TDD）→ Minor 记台账 → `git push origin master`。

- [ ] **Step 3: 汇报**

列出提交、测试/构建结果、裁决与遗留项。
