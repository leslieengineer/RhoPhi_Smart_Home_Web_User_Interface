<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useSystemStore } from '@/stores/system'
import { useWsStore } from '@/stores/ws'
import type { LogEntry } from '@/types/system'

const system = useSystemStore()
const ws = useWsStore()

const logViewport = ref<HTMLElement | null>(null)
const autoScroll = ref(true)
const logLevelFilter = ref<string>('ALL')
const levels = ['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE']
const levelColors: Record<string, string> = {
  ERROR: 'text-red-400',
  WARN: 'text-yellow-400',
  INFO: 'text-blue-400',
  DEBUG: 'text-zinc-400',
  VERBOSE: 'text-zinc-600',
}

const filteredLogs = computed<LogEntry[]>(() => {
  if (logLevelFilter.value === 'ALL') return system.logs
  return system.logs.filter((l) => l.level === logLevelFilter.value)
})

function scrollToBottom() {
  nextTick(() => {
    if (logViewport.value && autoScroll.value) {
      logViewport.value.scrollTop = logViewport.value.scrollHeight
    }
  })
}

function onScroll() {
  if (!logViewport.value) return
  const { scrollTop, scrollHeight, clientHeight } = logViewport.value
  autoScroll.value = scrollTop + clientHeight >= scrollHeight - 40
}

// Watch logs length via interval for auto-scroll
let scrollInterval: ReturnType<typeof setInterval>
onMounted(async () => {
  await Promise.all([
    system.fetchInfo(),
    system.fetchHeap(),
    system.fetchTasks(),
    system.fetchNvs(),
  ])
  ws.enableLogStream(true)
  ws.enableTaskStream(true)
  scrollInterval = setInterval(scrollToBottom, 500)
})
onUnmounted(() => {
  ws.enableLogStream(false)
  ws.enableTaskStream(false)
  clearInterval(scrollInterval)
})

