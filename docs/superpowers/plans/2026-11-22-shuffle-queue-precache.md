# 随机播放洗牌队列与预缓存重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 随机播放改为洗牌队列模型（上一首/下一首严格跟随队列），单曲循环跨轮复用预缓存 blob 不重复下载，随机模式恢复下一曲预测预缓存。

**Architecture:** 队列本身即洗牌结果（Fisher-Yates），`setMode('shuffle')` 重组队列不打断播放；新增 `playAll` 动作让视图表达「播放全部」手势（shuffle 下整列表完全随机），`playQueue`/`playSongNow` 的点播手势在 shuffle 下点击曲队首；`peekNextSong` 统一预测（loop 返回当前曲、order/shuffle 返回 index+1 回绕），precache 新增保留式取用支持 loop 复用。

**Tech Stack:** Vue 3 + Pinia + TypeScript strict + Vitest（现有测试设施：`vi.mock('@/player/engine')`、precache 模块级 mock、`FakeAudio` 假 Audio 类）。

**Spec:** `docs/superpowers/specs/2026-11-22-shuffle-queue-precache-design.md`

## Global Constraints

- 提交前 `npm run typecheck`（vue-tsc）必须通过；测试命令 `npm run test`（Vitest，tests/unit + tests/components）
- 禁止 emoji；Conventional Commits 中文提交信息
- 引擎降级链（`main302 → outer`）、`src/player/engine.ts`、`tests/unit/engine-chain.spec.ts`、E2E mocks 一律不动
- FM 续播逻辑不动：FMView 直接赋值 `player.queue`（不经 `playQueue`），所有洗牌分支必须带 `!this.fmMode` 守卫
- 不引入持久化；blob 生命周期延续 handoff 两代回收规则
- `vi.mock` 工厂实现跨用例残留：涉及 mock 的用例在 `beforeEach` 或用例内显式重置 `mockReturnValue`/`mockImplementation`
- 洗牌用 `Math.random`（无需可复现种子）；`shuffledTail` 必须返回新数组、不修改入参

## Review Focus

1. **队列只有 1 首时切 shuffle**：Fisher-Yates 空转，当前曲即队首，播放不打断 → Task 1 Step 1 的单首用例
2. **shuffle 下点击列表第一首（start=0，与播放全部同参）**：`playQueue` 必须点击曲队首（点谁播谁），只有 `playAll` 才完全随机 → Task 2 Step 1 的 playQueue 用例
3. **loop 中手动切歌后的 blob 残留**：`playAt` 在 loop 下必须 `evictExcept(当前曲)` 释放旧歌 blob → Task 3 Step 1 的切歌清理断言
4. **快速连续跳歌的 store 条目积累**：超过 4 条淘汰最旧并 revoke → Task 3 Step 1 的上限用例
5. **FM 播放中切到 shuffle**：FM 推荐流顺序不被洗 → Task 1 Step 1 的 fmMode 用例

---

### Task 1: store 洗牌队列核心（setMode 洗牌 + 遍历与预测统一）

**Files:**
- Modify: `src/stores/player.ts`
- Test: `tests/unit/player-store.spec.ts`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: `export function shuffledTail(songs: Song[]): Song[]`（Fisher-Yates 纯函数，Task 2/依赖）；`peekNextSong()` 新语义（loop → 当前曲；order/shuffle → index+1 回绕；fmMode → queue[index+1]）；删除 `pickShuffle`；`setMode` 增加洗牌副作用

- [ ] **Step 1: Write the failing tests**

在 `tests/unit/player-store.spec.ts` 顶部 import 处补充 `shuffledTail`（来自 `@/stores/player`），然后：

替换现有用例 `shuffle 模式下一首不等于当前`（约 :121）为：

