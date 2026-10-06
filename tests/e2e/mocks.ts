import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'

/** 供 e2e 播放的两首“短歌”（时长 < 30s，规避试听片段判定） */
const SONG_A = {
  id: 101,
  name: 'E2E Song A',
  ar: [{ id: 501, name: 'E2E Artist' }],
  al: { id: 601, name: 'E2E Album', picUrl: 'https://p1.music.126.net/e2e-cover-a.svg' },
  dt: 2000,
  fee: 8,
}
const SONG_B = {
  id: 102,
  name: 'E2E Song B',
  ar: [{ id: 502, name: 'E2E Artist B' }],
  al: { id: 602, name: 'E2E Album B', picUrl: 'https://p1.music.126.net/e2e-cover-b.svg' },
  dt: 2400,
  fee: 0,
}

const PLAYLIST = {
  id: 1,
  name: 'E2E 精选歌单',
  coverImgUrl: 'https://p1.music.126.net/e2e-playlist-cover.svg',
  trackCount: 2,
  playCount: 12345,
  subscribedCount: 100,
  subscribed: false,
  creator: { userId: 1, nickname: 'E2E Creator', avatarUrl: 'https://p1.music.126.net/e2e-avatar.svg' },
  description: '端到端测试使用的歌单',
  tags: ['测试'],
  trackIds: [{ id: 101 }, { id: 102 }],
  tracks: [SONG_A, SONG_B],
}

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

