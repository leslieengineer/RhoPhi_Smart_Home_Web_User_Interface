import type { FirmwareEvent, ClientEvent } from '@/types/ws'

type MessageHandler = (event: FirmwareEvent) => void
type StatusHandler = (connected: boolean) => void

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws`
const RECONNECT_DELAY_MS = 3000

class WebSocketService {
  private ws: WebSocket | null = null
  private handlers: MessageHandler[] = []
  private statusHandlers: StatusHandler[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true

  connect() {
    this.shouldReconnect = true
    this.openConnection()
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  send(event: ClientEvent) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event))
    }
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler)
    }
  }

  onStatus(handler: StatusHandler) {
    this.statusHandlers.push(handler)
    return () => {
      this.statusHandlers = this.statusHandlers.filter((h) => h !== handler)
    }
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private openConnection() {
    try {
      this.ws = new WebSocket(WS_URL)
      this.ws.onopen = () => this.statusHandlers.forEach((h) => h(true))
      this.ws.onclose = () => {
        this.statusHandlers.forEach((h) => h(false))
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => this.openConnection(), RECONNECT_DELAY_MS)
        }
      }
      this.ws.onerror = () => this.ws?.close()
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as FirmwareEvent
          this.handlers.forEach((h) => h(msg))
        } catch {
          /* ignore malformed */
        }
      }
    } catch {
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.openConnection(), RECONNECT_DELAY_MS)
      }
    }
  }
}

export const wsService = new WebSocketService()
