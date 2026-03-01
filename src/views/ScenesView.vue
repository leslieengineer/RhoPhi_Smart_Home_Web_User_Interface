<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useScenesStore } from '@/stores/scenes'
import { useMeshStore } from '@/stores/mesh'
import { useDeviceStore } from '@/stores/device'
import type { SceneTarget, SceneChannelSnapshot, SceneLocalSnapshot } from '@/types/scene'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { useToast } from '@/composables/useToast'

const scenes = useScenesStore()
const mesh = useMeshStore()
const device = useDeviceStore()
const toast = useToast()

onMounted(() => {
  scenes.fetchScenes()
  mesh.fetchNodes()
  device.fetchState()
})

// --- Create scene modal ---
const showCreate = ref(false)
const newName = ref('')

// Local channels snapshot for create modal
interface LocalChEdit {
  index: number
  name: string
  on: boolean
  level: number
}

// Remote targets snapshot for create modal
interface TargetEdit {
  addr: string
  nodeName: string
  channels: LocalChEdit[]
}

const localChannels = ref<LocalChEdit[]>([])
const targets = ref<TargetEdit[]>([])

function openCreate() {
  newName.value = ''
  // Populate local channels from current device state
  localChannels.value = device.state.channels.map((ch) => ({
    index: ch.index,
    name: ch.name,
    on: ch.on,
    level: ch.level,
  }))
  // Populate mesh targets from online nodes
  targets.value = mesh.nodesArray
    .filter((n) => n.status === 'online')
    .map((n) => ({
      addr: n.addr,
      nodeName: n.name || n.addr,
      channels: n.channels.map((ch) => ({
        index: ch.index,
        name: ch.name,
        on: ch.on,
        level: ch.level,
      })),
    }))
  showCreate.value = true
}

async function submitCreate() {
  if (!newName.value.trim()) {
    toast.error('Scene name required')
    return
  }
  try {
    const sceneTargets: SceneTarget[] = targets.value.map((t) => ({
      addr: t.addr,
      channels: t.channels.map(
        (ch): SceneChannelSnapshot => ({
          index: ch.index,
          on: ch.on,
          level: ch.level,
        }),
      ),
    }))
    const local_channels: SceneLocalSnapshot = {
      channels: localChannels.value.map(
        (ch): SceneChannelSnapshot => ({
          index: ch.index,
          on: ch.on,
          level: ch.level,
        }),
      ),
    }
    await scenes.createScene(newName.value.trim(), sceneTargets, local_channels)
    showCreate.value = false
    toast.success('Scene created')
  } catch {
    toast.error('Failed to create scene')
  }
}

// --- Delete confirm ---
const deleteId = ref<number | null>(null)

async function confirmDelete() {
  if (deleteId.value === null) return
  await scenes.deleteScene(deleteId.value)
  deleteId.value = null
  toast.success('Scene deleted')
}

async function activate(id: number) {
  try {
    await scenes.activateScene(id)
    toast.success('Scene activated')
  } catch {
    toast.error('Failed to activate')
  }
}

function targetSummary(scene: import('@/types/scene').Scene) {
  const parts: string[] = []
  if (scene.local_channels?.channels?.length) {
    const on = scene.local_channels.channels.filter((c) => c.on).length
    parts.push(`Local: ${on}/${scene.local_channels.channels.length} on`)
  }
  if (scene.targets.length) {
    parts.push(`${scene.targets.length} node${scene.targets.length > 1 ? 's' : ''}`)
  }
  return parts.join(' · ') || 'No targets'
}

function channelChipLabel(ch: SceneChannelSnapshot): string {
  return ch.on ? `Ch${ch.index} ON ${ch.level}%` : `Ch${ch.index} OFF`
}
</script>

