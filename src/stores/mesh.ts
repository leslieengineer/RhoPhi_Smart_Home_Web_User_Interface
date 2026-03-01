import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/services/api'
import type { MeshNode, MeshNetwork, NodeChannel } from '@/types/mesh'
import { normalizeMeshNode } from '@/types/mesh'

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
      data.nodes.forEach((n) => nodes.value.set(n.addr, normalizeMeshNode(n)))
    } finally {
      loading.value = false
    }
  }

  async function toggleNodeChannel(addr: string, ch: number, state: boolean) {
    const node = nodes.value.get(addr)
    if (!node) return
    const channel = node.channels.find((c) => c.index === ch)
    if (!channel) return
    const prev = channel.on
    channel.on = state // optimistic
    try {
      await api.setNodeChannelState(addr, ch, state)
    } catch {
      channel.on = prev // rollback
    }
  }

  async function setNodeChannelLevel(addr: string, ch: number, level: number) {
    const node = nodes.value.get(addr)
    if (!node) return
    const channel = node.channels.find((c) => c.index === ch)
    if (!channel) return
    const prev = channel.level
    channel.level = level // optimistic
    try {
      await api.setNodeChannelLevel(addr, ch, level)
    } catch {
      channel.level = prev // rollback
    }
  }

  // Legacy compat
  async function toggleNode(addr: string, state: boolean) {
    return toggleNodeChannel(addr, 0, state)
  }
  async function setNodeBrightness(addr: string, level: number) {
    return setNodeChannelLevel(addr, 0, level)
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

  function updateNode(partial: MeshNode) {
    const normalized = normalizeMeshNode(partial)
    const existing = nodes.value.get(normalized.addr)
    nodes.value.set(normalized.addr, { ...existing, ...normalized })
  }

  function updateNodeChannel(addr: string, channel: NodeChannel) {
    const node = nodes.value.get(addr)
    if (!node) return
    const idx = node.channels.findIndex((c) => c.index === channel.index)
    if (idx >= 0) {
      node.channels[idx] = channel
    }
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
    toggleNodeChannel,
    setNodeChannelLevel,
    toggleNode,
    setNodeBrightness,
    renameNode,
    removeNode,
    updateNode,
    updateNodeChannel,
    markOffline,
  }
})
