export type ChannelType = 'onoff' | 'dimmer'

export interface Channel {
  index: number
  name: string
  type: ChannelType
  on: boolean
  level: number // 0–100, meaningful for dimmer only
}

export interface DeviceState {
  product: string // Product code, e.g. "SW-2CH-D"
  channel_count: number // 1–6
  channels: Channel[] // Per-channel state
  scene_id: number // Active scene, 0 = none
  device_name: string
  // Legacy compat (maps to channels[0]):
  relay_on?: boolean
  brightness?: number
}

/**
 * Normalize a legacy flat DeviceState (relay_on, brightness)
 * into the multi-channel format if channels[] is missing.
 */
export function normalizeDeviceState(raw: Record<string, unknown>): DeviceState {
  const state = raw as unknown as DeviceState
  if (!state.channels || state.channels.length === 0) {
    state.product = state.product || 'SW-1CH-N'
    state.channel_count = 1
    state.channels = [
      {
        index: 0,
        name: 'Relay',
        type: 'onoff',
        on: state.relay_on ?? false,
        level: state.brightness ?? (state.relay_on ? 100 : 0),
      },
    ]
  }
  return state
}