<template>
  <div class="px-4 py-4 space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-sm font-semibold text-zinc-100">Scenes</h2>
        <p class="text-xs text-zinc-500">Automate your devices</p>
      </div>
      <button
        @click="openCreate"
        class="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        + New
      </button>
    </div>

    <!-- Loading -->
    <div v-if="scenes.loading" class="flex justify-center py-12">
      <div
        class="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin"
      />
    </div>

    <!-- Empty -->
    <div v-else-if="scenes.scenes.length === 0" class="text-center py-16 space-y-3">
      <div class="text-4xl">🎬</div>
      <div class="text-zinc-400 text-sm">No scenes yet</div>
      <div class="text-zinc-500 text-xs">Create a scene to control multiple channels at once</div>
    </div>

    <!-- Scene list -->
    <div v-else class="space-y-3">
      <div
        v-for="scene in scenes.scenes"
        :key="scene.id"
        class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3"
      >
        <div class="flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-zinc-100">{{ scene.name }}</div>
            <div class="text-xs text-zinc-500 mt-0.5">{{ targetSummary(scene) }}</div>
          </div>
          <button
            @click="deleteId = scene.id"
            class="text-zinc-600 hover:text-red-400 text-lg leading-none transition-colors"
          >
            🗑
          </button>
        </div>

        <!-- Local channels preview -->
        <div v-if="scene.local_channels?.channels?.length" class="space-y-1">
          <div class="text-[10px] text-zinc-600 uppercase tracking-wider">This Device</div>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="ch in scene.local_channels.channels"
              :key="'l' + ch.index"
              class="text-[10px] px-2 py-0.5 rounded-lg"
              :class="ch.on ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-500'"
            >
              {{ channelChipLabel(ch) }}
            </span>
          </div>
        </div>

        <!-- Remote targets preview -->
        <div v-if="scene.targets.length" class="space-y-1">
          <div class="text-[10px] text-zinc-600 uppercase tracking-wider">Mesh Nodes</div>
          <div v-for="t in scene.targets.slice(0, 3)" :key="t.addr" class="flex flex-wrap gap-1.5 items-center">
            <span class="text-[10px] text-zinc-500 font-mono">{{ t.addr.slice(-4) }}</span>
            <span
              v-for="ch in (t.channels || [])"
              :key="ch.index"
              class="text-[10px] px-1.5 py-0.5 rounded-lg"
              :class="ch.on ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-500'"
            >
              {{ channelChipLabel(ch) }}
            </span>
          </div>
          <div v-if="scene.targets.length > 3" class="text-[10px] text-zinc-500">
            +{{ scene.targets.length - 3 }} more nodes
          </div>
        </div>

        <button
          @click="activate(scene.id)"
          :disabled="scenes.activating === scene.id"
          class="w-full py-2.5 bg-green-500/20 hover:bg-green-500/30 disabled:opacity-50 text-green-400 text-sm font-semibold rounded-xl transition-colors"
        >
          <span v-if="scenes.activating === scene.id">Activating...</span>
          <span v-else>▶ Activate</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Create modal -->
  <Teleport to="body">
    <Transition name="drawer">
      <div
        v-if="showCreate"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      >
        <div
          class="w-full max-w-[480px] rounded-t-3xl bg-zinc-900 border border-zinc-800 p-6 space-y-5 max-h-[85vh] overflow-y-auto"
        >
          <div class="flex items-center justify-between">
            <h2 class="text-base font-bold text-zinc-100">New Scene</h2>
            <button @click="showCreate = false" class="text-zinc-500 hover:text-zinc-300 text-xl">
              ✕
            </button>
          </div>

          <div>
            <label class="text-xs text-zinc-500 font-medium">Scene Name</label>
            <input
              v-model="newName"
              placeholder="e.g. Movie Night"
              class="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>

          <!-- Local device channels -->
          <div v-if="localChannels.length > 0">
            <div class="text-xs text-zinc-500 font-medium mb-2">This Device</div>
            <div class="space-y-2">
              <div
                v-for="ch in localChannels"
                :key="'lc' + ch.index"
                class="bg-zinc-800 rounded-xl p-3 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <span class="text-sm text-zinc-200">{{ ch.name || `Ch${ch.index}` }}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-zinc-500">{{ ch.on ? 'ON' : 'OFF' }}</span>
                    <button
                      @click="ch.on = !ch.on"
                      :class="ch.on ? 'bg-green-500' : 'bg-zinc-600'"
                      class="w-10 h-6 rounded-full transition-colors relative"
                    >
                      <span
                        :class="ch.on ? 'translate-x-4' : 'translate-x-0.5'"
                        class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform block"
                      />
                    </button>
                  </div>
                </div>
                <div v-if="ch.on" class="flex items-center gap-2">
                  <span class="text-xs text-zinc-500 w-12">{{ ch.level }}%</span>
                  <input
                    type="range"
                    v-model.number="ch.level"
                    min="0"
                    max="100"
                    class="flex-1"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Mesh node targets -->
          <div v-if="targets.length > 0">
            <div class="text-xs text-zinc-500 font-medium mb-2">Mesh Nodes</div>
            <div class="space-y-3">
              <div
                v-for="t in targets"
                :key="t.addr"
                class="bg-zinc-800 rounded-xl p-3 space-y-2"
              >
                <div class="text-sm text-zinc-200 font-medium">
                  {{ t.nodeName }}
                  <span class="text-xs text-zinc-500 font-mono ml-1">{{ t.addr.slice(-4) }}</span>
                </div>
                <div
                  v-for="ch in t.channels"
                  :key="ch.index"
                  class="bg-zinc-700/50 rounded-lg p-2 space-y-1.5"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-zinc-300">{{ ch.name || `Ch${ch.index}` }}</span>
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] text-zinc-500">{{ ch.on ? 'ON' : 'OFF' }}</span>
                      <button
                        @click="ch.on = !ch.on"
                        :class="ch.on ? 'bg-green-500' : 'bg-zinc-600'"
                        class="w-8 h-5 rounded-full transition-colors relative"
                      >
                        <span
                          :class="ch.on ? 'translate-x-3' : 'translate-x-0.5'"
                          class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform block"
                        />
                      </button>
                    </div>
                  </div>
                  <div v-if="ch.on" class="flex items-center gap-2">
                    <span class="text-[10px] text-zinc-500 w-10">{{ ch.level }}%</span>
                    <input
                      type="range"
                      v-model.number="ch.level"
                      min="0"
                      max="100"
                      class="flex-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            v-else-if="localChannels.length === 0"
            class="text-xs text-zinc-500 italic"
          >
            No channels to configure
          </div>

          <button
            @click="submitCreate"
            class="w-full py-3 bg-green-500 hover:bg-green-600 text-white text-sm font-bold rounded-xl transition-colors"
          >
            Create Scene
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>

  <ConfirmDialog
    v-if="deleteId !== null"
    title="Delete Scene"
    :message="`Delete scene '${scenes.scenes.find((s) => s.id === deleteId)?.name}'?`"
    confirm-label="Delete"
    :danger="true"
    @confirm="confirmDelete"
    @cancel="deleteId = null"
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
