import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { getExistingEngine } from '@/player/engine'
import { AUDIO_OUTPUT_STORAGE_KEY, useAudioOutput } from '@/composables/useAudioOutput'

vi.mock('@/player/engine', () => ({
  getExistingEngine: vi.fn(),
}))

type MediaDevice = { deviceId: string; kind: MediaDeviceKind; label: string }

function makeDevice(deviceId: string, kind: MediaDeviceKind, label: string): MediaDevice {
  return { deviceId, kind, label }
}

const enumerateDevices = vi.fn<() => Promise<MediaDevice[]>>()
const addEventListener = vi.fn<(type: string, listener: () => void) => void>()
const removeEventListener = vi.fn<(type: string, listener: () => void) => void>()

function stubMediaDevices(list: MediaDevice[]): void {
  enumerateDevices.mockResolvedValue(list)
  vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices, addEventListener, removeEventListener } })
}

function stubEngine(): ReturnType<typeof vi.fn> {
  const setOutputDevice = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)
  vi.mocked(getExistingEngine).mockReturnValue({ setOutputDevice } as never)
  return setOutputDevice
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useAudioOutput', () => {
  it('refresh 枚举音频输出设备：过滤非输出、空 label 兜底命名', async () => {
    stubMediaDevices([
      makeDevice('default', 'audiooutput', ''),
      makeDevice('abc', 'audiooutput', ''),
      makeDevice('ext', 'audiooutput', 'External Speakers'),
      makeDevice('mic', 'audioinput', '麦克风'),
    ])
    const scope = effectScope()
    const { devices, refresh } = scope.run(() => useAudioOutput())!
    await refresh()
    expect(devices.value).toEqual([
      { deviceId: 'default', label: '系统默认' },
      { deviceId: 'abc', label: '扬声器 2' },
      { deviceId: 'ext', label: 'External Speakers' },
    ])
    scope.stop()
  })

  it('select 写入引擎、持久化并更新 currentId', async () => {
    stubMediaDevices([makeDevice('default', 'audiooutput', ''), makeDevice('abc', 'audiooutput', 'Speakers')])
    const setOutputDevice = stubEngine()
    const scope = effectScope()
    const { select, currentId } = scope.run(() => useAudioOutput())!
    await select('abc')
    expect(setOutputDevice).toHaveBeenCalledWith('abc')
    expect(localStorage.getItem(AUDIO_OUTPUT_STORAGE_KEY)).toBe('abc')
    expect(currentId.value).toBe('abc')
    scope.stop()
  })

  it('所选设备消失时回退默认设备（engine 收到 default，映射空串在引擎内完成）', async () => {
    localStorage.setItem(AUDIO_OUTPUT_STORAGE_KEY, 'gone')
    stubMediaDevices([makeDevice('default', 'audiooutput', ''), makeDevice('abc', 'audiooutput', 'Speakers')])
    const setOutputDevice = stubEngine()
    const scope = effectScope()
    const { refresh, currentId } = scope.run(() => useAudioOutput())!
    await refresh()
    expect(currentId.value).toBe('default')
    expect(setOutputDevice).toHaveBeenCalledWith('default')
    expect(localStorage.getItem(AUDIO_OUTPUT_STORAGE_KEY)).toBe('default')
    scope.stop()
  })

  it('devicechange 触发刷新，scope 释放后解绑监听', async () => {
    stubMediaDevices([makeDevice('default', 'audiooutput', '')])
    stubEngine()
    const scope = effectScope()
    scope.run(() => useAudioOutput())
    expect(addEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function))
    const callsBefore = enumerateDevices.mock.calls.length
    const listener = addEventListener.mock.calls.find(([type]) => type === 'devicechange')?.[1]
    listener?.()
    await Promise.resolve()
    expect(enumerateDevices.mock.calls.length).toBeGreaterThan(callsBefore)
    scope.stop()
    expect(removeEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function))
  })
})
