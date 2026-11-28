import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getEngine, getExistingEngine, resetEngineForTest, type EngineCallbacks } from '@/player/engine'

const noopCallbacks: EngineCallbacks = {
  onResolved: () => undefined,
  onFailed: () => undefined,
  onPlaying: () => undefined,
  onPaused: () => undefined,
  onEnded: () => undefined,
  onTimeUpdate: () => undefined,
}

/** jsdom 未实现 setSinkId（类型上存在于 lib.dom），运行时移除以还原真实环境 */
function removeSetSinkId(): void {
  delete (HTMLMediaElement.prototype as { setSinkId?: HTMLMediaElement['setSinkId'] }).setSinkId
}

function stubSetSinkId(impl: (sinkId: string) => Promise<void>): void {
  HTMLMediaElement.prototype.setSinkId = impl
}

beforeEach(() => {
  resetEngineForTest()
  removeSetSinkId()
})

afterEach(() => {
  resetEngineForTest()
  vi.restoreAllMocks()
})

describe('PlayerEngine.setOutputDevice', () => {
  it('环境不支持 setSinkId 时抛明确错误（jsdom 原生无该方法）', async () => {
    const engine = getEngine(noopCallbacks)
    await expect(engine.setOutputDevice('abc')).rejects.toThrow('当前环境不支持切换播放设备')
  })

  it("setOutputDevice('default') 映射为空串传给 setSinkId", async () => {
    const sinkId = vi.fn<(sinkId: string) => Promise<void>>().mockResolvedValue(undefined)
    stubSetSinkId(sinkId)
    const engine = getEngine(noopCallbacks)
    await engine.setOutputDevice('default')
    expect(sinkId).toHaveBeenCalledWith('')
  })

  it('setOutputDevice(设备id) 原样传给 setSinkId', async () => {
    const sinkId = vi.fn<(sinkId: string) => Promise<void>>().mockResolvedValue(undefined)
    stubSetSinkId(sinkId)
    const engine = getEngine(noopCallbacks)
    await engine.setOutputDevice('abc')
    expect(sinkId).toHaveBeenCalledWith('abc')
  })

  it('setSinkId 失败时错误向上抛（由调用方提示）', async () => {
    stubSetSinkId(vi.fn<(sinkId: string) => Promise<void>>().mockRejectedValue(new DOMException('设备不存在', 'NotFoundError')))
    const engine = getEngine(noopCallbacks)
    await expect(engine.setOutputDevice('gone')).rejects.toThrow()
  })
})

describe('getExistingEngine', () => {
  it('引擎未创建时返回 null，不触发创建', () => {
    expect(getExistingEngine()).toBeNull()
  })

  it('getEngine 创建后返回同一实例', () => {
    const engine = getEngine(noopCallbacks)
    expect(getExistingEngine()).toBe(engine)
  })
})