```ts
it('shuffle 模式：切换时当前曲固定队首，其余洗牌，不打断播放', () => {
  const player = usePlayerStore()
  player.playQueue([makeSong(1), makeSong(2), makeSong(3), makeSong(4), makeSong(5)], 2)
  player.playing = true
  const playCallsBefore = fakeEngine.play.mock.calls.length
  player.preloadedNextFor = 5 // 模拟旧"下一曲已预载"标记
  const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
  player.setMode('shuffle')
  randomSpy.mockRestore()
  // 当前曲固定队首，队列是原集合的排列
  expect(player.queue[0]?.id).toBe(3)
  expect(player.queue.map((s) => s.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  expect(player.index).toBe(0)
  // 旧"下一曲"预测作废，徽标不撒谎
  expect(player.preloadedNextFor).toBe(0)
  // 不打断播放：不重新 play，playing 保持
  expect(fakeEngine.play.mock.calls.length).toBe(playCallsBefore)
  expect(player.playing).toBe(true)
  // 随机模式下一首/上一首严格跟随洗牌后的队列
  player.next()
  expect(player.currentSong?.id).toBe(player.queue[1]?.id)
  player.prev()
  expect(player.currentSong?.id).toBe(3)
})

it('shuffle 模式：队列只有一首时平凡洗牌，播放不打断', () => {
  const player = usePlayerStore()
  player.playQueue([makeSong(1)], 0)
  player.playing = true
  player.setMode('shuffle')
  expect(player.queue.map((s) => s.id)).toEqual([1])
  expect(player.index).toBe(0)
  expect(player.playing).toBe(true)
})

it('shuffle 模式：队列为空时切换仅记录模式', () => {
  const player = usePlayerStore()
  player.setMode('shuffle')
  expect(player.mode).toBe('shuffle')
  expect(player.queue).toHaveLength(0)
})

it('shuffle 切回 order/loop：队列保持洗牌序不动', () => {
  const player = usePlayerStore()
  player.playQueue([makeSong(1), makeSong(2), makeSong(3), makeSong(4), makeSong(5)], 2)
  const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
  player.setMode('shuffle')
  randomSpy.mockRestore()
  const shuffled = player.queue.map((s) => s.id)
  player.setMode('order')
  expect(player.queue.map((s) => s.id)).toEqual(shuffled)
  player.setMode('loop')
  expect(player.queue.map((s) => s.id)).toEqual(shuffled)
})

it('shuffle 模式：FM 播放中切换不洗 FM 队列', () => {
  const player = usePlayerStore()
  player.playQueue([makeSong(1), makeSong(2), makeSong(3)], 1)
  player.fmMode = true
  player.setMode('shuffle')
  expect(player.queue.map((s) => s.id)).toEqual([1, 2, 3])
  expect(player.index).toBe(1)
})
```

替换现有用例 `peekNextSong：order 模式回绕，loop/shuffle 返回 null，fm 取下一首`（约 :267）为：

```ts
it('peekNextSong：order/shuffle 回绕预测下一首，loop 返回当前曲，fm 取下一首', () => {
  const player = usePlayerStore()
  player.playQueue([makeSong(1), makeSong(2), makeSong(3)], 2)
  expect(player.peekNextSong()?.id).toBe(1) // order：末尾回绕到第一首

  player.setMode('shuffle') // 3 为当前曲 → 队首，其余洗牌
  expect(player.peekNextSong()?.id).toBe(player.queue[1]?.id)
  player.setMode('loop')
  expect(player.peekNextSong()?.id).toBe(player.currentSong?.id) // loop：预载自己

  player.setMode('order')
  player.fmMode = true
  expect(player.peekNextSong()).toBeNull() // FM 队列末尾
  player.queue.push(makeSong(9))
  expect(player.peekNextSong()?.id).toBe(9)
})
```

新增 `shuffledTail` 纯函数用例（固定 Math.random 序列锁定算法，实现必须为从队尾向队首的标准 Fisher-Yates）：

```ts
it('shuffledTail：Fisher-Yates 返回新数组且不修改入参', () => {
  const input = [makeSong(1), makeSong(2), makeSong(3)]
  const spy = vi.spyOn(Math, 'random')
    .mockReturnValueOnce(0.9) // i=2 → j=2，无交换
    .mockReturnValueOnce(0.1) // i=1 → j=0，交换 a[1]/a[0]
  const out = shuffledTail(input)
  spy.mockRestore()
  expect(input.map((s) => s.id)).toEqual([1, 2, 3])
  expect(out.map((s) => s.id)).toEqual([2, 1, 3])
  expect(out).not.toBe(input)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/player-store.spec.ts`
