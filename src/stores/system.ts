import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/services/api'
import type { SystemInfo, HeapInfo, TaskInfo, LogEntry, NvsEntry } from '@/types/system'
import type { WifiStatus } from '@/types/wifi'

const MAX_LOGS = 200
let logIdCounter = 0

export const useSystemStore = defineStore('system', () => {
  const info = ref<SystemInfo | null>(null)
  const heap = ref<HeapInfo | null>(null)
  const wifi = ref<WifiStatus | null>(null)
  const tasks = ref<TaskInfo[]>([])
  const logs = ref<LogEntry[]>([])
  const nvsEntries = ref<NvsEntry[]>([])
  const loading = ref(false)
  const wifiConnecting = ref(false)

  async function fetchInfo() {
    try {
      loading.value = true
      info.value = await api.getSystemInfo()
    } finally {
      loading.value = false
    }
  }

  async function fetchHeap() {
    heap.value = await api.getDiagSystem()
  }

  async function fetchWifi() {
    wifi.value = await api.getWifiStatus()
  }

  async function fetchTasks() {
    const res = await api.getDiagTasks()
    tasks.value = res.tasks
  }

  async function fetchNvs() {
    const res = await api.getDiagNvs()
    nvsEntries.value = res.entries
  }

  function pushLog(entry: Omit<LogEntry, 'id' | 'ts_label'>) {
    const ms = entry.ts
    const h = Math.floor(ms / 3600000)
      .toString()
      .padStart(2, '0')
    const m = Math.floor((ms % 3600000) / 60000)
      .toString()
      .padStart(2, '0')
    const s = Math.floor((ms % 60000) / 1000)
      .toString()
      .padStart(2, '0')
    const ms2 = (ms % 1000).toString().padStart(3, '0')
    const log: LogEntry = { ...entry, id: ++logIdCounter, ts_label: `${h}:${m}:${s}.${ms2}` }
    logs.value.push(log)
    if (logs.value.length > MAX_LOGS) logs.value.shift()
  }

  function clearLogs() {
    logs.value = []
  }

  return {
    info,
    heap,
    wifi,
    tasks,
    logs,
    nvsEntries,
    loading,
    wifiConnecting,
    fetchInfo,
    fetchHeap,
    fetchWifi,
    fetchTasks,
    fetchNvs,
    pushLog,
    clearLogs,
  }
})
