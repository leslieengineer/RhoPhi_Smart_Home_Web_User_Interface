import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/services/api'
import type { MeshNode, MeshNetwork } from '@/types/mesh'

export const useMeshStore = defineStore('mesh', () => {
  const nodes = ref<Map<string, MeshNode>>(new Map())
  const selfAddr = ref('')
  const loading = ref(false)

  const nodesArray = computed(() => [...nodes.value.values()])
  const onlineCount = computed(() => nodesArray.value.filter((n) => n.status === 'online').length)
  const nodeCount = computed(() => nodes.value.size)

  async function fetchNodes() {
    try {
      loading.value = true
      const data: MeshNetwork = await api.getMeshNodes()
      selfAddr.value = data.self_addr
      nodes.value.clear()
      data.nodes.forEach((n) => nodes.value.set(n.addr, n))
    } finally {
      loading.value = false
    }
  }

  async function toggleNode(addr: string, state: boolean) {
    const node = nodes.value.get(addr)
    if (!node) return
    const prev = node.relay_on
    node.relay_on = state // optimistic
    try {
      await api.setNodeRelay(addr, state)
    } catch {
      node.relay_on = prev
    }
  }

  async function setNodeBrightness(addr: string, level: number) {
    const node = nodes.value.get(addr)
    if (!node) return
    node.brightness = level
    try {
      await api.setNodeBrightness(addr, level)
    } catch {
      /* ignore */
    }
  }

  async function renameNode(addr: string, name: string) {
    await api.renameNode(addr, name)
    const node = nodes.value.get(addr)
    if (node) node.name = name
  }

  async function removeNode(addr: string) {
    await api.removeNode(addr)
    nodes.value.delete(addr)
  }

  function updateNode(partial: Partial<MeshNode> & { addr: string }) {
    const existing = nodes.value.get(partial.addr)
    nodes.value.set(partial.addr, { ...existing, ...partial } as MeshNode)
  }

  function markOffline(addr: string, last_seen_ms: number) {
    const node = nodes.value.get(addr)
    if (node) {
      node.status = 'offline'
      node.last_seen_ms = last_seen_ms
    }
  }

  return {
    nodes,
    selfAddr,
    loading,
    nodesArray,
    onlineCount,
    nodeCount,
    fetchNodes,
    toggleNode,
    setNodeBrightness,
    renameNode,
    removeNode,
    updateNode,
    markOffline,
  }
})
