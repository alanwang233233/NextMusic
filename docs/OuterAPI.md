# NextMusic API 接口文档

- **版本**：1.2.0
- **更新时间**：2026-10-06
- **OpenAPI 规范**：[openapi.yaml](./openapi.yaml)（可导入 Swagger UI、Redoc、Postman、Apifox 等工具）
- **说明**：本文档基于实际请求抓包与实测响应编写。

## 1. 概述

NextMusic 提供网易云音乐歌曲、专辑与歌单的查询代理服务，包含五个接口：

| 接口 | 说明 |
| --- | --- |
| `POST /api/search` | 搜索歌曲/专辑/歌手/歌单等资源，返回歌曲 ID 等信息 |
| `POST /api/getAlbum` | 获取专辑详情（封面、发行时间、歌手、简介）及专辑内全部歌曲 |
| `POST /api/playlist_trackall` | 获取歌单信息及全部（或分页）歌曲 |
| `POST /api/getSongInfo` | 获取歌曲基本信息（歌名、专辑、歌手、封面、时长、免费/版权状态等） |
| `POST /api/getSongUrl` | 获取歌曲音频播放直链（可指定音质等级） |
| `POST /api/getSongLyric` | 获取歌曲歌词（原文、翻译、罗马音、逐字歌词等） |

接口无需鉴权（无需 Token / Cookie），返回的封面图与音频直链托管于网易云音乐 CDN（`*.music.126.net`），客户端拿到 URL 后直接访问即可。

## 2. 基础信息

| 项目 | 值 |
| --- | --- |
| Base URL | `https://nextmusic.toubiec.cn` |
| 请求方法 | 所有业务接口均为 `POST` |
| 请求体格式 | `application/json`（UTF-8） |
| 响应体格式 | `application/json; charset=utf-8` |
| 鉴权 | 无 |
| CORS | 已开启，允许任意来源（`Access-Control-Allow-Origin: *`） |

## 3. 通用约定

### 3.1 公共请求参数

