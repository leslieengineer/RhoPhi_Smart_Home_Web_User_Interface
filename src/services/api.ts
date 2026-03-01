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

  // Device — multi-channel (v1.5.0)
  getDeviceState: () => request<import('@/types/device').DeviceState>('/api/device/state'),
  setChannelState: (ch: number, on: boolean) =>
    request<{ ok: boolean }>(`/api/device/channel/${ch}/state`, {
      method: 'POST',
      body: JSON.stringify({ on }),
    }),
  setChannelLevel: (ch: number, level: number) =>
    request<{ ok: boolean }>(`/api/device/channel/${ch}/level`, {
      method: 'POST',
      body: JSON.stringify({ level }),
    }),
  // Legacy single-relay compat
  setRelay: (state: boolean) =>
    request<{ ok: boolean }>('/api/device/channel/0/state', {
      method: 'POST',
      body: JSON.stringify({ on: state }),
    }),
  setBrightness: (level: number) =>
    request<{ ok: boolean }>('/api/device/channel/0/level', {
      method: 'POST',
      body: JSON.stringify({ level }),
    }),

  // Mesh — multi-channel (v1.5.0)
  getMeshNodes: () => request<import('@/types/mesh').MeshNetwork>('/api/mesh/nodes'),
  setNodeChannelState: (addr: string, ch: number, on: boolean) =>
    request<{ ok: boolean }>(`/api/mesh/node/${addr}/channel/${ch}/state`, {
      method: 'POST',
      body: JSON.stringify({ on }),
    }),
  setNodeChannelLevel: (addr: string, ch: number, level: number) =>
    request<{ ok: boolean }>(`/api/mesh/node/${addr}/channel/${ch}/level`, {
      method: 'POST',
      body: JSON.stringify({ level }),
    }),
  // Legacy single-relay compat
  setNodeRelay: (addr: string, state: boolean) =>
    request<{ ok: boolean }>(`/api/mesh/node/${addr}/channel/0/state`, {
      method: 'POST',
      body: JSON.stringify({ on: state }),
    }),
  setNodeBrightness: (addr: string, level: number) =>
    request<{ ok: boolean }>(`/api/mesh/node/${addr}/channel/0/level`, {
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

  // Scenes — per-channel (v1.5.0)
  getScenes: () => request<{ scenes: import('@/types/scene').Scene[] }>('/api/scenes'),
  createScene: (
    name: string,
    targets: import('@/types/scene').SceneTarget[] = [],
    local_channels?: import('@/types/scene').SceneLocalSnapshot,
  ) =>
    request<import('@/types/scene').Scene>('/api/scenes', {
      method: 'POST',
      body: JSON.stringify({ name, targets, local_channels }),
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
