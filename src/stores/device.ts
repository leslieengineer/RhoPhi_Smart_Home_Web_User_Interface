import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/services/api'
import type { Channel, DeviceState } from '@/types/device'
import { normalizeDeviceState } from '@/types/device'

export const useDeviceStore = defineStore('device', () => {
  const state = ref<DeviceState>({
    product: 'SW-1CH-N',
    channel_count: 1,
    channels: [{ index: 0, name: 'Relay', type: 'onoff', on: false, level: 0 }],
    scene_id: 0,
    device_name: '',
  })
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchState() {
    try {
      loading.value = true
      const raw = await api.getDeviceState()
      state.value = normalizeDeviceState(raw as unknown as Record<string, unknown>)
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function setChannelState(ch: number, on: boolean) {
    const channel = state.value.channels.find((c) => c.index === ch)
    if (!channel) return
    const prev = channel.on
    channel.on = on // optimistic
    try {
      await api.setChannelState(ch, on)
    } catch {
      channel.on = prev // rollback
    }
  }

  async function setChannelLevel(ch: number, level: number) {
    const channel = state.value.channels.find((c) => c.index === ch)
    if (!channel) return
    const prev = channel.level
    channel.level = level // optimistic
    try {
      await api.setChannelLevel(ch, level)
    } catch {
      channel.level = prev // rollback
    }
  }

  // Legacy compat
  async function setRelay(on: boolean) {
    return setChannelState(0, on)
  }
  async function setBrightness(level: number) {
    return setChannelLevel(0, level)
  }

  function applyServerUpdate(update: DeviceState) {
    state.value = normalizeDeviceState(update as unknown as Record<string, unknown>)
  }

  function updateChannel(channel: Channel) {
    const idx = state.value.channels.findIndex((c) => c.index === channel.index)
    if (idx >= 0) {
      state.value.channels[idx] = channel
    }
  }

  return {
    state,
    loading,
    error,
    fetchState,
    setChannelState,
    setChannelLevel,
    setRelay,
    setBrightness,
    applyServerUpdate,
    updateChannel,
  }
})
