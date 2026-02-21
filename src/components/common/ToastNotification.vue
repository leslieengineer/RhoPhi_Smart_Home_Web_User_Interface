<script setup lang="ts">
import { toasts } from '@/composables/useToast'
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-80 max-w-[90vw]">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          :class="{
            'bg-green-500/90': t.type === 'success',
            'bg-red-500/90': t.type === 'error',
            'bg-zinc-700/90': t.type === 'info',
          }"
          class="px-4 py-3 rounded-xl backdrop-blur text-white text-sm font-medium shadow-lg"
        >
          {{ t.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
