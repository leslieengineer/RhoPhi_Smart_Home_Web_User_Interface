export interface WifiNetwork {
  ssid: string
  rssi: number
  secure: boolean
  channel: number
}

export interface WifiStatus {
  connected: boolean
  ssid: string | null
  ip: string | null
  rssi: number | null
  channel: number | null
  gateway: string | null
}
