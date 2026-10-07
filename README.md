# NextMusic

基于网易云音乐接口的纯客户端音乐单页应用（SPA）。Vue 3 + TypeScript + Tailwind CSS 构建，
红色主题、无 emoji（全部内联 SVG 图标）、桌面 / 移动端响应式。

## 功能

### 登录体系（5 种方式）
| 方式 | 说明 |
| --- | --- |
| 手机登录 | 密码或短信验证码（`/login/cellphone`，验证码经 `/captcha/sent` 发送） |
| 邮箱登录 | 网易邮箱 + 密码（`/login`） |
| 扫码登录 | 二维码 key → 生成 → 轮询状态（801 等待 / 802 待确认 / 803 成功 / 800 过期） |
| 虚拟登录 | 输入昵称搜索用户（`/cloudsearch type=1002`），以该用户公开数据只读浏览 |
| 游客登录 | `/register/anonimous` 获取游客 cookie |

- 仅正式登录可执行写操作（喜欢、收藏、歌单编辑、FM 垃圾桶、下载等）。
- 游客模式写操作提示「游客模式不支持该操作，请先登录」。
- 虚拟登录写操作提示「虚拟登录为只读模式，写入操作不可用」。

### 核心功能
- 发现页：推荐歌单、热门歌手、排行榜
- 每日推荐：推荐歌单 + 推荐歌曲（需登录）
- 歌单：详情、全部歌曲补全、播放全部、收藏、编辑（名称/描述/标签）、移除歌曲
- 播放：降级链（见下）、音质选择（10 档）、播放队列、顺序/循环/随机、进度与音量
- 预缓存（默认行为）：一首歌播放进度过半（>=50%）时自动按降级链解析并用隐藏 Audio
  预加载下一曲（含时长校验防试听片段），切歌时直接命中已缓存地址（第 0 步），
  跳过解析与缓冲等待。播放条显示「缓冲中」/「下一首已缓存」状态。
- 歌词：LRC + 逐字歌词（YRC）解析、翻译开关、逐行滚动高亮、点击行跳播
- 喜欢：喜欢/取消喜欢、喜欢列表
- 最近播放：`/record/recent/song`（登录）/ `/user/record`（虚拟）
- 心动模式：`/playmode/intelligence/list`，任意歌曲列表均可触发
- 私人 FM：自动续播、垃圾桶、喜欢
- 搜索：热搜、搜索建议、单曲/歌手/专辑/歌单四个维度、分页加载
- 用户主页 / 歌手主页：公开信息、歌单、热门歌曲、专辑、简介、相似歌手、收藏歌手
  （相似歌手接口 `/simi/artist` 仅对正式登录用户开放，未登录时展示登录提示）
- 下载：`/song/download/url` 获取直链 → Blob 下载，失败回退新标签页（该接口匿名可用，虚拟登录模式下同样可以下载）

### 播放降级链（核心规则）
1. `/song/url/v1/302?id=&level=`（携带登录 cookie），`<audio>` 直接跟随 302
2. 加载报错或元数据时长 < 期望时长 × 65%（试听片段判定）→ OuterAPI `POST /api/getSongUrl {id, level}` 取直链播放
3. OuterAPI 限流较严格：失败时按指数退避（1s/2s/4s/8s/16s）重试，最多 5 次

## 快速开始

```bash
cp .env.example .env.local   # 填入你的 VITE_MAIN_API（主 API 地址，仅存本地）
bun install                  # 或 npm install
npm run dev                  # 开发服务器
npm run build                # 类型检查 + 生产构建
npm run preview              # 预览生产构建
```

> 主 API 地址属于本地环境敏感配置，不入库：源码中不含任何具体地址，
> 一律通过构建时环境变量 `VITE_MAIN_API` 注入（OuterAPI 地址为公开服务，无需隔离）。

## 测试

```bash
npm run test              # Vitest 全部单元 + 组件测试（113 个）
npm run test:unit         # 仅单元测试
npm run test:components   # 仅组件测试
npm run test:e2e          # Playwright E2E（mock 全部 API，确定性）
npm run test:visual       # 视觉测试（桌面 + 移动端截图、无横向溢出断言）
npm run typecheck         # vue-tsc 严格类型检查
```

