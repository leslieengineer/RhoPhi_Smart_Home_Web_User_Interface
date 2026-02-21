<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ modelValue: number; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const local = ref(props.modelValue)
let debounce: ReturnType<typeof setTimeout>

watch(
  () => props.modelValue,
  (v) => {
    local.value = v
  },
)

function onInput(e: Event) {
  local.value = Number((e.target as HTMLInputElement).value)
  clearTimeout(debounce)
  debounce = setTimeout(() => emit('update:modelValue', local.value), 400)
}
</script>

<template>
  <div class="flex items-center gap-3">
    <input
      type="range"
      min="0"
      max="100"
      :value="local"
      @input="onInput"
      :disabled="disabled"
      class="flex-1"
      :class="disabled ? 'opacity-40 cursor-not-allowed' : ''"
    />
    <span class="text-sm text-zinc-300 w-10 text-right tabular-nums">{{ local }}%</span>
  </div>
</template>
