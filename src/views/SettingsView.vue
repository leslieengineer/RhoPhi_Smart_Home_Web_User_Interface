<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSystemStore } from '@/stores/system'
import { useToast } from '@/composables/useToast'
import { api } from '@/services/api'
import type { WifiNetwork } from '@/types/wifi'

const system = useSystemStore()
const toast = useToast()

onMounted(() => {
  system.fetchInfo()
  system.fetchWifi()
})

// ── Device name ──────────────────────────────────────────────
const editingName = ref(false)
const newName = ref('')
const savingName = ref(false)

function startEditName() {
  newName.value = system.info?.device_name ?? ''
  editingName.value = true
}
async function saveName() {
  savingName.value = true
  try {
    await api.saveDeviceName(newName.value.trim())
    toast.success('Name saved')
    editingName.value = false
    await system.fetchInfo()
  } catch {
    toast.error('Failed to save')
  } finally {
    savingName.value = false
  }
}

// ── WiFi scanner ──────────────────────────────────────────────
const showWifi = ref(false)
const scanning = ref(false)
const wifiNetworks = ref<WifiNetwork[]>([])
const selectedSsid = ref('')
const wifiPassword = ref('')
const connecting = ref(false)

async function scanWifi() {
  scanning.value = true
  try {
    const res = await api.scanWifi()
    wifiNetworks.value = res.networks
  } catch {
    toast.error('Scan failed')
  } finally {
    scanning.value = false
  }
}

function selectNetwork(ssid: string) {
  selectedSsid.value = ssid
  wifiPassword.value = ''
}

async function connectWifi() {
  if (!selectedSsid.value || !wifiPassword.value) {
    toast.error('Enter SSID and password')
    return
  }
  connecting.value = true
  try {
    await api.connectWifi(selectedSsid.value, wifiPassword.value)
    toast.success('Connecting…')
    showWifi.value = false
    setTimeout(() => system.fetchWifi(), 3000)
  } catch {
    toast.error('Connect failed')
  } finally {
    connecting.value = false
  }
}

function rssiIcon(rssi: number) {
  if (rssi > -50) return '▂▄▆█'
  if (rssi > -65) return '▂▄▆'
  if (rssi > -75) return '▂▄'
  return '▂'
}

function openWifi() {
  showWifi.value = true
  scanWifi()
}
</script>