function uptimeLabel(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}h ${m}m ${sec}s`
}

function heapPercent(heap: typeof system.heap) {
  if (!heap || !heap.total_heap) return 0
  return Math.round((heap.free_heap / heap.total_heap) * 100)
}

function refreshSystem() {
  // grouped refresh used by the template to avoid complex inline expressions
  system.fetchInfo()
  system.fetchHeap()
}

const taskStateColors: Record<string, string> = {
  RUN: 'text-green-400',
  RDY: 'text-blue-400',
  BLK: 'text-yellow-400',
  SUS: 'text-zinc-500',
  DEL: 'text-red-400',
}
</script>

<template>
  <div class="px-4 py-4 space-y-4">
    <!-- System Info -->
    <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="text-xs text-zinc-500 font-semibold uppercase tracking-wider">System</div>
        <button @click="refreshSystem" class="text-xs text-zinc-500 hover:text-zinc-300">
          ↻ Refresh
        </button>
      </div>

      <div v-if="system.info" class="grid grid-cols-2 gap-3">
        <div class="bg-zinc-800 rounded-xl p-3">
          <div class="text-xs text-zinc-500 mb-0.5">Uptime</div>
          <div class="text-sm text-zinc-200 font-mono">{{ uptimeLabel(system.info.uptime_s) }}</div>
        </div>
        <div class="bg-zinc-800 rounded-xl p-3">
          <div class="text-xs text-zinc-500 mb-0.5">Boot Count</div>
          <div class="text-sm text-zinc-200 font-mono">{{ system.info.boot_count }}</div>
        </div>
        <div class="bg-zinc-800 rounded-xl p-3">
          <div class="text-xs text-zinc-500 mb-0.5">Reset Reason</div>
          <div class="text-xs text-zinc-200">{{ system.info.reset_reason }}</div>
        </div>
        <div class="bg-zinc-800 rounded-xl p-3">
          <div class="text-xs text-zinc-500 mb-0.5">CPU Freq</div>
          <div class="text-sm text-zinc-200">{{ system.info.cpu_freq_mhz }} MHz</div>
        </div>
      </div>

      <!-- Heap bar -->
      <div v-if="system.heap" class="space-y-1.5">
        <div class="flex justify-between text-xs">
          <span class="text-zinc-400">Free Heap</span>
          <span class="text-zinc-200 font-mono">
            {{ Math.round(system.heap.free_heap / 1024) }}k /
            {{ Math.round(system.heap.total_heap / 1024) }}k
            <span class="text-zinc-500">({{ heapPercent(system.heap) }}%)</span>
          </span>
        </div>
        <div class="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            :class="
              heapPercent(system.heap) > 40
                ? 'bg-green-500'
                : heapPercent(system.heap) > 20
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
            "
            :style="{ width: heapPercent(system.heap) + '%' }"
          />
        </div>
        <div class="flex justify-between text-xs text-zinc-500">
          <span>Min free: {{ Math.round(system.heap.min_free_heap / 1024) }}k</span>
          <span>Largest: {{ Math.round(system.heap.largest_free_block / 1024) }}k</span>
        </div>
      </div>
    </div>

    <!-- Tasks -->
    <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
          FreeRTOS Tasks
        </div>
        <button @click="system.fetchTasks()" class="text-xs text-zinc-500 hover:text-zinc-300">
          ↻ Refresh
        </button>
      </div>
      <div v-if="system.tasks.length === 0" class="text-xs text-zinc-500 italic">No task data</div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-zinc-500 border-b border-zinc-800">
              <th class="text-left pb-2 font-medium">Name</th>
              <th class="text-center pb-2 font-medium">Pri</th>
              <th class="text-center pb-2 font-medium">State</th>
              <th class="text-right pb-2 font-medium">Stack HWM</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="task in system.tasks"
              :key="task.name"
              class="border-b border-zinc-800/50 last:border-0"
            >
              <td class="py-2 pr-2 font-mono text-zinc-200">{{ task.name }}</td>
              <td class="py-2 text-center text-zinc-400">{{ task.priority }}</td>
              <td
                class="py-2 text-center font-medium"
                :class="taskStateColors[task.state] || 'text-zinc-400'"
              >
                {{ task.state }}
              </td>
              <td class="py-2 text-right font-mono text-zinc-400">{{ task.stack_hwm_bytes }}B</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Log viewer -->
    <div class="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
      <div class="px-4 py-3 flex items-center justify-between border-b border-zinc-800">
        <div class="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Live Logs</div>
        <div class="flex items-center gap-2">
          <div class="flex gap-1">
            <button
              v-for="lvl in levels"
              :key="lvl"
              @click="logLevelFilter = lvl"
              :class="logLevelFilter === lvl ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-600'"
              class="px-2 py-0.5 text-xs rounded-lg transition-colors font-medium"
            >
              {{ lvl }}
            </button>
          </div>
          <button
            @click="autoScroll = !autoScroll"
            :class="autoScroll ? 'text-green-400' : 'text-zinc-500'"
            class="text-xs font-medium"
          >
            {{ autoScroll ? 'Auto' : 'Paused' }}
          </button>
          <button @click="system.clearLogs()" class="text-xs text-zinc-600 hover:text-zinc-400">
            Clear
          </button>
        </div>
      </div>
      <div
        ref="logViewport"
        @scroll="onScroll"
        class="h-64 overflow-y-auto font-mono text-xs leading-relaxed p-3 space-y-0.5"
      >
        <div v-if="filteredLogs.length === 0" class="text-zinc-600 italic pt-2">
          Waiting for logs…
        </div>
        <div
          v-for="log in filteredLogs"
          :key="log.id"
          class="flex gap-2 hover:bg-zinc-800/50 px-1 rounded"
        >
          <span class="text-zinc-600 flex-shrink-0">{{ log.ts_label }}</span>
          <span :class="levelColors[log.level] || 'text-zinc-400'" class="flex-shrink-0 w-5">{{
            log.level[0]
          }}</span>
          <span class="text-zinc-500 flex-shrink-0">[{{ log.tag }}]</span>
          <span class="text-zinc-300 break-all">{{ log.msg }}</span>
        </div>
      </div>
    </div>

    <!-- NVS -->
    <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="text-xs text-zinc-500 font-semibold uppercase tracking-wider">NVS Storage</div>
        <button @click="system.fetchNvs()" class="text-xs text-zinc-500 hover:text-zinc-300">
          ↻ Refresh
        </button>
      </div>
      <div v-if="system.nvsEntries.length === 0" class="text-xs text-zinc-500 italic">
        No NVS data
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-zinc-500 border-b border-zinc-800">
              <th class="text-left pb-2 font-medium">Namespace</th>
              <th class="text-left pb-2 font-medium">Key</th>
              <th class="text-left pb-2 font-medium">Type</th>
              <th class="text-right pb-2 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in system.nvsEntries"
              :key="`${entry.namespace}/${entry.key}`"
              class="border-b border-zinc-800/50 last:border-0"
            >
              <td class="py-2 pr-2 font-mono text-zinc-500">{{ entry.namespace }}</td>
              <td class="py-2 pr-2 font-mono text-zinc-300">{{ entry.key }}</td>
              <td class="py-2 pr-2 text-zinc-500">{{ entry.type }}</td>
              <td class="py-2 text-right font-mono text-zinc-400 break-all">{{ entry.value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
