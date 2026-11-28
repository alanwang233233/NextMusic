import { onScopeDispose, ref } from 'vue'
import { getExistingEngine, type PlayerEngine } from '@/player/engine'

/** 音频输出设备（枚举自 navigator.mediaDevices，仅桌面环境有实际设备列表） */
export interface AudioOutputDevice {
  deviceId: string
  label: string
}

export const AUDIO_OUTPUT_STORAGE_KEY = 'nextmusic.audioOutput'

/** 持久化的播放设备（无记录 → 系统默认） */
export function readPersistedAudioOutput(): string {
  try {
    return localStorage.getItem(AUDIO_OUTPUT_STORAGE_KEY) || 'default'
  } catch {
    return 'default'
  }
}

export function persistAudioOutput(id: string): void {
  try {
    localStorage.setItem(AUDIO_OUTPUT_STORAGE_KEY, id)
  } catch {
    /* 存储不可用时静默 */
  }
}

/** 引擎创建后应用持久化设备（player store 接线点；失败静默不影响播放） */
export async function applyPersistedAudioOutput(engine: PlayerEngine): Promise<void> {
  try {
    await engine.setOutputDevice(readPersistedAudioOutput())
  } catch (err) {
    console.warn('应用持久化播放设备失败', err)
  }
}

/**
 * 播放输出设备管理（设置页桌面板块使用）：
 * 枚举/选择/持久化，devicechange 时刷新；所选设备消失自动回退系统默认。
 */
export function useAudioOutput() {
  const devices = ref<AudioOutputDevice[]>([])
  const currentId = ref(readPersistedAudioOutput())

  async function select(id: string): Promise<void> {
    currentId.value = id
    persistAudioOutput(id)
    try {
      await getExistingEngine()?.setOutputDevice(id)
    } catch (err) {
      console.warn('切换播放设备失败', err)
    }
  }

  async function refresh(): Promise<void> {
    const list = await navigator.mediaDevices.enumerateDevices()
    const outputs = list.filter((d) => d.kind === 'audiooutput')
    devices.value = outputs.map((d, index) => ({
      deviceId: d.deviceId,
      label: d.label || (d.deviceId === 'default' ? '系统默认' : `扬声器 ${index + 1}`),
    }))
    if (currentId.value !== 'default' && !outputs.some((d) => d.deviceId === currentId.value)) {
      await select('default')
    }
  }

  const onDeviceChange = (): void => {
    void refresh()
  }
  navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
  onScopeDispose(() => {
    navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
  })

  return { devices, currentId, select, refresh }
}
