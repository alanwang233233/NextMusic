/**
 * 桌面桥接读取。
 *
 * Electron 的 preload 经 contextBridge 注入 `window.nextmusicDesktop`；
 * 纯 Web 环境不存在该对象，所有桌面功能据此条件渲染/启用，
 * 保证纯前端行为完全不受影响。
 */

/** 桥接对象存在且形状合法时返回之（mainApiBase 允许为空串：本地服务启动失败场景） */
export function getDesktopBridge(): DesktopBridge | null {
  const bridge = (globalThis as { nextmusicDesktop?: unknown }).nextmusicDesktop
  if (!bridge || typeof bridge !== 'object') return null
  const candidate = bridge as Partial<DesktopBridge>
  if (typeof candidate.mainApiBase !== 'string') return null
  if (typeof candidate.setGeneralUnblock !== 'function') return null
  return candidate as DesktopBridge
}
