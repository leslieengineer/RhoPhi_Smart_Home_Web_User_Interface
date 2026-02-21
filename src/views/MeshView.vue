<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMeshStore } from '@/stores/mesh'
import type { MeshNode } from '@/types/mesh'
import RelayToggle from '@/components/common/RelayToggle.vue'
import BrightnessSlider from '@/components/common/BrightnessSlider.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

const mesh = useMeshStore()
type FilterType = 'all' | 'online' | 'offline'
const filter = ref<FilterType>('all')
const filterOpts: FilterType[] = ['all', 'online', 'offline']
const search = ref('')

const filteredNodes = computed(() => {
  let list = mesh.nodesArray
  if (filter.value === 'online') list = list.filter((n) => n.status === 'online')
  if (filter.value === 'offline') list = list.filter((n) => n.status !== 'online')
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter((n) => n.name.toLowerCase().includes(q) || n.addr.toLowerCase().includes(q))
  }
  return list
})

onMounted(() => mesh.fetchNodes())

// Detail drawer
const selectedNode = ref<MeshNode | null>(null)
const editName = ref('')
const showConfirmRemove = ref(false)

function openDetail(node: MeshNode) {
  selectedNode.value = { ...node }
  editName.value = node.name
}
function closeDetail() {
  selectedNode.value = null
}

async function saveName() {
  if (!selectedNode.value) return
  await mesh.renameNode(selectedNode.value.addr, editName.value)
  closeDetail()
}

async function confirmRemove() {
  if (!selectedNode.value) return
  await mesh.removeNode(selectedNode.value.addr)
  showConfirmRemove.value = false
  closeDetail()
}

function rssiBar(rssi: number | null) {
  if (rssi === null) return 0
  return Math.max(0, Math.min(100, (rssi + 100) * 2))
}

function lastSeenLabel(ms: number) {
  const s = ms / 1000
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}
</script>

<template>
  <div class="px-4 py-4 space-y-4">
    <!-- Filter bar -->
    <div class="flex gap-2">
      <div class="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-1">
        <button
          v-for="opt in filterOpts"
          :key="opt"
          @click="filter = opt"
          :class="filter === opt ? 'bg-zinc-700 text-white' : 'text-zinc-500'"
          class="px-3 py-1 text-xs rounded-lg capitalize transition-colors font-medium"
        >
          {{ opt }}
        </button>
      </div>
      <div class="flex-1 relative">
        <input
          v-model="search"
          placeholder="Search..."
          class="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>
    </div>

    <!-- Count -->
    <div class="text-xs text-zinc-500">{{ mesh.onlineCount }}/{{ mesh.nodeCount }} online</div>

    <!-- Node list -->
    <div v-if="mesh.loading" class="flex justify-center py-12">
      <div
        class="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin"
      />
    </div>
    <div
      v-else-if="filteredNodes.length === 0"
      class="text-center py-12 text-zinc-500 text-sm italic"
    >
      No nodes found
    </div>
    <div v-else class="space-y-3">
      <div
        v-for="node in filteredNodes"
        :key="node.addr"
        class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3"
      >
        <!-- Header -->
        <div class="flex items-start gap-3">
          <span
            :class="node.status === 'online' ? 'bg-green-400' : 'bg-zinc-600'"
            class="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0"
          />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-zinc-100 truncate">
              {{ node.name || node.addr }}
            </div>
            <div class="text-xs text-zinc-500">{{ node.addr }} · {{ node.model_type }}</div>
          </div>
          <span
            v-if="node.status !== 'online'"
            class="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full"
          >
            Offline · {{ lastSeenLabel(node.last_seen_ms) }}
          </span>
        </div>

        <!-- Controls (online only) -->
        <template v-if="node.status === 'online'">
          <div class="flex items-center justify-between">
            <span class="text-xs text-zinc-400">Relay</span>
            <RelayToggle
              :model-value="node.relay_on"
              @update:model-value="mesh.toggleNode(node.addr, $event)"
            />
          </div>
          <div v-if="node.model_type === 'lightness'" class="space-y-1">
            <span class="text-xs text-zinc-400">Brightness</span>
            <BrightnessSlider
              :model-value="node.brightness"
              @update:model-value="mesh.setNodeBrightness(node.addr, $event)"
            />
          </div>
          <div v-if="node.rssi !== null" class="flex items-center gap-2">
            <span class="text-xs text-zinc-500">RSSI {{ node.rssi }} dBm</span>
            <div class="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500 rounded-full transition-all"
                :style="{ width: rssiBar(node.rssi) + '%' }"
              />
            </div>
          </div>
        </template>

        <!-- Details button -->
        <button
          @click="openDetail(node)"
          class="w-full py-2 text-xs text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
        >
          Details
        </button>
      </div>
    </div>
  </div>

  <!-- Detail drawer -->
  <Teleport to="body">
    <Transition name="drawer">
      <div
        v-if="selectedNode"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      >
        <div
          class="w-full max-w-[480px] rounded-t-3xl bg-zinc-900 border border-zinc-800 p-6 space-y-5"
        >
          <div class="flex items-center justify-between">
            <h2 class="text-base font-bold text-zinc-100">Node Details</h2>
            <button
              @click="closeDetail"
              class="text-zinc-500 hover:text-zinc-300 text-xl leading-none"
            >
              ✕
            </button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="text-xs text-zinc-500 font-medium">Name</label>
              <input
                v-model="editName"
                class="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="bg-zinc-800 rounded-xl p-3">
                <div class="text-xs text-zinc-500 mb-1">Address</div>
                <div class="text-zinc-200 font-mono">{{ selectedNode.addr }}</div>
              </div>
              <div class="bg-zinc-800 rounded-xl p-3">
                <div class="text-xs text-zinc-500 mb-1">Model</div>
                <div class="text-zinc-200 capitalize">{{ selectedNode.model_type }}</div>
              </div>
              <div class="bg-zinc-800 rounded-xl p-3">
                <div class="text-xs text-zinc-500 mb-1">Status</div>
                <div
                  :class="selectedNode.status === 'online' ? 'text-green-400' : 'text-red-400'"
                  class="font-medium capitalize"
                >
                  {{ selectedNode.status }}
                </div>
              </div>
              <div class="bg-zinc-800 rounded-xl p-3">
                <div class="text-xs text-zinc-500 mb-1">RSSI</div>
                <div class="text-zinc-200">
                  {{ selectedNode.rssi !== null ? selectedNode.rssi + ' dBm' : '–' }}
                </div>
              </div>
            </div>
          </div>

          <div class="flex gap-3">
            <button
              @click="saveName"
              class="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Save Name
            </button>
            <button
              @click="showConfirmRemove = true"
              class="flex-1 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium rounded-xl transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <ConfirmDialog
    v-if="showConfirmRemove"
    title="Remove Node"
    :message="`Remove '${selectedNode?.name || selectedNode?.addr}' from mesh?`"
    confirm-label="Remove"
    :danger="true"
    @confirm="confirmRemove"
    @cancel="showConfirmRemove = false"
  />
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: all 0.3s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
  transform: translateY(100%);
}
</style>
