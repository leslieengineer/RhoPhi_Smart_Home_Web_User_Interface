<script setup lang="ts">
defineProps<{
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div class="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 space-y-4">
        <h3 class="text-base font-semibold text-zinc-100">{{ title }}</h3>
        <p class="text-sm text-zinc-400">{{ message }}</p>
        <div class="flex gap-3">
          <button
            @click="emit('cancel')"
            class="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-700 transition-colors"
          >
            Huỷ
          </button>
          <button
            @click="emit('confirm')"
            :class="danger ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'"
            class="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors"
          >
            {{ confirmLabel ?? 'Xác nhận' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