Expected: FAIL（`shuffledTail` 未导出导致编译错误，或 shuffle/peekNextSong 行为断言失败）

- [ ] **Step 3: Implement in `src/stores/player.ts`**

文件顶部（store 定义之外）导出纯函数：

```ts
/** Fisher-Yates 洗牌：返回新数组，不修改入参 */
export function shuffledTail(songs: Song[]): Song[] {
  const out = [...songs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}
```

`setMode` 改为（保留 `this.mode = mode` 首行）：

```ts
setMode(mode: PlayMode) {
  this.mode = mode
  // 切到随机：当前曲固定队首，其余洗牌，不打断播放；FM 队列与空队列不洗
  if (mode !== 'shuffle' || this.fmMode || !this.hasCurrent) return
  const current = this.currentSong!
  this.queue = [current, ...shuffledTail(this.queue.filter((_, i) => i !== this.index))]
  this.index = 0
  // 旧"下一曲"预测作废：徽标与触发标记重置（若旧预载歌恰是新下一曲，preloadNext 的 peek 会零成本重新标记）
  this.preloadedNextFor = 0
  this._preloadTriggeredFor = 0
}
```

`next()` 删除 `else if (this.mode === 'shuffle')` 分支及 `pickShuffle` action，仅保留 fmMode 分支与 order 逻辑（order 与 shuffle 共用 `index+1`）。

`peekNextSong()` 改为：

```ts
peekNextSong(): Song | null {
  if (!this.queue.length) return null
  if (this.fmMode) return this.queue[this.index + 1] ?? null
  if (this.mode === 'loop') return this.currentSong
  const nextIndex = this.index + 1 < this.queue.length ? this.index + 1 : 0
  return this.queue[nextIndex] ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/player-store.spec.ts`
Expected: PASS（全部用例，含未改动的 order/loop/fm/插播/预缓存回归用例）

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/stores/player.ts tests/unit/player-store.spec.ts
git commit -m "feat(player): 随机播放改为洗牌队列，遍历与预测统一跟随队列"
```

---

### Task 2: `playAll` 动作 + 建队列入口 shuffle 分支 + 5 个视图接线

**Files:**
- Modify: `src/stores/player.ts`（playQueue / playSongNow / 新增 playAll）
- Modify: `src/views/PlaylistDetailView.vue:84-87`（`playAll()` 函数体）
- Modify: `src/views/AlbumDetailView.vue:67`（播放全部按钮 `@click`）
- Modify: `src/views/LikedView.vue:61`（播放全部按钮 `@click`）
- Modify: `src/views/ArtistView.vue:88-91`（`playAll()` 函数体）
- Modify: `src/views/DailyView.vue:40-43`（`playSongs()` 函数体）
- Test: `tests/unit/player-store.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `shuffledTail`
- Produces: store action `playAll(songs: Song[]): void`（播放全部手势：shuffle 下整列表完全随机起播，order/loop 等价 `playQueue(songs, 0)`）

- [ ] **Step 1: Write the failing tests**

追加到 `tests/unit/player-store.spec.ts`：

