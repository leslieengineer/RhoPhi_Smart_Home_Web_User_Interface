<script setup lang="ts">
import type { Channel } from '@/types/device'
import type { NodeChannel } from '@/types/mesh'
import RelayToggle from './RelayToggle.vue'
import BrightnessSlider from './BrightnessSlider.vue'

const props = defineProps<{
  channel: Channel | NodeChannel
  loading?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  toggle: [chIndex: number, on: boolean]
  level: [chIndex: number, value: number]
}>()

function onToggle(on: boolean) {
  emit('toggle', props.channel.index, on)
}

function onLevel(value: number) {
  emit('level', props.channel.index, value)
}
</script>

<template>
  <div
    class="rounded-xl bg-zinc-800/50 border border-zinc-700/50 p-3 space-y-2"
    :class="disabled ? 'opacity-50' : ''"
  >
    <!-- Channel header + toggle -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-zinc-200 truncate">
          {{ channel.name || `Ch${channel.index}` }}
        </div>
        <div class="text-[10px] text-zinc-500 uppercase tracking-wider">
          {{ channel.type === 'dimmer' ? 'Dimmer' : 'Switch' }}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span
          :class="channel.on ? 'text-green-400' : 'text-zinc-500'"
          class="text-xs font-medium"
        >
          {{ channel.on ? 'ON' : 'OFF' }}
        </span>
        <RelayToggle
          :model-value="channel.on"
          :loading="loading"
          :disabled="disabled"
          @update:model-value="onToggle"
        />
      </div>
    </div>

    <!-- Brightness slider (dimmer only) -->
    <div v-if="channel.type === 'dimmer'" class="pt-1">
      <BrightnessSlider
        :model-value="channel.level"
        :disabled="disabled || !channel.on"
        @update:model-value="onLevel"
      />
    </div>
  </div>
</template>
