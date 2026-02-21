export interface SceneTarget {
  addr: string
  relay_on: boolean
  brightness: number
}

export interface Scene {
  id: number
  name: string
  targets: SceneTarget[]
  created_at: number
}
