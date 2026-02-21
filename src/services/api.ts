const BASE = import.meta.env.VITE_API_BASE || ''

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json()
}

export const api = {
  // System
  getSystemInfo: () => request<import('@/types/system').SystemInfo>('/api/system/info'),
  getDiagSystem: () => request<import('@/types/system').HeapInfo>('/api/diagnostics/system'),
  getDiagTasks: () =>
    request<{ tasks: import('@/types/system').TaskInfo[] }>('/api/diagnostics/tasks'),
  getDiagNvs: () =>
    request<{ entries: import('@/types/system').NvsEntry[] }>('/api/diagnostics/nvs'),

  // Device
  getDeviceState: () => request<import('@/types/device').DeviceState>('/api/device/state'),
  setRelay: (state: boolean) =>
    request<{ relay_on: boolean }>('/api/device/relay', {
      method: 'POST',
      body: JSON.stringify({ state }),
    }),
  setBrightness: (level: number) =>
    request<{ brightness: number }>('/api/device/brightness', {
      method: 'POST',
      body: JSON.stringify({ level }),
    }),

  // Mesh
  getMeshNodes: () => request<import('@/types/mesh').MeshNetwork>('/api/mesh/nodes'),
  setNodeRelay: (addr: string, state: boolean) =>
    request<{ addr: string; relay_on: boolean }>(`/api/mesh/node/${addr}/relay`, {
      method: 'POST',
      body: JSON.stringify({ state }),
    }),
  setNodeBrightness: (addr: string, level: number) =>
    request<{ addr: string; brightness: number }>(`/api/mesh/node/${addr}/brightness`, {
      method: 'POST',
      body: JSON.stringify({ level }),
    }),
  renameNode: (addr: string, name: string) =>
    request<{ addr: string; name: string }>(`/api/mesh/node/${addr}/name`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  removeNode: (addr: string) =>
    request<{ removed: boolean }>(`/api/mesh/node/${addr}`, { method: 'DELETE' }),

  // Scenes
  getScenes: () => request<{ scenes: import('@/types/scene').Scene[] }>('/api/scenes'),
  createScene: (name: string, targets: import('@/types/scene').SceneTarget[] = []) =>
    request<import('@/types/scene').Scene>('/api/scenes', {
      method: 'POST',
      body: JSON.stringify({ name, targets }),
    }),
  activateScene: (id: number) =>
    request<{ activated: boolean }>(`/api/scenes/${id}/activate`, { method: 'POST' }),
  deleteScene: (id: number) =>
    request<{ removed: boolean }>(`/api/scenes/${id}`, { method: 'DELETE' }),

  // WiFi
  getWifiStatus: () => request<import('@/types/wifi').WifiStatus>('/api/wifi/status'),
  scanWifi: () => request<{ networks: import('@/types/wifi').WifiNetwork[] }>('/api/wifi/scan'),
  connectWifi: (ssid: string, password: string) =>
    request<{ status: string }>('/api/wifi/connect', {
      method: 'POST',
      body: JSON.stringify({ ssid, password }),
    }),

  // Settings
  saveDeviceName: (name: string) =>
    request<{ name: string }>('/api/settings/device', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
}
