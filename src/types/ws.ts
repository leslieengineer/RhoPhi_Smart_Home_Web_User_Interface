import type { DeviceState } from './device'
import type { MeshNode } from './mesh'
import type { WifiStatus } from './wifi'
import type { LogEntry, TaskInfo } from './system'

export type FirmwareEvent =
  | { type: 'STATE_UPDATE'; payload: DeviceState }
  | { type: 'NODE_UPDATE'; payload: MeshNode }
  | { type: 'NODE_OFFLINE'; payload: { addr: string; last_seen_ms: number } }
  | { type: 'WIFI_STATUS'; payload: WifiStatus }
  | { type: 'LOG'; payload: LogEntry }
  | { type: 'TASK_STATS'; payload: { tasks: TaskInfo[] } }
  | {
      type: 'HEAP_STATS'
      payload: {
        free_heap: number
        min_free_heap: number
        largest_free_block: number
        total_heap: number
      }
    }
  | { type: 'WIFI_CONNECT_RESULT'; payload: { success: boolean; ip?: string; error?: string } }
  | {
      type: 'SCENE_ACTIVATED'
      payload: { scene_id: number; results: { addr: string; ok: boolean }[] }
    }
  | { type: 'PONG' }

export type ClientEvent =
  | { type: 'SUBSCRIBE_LOG'; enabled: boolean }
  | { type: 'SUBSCRIBE_TASKS'; enabled: boolean }
  | { type: 'PING' }
