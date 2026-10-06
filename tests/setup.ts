import { beforeEach } from 'vitest'

/**
 * Node >= 22 提供实验性的全局 localStorage（需要 --localstorage-file 参数，否则为 undefined），
 * 会遮蔽 jsdom 环境注入的 localStorage。这里在缺失时补一个内存实现，保证各环境行为一致。
 */
if (typeof globalThis.localStorage === 'undefined' || globalThis.localStorage === null) {
  const store = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true, writable: true })
}

beforeEach(() => {
  localStorage.clear()
})
