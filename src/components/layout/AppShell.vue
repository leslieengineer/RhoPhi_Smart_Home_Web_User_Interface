<script setup lang="ts">
import { useWsStore } from '@/stores/ws'

const ws = useWsStore()

const navItems = [
  { to: '/', icon: '🏠', label: 'Dashboard' },
  { to: '/mesh', icon: '🔗', label: 'Mesh' },
  { to: '/scenes', icon: '🎬', label: 'Scenes' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
  { to: '/diagnostics', icon: '🔍', label: 'Diag' },
]
</script>

<template>
  <header
    class="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-zinc-950/95 backdrop-blur border-b border-zinc-800"
  >
    <div class="flex items-center gap-2">
      <span class="text-lg font-bold text-white tracking-tight">🏠 RhoPhi</span>
    </div>
    <div class="flex items-center gap-2">
      <span
        :class="ws.connected ? 'bg-green-500' : 'bg-red-500'"
        class="inline-block w-2 h-2 rounded-full"
        :title="ws.connected ? 'Connected' : 'Disconnected'"
      />
      <span class="text-xs text-zinc-400">{{ ws.connected ? 'Live' : 'Offline' }}</span>
    </div>
  </header>

  <!-- Main content slot -->
  <main class="pb-20">
    <slot />
  </main>

  <!-- Bottom Navigation -->
  <nav
    class="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-zinc-950/95 backdrop-blur border-t border-zinc-800 z-40"
  >
    <div class="flex">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors"
        :class="$route.path === item.to ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-300'"
      >
        <span class="text-xl leading-tight">{{ item.icon }}</span>
        <span class="text-[10px] font-medium">{{ item.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