<template>
  <div class="px-4 py-4 space-y-4">
    <!-- Device Info -->
    <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div class="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Device</div>

      <div v-if="!system.info" class="text-xs text-zinc-500">Loading...</div>
      <div v-else class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-zinc-400">Name</span>
          <div v-if="editingName" class="flex gap-2">
            <input
              v-model="newName"
              class="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-0.5 text-sm text-zinc-100 w-36 focus:outline-none"
            />
            <button
              @click="saveName"
              :disabled="savingName"
              class="text-green-400 text-xs font-medium"
            >
              Save
            </button>
            <button @click="editingName = false" class="text-zinc-500 text-xs">Cancel</button>
          </div>
          <div v-else class="flex items-center gap-2">
            <span class="text-zinc-200 font-medium">{{ system.info.device_name }}</span>
            <button @click="startEditName" class="text-green-400 text-xs">Edit</button>
          </div>
        </div>
        <div class="flex justify-between">
          <span class="text-zinc-400">Firmware</span>
          <span class="text-zinc-200 font-mono text-xs">{{ system.info.version }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-zinc-400">Build</span>
          <span class="text-zinc-200 text-xs">{{ system.info.build_date }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-zinc-400">Chip</span>
          <span class="text-zinc-200 text-xs"
            >{{ system.info.chip_model }} rev{{ system.info.chip_revision }}</span
          >
        </div>
        <div class="flex justify-between">
          <span class="text-zinc-400">MAC</span>
          <span class="text-zinc-200 font-mono text-xs">{{ system.info.mac }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-zinc-400">IDF</span>
          <span class="text-zinc-200 font-mono text-xs">{{ system.info.idf_version }}</span>
        </div>
      </div>
    </div>

    <!-- WiFi -->
    <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="text-xs text-zinc-500 font-semibold uppercase tracking-wider">WiFi</div>
        <button @click="openWifi" class="text-xs text-green-400 hover:text-green-300 font-medium">
          Change Network
        </button>
      </div>

      <div v-if="!system.wifi" class="text-xs text-zinc-500">Loading...</div>
      <div v-else class="space-y-2 text-sm">
        <div class="flex items-center gap-2">
          <span
            :class="system.wifi.connected ? 'bg-green-400' : 'bg-red-500'"
            class="w-2 h-2 rounded-full"
          />
          <span :class="system.wifi.connected ? 'text-green-400' : 'text-zinc-400'">
            {{ system.wifi.connected ? 'Connected' : 'Disconnected' }}
          </span>
        </div>
        <template v-if="system.wifi.connected">
          <div class="flex justify-between">
            <span class="text-zinc-400">SSID</span>
            <span class="text-zinc-200 font-medium">{{ system.wifi.ssid }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-400">IP</span>
            <span class="text-zinc-200 font-mono">{{ system.wifi.ip }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-400">RSSI</span>
            <span class="text-zinc-200">{{ system.wifi.rssi }} dBm</span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-400">Gateway</span>
            <span class="text-zinc-200 font-mono">{{ system.wifi.gateway }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Mesh config -->
    <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div class="text-xs text-zinc-500 font-semibold uppercase tracking-wider">BLE Mesh</div>
      <div class="text-xs text-zinc-400 leading-relaxed">
        Mesh provisioning is handled via the firmware configuration tool. Use the
        <RouterLink to="/mesh" class="text-green-400 hover:underline">Mesh tab</RouterLink>
        to manage provisioned nodes.
      </div>
    </div>

    <!-- About -->
    <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
      <div class="text-xs text-zinc-500 font-semibold uppercase tracking-wider">About</div>
      <div class="text-xs text-zinc-400 leading-relaxed">
        RhoPhi Smart Home ESP32 Gateway<br />
        BLE Mesh + WiFi Home Automation
      </div>
    </div>
  </div>

  <!-- WiFi Scanner drawer -->
  <Teleport to="body">
    <Transition name="drawer">
      <div
        v-if="showWifi"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      >
        <div
          class="w-full max-w-[480px] rounded-t-3xl bg-zinc-900 border border-zinc-800 p-6 space-y-5 max-h-[85vh] overflow-y-auto"
        >
          <div class="flex items-center justify-between">
            <h2 class="text-base font-bold text-zinc-100">WiFi Networks</h2>
            <div class="flex gap-3 items-center">
              <button
                @click="scanWifi"
                :disabled="scanning"
                class="text-xs text-green-400 font-medium disabled:opacity-50"
              >
                {{ scanning ? 'Scanning...' : 'Rescan' }}
              </button>
              <button @click="showWifi = false" class="text-zinc-500 hover:text-zinc-300 text-xl">
                ✕
              </button>
            </div>
          </div>

          <div v-if="scanning" class="flex justify-center py-6">
            <div
              class="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin"
            />
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="net in wifiNetworks"
              :key="net.ssid"
              @click="selectNetwork(net.ssid)"
              :class="
                selectedSsid === net.ssid
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-750'
              "
              class="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors"
            >
              <span class="text-zinc-400 font-mono text-xs">{{ rssiIcon(net.rssi) }}</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-zinc-100 truncate">{{ net.ssid }}</div>
                <div class="text-xs text-zinc-500">
                  {{ net.rssi }} dBm · Ch {{ net.channel }} {{ net.secure ? '🔒' : '' }}
                </div>
              </div>
            </button>
          </div>

          <!-- Manual / Password -->
          <div v-if="selectedSsid || wifiNetworks.length === 0" class="space-y-3 pt-1">
            <div v-if="!selectedSsid">
              <label class="text-xs text-zinc-500">SSID (manual)</label>
              <input
                v-model="selectedSsid"
                placeholder="Enter SSID"
                class="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
            <div v-else class="text-sm font-medium text-green-400">📶 {{ selectedSsid }}</div>
            <div>
              <label class="text-xs text-zinc-500">Password</label>
              <input
                v-model="wifiPassword"
                type="password"
                placeholder="Password"
                class="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
            <button
              @click="connectWifi"
              :disabled="connecting"
              class="w-full py-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
            >
              {{ connecting ? 'Connecting...' : 'Connect' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
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