/** 红色渐变封面图（SVG，URL 以 .svg 结尾即可直接命中） */
const coverSvg = (label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#dc2626"/><stop offset="100%" stop-color="#450a0a"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><text x="150" y="158" font-size="28" fill="#fff" text-anchor="middle" font-family="sans-serif">${label}</text></svg>`

export interface MockState {
  likeCalls: string[]
  subscribeCalls: string[]
  song302Calls: number
  unblockCalls: number
  outerCalls: number
}

/**
 * 注册全部 mock 路由。
 * 注意：Playwright 以“后注册优先”的顺序匹配，因此最先注册兜底路由。
 */
export async function setupMockRoutes(page: Page): Promise<MockState> {
  const state: MockState = { likeCalls: [], subscribeCalls: [], song302Calls: 0, unblockCalls: 0, outerCalls: 0 }
  const tone = fs.readFileSync(path.resolve('tests/e2e/fixtures/tone.wav'))

  // 兜底：任何非 localhost 且未显式 mock 的请求返回空成功，防止真实外呼。
  // 主机无关——无论构建时 VITE_MAIN_API 指向哪个地址都能命中。
  const nonLocal = /^https?:\/\/(?!localhost|127\.0\.0\.1)/
  await page.route(nonLocal, (route) => route.fulfill(json({ code: 200 })))
  // 网易 CDN 图片 → 本地渐变 SVG
  await page.route('**music.126.net/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: coverSvg('NextMusic') }),
  )

  // 登录相关
  await page.route('**/register/anonimous*', (route) => route.fulfill(json({ code: 200, cookie: 'MUSIC_U=guest-e2e-cookie' })))
  await page.route('**/login/qr/key*', (route) => route.fulfill(json({ code: 200, data: { unikey: 'e2e-key' } })))
  await page.route('**/login/qr/create*', (route) =>
    route.fulfill(json({ code: 200, data: { qrimg: 'data:image/svg+xml;base64,xxx', qrurl: 'https://music.163.com/login' } })))

  // 首页
  await page.route('**/personalized*', (route) =>
    route.fulfill(json({
      code: 200,
      result: Array.from({ length: 12 }, (_, i) => ({
        id: 1000 + i,
        name: `推荐歌单 ${i + 1}`,
        coverImgUrl: `https://p1.music.126.net/e2e-cover-${i}.svg`,
        playCount: 10000 * (i + 1),
        copywriter: '每日精选',
        creator: { userId: 1, nickname: 'E2E Creator' },
      })),
    })),
  )
  await page.route('**/top/artists*', (route) =>
    route.fulfill(json({
      code: 200,
      artists: Array.from({ length: 8 }, (_, i) => ({
        id: 2000 + i,
        name: `歌手 ${i + 1}`,
        img1v1Url: `https://p1.music.126.net/e2e-artist-${i}.svg`,
        musicSize: 50,
        albumSize: 10,
        mvSize: 3,
      })),
      more: false,
    })),
  )
  await page.route('**/toplist/detail*', (route) =>
    route.fulfill(json({
      code: 200,
      list: Array.from({ length: 5 }, (_, i) => ({
        id: 3000 + i,
        name: `飙升榜${i > 0 ? ` ${i + 1}` : ''}`,
        coverImgUrl: `https://p1.music.126.net/e2e-top-${i}.svg`,
        updateFrequency: '每天更新',
        trackCount: 20,
        playCount: 99999,
        creator: { userId: 1, nickname: '官方' },
      })),
    })),
  )
  await page.route('**/banner*', (route) => route.fulfill(json({ code: 200, banners: [] })))

  // 歌单与歌曲
  await page.route('**/playlist/detail*', (route) => route.fulfill(json({ code: 200, playlist: PLAYLIST })))
  await page.route('**/playlist/track/all*', (route) => route.fulfill(json({ code: 200, songs: [SONG_A, SONG_B] })))
  await page.route('**/song/detail*', (route) => route.fulfill(json({ code: 200, songs: [SONG_A, SONG_B] })))
  await page.route('**/lyric/new*', (route) =>
    route.fulfill(json({
      code: 200,
      lrc: { lyric: '[00:00.10]E2E 第一句\n[01:00.00]E2E 第二句' },
      tlyric: { lyric: '' },
      yrc: { lyric: '' },
    })),
  )
  await page.route('**/playmode/intelligence/list*', (route) =>
    route.fulfill(json({ code: 200, data: [{ songInfo: SONG_B, recommended: true, alg: 'e2e' }] })),
  )

  // 播放：302 → 本地 wav（统一短音频，元数据校验通过）
  await page.route('**/song/url/v1/302*', (route) => {
    state.song302Calls++
    const url = route.request().url()
    if (url.includes('unblock=true')) state.unblockCalls++
    void route.fulfill({ status: 302, headers: { Location: '/e2e/tone.wav' } })
  })
  await page.route('**/e2e/tone.wav', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: tone }))
  await page.route('**/api/getSongUrl', (route) => {
    state.outerCalls++
    return route.fulfill(json({ code: 200, data: { id: 101, url: '/e2e/tone.wav', br: 128000, level: 'standard', size: tone.length } }))
  })
  await page.route('**/scrobble*', (route) => route.fulfill(json({ code: 200 })))
  await page.route('**/check/music*', (route) => route.fulfill(json({ code: 200, success: true })))

  // 搜索
  await page.route('**/search/hot/detail*', (route) =>
    route.fulfill(json({
      code: 200,
      data: Array.from({ length: 8 }, (_, i) => ({ searchWord: `热词${i + 1}`, score: 100 - i, content: '', iconUrl: '', iconType: 0 })),
    })),
  )
  await page.route('**/search/suggest*', (route) =>
    route.fulfill(json({ code: 200, result: { order: ['songs'], songs: [SONG_A] } })),
  )
  await page.route('**/cloudsearch*', (route) => {
    const url = new URL(route.request().url())
    const type = url.searchParams.get('type')
    if (type === '1002') {
      return route.fulfill(json({
        code: 200,
        result: { userprofileCount: 1, userprofiles: [{ userId: 777, nickname: 'E2E 虚拟用户', avatarUrl: 'https://p1.music.126.net/e2e-avatar.svg', signature: '虚拟签名' }] },
      }))
    }
    if (type === '100') {
      return route.fulfill(json({ code: 200, result: { artistCount: 1, artists: [{ id: 501, name: 'E2E Artist', img1v1Url: 'https://p1.music.126.net/e2e-artist.svg', musicSize: 10, albumSize: 2 }] } }))
    }
    if (type === '1000') {
      return route.fulfill(json({ code: 200, result: { playlistCount: 1, playlists: [PLAYLIST] } }))
    }
    if (type === '10') {
      return route.fulfill(json({ code: 200, result: { albumCount: 1, albums: [{ id: 601, name: 'E2E Album', picUrl: 'https://p1.music.126.net/e2e-cover-a.svg', artist: { id: 501, name: 'E2E Artist' } }] } }))
    }
    return route.fulfill(json({ code: 200, result: { songCount: 2, songs: [SONG_A, SONG_B] } }))
  })

  // 用户域
  await page.route('**/user/detail*', (route) =>
    route.fulfill(json({
      code: 200,
      level: 8,
      listenSongs: 2000,
      profile: { userId: 777, nickname: 'E2E 虚拟用户', avatarUrl: 'https://p1.music.126.net/e2e-avatar.svg', signature: '虚拟签名', follows: 10, followeds: 20 },
    })),
  )
  await page.route('**/user/playlist*', (route) =>
    route.fulfill(json({
      code: 200,
      more: false,
      playlist: [
        { ...PLAYLIST, name: '我喜欢的音乐', creator: { userId: 777, nickname: 'E2E 虚拟用户' } },
        { ...PLAYLIST, id: 2, name: 'E2E 私人收藏', creator: { userId: 777, nickname: 'E2E 虚拟用户' } },
      ],
    })),
  )
  await page.route('**/user/account*', (route) =>
    route.fulfill(json({ code: 200, account: { id: 1 }, profile: { userId: 1, nickname: 'E2E 正式用户', avatarUrl: 'https://p1.music.126.net/e2e-avatar.svg' } })),
  )
  await page.route('**/likelist*', (route) => route.fulfill(json({ code: 200, ids: ['101'] })))
  await page.route('**/like*', (route) => {
    state.likeCalls.push(route.request().url())
    return route.fulfill(json({ code: 200, playlistId: 1 }))
  })
  await page.route('**/playlist/subscribe*', (route) => {
    state.subscribeCalls.push(route.request().url())
    return route.fulfill(json({ code: 200 }))
  })
  await page.route('**/record/recent/song*', (route) =>
    route.fulfill(json({ code: 200, data: { list: [{ data: SONG_A, playTime: 1 }, { data: SONG_B, playTime: 2 }], total: 2 } })),
  )
  await page.route('**/user/record*', (route) =>
    route.fulfill(json({ code: 200, weekData: [{ playCount: 9, score: 90, song: SONG_A }], allData: [] })),
  )

  // 私人 FM
  await page.route('**/personal_fm*', (route) => route.fulfill(json({ code: 200, data: [SONG_A, SONG_B] })))
  await page.route('**/fm_trash*', (route) => route.fulfill(json({ code: 200 })))

  // 每日推荐
  await page.route('**/recommend/resource*', (route) =>
    route.fulfill(json({ code: 200, recommend: [{ ...PLAYLIST, id: 4001, name: '每日推荐歌单' }] })),
  )
  await page.route('**/recommend/songs*', (route) => route.fulfill(json({ code: 200, data: { dailySongs: [SONG_A, SONG_B] } })))

  return state
}

/** 预置本地登录态，跳过登录流程 */
export async function presetAuth(page: Page, mode: 'guest' | 'virtual', extra: Record<string, unknown> = {}) {
  await page.addInitScript(
    ({ mode, extra }) => {
      const data: Record<string, unknown> = { mode, cookie: mode === 'guest' ? 'MUSIC_U=guest-cookie' : undefined, ...extra }
      localStorage.setItem('nextmusic.auth', JSON.stringify(data))
    },
    { mode, extra },
  )
}
