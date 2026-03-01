export interface SceneChannelSnapshot {
  index: number
  on: boolean
  level: number // 0–100
}

export interface SceneTarget {
  addr: string
  channels: SceneChannelSnapshot[]
  // Legacy compat:
  relay_on?: boolean
  brightness?: number
}

export interface SceneLocalSnapshot {
  channels: SceneChannelSnapshot[]
}

export interface Scene {
  id: number
  name: string
  targets: SceneTarget[]
  local_channels?: SceneLocalSnapshot
  created_at: number
}
