export interface SystemInfo {
  version: string
  build_date: string
  idf_version: string
  chip_model: string
  chip_revision: number
  mac: string
  device_id: string
  device_name: string
  uptime_s: number
  boot_count: number
  reset_reason: string
  cpu_freq_mhz: number
}

export interface HeapInfo {
  free_heap: number
  min_free_heap: number
  largest_free_block: number
  total_heap: number
  uptime_s: number
}

export type TaskState = 'RUN' | 'RDY' | 'BLK' | 'SUS' | 'DEL'

export interface TaskInfo {
  name: string
  priority: number
  stack_hwm: number
  stack_hwm_bytes: number
  state: TaskState
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

export interface LogEntry {
  id: number
  level: LogLevel
  tag: string
  msg: string
  ts: number
  ts_label: string
}

export interface NvsEntry {
  namespace: string
  key: string
  type: 'u8' | 'u32' | 'i32' | 'bool' | 'string' | 'blob'
  value: string
  size: number
}