| 字段 | 类型 | 必填 | 说明 | 适用接口 |
| --- | --- | --- | --- | --- |
| `id` | string | 是 | 歌曲/专辑/歌单 ID（网易云音乐数字 ID 的字符串形式）。缺失时返回 400 | 除 search 外的全部接口 |
| `keyword` | string | 是 | 搜索关键词。缺失时返回 400 | search |
| `type` | integer | 否 | 搜索类型，默认 1（单曲），取值见 [4.1](#41-搜索歌曲) | search |
| `limit` | integer | 否 | 分页大小。search 默认 30；playlist_trackall 不传时实测返回全部 | search / playlist_trackall |
| `offset` | integer | 否 | 分页偏移，从 0 开始，默认 0 | search / playlist_trackall |
| `timestamp` | integer | 否 | 客户端毫秒时间戳，每次请求携带当前时间即可 | 全部 |
| `ip` | string | 否 | 客户端 IP，服务端可能用于地区相关逻辑；直接透传调用方真实 IP 即可 | 全部 |

`getSongUrl` 额外支持 `level`（音质等级），见 [4.5](#45-获取播放地址)。

### 3.2 统一响应结构

成功：

```json
{
  "code": 200,
  "data": {}
}
```

失败（`code` 与 HTTP 状态码一致，`data` 固定为 `null`）：

```json
{
  "code": 400,
  "message": "Missing id parameter",
  "data": null
}
```

### 3.3 错误码

实测错误响应的 HTTP 状态码与响应体中的 `code` 一致：

| HTTP 状态码 | `message` 示例 | 触发场景 |
| --- | --- | --- |
| 400 | `Missing id parameter` / `Missing keyword parameter` | 请求体缺少 `id`（search 外的全部接口）或 `keyword`（search）参数 |
| 404 | `Failed to fetch album` | 资源不存在（如专辑 ID 无效） |
| 500 | `Cannot read properties of undefined (reading 'fee')` | 服务端处理失败，如歌曲不存在、上游接口异常 |

### 3.4 CORS 跨域

服务端所有响应（含错误响应）均携带 CORS 头，允许任意来源访问。浏览器跨域调用时会自动发起 `OPTIONS` 预检请求，预检响应为 `204 No Content`，实测响应头如下：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
Access-Control-Max-Age: 86400
```

预检由浏览器自动完成，客户端无需（也不应）手动调用 `OPTIONS`。

## 4. 接口详情

### 4.1 搜索歌曲

```
POST /api/search
```

根据关键词搜索网易云音乐资源，支持分页。返回结构随 `type` 变化：`type=1`（单曲，默认）时 `data` 为 `{ songs, songCount }`，歌曲项结构与 [4.4 获取歌曲信息](#44-获取歌曲信息) 的 `data` 完全一致；其他 `type` 透传网易云原始搜索结果（资源复数名为数组键，计数键为「资源名 + Count」）。

**请求示例**

```bash
curl -X POST 'https://nextmusic.toubiec.cn/api/search' \
  -H 'Content-Type: application/json' \
  --data-raw '{"keyword":"alan","type":1,"limit":100,"offset":0,"timestamp":1791275481846,"ip":"104.28.240.138"}'
```

**`type` 取值**（与网易云音乐搜索 type 一致，不传时默认 1）：

| 取值 | 含义 |
| --- | --- |
| `1` | 单曲（默认） |
| `10` | 专辑 |
| `100` | 歌手 |
| `1000` | 歌单 |
| `1004` | MV |
| `1006` | 歌词 |
| `1009` | 电台 |
| `1014` | 视频 |
| `1018` | 综合 |

其中 `1` / `10` / `100` / `1000` 已实测验证，其余为网易云通用取值，未逐一验证。

**响应示例**（`type=1`，实测共 343 项，此处截取前 2 项）

```json
{
  "code": 200,
  "data": {
    "songs": [
      {
        "id": 506092035,
        "name": "The Spectre",
        "free": false,
        "album": "The Spectre",
        "singer": "Alan Walker",
        "picimg": "http://p2.music.126.net/P6XMbCPENqlMsvPDEGIQxg==/109951165982513700.jpg",
        "duration": "3:14",
        "copyright": 1,
        "time": "2026/10/06 16:36:30"
      },
      {
        "id": 419594258,
        "name": "Hymn For The Weekend（Remix）",
        "free": true,
        "album": "Hymn For The Weekend [Remix]",
        "singer": "Alan Walker/Coldplay",
        "picimg": "http://p2.music.126.net/zx0EgLRhfOo-q906272T0Q==/3427177756044412.jpg",
        "duration": "3:50",
        "copyright": 0,
        "time": "2026/10/06 16:36:30"
      }
    ],
    "songCount": 343
  }
}
```

**响应字段（`data`，type=1）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `songs` | SongInfo[] | 歌曲列表，项字段与 [4.4 获取歌曲信息](#44-获取歌曲信息) 的 `data` 完全一致 |
| `songCount` | integer | 符合条件的歌曲总数（本例 343），可据此计算分页 `offset` |

其他 `type` 实测返回：`type=10` → `albums` / `albumCount`；`type=100` → `artists` / `artistCount`；`type=1000` → `playlists` / `playlistCount`。这些为网易云原始结构（未归一化），部分结果可能包含 `searchQcReminder` 提示字段。

### 4.2 获取专辑详情

```
POST /api/getAlbum
```

根据专辑 ID 查询专辑信息（名称、封面、发行时间、歌手、简介）及专辑内全部歌曲。歌曲项结构与 [4.4 获取歌曲信息](#44-获取歌曲信息) 的 `data` 一致，但实测可能缺少 `copyright` 字段。

**请求示例**

```bash
curl -X POST 'https://nextmusic.toubiec.cn/api/getAlbum' \
  -H 'Content-Type: application/json' \
  --data-raw '{"id":"394505804","timestamp":1791275758126,"ip":"104.28.240.138"}'
```

**响应示例**

```json
{
  "code": 200,
  "data": {
    "id": 394505804,
    "name": "GGEZ",
    "picUrl": "https://p2.music.126.net/486EO2Aw9v05iPhCmI256A==/109951173823280680.jpg",
    "publishTime": "8/26/2026",
    "artist": {
      "id": 31165554,
      "name": "概念黁"
    },
    "description": "火爆全网《GGEZ》迎来全新版本，音乐人概念黁、SUGAR惊喜加盟。轻快旋律持续抓耳，随时随地开启你的好心情。",
    "songs": [
      {
        "id": 3425832887,
        "name": "GGEZ",
        "free": true,
        "album": "GGEZ",
        "singer": "M.Sasuke/概念黁/Sugar张惠晴",
        "picimg": "https://p1.music.126.net/486EO2Aw9v05iPhCmI256A==/109951173823280680.jpg",
        "duration": "2:33",
        "time": "2026/10/06 16:46:44"
      }
    ]
  }
}
```

**响应字段（`data`）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | integer | 专辑 ID |
| `name` | string | 专辑名 |
| `picUrl` | string | 专辑封面 URL（使用方式同歌曲封面，见 [5.1](#51-封面图)） |
| `publishTime` | string | 发行时间，观测格式 `M/D/YYYY`（如 `8/26/2026`） |
| `artist` | object | 专辑歌手：`id` 歌手 ID、`name` 歌手名 |
| `description` | string \| null | 专辑简介，可能为 `null` |
| `songs` | SongInfo[] | 专辑内歌曲（一次性返回，无分页），字段同 [4.4 获取歌曲信息](#44-获取歌曲信息)，实测可能缺少 `copyright` |

### 4.3 获取歌单曲目

```
POST /api/playlist_trackall
```

根据歌单 ID 查询歌单信息及歌曲列表，支持 `limit` / `offset` 分页；不传时实测返回歌单内全部歌曲。`songs` 为当前页歌曲，`songCount` 为歌单内歌曲总数；`offset` 超出总数时 `songs` 为空数组、`songCount` 不变。

**请求示例**

```bash
curl -X POST 'https://nextmusic.toubiec.cn/api/playlist_trackall' \
  -H 'Content-Type: application/json' \
  --data-raw '{"id":"9277635598","limit":500,"offset":0,"timestamp":1791275850414,"ip":"104.28.240.138"}'
```

**响应示例**（实测该歌单共 4 首，此处截取前 2 项）

```json
{
  "code": 200,
  "data": {
    "id": 9277635598,
    "name": "新年",
    "coverImage": "https://p1.music.126.net/65O_AVwyaPszhF2pDHWVHw==/109951169282969862.jpg",
    "songCount": 4,
    "playCount": 0,
    "description": null,
    "tags": [],
    "creator": {
      "uid": 1473332243,
      "avatar": "http://p1.music.126.net/m9Rw7Gj3fY9gm1ftc-5zsg==/109951172691390043.jpg",
      "name": "Error404-Official"
    },
    "songs": [
      {
        "id": 395304,
        "name": "春节序曲",
        "free": true,
        "album": "中国礼仪庆典大全之春节喜庆篇",
        "singer": "中国人民解放军军乐团",
        "picimg": "https://p3.music.126.net/j0g_25GyPhar5xxJoGPZiA==/109951163910801634.jpg",
        "duration": "4:56",
        "copyright": 2,
        "time": "2026/10/06 16:46:47"
      },
      {
        "id": 2028663002,
        "name": "叶蒨文-驿动的心英文版（贵族乐队 remix）",
        "free": true,
        "album": "铃声",
        "singer": "贵族乐队",
        "picimg": "https://p3.music.126.net/QYSOl_9qGfzWHmR0ByaN3A==/109951168278075486.jpg",
        "duration": "0:30",
        "copyright": 0,
        "time": "2026/10/06 16:46:47"
      }
    ]
  }
}
```

**响应字段（`data`）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | integer | 歌单 ID |
| `name` | string | 歌单名 |
| `coverImage` | string | 歌单封面 URL（使用方式同歌曲封面，见 [5.1](#51-封面图)） |
| `songCount` | integer | 歌单内歌曲总数，分页可依据它计算 `offset` |
| `playCount` | integer | 播放次数 |
| `description` | string \| null | 歌单简介，可能为 `null` |
| `tags` | string[] | 歌单标签，实测可为空数组 |
| `creator` | object | 创建者：`uid` 用户 ID、`avatar` 头像 URL、`name` 昵称 |
| `songs` | SongInfo[] | 当前页歌曲，字段同 [4.4 获取歌曲信息](#44-获取歌曲信息) |

### 4.4 获取歌曲信息

```
POST /api/getSongInfo
```

根据歌曲 ID 查询歌曲名称、专辑、歌手、封面图、时长、免费/版权状态等基本信息。

**请求示例**

```bash
curl -X POST 'https://nextmusic.toubiec.cn/api/getSongInfo' \
  -H 'Content-Type: application/json' \
  --data-raw '{"id":"2665950805","timestamp":1791274982327,"ip":"104.28.240.138"}'
```

**响应示例**

```json
{
  "code": 200,
  "data": {
    "id": 2665950805,
    "name": "Land of Fog",
    "free": true,
    "album": "Land of Fog",
    "singer": "柯拉一世/ACE Studio",
    "picimg": "https://p1.music.126.net/evymH3Rw-iNVkLRu9asUGw==/109951170377099253.jpg",
    "duration": "3:03",
    "copyright": 0,
    "time": "2026/10/06 16:23:05"
  }
}
```

**响应字段（`data`）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | integer | 歌曲 ID |
| `name` | string | 歌曲名 |
| `free` | boolean | 是否免费歌曲 |
| `album` | string | 专辑名 |
| `singer` | string | 歌手，多名歌手以 `/` 分隔 |
| `picimg` | string | 封面图 URL（CDN 直链，可直接 GET，建议 Referer 置空，见 [5.1](#51-封面图)） |
| `duration` | string | 时长，格式 `m:ss`（如 `3:03`） |
| `copyright` | integer | 版权状态标记，观测取值 0/1/2（含义以服务端实现为准，与 `free` 无固定对应关系） |
| `time` | string | 查询时间，格式 `yyyy/MM/dd HH:mm:ss` |

### 4.5 获取播放地址

```
POST /api/getSongUrl
```

根据歌曲 ID 与音质等级获取音频播放直链。实际返回的音质（`level` / `br`）受版权与账号会员状态影响，高音质请求可能被降级返回，以响应为准。

**请求示例**

```bash
curl -X POST 'https://nextmusic.toubiec.cn/api/getSongUrl' \
  -H 'Content-Type: application/json' \
  --data-raw '{"id":"2665950805","level":"standard","timestamp":1791274984578,"ip":"104.28.240.138"}'
```

**`level` 取值**（与网易云音乐音质等级一致，不传时默认 `standard`）：

| 取值 | 含义 |
| --- | --- |
| `standard` | 标准（128kbps） |
| `higher` | 较高（192kbps） |
| `exhigh` | 极高（320kbps） |
| `lossless` | 无损（FLAC） |
| `hires` | Hi-Res |
| `jyeffect` | 高清环绕声 |
| `sky` | 沉浸环绕声 |
| `jymaster` | 超清母带 |

**响应示例**

```json
{
  "code": 200,
  "data": {
    "id": 2665950805,
    "url": "https://m701.music.126.net/20261006165205/e2c6328dc1ddc3224b80d7a5e24303b2/jdymusic/obj/wo3DlMOGwrbDjj7DisKw/57648542423/e8d7/5e9f/daad/2d5fea5b6bf824d6be28a9bf2737f6db.mp3?vuutv=kYzNDy4oX1I+Z/WNj7DBZE0QS+ZzapAhIfh6cW6Ew1dByhiDblDxrj3jQgF739opVE9v9JuEWZbKAd2vOhHpif3tWZdJM0znxf4pratMzJw=",
    "br": 128000,
    "level": "standard",
    "size": 2925340,
    "md5": "2d5fea5b6bf824d6be28a9bf2737f6db",
    "channelLayout": null,
    "effects": null,
    "cookie": {
      "id": "netease-2",
      "label": "备用账号 #2",
      "index": 1
    },
    "time": "2026/10/06 16:27:06"
  }
}
```

**响应字段（`data`）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | integer | 歌曲 ID |
| `url` | string | 音频直链（带签名 token，有时效性，见 [5.2](#52-音频直链)） |
| `br` | integer | 音频码率（bps），如 `128000` 表示 128kbps |
| `level` | string | 实际返回的音质等级（可能与请求的 `level` 不同） |
| `size` | integer | 音频文件大小（字节） |
| `md5` | string | 音频文件 MD5，可用于完整性校验 |
| `channelLayout` | string \| null | 声道布局，可能为 `null` |
| `effects` | string \| null | 音效信息，可能为 `null` |
| `cookie` | object \| null | 服务端本次使用的账号信息（账号池），可能为 `null`；主要用于排查问题，客户端可忽略 |
| `time` | string | 查询时间，格式 `yyyy/MM/dd HH:mm:ss` |

### 4.6 获取歌词

```
POST /api/getSongLyric
```

根据歌曲 ID 查询歌词，返回原文、翻译、罗马音、卡拉OK及逐字歌词等多种格式。部分字段为空字符串表示该歌曲没有对应格式的歌词。

**请求示例**

```bash
curl -X POST 'https://nextmusic.toubiec.cn/api/getSongLyric' \
  -H 'Content-Type: application/json' \
  --data-raw '{"id":"2665950805","timestamp":1791274987357,"ip":"104.28.240.138"}'
```

**响应示例**（歌词内容有截断）

```json
{
  "code": 200,
  "data": {
    "lrc": "{\"t\":-1000,\"c\":[{\"tx\":\"作词: \",...}]}\n[00:00.000]Far to the east in mist so deep\n[00:05.296]There's a land where no man step on\n...",
    "tlyric": "[00:00.000]大陆以东，雾色之中\n[00:05.296]有一片无人踏足之地\n...",
    "romalrc": "",
    "klyric": "",
    "yrc": "",
    "yromalrc": "",
    "ytlrc": "",
    "time": "2026/10/06 16:28:19"
  }
}
```

**响应字段（`data`）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `lrc` | string | 原文歌词（LRC 格式）。开头可能包含网易云的 JSON 元数据行（歌词作者信息等），解析时需按行处理，`{` 开头的行按元数据处理或跳过 |
| `tlyric` | string | 翻译歌词（LRC 格式），无翻译时为空字符串 |
| `romalrc` | string | 罗马音歌词（LRC 格式），可能为空字符串 |
| `klyric` | string | 卡拉OK歌词，可能为空字符串 |
| `yrc` | string | 逐字歌词（YRC 格式），可能为空字符串 |
| `yromalrc` | string | 逐字罗马音歌词，可能为空字符串 |
| `ytlrc` | string | 逐字翻译歌词，可能为空字符串 |
| `time` | string | 查询时间，格式 `yyyy/MM/dd HH:mm:ss` |

## 5. 媒体资源说明

以下资源托管于网易云音乐 CDN，不属于本服务路径，无需调用本 API 即可直接 `GET` 访问。

### 5.1 封面图

即 `getSongInfo` / `getAlbum` / `playlist_trackall` 等接口返回的封面字段（`picimg` / `picUrl` / `coverImage`）。直接 `GET` 即可，无需鉴权；实测以**空 `Referer`** 请求正常返回（浏览器端可配合 `referrerpolicy="no-referrer"` 使用）：

注意：部分响应中的封面/头像 URL 可能返回 `http://` 协议（如搜索结果的 `picimg`、歌单创建者的 `avatar`），HTTPS 页面直接引用会被浏览器拦截为混合内容，建议改写为 `https://`（实测同一地址替换协议后可正常访问）：

```bash
curl 'https://p1.music.126.net/evymH3Rw-iNVkLRu9asUGw==/109951170377099253.jpg' \
  -H 'Referer;'
```

### 5.2 音频直链

即 `getSongUrl` 返回的 `url`，供 `<audio>` 播放器或下载使用：

- URL 携带签名 token（`vuutv` 参数），**具有时效性**，过期后需重新调用 `getSongUrl` 获取，不建议长期缓存；
- 支持 `Range` 分段请求（`Range: bytes=0-`），可实现边下边播、拖动进度与断点续传；
- 可用响应中的 `md5`、`size`、`br` 做完整性校验与码率展示。

```bash
curl 'https://m701.music.126.net/.../xxx.mp3?vuutv=...' \
  -H 'Range: bytes=0-'
```

## 6. 推荐调用流程

1. 获取歌曲 ID：调用 `search` 搜索关键词，或调用 `getAlbum` / `playlist_trackall` 获取专辑、歌单内的歌曲列表；
2. 调用 `getSongInfo` 展示歌曲名、歌手、封面等基本信息；
3. 调用 `getSongUrl`（按需指定 `level`）获取播放直链，交给播放器播放；链接过期后重新获取；
4. 调用 `getSongLyric` 获取歌词，`lrc` 与 `tlyric` 可做原文/翻译双语展示，`yrc` 存在时可用于逐字歌词动画。

步骤 2–4 在拿到歌曲 ID 后相互独立，可并行调用。

## 7. 备注

- 公共参数 `timestamp` / `ip` 的具体用途基于抓包观测推断，每次请求携带当前时间与调用方真实 IP 即可。
- `getSongUrl` 响应中的 `cookie` 字段表明服务端使用账号池转发上游请求，客户端无需处理该字段。
- `search` 除 `type=1/10/100/1000` 外的取值未实测，返回结构以实际响应为准。
