import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/services/api'
import type { Scene, SceneTarget, SceneLocalSnapshot } from '@/types/scene'

export const useScenesStore = defineStore('scenes', () => {
  const scenes = ref<Scene[]>([])
  const loading = ref(false)
  const activating = ref<number | null>(null)

  async function fetchScenes() {
    try {
      loading.value = true
      const res = await api.getScenes()
      scenes.value = res.scenes
    } finally {
      loading.value = false
    }
  }

  async function createScene(
    name: string,
    targets: SceneTarget[] = [],
    local_channels?: SceneLocalSnapshot,
  ) {
    const scene = await api.createScene(name, targets, local_channels)
    scenes.value.push(scene)
    return scene
  }

  async function activateScene(id: number) {
    activating.value = id
    try {
      await api.activateScene(id)
    } finally {
      activating.value = null
    }
  }

  async function deleteScene(id: number) {
    await api.deleteScene(id)
    scenes.value = scenes.value.filter((s) => s.id !== id)
  }

  return { scenes, loading, activating, fetchScenes, createScene, activateScene, deleteScene }
})
