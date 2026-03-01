import { defineStore } from 'pinia'
import { ref } from 'vue'
import { wsService } from '@/services/websocket'
import { useDeviceStore } from './device'
import { useMeshStore } from './mesh'
import { useSystemStore } from './system'
import type { NodeChannel } from '@/types/mesh'

export const useWsStore = defineStore('ws', () => {
  const connected = ref(false)
  const subscribeLog = ref(false)

  function init() {
    wsService.onStatus((c) => {
      connected.value = c
    })

    wsService.onMessage((msg) => {
      const device = useDeviceStore()
      const mesh = useMeshStore()
      const system = useSystemStore()

      switch (msg.type) {
        case 'STATE_UPDATE':
          device.applyServerUpdate(msg.payload)
          break
        case 'NODE_UPDATE':
          mesh.updateNode(msg.payload)
          break
        case 'CHANNEL_UPDATE':
          if (msg.payload.source === 'local') {
            device.updateChannel(msg.payload.channel)
          } else if (msg.payload.source === 'mesh' && msg.payload.addr) {
            mesh.updateNodeChannel(msg.payload.addr, msg.payload.channel as NodeChannel)
          }
          break
        case 'NODE_OFFLINE':
          mesh.markOffline(msg.payload.addr, msg.payload.last_seen_ms)
          break
        case 'WIFI_STATUS':
          system.wifi = msg.payload
          break
        case 'LOG':
          system.pushLog(msg.payload)
          break
        case 'TASK_STATS':
          system.tasks = msg.payload.tasks
          break
        case 'HEAP_STATS':
          if (system.heap) Object.assign(system.heap, msg.payload)
          break
        case 'WIFI_CONNECT_RESULT':
          system.wifiConnecting = false
          break
      }
    })

    wsService.connect()
  }

  function enableLogStream(enabled: boolean) {
    subscribeLog.value = enabled
    wsService.send({ type: 'SUBSCRIBE_LOG', enabled })
  }

  function enableTaskStream(enabled: boolean) {
    wsService.send({ type: 'SUBSCRIBE_TASKS', enabled })
  }

  return { connected, subscribeLog, init, enableLogStream, enableTaskStream }
})
