<script setup lang="ts">
defineProps<{ connected: boolean }>()
</script>

<template>
  <div class="flex items-center gap-1.5">
    <span
      :class="connected ? 'bg-green-400' : 'bg-red-400'"
      class="inline-block w-2 h-2 rounded-full"
    />
    <span :class="connected ? 'text-green-400' : 'text-red-400'" class="text-xs font-medium">
      {{ connected ? 'Online' : 'Offline' }}
    </span>
  </div>
</template>
