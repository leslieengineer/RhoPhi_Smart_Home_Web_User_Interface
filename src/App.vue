<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import ToastNotification from '@/components/common/ToastNotification.vue'
import { useWsStore } from '@/stores/ws'

const ws = useWsStore()
onMounted(() => ws.init())
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
  <ToastNotification />
</template>
