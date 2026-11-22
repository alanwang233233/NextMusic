# 随机播放洗牌队列与预缓存重构 — 设计稿

日期：2026-11-22
状态：待评审
范围：`src/stores/player.ts`、`src/player/precache.ts`、5 个视图的播放全部入口、`tests/unit/player-store.spec.ts`、`tests/unit/precache.spec.ts`

## 背景与意图

现状两个问题：

1. **随机播放与队列脱钩**：`pickShuffle` 在每次 `next()` 时随机挑一个 ≠ 当前的目标。QueueDrawer 展示的队列对随机模式毫无意义；上一首回不到刚才随机播过的歌；手动连点下一曲每次都是新随机。
2. **预缓存对 loop / shuffle 失效**：`peekNextSong` 对两者返回 null；单曲循环曲终重播重进降级链，而 302 URL 每次携带新 `timestamp`，**每轮循环都真实重新下载整首音频**。

目标：随机播放改为洗牌队列模型（上一首/下一首严格跟随队列），预缓存覆盖单曲循环（不重复下载）与随机播放（可预测）。

## 决策记录（均已与使用者确认）

| # | 决策 |
|---|------|
| 1 | 洗牌对象 = 当前播放队列（store 不感知浏览上下文） |
| 2 | 切换到随机模式：**当前曲固定队首**，其余洗牌，**不打断播放** |
| 3 | 随机模式生效期间新建队列自动洗牌；「播放全部」为**完全随机**（含第一首） |
| 4 | 单曲循环不重复下载 = 过半时把当前曲 fetch 成 blob，**同一首歌跨循环只 fetch 一次**，曲终重播零网络 |
| 5 | 新增 `playAll` 动作区分手势：「播放全部」与「点击某首歌」在 store 层无法区分，由视图表达意图 |

## 方案

### 核心原则

**队列本身即洗牌结果**。不保留原序、不引入隐藏播放序映射（QueueDrawer 展示的就是 `queue`，隐藏映射会使「上一首/下一首跟随播放队列」不成立）。洗牌算法为 Fisher-Yates（`Math.random`，无需可复现种子）。

**统一洗牌规则**：凡洗牌发生，「当前曲（或明确点击的起始曲）固定队首，其余 Fisher-Yates」；唯一例外是 `playAll` 在随机模式下整列表全洗（无起始曲语义）。

### store（`src/stores/player.ts`）

- **新增 `playAll(list)` 动作**（播放全部手势，5 个视图改调）：
  - shuffle 模式 → 全列表洗牌入队，从新队列第 0 首（随机一首）开始播
  - order/loop 模式 → 等价于现在的 `playQueue(list, 0)`，行为零变化
- **`playQueue(list, startIndex)`**：order/loop 行为不变；shuffle 模式 → `[list[start], ...shuffle(其余)]` 播第 0 首（**点击曲先播**，不是回归）；start 越界或未命中时退化为全洗牌
- **`playSongNow(song, context)`**：现有三分支结构不变；其中「空队列 + 上下文建队列」分支在 shuffle 模式下 → `[song, ...shuffle(context 去重后的其余)]`；「已在队列跳转」「插播在当前曲之后」两分支不变
- **`setMode(mode)`**：切到 shuffle 且 `!fmMode` 且队列非空时 → `queue = [当前曲, ...shuffle(其余)]`，`index = 0`，**不调 `playAt`**（音频继续）；同时重置 `preloadedNextFor` 与 `_preloadTriggeredFor`（旧"下一曲"预测失效；若被预载的歌恰好仍是新下一曲，`preloadNext` 的 peek 会零成本重新标记）。队列空或 FM 模式下仅记录 mode。切回 order/loop：队列保持洗牌序不动
- **`next()`**：删除 shuffle 随机分支与 `pickShuffle`，order/shuffle 完全共用 `index+1`（曲终 auto 回绕 0、末曲手动 next 停住，与现状一致）；fmMode 分支保持最优先
- **`prev()`**：不变（index-1，第 0 首回绕末尾）
- **`peekNextSong()`**：fmMode → `queue[index+1]`；**loop → 当前曲自己**；order/shuffle → `index+1` 回绕 0

