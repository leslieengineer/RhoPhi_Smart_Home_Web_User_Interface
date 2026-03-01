import type { ChannelType } from './device'

export type NodeModelType = 'onoff' | 'lightness' | 'switch' | 'unknown'
export type NodeOnlineStatus = 'online' | 'offline' | 'provisioning'

export interface NodeChannel {
  index: number
  name: string
  type: ChannelType
  on: boolean
  level: number // 0–100
}

export interface MeshNode {
  addr: string
  uuid: string
  name: string
  product_id: string // e.g. "SW-3CH-N"
  model_type: NodeModelType
  channel_count: number
  channels: NodeChannel[]
  status: NodeOnlineStatus
  rssi: number | null
  last_seen_ms: number
  // Legacy compat (maps to channels[0]):
  relay_on: boolean
  brightness: number
}

export interface MeshNetwork {
  self_addr: string
  node_count: number
  online_count: number
  nodes: MeshNode[]
}

/**
 * Normalize a legacy flat MeshNode (relay_on, brightness)
 * into the multi-channel format if channels[] is missing.
 */
export function normalizeMeshNode(raw: MeshNode): MeshNode {
  if (!raw.channels || raw.channels.length === 0) {
    raw.product_id = raw.product_id || 'SW-1CH-N'
    raw.channel_count = 1
    raw.channels = [
      {
        index: 0,
        name: 'Relay',
        type: raw.model_type === 'lightness' ? 'dimmer' : 'onoff',
        on: raw.relay_on ?? false,
        level: raw.brightness ?? (raw.relay_on ? 100 : 0),
      },
    ]
  }
  return raw
}
