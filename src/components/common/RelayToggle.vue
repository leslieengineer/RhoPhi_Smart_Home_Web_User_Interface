<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ modelValue: boolean; loading?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const toggling = ref(false)

async function toggle() {
  if (toggling.value || props.disabled) return
  toggling.value = true
  emit('update:modelValue', !props.modelValue)
  await new Promise((r) => setTimeout(r, 300))
  toggling.value = false
}
</script>

<template>
  <button
    @click="toggle"
    :disabled="disabled || toggling"
    :class="[
      'relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-200 focus:outline-none',
      modelValue ? 'bg-green-400' : 'bg-zinc-700',
      disabled || toggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    ]"
    role="switch"
    :aria-checked="modelValue"
  >
    <span
      :class="[
        'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200',
        modelValue ? 'translate-x-8' : 'translate-x-1',
      ]"
    />
    <span class="sr-only">{{ modelValue ? 'ON' : 'OFF' }}</span>
  </button>
</template>