- 单元测试覆盖：LRC/YRC 歌词解析、播放降级链状态机（含切歌 token 隔离、旧事件丢弃）、
  HTTP 层（cookie 注入、POST body、错误映射、超时）、auth store（四种登录态、写守卫、
  持久化与损坏数据回退）、player store（队列、播放模式、ended 编排、写守卫）、下载命名与降级。
- E2E：游客完整链路（登录 → 首页 → 歌单 → 播放 → 歌词）、虚拟登录只读校验（写请求零发出）、
  搜索流程、路由守卫、私人 FM、预缓存（过半触发、命中后切歌零解析请求、按歌曲 id 统计
  OuterAPI 调用）。全部 API 通过 Playwright 路由 mock，不产生真实外呼。
- 视觉：桌面（1280×800）/ 移动（390×844）关键页面截图输出至 `test-results/visual/`。

## API 使用约定

- 主 API：地址通过环境变量 `VITE_MAIN_API` 配置（文档见 `docs/mainAPI.md`）
- OuterAPI：`https://nextmusic.toubiec.cn`（文档见 `docs/OuterAPI.md`），**仅**用于播放降级第 3 步
- 主 API 虽返回 `Access-Control-Allow-Credentials: true`，但 `origin: *` 使浏览器拒绝携带凭据，
  因此登录 cookie 统一通过 `?cookie=` 参数（GET）或 JSON body（POST）传递
- POST 请求参数放 JSON body 并追加 `timestamp` 防缓存，密码不出现在 URL 中
- 图片统一 `?param=WxY` 缩放、http 协议升级 https、`referrerpolicy="no-referrer"`

## 安全说明

- 登录凭证（MUSIC_U cookie）仅保存在本地 localStorage，不经过任何中间服务器
- 页面级 `no-referrer` 降低 cookie 经 Referer 泄露的风险
- 登录密码经 HTTPS POST body 传输（不在 URL 查询串中）
- 第三方 API 返回的下载链接做协议白名单校验（仅 http/https）
- 已知取舍：cookie 会出现在第三方 API 的服务端日志中，这是该 API 纯客户端接入方式的固有约束，
  登录页已向用户明示风险

## 部署到 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Falanwang233233%2FNextMusic&env=VITE_MAIN_API&envDescription=%E4%B8%BB%20API%20%E6%9C%8D%E5%8A%A1%E5%99%A8%E5%9C%B0%E5%9D%80%EF%BC%8C%E4%BE%8B%E5%A6%82%20https%3A%2F%2Fyour-main-api.example.com&project-name=next-music&repository-name=NextMusic)

点击上方按钮即可一键克隆仓库并进入 Vercel 部署流程，或按以下步骤手动部署：

1. Fork 本仓库（或直接使用一键部署按钮）
2. 在 Vercel 控制台点击 **Add New → Project**，导入 fork 后的仓库
3. Framework Preset 会自动识别为 **Vite**（`vercel.json` 已配置构建命令与 SPA 路由回退）
4. 在 **Environment Variables** 中添加：
   - `VITE_MAIN_API` = 你的主 API 地址（必填，例如自部署的 NeteaseCloudMusicApi Enhanced 实例）
   - `VITE_OUTER_API` / `VITE_OUTER_IP`（可选，见 `.env.example`）
5. 点击 **Deploy**，构建完成后即可访问

> 注意：`VITE_MAIN_API` 是构建时变量，修改后需要重新触发部署才会生效。
> 仓库内 `vercel.json` 已包含 SPA 的 history 路由回退规则，无需额外配置。

## 项目结构

```
src/
  api/          HTTP 封装 + 各域 API 模块（auth/user/playlist/song/artist/search/fm/recommend/outer）
  player/       播放引擎（302 降级链状态机）
  stores/       Pinia：auth / player / settings / toast
  composables/  写操作守卫、心动模式
  utils/        歌词解析、格式化、下载
  components/   ui/（通用）layout/（壳层）player/（播放条/歌词/队列）music/（列表/卡片）
  views/        Login/Home/Daily/Playlist/Album/Artist/Search/User/Me/Liked/Recent/Library/FM/404
tests/
  unit/         Vitest 单元测试
  components/   Vitest 组件测试
  e2e/          Playwright 端到端（mock 路由 + 音频 fixture）
  visual/       Playwright 视觉截图
```
