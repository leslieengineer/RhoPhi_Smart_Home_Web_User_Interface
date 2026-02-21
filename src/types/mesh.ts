export type NodeModelType = 'onoff' | 'lightness' | 'switch' | 'unknown'
export type NodeOnlineStatus = 'online' | 'offline' | 'provisioning'

export interface MeshNode {
  addr: string
  uuid: string
  name: string
  model_type: NodeModelType
  status: NodeOnlineStatus
  relay_on: boolean
  brightness: number
  rssi: number | null
  last_seen_ms: number
}

export interface MeshNetwork {
  self_addr: string
  node_count: number
  online_count: number
  nodes: MeshNode[]
}
