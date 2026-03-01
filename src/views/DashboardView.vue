<script setup lang="ts">
import { onMounted } from 'vue'
import { useDeviceStore } from '@/stores/device'
import { useMeshStore } from '@/stores/mesh'
import { useSystemStore } from '@/stores/system'
import ChannelCard from '@/components/common/ChannelCard.vue'
import RelayToggle from '@/components/common/RelayToggle.vue'

const device = useDeviceStore()
const mesh = useMeshStore()
const system = useSystemStore()

onMounted(async () => {
  await Promise.all([device.fetchState(), mesh.fetchNodes(), system.fetchWifi()])
})

function rssiLabel(rssi: number | null) {
  if (rssi === null) return '–'
  if (rssi > -50) return 'Excellent'
  if (rssi > -65) return 'Good'
  if (rssi > -75) return 'Fair'
  return 'Poor'
}

function lastSeenLabel(ms: number): string {
  const s = ms / 1000
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}
</script>

<template>
  <div class="px-4 py-4 space-y-4">
    <!-- Status cards -->
    <div class="grid grid-cols-2 gap-3">
      <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-1">
        <div class="text-xs text-zinc-500 font-medium">📶 WiFi</div>
        <div
          :class="system.wifi?.connected ? 'text-green-400' : 'text-red-400'"
          class="text-sm font-semibold"
        >
          {{ system.wifi?.connected ? 'Connected' : 'Disconnected' }}
        </div>
        <div class="text-xs text-zinc-400 truncate">{{ system.wifi?.ssid ?? '–' }}</div>
        <div v-if="system.wifi?.rssi" class="text-xs text-zinc-500">
          {{ system.wifi.rssi }} dBm · {{ rssiLabel(system.wifi.rssi) }}
        </div>
      </div>
      <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-1">
        <div class="text-xs text-zinc-500 font-medium">🔗 BLE Mesh</div>
        <div class="text-sm font-semibold text-green-400">
          {{ mesh.onlineCount }}/{{ mesh.nodeCount }} Online
        </div>
        <div class="text-xs text-zinc-400">{{ mesh.nodeCount }} nodes</div>
        <div v-if="mesh.selfAddr" class="text-xs text-zinc-500">GW: {{ mesh.selfAddr }}</div>
      </div>
    </div>

    <!-- This device — multi-channel -->
    <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
            This Device
          </div>
          <div class="text-[10px] text-zinc-600 mt-0.5">
            {{ device.state.product }} · {{ device.state.channel_count }}ch
          </div>
        </div>
        <div v-if="device.state.device_name" class="text-xs text-zinc-400 truncate max-w-[140px]">
          {{ device.state.device_name }}
        </div>
      </div>

      <!-- Render N ChannelCards dynamically -->
      <div class="space-y-2">
        <ChannelCard
          v-for="ch in device.state.channels"
          :key="ch.index"
          :channel="ch"
          @toggle="(idx, on) => device.setChannelState(idx, on)"
          @level="(idx, val) => device.setChannelLevel(idx, val)"
        />
      </div>
    </div>

    <!-- Quick mesh -->
    <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Mesh Nodes</div>
        <RouterLink to="/mesh" class="text-xs text-green-400 hover:text-green-300"
          >View all →</RouterLink
        >
      </div>
      <div v-if="mesh.loading" class="text-xs text-zinc-500">Loading...</div>
      <div v-else-if="mesh.nodeCount === 0" class="text-xs text-zinc-500 italic">
        No nodes provisioned
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="node in mesh.nodesArray.slice(0, 3)"
          :key="node.addr"
          class="flex items-center gap-3"
        >
          <span
            :class="node.status === 'online' ? 'bg-green-400' : 'bg-zinc-600'"
            class="w-2 h-2 rounded-full flex-shrink-0"
          />
          <div class="flex-1 min-w-0">
            <div class="text-sm text-zinc-200 truncate">{{ node.name || node.addr }}</div>
            <div class="text-[10px] text-zinc-500">
              {{ node.product_id || node.model_type }} · {{ node.channel_count }}ch
              <template v-if="node.status === 'offline'">
                · {{ lastSeenLabel(node.last_seen_ms) }}
              </template>
            </div>
          </div>
          <!-- Quick toggle for first channel -->
          <RelayToggle
            v-if="node.status === 'online' && node.channels?.length > 0"
            :model-value="node.channels[0]?.on ?? false"
            @update:model-value="mesh.toggleNodeChannel(node.addr, 0, $event)"
          />
          <span v-else-if="node.status !== 'online'" class="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full"
            >Offline</span
          >
        </div>
        <div v-if="mesh.nodeCount > 3" class="text-xs text-zinc-500 text-center pt-1">
          + {{ mesh.nodeCount - 3 }} more
        </div>
      </div>
    </div>
  </div>
</template>
