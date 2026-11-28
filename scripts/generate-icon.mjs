/**
 * 占位应用图标生成（零依赖）：512×512 纯色 primary 红 PNG。
 * 正式图标确定后直接替换 assets/icon.png（electron-builder 自动转 icns/ico）。
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const SIZE = 512
const [R, G, B] = [0xdc, 0x26, 0x26] // primary-600

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = 0 ^ -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// IHDR：8bit RGBA
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA

// 原始像素数据（每行前置 filter byte 0）
const row = Buffer.alloc(1 + SIZE * 4)
for (let x = 0; x < SIZE; x++) {
  row[1 + x * 4] = R
  row[2 + x * 4] = G
  row[3 + x * 4] = B
  row[4 + x * 4] = 0xff
}
const raw = Buffer.concat(Array.from({ length: SIZE }, () => row))

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

mkdirSync(path.resolve('assets'), { recursive: true })
writeFileSync(path.resolve('assets/icon.png'), png)
console.log(`assets/icon.png 已生成（${SIZE}x${SIZE}）`)