```ts
it('playAll：order 模式等价 playQueue 从第 0 首播', () => {
  const player = usePlayerStore()
  player.playAll([makeSong(1), makeSong(2), makeSong(3)])
  expect(player.queue.map((s) => s.id)).toEqual([1, 2, 3])
  expect(player.index).toBe(0)
})

it('playAll：shuffle 模式整列表洗牌，从随机一首起播', () => {
  const player = usePlayerStore()
  player.setMode('shuffle')
  player.playAll([makeSong(1), makeSong(2), makeSong(3), makeSong(4)])
  expect(player.queue).toHaveLength(4)
  expect(player.queue.map((s) => s.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
  expect(player.index).toBe(0)
  expect(player.currentSong?.id).toBe(player.queue[0]?.id)
})

it('playAll：空列表不建立队列', () => {
  const player = usePlayerStore()
  player.playAll([])
  expect(player.queue).toHaveLength(0)
})

it('playQueue：shuffle 模式下起始曲队首，其余洗牌（点击曲先播）', () => {
  const player = usePlayerStore()
  player.setMode('shuffle')
  player.playQueue([makeSong(1), makeSong(2), makeSong(3), makeSong(4)], 2)
  expect(player.queue[0]?.id).toBe(3)
  expect(player.queue.map((s) => s.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
  expect(player.currentSong?.id).toBe(3)
})

it('playQueue：shuffle 模式 start 越界退化为整列表洗牌', () => {
  const player = usePlayerStore()
  player.setMode('shuffle')
  player.playQueue([makeSong(1), makeSong(2)], 99)
  expect(player.queue.map((s) => s.id).sort((a, b) => a - b)).toEqual([1, 2])
  expect(player.index).toBe(0)
})

it('playSongNow：shuffle 模式空队列建队列时点击曲队首，其余洗牌', () => {
  const player = usePlayerStore()
  player.setMode('shuffle')
  player.playSongNow(makeSong(102), [makeSong(101), makeSong(102), makeSong(103)])
  expect(player.queue[0]?.id).toBe(102)
  expect(player.queue.map((s) => s.id).sort((a, b) => a - b)).toEqual([101, 102, 103])
  expect(player.currentSong?.id).toBe(102)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/player-store.spec.ts`
Expected: FAIL（`playAll` 不存在；shuffle 下 playQueue 行为不匹配）

- [ ] **Step 3: Implement in `src/stores/player.ts`**

`playAll`（放在 `playQueue` 之前）：

```ts
/** 播放全部手势：随机模式下整列表洗牌、随机一首起播；其余模式等价 playQueue(songs, 0) */
playAll(songs: Song[]) {
  if (!songs.length) return
  if (this.mode === 'shuffle' && !this.fmMode) {
    this.queue = shuffledTail(songs)
    this.fmMode = false
    void this.playAt(0)
    return
  }
  this.playQueue(songs, 0)
}
```

`playQueue` 改为：

```ts
playQueue(songs: Song[], startIndex = 0) {
  if (!songs.length) return
  // 随机模式点播：起始曲队首（点谁播谁），其余洗牌；start 越界退化为整列表洗牌
  if (this.mode === 'shuffle' && !this.fmMode) {
    const startSong = songs[startIndex]
    this.queue = startSong
      ? [startSong, ...shuffledTail(songs.filter((s) => s.id !== startSong.id))]
      : shuffledTail(songs)
    this.fmMode = false
    void this.playAt(0)
    return
  }
  this.queue = [...songs]
  this.fmMode = false
  void this.playAt(startIndex)
}
```

`playSongNow` 的「空队列 + 浏览上下文」分支内（`contextIndex >= 0` 时）改为：

```ts
if (this.mode === 'shuffle' && !this.fmMode) {
  this.queue = [song, ...shuffledTail(context.filter((s) => s.id !== song.id))]
} else {
  this.queue = [...context]
}
this.fmMode = false
void this.playAt(0)
return
```

（「已在队列跳转」「插播当前曲之后」两分支不变。）

视图接线（5 处，均为把 `playQueue(xxx, 0)` 换成 `playAll(xxx)`）：
- `PlaylistDetailView.vue` `playAll()` 函数体 → `player.playAll(songs.value)`
- `AlbumDetailView.vue:67` → `@click="player.playAll(songs)"`
- `LikedView.vue:61` → `@click="player.playAll(songs)"`
- `ArtistView.vue:88-91` `playAll()` → `player.playAll(topSongs.value)`
- `DailyView.vue` `playSongs()` → `player.playAll(songs.value)`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/player-store.spec.ts tests/components/`
Expected: PASS（组件测试只做 playQueue 铺垫、不断言播放全部按钮的 store 调用，不受影响）

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/stores/player.ts src/views/PlaylistDetailView.vue src/views/AlbumDetailView.vue src/views/LikedView.vue src/views/ArtistView.vue src/views/DailyView.vue tests/unit/player-store.spec.ts
git commit -m "feat(player): 新增 playAll 动作按模式区分播放全部与点播手势"
```

---

