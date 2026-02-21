import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/services/api'
import type { DeviceState } from '@/types/device'

export const useDeviceStore = defineStore('device', () => {
  const state = ref<DeviceState>({ relay_on: false, brightness: 100, scene_id: 0, device_name: '' })
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchState() {
    try {
      loading.value = true
      state.value = await api.getDeviceState()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function setRelay(on: boolean) {
    const prev = state.value.relay_on
    state.value.relay_on = on // optimistic
    try {
      await api.setRelay(on)
    } catch {
      state.value.relay_on = prev // rollback
    }
  }

  async function setBrightness(level: number) {
    const prev = state.value.brightness
    state.value.brightness = level
    try {
      await api.setBrightness(level)
    } catch {
      state.value.brightness = prev
    }
  }

  function applyServerUpdate(update: Partial<DeviceState>) {
    Object.assign(state.value, update)
  }

  return { state, loading, error, fetchState, setRelay, setBrightness, applyServerUpdate }
})