### precache（`src/player/precache.ts`）

- 新增**保留式取用**（如 `takeKeep(songId)` 或 `take(songId, { keep })`）：loop 模式下取用预缓存**不删除条目**，同一首歌的 blob 跨循环复用；handoff 两代回收规则照常（同一 URL 重复交出时去重）
- `playAt` 在 loop 模式下取用走 keep 语义，并清除 store 中**除当前曲外**的残留条目（切歌后旧 blob 及时 revoke）；order/shuffle 模式维持现有 take（取用即删）
- 卫生改进（次要）：成功 preload 后若 store 条目数超过上限（4），revoke 并淘汰最旧条目——现状 Map 无上限，快速跳歌会缓慢积累

### 视图（仅改播放全部手势，5 处）

| 文件 | 改动 |
|------|------|
| `PlaylistDetailView.vue` | `playAll()` → `player.playAll(songs.value)` |
| `AlbumDetailView.vue` | 播放全部按钮 → `player.playAll(songs)` |
| `LikedView.vue` | 播放全部按钮 → `player.playAll(songs)` |
| `ArtistView.vue` | `playAll()` → `player.playAll(topSongs.value)` |
| `DailyView.vue` | 头部按钮 → `player.playAll(songs.value)` |

行点击（`playQueue(list, index)`）与单曲就位（`playSongNow`）的调用点全部不动。

## 目标 / 非目标 / 反目标

- **目标**：随机模式队列化；loop 重播零下载；shuffle 预缓存恢复；播放条「下一首已缓存」徽标在 shuffle 下恢复意义
- **非目标**：引擎降级链（`main302 → outer`）不动；FM 续播逻辑不动；模式持久化（刷新回 order，维持现状）；PlayerBar 按钮循环与图标不动
- **反目标（出现即失败）**：引入隐藏播放序映射；随机模式下点歌不播点击的歌；loop 每轮循环重新下载；洗牌打断当前播放

## 边界情况

| 场景 | 行为 |
|------|------|
| 切 shuffle 时队列为空 | 仅记录 mode，等下次建队列时洗 |
| 切 shuffle 时正在 FM | 不洗 FM 队列（fmMode 优先） |
| 队列只有 1 首 | 洗牌平凡，行为不变 |
| shuffle 下 `playAll` 单首歌单 | 洗牌平凡，播该首 |
| shuffle → order 切回 | 队列保持洗牌序；下次「播放全部」重建原序 |
| 洗牌时已预载的旧下一曲 | blob 保留在 store（可能恰好仍是新下一曲，peek 零成本命中）；靠 store 上限淘汰 |
| loop 重播时过半再次触发预载 | peek 命中保留条目 → 直接标记，不重复 fetch |

## 测试影响

- `tests/unit/player-store.spec.ts`：
  - 重写 `shuffle 模式下一首不等于当前` → 洗牌队列语义（重排、当前曲队首、不打断播放、next 走 index+1）
  - 重写 `peekNextSong：order 模式回绕，loop/shuffle 返回 null` → loop 返回当前曲、shuffle 返回 index+1
  - 新增：`setMode('shuffle')` 洗牌与不打断 / 空队列 no-op / FM 下不洗 / 切回 order 队列不变
  - 新增：`playAll` shuffle 完全随机起播 / order 等价 `playQueue(0)`
  - 新增：`playQueue`、`playSongNow` 的 shuffle 分支（点击曲队首）
  - 新增：loop 曲终重播命中保留 blob、零新请求；切歌后旧 blob 被 revoke
- `tests/unit/precache.spec.ts`：新增 keep 取用与 `evictExcept`、store 上限淘汰用例
- 回归：`engine-chain.spec.ts`、E2E mocks 不动；`npm run typecheck` 与 `npm run test` 全绿为完成标准

## 约束

- 遵循 AGENTS.md：`vue-tsc` 门禁；禁止 emoji；Conventional Commits 中文提交信息
- blob 内存管理延续 handoff 两代回收；不引入持久化存储