### Task 3: precache loop 保留式取用 + 残留清理 + 条目上限

**Files:**
- Modify: `src/player/precache.ts`
- Modify: `src/stores/player.ts`（`playAt`）
- Test: `tests/unit/precache.spec.ts`
- Test: `tests/unit/player-store.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `peekNextSong` loop → 当前曲（loop 预载自己）
- Produces: `nextSongPreloader.takeKeep(songId: number): PreloadOutcome | null`（命中不删除条目，可重复取用；handoff 记录同 URL 去重）；`nextSongPreloader.evictExcept(songId: number): void`（清除并 revoke 其他条目）；store `preload` 成功后 store 上限 4 条

- [ ] **Step 1: Write the failing tests**

`tests/unit/precache.spec.ts` 追加（沿用 `FakeAudio`/`lastProbe()` 设施）：

```ts
it('takeKeep：保留条目可重复取用（loop 跨轮复用）', async () => {
  const p = nextSongPreloader.preload(song, 'exhigh')
  await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
  lastProbe().duration = 200
  lastProbe().dispatch('canplay')
  await p
  expect(nextSongPreloader.takeKeep(7)!.url).toBe('blob:mock-1')
  expect(nextSongPreloader.takeKeep(7)!.url).toBe('blob:mock-1')
  // 条目不删除，peek 仍可见（重播过半 peek 命中 → 零重复 fetch）
  expect(nextSongPreloader.peek(7)).not.toBeNull()
})

it('evictExcept：清除其他歌曲条目并 revoke blob，保留指定条目', async () => {
  const p1 = nextSongPreloader.preload(song, 'exhigh') // id 7
  await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(1))
  lastProbe().duration = 200
  lastProbe().dispatch('canplay')
  await p1
  const other: Song = { ...song, id: 8 }
  const p2 = nextSongPreloader.preload(other, 'exhigh')
  await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(2))
  lastProbe().duration = 200
  lastProbe().dispatch('canplay')
  await p2
  nextSongPreloader.evictExcept(8)
  expect(nextSongPreloader.peek(7)).toBeNull()
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1')
  expect(nextSongPreloader.peek(8)).not.toBeNull()
})

it('store 超过 4 条时淘汰最旧条目并 revoke', async () => {
  const ids = [7, 8, 9, 10, 11]
  for (const id of ids) {
    const target: Song = { ...song, id }
    const p = nextSongPreloader.preload(target, 'exhigh')
    await vi.waitFor(() => expect(FakeAudio.instances.length).toBe(ids.indexOf(id) + 1))
    lastProbe().duration = 200
    lastProbe().dispatch('canplay')
    await p
  }
  expect(nextSongPreloader.peek(7)).toBeNull() // 最旧的 7 被淘汰
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1')
  expect(nextSongPreloader.peek(11)).not.toBeNull()
})
```

`tests/unit/player-store.spec.ts`：

先给 precache mock 对象（约 :37-44）补两个方法：

```ts
takeKeep: (...args: unknown[]) => preloadTakeKeep(...(args as [number])),
evictExcept: (...args: unknown[]) => preloadEvictExcept(...(args as [number])),
```

并在 mock 声明区（约 :33-35 旁）新增：

```ts
const preloadTakeKeep = vi.fn((_id: number): PreloadOutcome | null => null)
const preloadEvictExcept = vi.fn((_id: number): void => undefined)
```

追加用例：

```ts
it('loop 模式：预载当前曲自己，曲终重播复用 blob 不重复 fetch，切歌清理旧条目', async () => {
  const player = usePlayerStore()
  player.playQueue([makeSong(1), makeSong(2)], 0)
  player.setMode('loop')
  player.playing = true
  player.durationMs = 200_000
  preloadMock.mockResolvedValue({ songId: 1, url: 'blob:loop-1', source: 'main302' })
  const callbacks = buildEngineCallbacks()
  // 第一遍播放过半 → 预载当前曲自己
  callbacks.onTimeUpdate(100_000, 200_000)
  await vi.waitFor(() => preloadMock.mock.calls.length > 0)
  expect(preloadMock.mock.calls[0]![0]).toMatchObject({ id: 1 })
  const preloadCallsAfterFirstPass = preloadMock.mock.calls.length

  // 曲终重播：takeKeep 命中，blob 直接交给引擎
  preloadTakeKeep.mockReturnValue({ songId: 1, url: 'blob:loop-1', source: 'main302' })
  await player.playAt(0)
  expect(fakeEngine.play).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 1 }),
    expect.any(String),
    expect.objectContaining({ url: 'blob:loop-1' }),
  )

  // 重播过半：peek 命中保留条目 → 不再发起新预载
  preloadPeek.mockReturnValue({ songId: 1, url: 'blob:loop-1', source: 'main302' })
  callbacks.onTimeUpdate(150_000, 200_000)
  await vi.waitFor(() => player.preloadedNextFor === 1)
  expect(preloadMock.mock.calls.length).toBe(preloadCallsAfterFirstPass)

  // 切到别的歌：loop 下清理除当前曲外的残留条目
  await player.playAt(1)
  expect(preloadEvictExcept).toHaveBeenCalledWith(2)
  expect(fakeEngine.play).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 2 }),
    expect.any(String),
    undefined,
  )
  preloadTakeKeep.mockReturnValue(null)
  preloadPeek.mockReturnValue(null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/precache.spec.ts tests/unit/player-store.spec.ts`
Expected: FAIL（`takeKeep`/`evictExcept` 不存在；loop 下 playAt 仍走 `take`）

- [ ] **Step 3: Implement in `src/player/precache.ts`**

`NextSongPreloader` 类内新增两个方法（放在 `take` 之后）：

```ts
/** 保留式取用：命中不删除条目（loop 跨轮复用同一首歌的缓存）；handoff 记录同 URL 去重 */
takeKeep(songId: number): PreloadOutcome | null {
  const hit = this.store.get(songId) ?? null
  if (hit?.blob && this.handoff[0] !== hit.url) {
    this.handoff.unshift(hit.url)
    while (this.handoff.length > 2) revokeBlobUrl(this.handoff.pop())
  }
  return hit
}

/** 清除指定歌曲以外的缓存条目（loop 切歌后释放旧 blob） */
evictExcept(songId: number): void {
  for (const [id, outcome] of this.store) {
    if (id !== songId) {
      revokeBlobUrl(outcome.url)
      this.store.delete(id)
    }
  }
}
```

`preload()` 成功 `this.store.set(song.id, outcome)` 之后追加卫生上限：

```ts
// 卫生上限：快速跳歌时最多保留 4 条，淘汰最旧（Map 迭代序即插入序）
while (this.store.size > 4) {
  const oldest = this.store.keys().next().value
  if (oldest === undefined) break
  const evicted = this.store.get(oldest)
  this.store.delete(oldest)
  revokeBlobUrl(evicted?.url)
}
```

- [ ] **Step 4: Implement in `src/stores/player.ts` `playAt`**

将现有 `const preloaded = nextSongPreloader.take(song.id) ?? undefined` 替换为：

```ts
// loop 模式：复用保留条目（同一首歌跨循环只 fetch 一次），并清理切歌残留；其余模式维持取用即删
let preloaded
if (this.mode === 'loop') {
  nextSongPreloader.evictExcept(song.id)
  preloaded = nextSongPreloader.takeKeep(song.id)
} else {
  preloaded = nextSongPreloader.take(song.id)
}
await engine.play(song, settings.quality, preloaded ?? undefined)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/precache.spec.ts tests/unit/player-store.spec.ts`
Expected: PASS（含既有 `playAt 使用预缓存地址直接播放`——默认 order 走 `take` 不受影响）

- [ ] **Step 6: Run full verification**

Run: `npm run typecheck && npm run test`
Expected: typecheck 无错误；unit + components 全绿（`engine-chain.spec.ts`、E2E mocks 不受影响）

- [ ] **Step 7: Commit**

```bash
git add src/player/precache.ts src/stores/player.ts tests/unit/precache.spec.ts tests/unit/player-store.spec.ts
git commit -m "feat(player): 单曲循环跨轮复用预缓存 blob 并限制缓存条目数"
```
