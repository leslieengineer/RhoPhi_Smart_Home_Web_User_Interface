# WebUI Implementation Guide — RhoPhi Smart Home

---

| Field        | Value                                        |
| ------------ | -------------------------------------------- |
| Document ID  | WEBUI-IMPL-001                               |
| Version      | 1.5.0                                        |
| Status       | Active                                       |
| Last Updated | 2026-02-28                                   |
| Relates to   | WEBUI-ARCH-001, WEBUI-DATA-001               |
| WebUI Repo   | `/home/leslie/WS/rhophismarthomeWebUI`       |
| FW Repo      | `/home/leslie/WS/RhoPhi_Smart_Home_ESP32_FW` |

---

## Table of Contents

1. [Tổng quan — Những gì đã được xây dựng](#1-tổng-quan)
2. [Cấu trúc thư mục hoàn chỉnh](#2-cấu-trúc-thư-mục-hoàn-chỉnh)
3. [Layer Types — TypeScript Data Models](#3-layer-types--typescript-data-models)
4. [Layer Services — API & WebSocket](#4-layer-services--api--websocket)
5. [Layer Stores — Pinia State Management](#5-layer-stores--pinia-state-management)
6. [Layer Components — UI Building Blocks](#6-layer-components--ui-building-blocks)
7. [Layer Views — Các màn hình](#7-layer-views--các-màn-hình)
8. [Router & App Entry Point](#8-router--app-entry-point)
9. [Tailwind CSS Configuration](#9-tailwind-css-configuration)
10. [Build Process & Nhúng vào ESP32](#10-build-process--nhúng-vào-esp32)
11. [Firmware Webserver Implementation](#11-firmware-webserver-implementation)
12. [Luồng dữ liệu end-to-end](#12-luồng-dữ-liệu-end-to-end)
13. [Phát triển & Debug](#13-phát-triển--debug)
14. [Kiểm thử Webserver sau khi Flash](#14-kiểm-thử-webserver-sau-khi-flash)

---

## 1. Tổng quan

### Tech Stack

| Thành phần | Thư viện / Công cụ                    | Phiên bản |
| ---------- | ------------------------------------- | --------- |
| Framework  | Vue 3 (Composition API)               | 3.5+      |
| Language   | TypeScript                            | 5.x       |
| Build tool | Vite                                  | 7.x       |
| Styling    | Tailwind CSS v4 (`@tailwindcss/vite`) | 4.x       |
| State      | Pinia                                 | 3.x       |
| Routing    | Vue Router                            | 4.x       |
| Deployment | ESP32 LittleFS/SPIFFS partition       | —         |

### Design System

- **Background**: `#0f0f0f` (near-black)
- **Surface**: `zinc-900` với border `zinc-800`
- **Primary accent**: `green-400` / `green-500`
- **Text**: `zinc-100` → `zinc-400` → `zinc-600` (hierarchy)
- **Layout**: mobile-first, `max-width: 480px`, centered
- **Navigation**: sticky header + fixed bottom tab bar (5 tabs)
- **Border radius**: `rounded-2xl` (16px) cho cards, `rounded-xl` (12px) cho inputs

### 5 màn hình

| Route          | View                  | Mô tả                                                           |
| -------------- | --------------------- | --------------------------------------------------------------- |
| `/`            | `DashboardView.vue`   | WiFi status, điều khiển relay/dim "device này", quick mesh list |
| `/mesh`        | `MeshView.vue`        | Danh sách BLE Mesh nodes, filter, search, detail drawer         |
| `/scenes`      | `ScenesView.vue`      | Quản lý scenes, create modal, activate/delete                   |
| `/settings`    | `SettingsView.vue`    | Device name, WiFi scanner, chip info                            |
| `/diagnostics` | `DiagnosticsView.vue` | Heap bar, FreeRTOS tasks, live log stream, NVS table            |

---

## 2. Cấu trúc thư mục hoàn chỉnh

```
rhophismarthomeWebUI/
├── src/
│   ├── types/                    ← TypeScript interfaces (mirror firmware C++ structs)
│   │   ├── system.ts             ← SystemInfo, HeapInfo, TaskInfo, LogEntry, NvsEntry
│   │   ├── device.ts             ← DeviceState
│   │   ├── mesh.ts               ← MeshNode, MeshNetwork, NodeModelType, NodeOnlineStatus
│   │   ├── scene.ts              ← Scene, SceneTarget
│   │   ├── wifi.ts               ← WifiNetwork, WifiStatus
│   │   └── ws.ts                 ← FirmwareEvent (union), ClientEvent (union)
│   │
│   ├── services/                 ← Giao tiếp với firmware
│   │   ├── api.ts                ← Toàn bộ REST endpoints (fetch wrapper)
│   │   └── websocket.ts          ← WebSocketService: connect, reconnect, pub/sub
│   │
│   ├── composables/
│   │   └── useToast.ts           ← Singleton toast state + useToast() composable
│   │
│   ├── stores/                   ← Pinia state management
│   │   ├── device.ts             ← useDeviceStore: relay, brightness (optimistic update)
│   │   ├── mesh.ts               ← useMeshStore: Map<addr, MeshNode>, CRUD + toggle
│   │   ├── system.ts             ← useSystemStore: info, heap, wifi, tasks, logs, nvs
│   │   ├── scenes.ts             ← useScenesStore: scenes[], CRUD + activate
│   │   └── ws.ts                 ← useWsStore: WS dispatcher → tất cả stores
│   │
│   ├── components/
│   │   ├── common/               ← Shared reusable UI
│   │   │   ├── StatusBadge.vue       ← Green/red dot + text
│   │   │   ├── ChannelCard.vue       ← ★ NEW v1.5.0: adaptive per-channel control card
│   │   │   ├── RelayToggle.vue       ← Animated ON/OFF toggle switch
│   │   │   ├── BrightnessSlider.vue  ← Range 0–100 với debounce 400ms
│   │   │   ├── LoadingSpinner.vue    ← SVG spinner (sm / md)
│   │   │   ├── ConfirmDialog.vue     ← Teleport modal với danger prop
│   │   │   └── ToastNotification.vue ← Teleport toast list (dùng useToast)
│   │   └── layout/
│   │       └── AppShell.vue          ← Header + slot + bottom nav
│   │
│   ├── views/                    ← 5 màn hình chính
│   │   ├── DashboardView.vue
│   │   ├── MeshView.vue
│   │   ├── ScenesView.vue
│   │   ├── SettingsView.vue
│   │   └── DiagnosticsView.vue
│   │
│   ├── router/
│   │   └── index.ts              ← 5 routes, lazy-loaded (trừ Dashboard)
│   │
│   ├── assets/
│   │   └── main.css              ← @import "tailwindcss" + dark theme globals
│   │
│   ├── App.vue                   ← Entry: AppShell > RouterView + ToastNotification
│   └── main.ts                   ← createApp + pinia + router mount
│
├── docsWeb/
│   ├── WebUI_Architecture.md     ← WEBUI-ARCH-001 (kiến trúc tổng thể)
│   ├── WebUI_Backend_Data.md     ← WEBUI-DATA-001 (data models, API mapping)
│   └── WebUI_Implementation.md   ← WEBUI-IMPL-001 (tài liệu này)
│
├── dist/                         ← Output build (nhúng vào ESP32)
│   ├── index.html
│   └── assets/
│       ├── index-[hash].js       ← ~121 kB (gzip: ~47 kB)
│       └── index-[hash].css      ← ~27 kB  (gzip: ~6 kB)
│
├── vite.config.ts
├── tsconfig.app.json
└── package.json
```

---

## 3. Layer Types — TypeScript Data Models

File location: `src/types/`

Tất cả interfaces TypeScript **mirror 1-1 với C++ structs** của firmware. Khi firmware thay đổi JSON output, chỉ cần cập nhật ở đây.

### `system.ts`

```typescript
interface SystemInfo {
  version: string // Firmware version string
  build_date: string // Build date
  idf_version: string // ESP-IDF version
  chip_model: string // "ESP32", "ESP32-S3"…
  chip_revision: number
  mac: string // MAC address (AA:BB:CC:DD:EE:FF)
  device_id: string
  device_name: string // NVS: namespace "system", key "device_name"
  uptime_s: number // esp_timer_get_time() / 1e6
  boot_count: number // NVS: "system"/"boot_count"
  reset_reason: string // esp_reset_reason() string
  cpu_freq_mhz: number
}

interface HeapInfo {
  free_heap: number // esp_get_free_heap_size()
  min_free_heap: number // esp_get_minimum_free_heap_size()
  largest_free_block: number // heap_caps_get_largest_free_block()
  total_heap: number
  uptime_s: number
}

interface TaskInfo {
  name: string
  priority: number
  stack_hwm: number // uxTaskGetStackHighWaterMark() in words
  stack_hwm_bytes: number // × 4
  state: 'RUN' | 'RDY' | 'BLK' | 'SUS' | 'DEL'
}

interface LogEntry {
  id: number // auto-increment (frontend only)
  level: string // "ERROR" | "WARN" | "INFO" | "DEBUG" | "VERBOSE"
  tag: string // ESP_LOG tag
  msg: string
  ts: number // firmware timestamp (ms)
  ts_label: string // formatted "HH:MM:SS.mmm"
}

interface NvsEntry {
  namespace: string
  key: string
  type: string // "str" | "u8" | "u32" | "blob"
  value: string // serialized
  size: number
}
```

### `device.ts`

```typescript
// v1.5.0 — Multi-channel device model
type ChannelType = 'onoff' | 'dimmer'

interface Channel {
  index: number       // 0-based channel index
  name: string        // User-defined name (e.g. "Đèn chính")
  type: ChannelType   // Determines UI: toggle-only vs toggle+slider
  on: boolean         // Current state
  level: number       // 0–100, meaningful for dimmer only
}

interface DeviceState {
  product: string        // Product code, e.g. "SW-2CH-D"
  channel_count: number  // 1–6
  channels: Channel[]    // Per-channel state
  scene_id: number       // Active scene, 0 = none
  device_name: string
}
```

### `mesh.ts`

```typescript
type NodeOnlineStatus = 'online' | 'offline' | 'provisioning'

// v1.5.0 — Per-channel state on remote mesh node (same shape as local Channel)
interface NodeChannel {
  index: number
  name: string
  type: ChannelType   // re-use from device.ts
  on: boolean
  level: number       // 0–100
}

interface MeshNode {
  addr: string              // BLE Mesh unicast address (hex string "0x0002")
  uuid: string
  name: string              // NVS persisted, editable via UI
  product_id: string        // e.g. "SW-3CH-N" (discovered via Composition Data)
  channel_count: number     // 1–6
  channels: NodeChannel[]   // Per-channel state
  status: NodeOnlineStatus
  rssi: number | null       // dBm
  last_seen_ms: number      // timestamp of last heartbeat
}

interface MeshNetwork {
  self_addr: string    // This gateway's address
  node_count: number
  online_count: number
  nodes: MeshNode[]
}
```

### `scene.ts`

```typescript
// v1.5.0 — Per-channel snapshot within a scene target
interface SceneChannelSnapshot {
  ch_index: number   // Channel index on the target device
  on: boolean
  level: number      // 0–100
}

interface SceneTarget {
  addr: string       // Target node address ("local" for this device, "0x0010" for mesh)
  channels: SceneChannelSnapshot[]   // Per-channel desired state
}

interface Scene {
  id: number
  name: string
  targets: SceneTarget[]
  created_at: number   // Unix timestamp
}
```

### `ws.ts` — WebSocket event union types

```typescript
// Firmware → Browser (v1.5.0 — added CHANNEL_UPDATE)
type FirmwareEvent =
  | { type: 'STATE_UPDATE'; payload: DeviceState }         // full device state with channels[]
  | { type: 'NODE_UPDATE'; payload: MeshNode }             // full node state with channels[]
  | { type: 'CHANNEL_UPDATE'; payload: {                   // ← NEW: fine-grained single channel
      source: 'local' | 'mesh'
      addr?: string              // mesh node addr (omitted for local)
      channel: Channel           // the updated channel
    }}
  | { type: 'NODE_OFFLINE'; payload: { addr: string; last_seen_ms: number } }
  | { type: 'WIFI_STATUS'; payload: WifiStatus }
  | { type: 'LOG'; payload: Omit<LogEntry, 'id' | 'ts_label'> }
  | { type: 'TASK_STATS'; payload: { tasks: TaskInfo[] } }
  | { type: 'HEAP_STATS'; payload: Partial<HeapInfo> }
  | { type: 'WIFI_CONNECT_RESULT'; payload: { success: boolean; ip?: string } }
  | { type: 'SCENE_ACTIVATED'; payload: { scene_id: number; results: { addr: string; ok: boolean }[] } }
  | { type: 'PONG' }

// Browser → Firmware
type ClientEvent =
  | { type: 'SUBSCRIBE_LOG'; enabled: boolean }
  | { type: 'SUBSCRIBE_TASKS'; enabled: boolean }
  | { type: 'PING' }
```

---

## 4. Layer Services — API & WebSocket

### `src/services/api.ts`

Fetch wrapper chung với typed return:

```typescript
const BASE = import.meta.env.VITE_API_BASE || ''
// Production: BASE = '' → relative path → cùng host ESP32
// Dev:        BASE = 'http://192.168.4.1' trong .env.local

async function request<T>(path: string, options?: RequestInit): Promise<T>
```

**Toàn bộ endpoints:**

| Method | URL                                       | Tác dụng                             |
| ------ | ----------------------------------------- | ------------------------------------ |
| GET    | `/api/system/info`                        | SystemInfo                           |
| GET    | `/api/diagnostics/system`                 | HeapInfo                             |
| GET    | `/api/diagnostics/tasks`                  | `{ tasks: TaskInfo[] }`              |
| GET    | `/api/diagnostics/nvs`                    | `{ entries: NvsEntry[] }`            |
| GET    | `/api/device/state`                       | DeviceState (product, channels[])    |
| POST   | `/api/device/channel/:ch/state`           | `{ on: boolean }` — toggle channel  |
| POST   | `/api/device/channel/:ch/level`           | `{ level: number }` — dimmer level  |
| GET    | `/api/mesh/nodes`                         | MeshNetwork (each node.channels[])   |
| POST   | `/api/mesh/node/:addr/channel/:ch/state`  | `{ on: boolean }` — node channel    |
| POST   | `/api/mesh/node/:addr/channel/:ch/level`  | `{ level: number }` — node dimmer   |
| POST   | `/api/mesh/node/:addr/name`               | `{ name: string }`                   |
| DELETE | `/api/mesh/node/:addr`                    | Remove node                          |
| GET    | `/api/scenes`                             | `{ scenes: Scene[] }` (per-ch snap) |
| POST   | `/api/scenes`                             | `{ name, targets[] }` → Scene       |
| POST   | `/api/scenes/:id/activate`                | Activate scene (per-channel)         |
| DELETE | `/api/scenes/:id`                         | Delete scene                         |
| GET    | `/api/wifi/status`                        | WifiStatus                           |
| GET    | `/api/wifi/scan`                          | `{ networks: WifiNetwork[] }`        |
| POST   | `/api/wifi/connect`                       | `{ ssid, password }`                 |
| POST   | `/api/settings/device`                    | `{ name: string }`                   |

### `src/services/websocket.ts`

```typescript
class WebSocketService {
  connect()                          // Kết nối ws://<host>/ws
  send(event: ClientEvent)           // Gửi JSON lên firmware
  onMessage(handler) → unsubscribe   // Đăng ký nhận FirmwareEvent
  onStatus(handler)  → unsubscribe   // Đăng ký trạng thái connected
}

export const wsService = new WebSocketService()
// Singleton — tự reconnect sau 3s nếu mất kết nối
```

---

## 5. Layer Stores — Pinia State Management

### `useDeviceStore` (`src/stores/device.ts`)

| State     | Type          | Nguồn dữ liệu                              |
| --------- | ------------- | ------------------------------------------- |
| `state`   | `DeviceState` | REST GET `/api/device/state` (channels[])   |
| `loading` | `boolean`     | —                                           |
| `error`   | `string \| null` | —                                        |

**Actions**: `fetchState()`, `setChannelState(ch, on)` _(optimistic — POST channel/:ch/state)_, `setChannelLevel(ch, level)` _(optimistic — POST channel/:ch/level)_, `applyServerUpdate(payload)` _(WS STATE_UPDATE — replaces full state)_, `updateChannel(channel)` _(WS CHANNEL_UPDATE — updates single channel by index)_.

### `useMeshStore` (`src/stores/mesh.ts`)

| State      | Type                    | Nguồn dữ liệu                           |
| ---------- | ----------------------- | ---------------------------------------- |
| `nodes`    | `Map<string, MeshNode>` | REST + WS push (each node has channels[])|
| `selfAddr` | `string`                | REST GET `/api/mesh/nodes`               |
| `loading`  | `boolean`               | —                                        |

**Computed**: `nodesArray`, `onlineCount`, `nodeCount`

**Actions**: `fetchNodes()`, `toggleNodeChannel(addr, ch, state)` _(optimistic — POST node/:addr/channel/:ch/state)_, `setNodeChannelLevel(addr, ch, level)` _(optimistic — POST node/:addr/channel/:ch/level)_, `renameNode()`, `removeNode()`, `updateNode()` _(WS NODE_UPDATE — full node with channels[])_, `updateNodeChannel(addr, channel)` _(WS CHANNEL_UPDATE — single channel)_, `markOffline()` _(WS NODE_OFFLINE)_.

### `useSystemStore` (`src/stores/system.ts`)

| State        | Type         | Nguồn dữ liệu                   |
| ------------ | ------------ | ------------------------------- |
| `info`       | `SystemInfo` | REST GET `/api/system/info`     |
| `heap`       | `HeapInfo`   | REST + WS `HEAP_STATS`          |
| `wifi`       | `WifiStatus` | REST + WS `WIFI_STATUS`         |
| `tasks`      | `TaskInfo[]` | REST + WS `TASK_STATS`          |
| `logs`       | `LogEntry[]` | WS `LOG` (buffer 200 entries)   |
| `nvsEntries` | `NvsEntry[]` | REST GET `/api/diagnostics/nvs` |

**Actions**: `fetchInfo()`, `fetchHeap()`, `fetchWifi()`, `fetchTasks()`, `fetchNvs()`, `pushLog()`, `clearLogs()`.

### `useScenesStore` (`src/stores/scenes.ts`)

| State        | Type           | Nguồn dữ liệu                            |
| ------------ | -------------- | ----------------------------------------- |
| `scenes`     | `Scene[]`      | REST GET `/api/scenes` (per-ch snapshots) |
| `loading`    | `boolean`      | —                                         |
| `activating` | `number\|null` | ID đang được activate                     |

**Actions**: `fetchScenes()`, `createScene(name, targets[])` _(targets now include per-channel SceneChannelSnapshot[])_, `activateScene(id)`, `deleteScene(id)`.

### `useWsStore` (`src/stores/ws.ts`)

WebSocket dispatcher — singleton. Gọi `ws.init()` một lần trong `App.vue`.

```
wsService.onMessage(msg) → switch(msg.type) →
  STATE_UPDATE    → deviceStore.applyServerUpdate()          // full state with channels[]
  NODE_UPDATE     → meshStore.updateNode()                   // full node with channels[]
  CHANNEL_UPDATE  → if source='local': deviceStore.updateChannel(ch)   // ← NEW v1.5.0
                    if source='mesh':  meshStore.updateNodeChannel(addr, ch)
  NODE_OFFLINE    → meshStore.markOffline()
  WIFI_STATUS     → systemStore.wifi = payload
  LOG             → systemStore.pushLog()
  TASK_STATS      → systemStore.tasks = payload.tasks
  HEAP_STATS      → Object.assign(systemStore.heap, payload)
  WIFI_CONNECT_RESULT → systemStore.wifiConnecting = false
  SCENE_ACTIVATED → toast result summary
```

---

## 6. Layer Components — UI Building Blocks

### Common Components (`src/components/common/`)

| Component               | Props / Events                                                           | Mô tả                                             |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| `StatusBadge.vue`       | `connected: boolean`                                                     | Green/red dot + "Connected/Disconnected"           |
| `ChannelCard.vue`       | `channel: Channel`, `loading?`, `disabled?` / emit `toggle`, `level`     | **NEW v1.5.0** — Adaptive per-channel control card |
| `RelayToggle.vue`       | `modelValue`, `loading?`, `disabled?`                                    | Animated toggle, 300ms debounce                    |
| `BrightnessSlider.vue`  | `modelValue: number`, `disabled?`                                        | Range 0–100, 400ms debounce emit                   |
| `LoadingSpinner.vue`    | `size?: 'sm' \| 'md'`                                                   | Spinning SVG                                       |
| `ConfirmDialog.vue`     | `title`, `message`, `confirmLabel`, `danger?` / emit `confirm`, `cancel` | Modal dialog via Teleport                          |
| `ToastNotification.vue` | _(no props)_ — reads `toasts` from composable                            | Fixed top toast list via Teleport                  |

#### `ChannelCard.vue` — Chi tiết (v1.5.0)

Reusable component render adaptive UI dựa trên `channel.type`:

```
┌─ ChannelCard ──────────────────────────┐
│ Ch0: Đèn chính          [ON/OFF ●──]  │  ← RelayToggle
│ ───────── (dimmer only) ───────────── │
│ Brightness:  ═══════●════  80%        │  ← BrightnessSlider (nếu type='dimmer')
└────────────────────────────────────────┘
```

- **`type: 'onoff'`** → chỉ hiện toggle switch
- **`type: 'dimmer'`** → hiện toggle + brightness slider
- Emit `toggle(ch_index, on)` khi user bấm switch
- Emit `level(ch_index, value)` khi user kéo slider
- `disabled` prop → greyed out khi node offline

### Composable: `useToast()` (`src/composables/useToast.ts`)

```typescript
const toast = useToast()
toast.success('Saved!')
toast.error('Failed to connect')
toast.info('Scanning...')
toast.show(message, type, durationMs)
```

Lưu ý: `toasts` là shared singleton ref — `ToastNotification.vue` tự render danh sách toast này.

### Layout (`src/components/layout/AppShell.vue`)

```
┌────────────────────────────────────┐
│ 🏠 RhoPhi              ● Live      │  ← sticky header, WS indicator
├────────────────────────────────────┤
│                                    │
│         <slot />                   │  ← RouterView content
│         (pb-20 for nav clearance)  │
│                                    │
├────────────────────────────────────┤
│  🏠       🔗       🎬  ⚙️       🔍 │  ← fixed bottom nav
│ Home    Mesh    Scenes Set   Diag  │
└────────────────────────────────────┘
```

---

## 7. Layer Views — Các màn hình

### `DashboardView.vue` — `/`

**Dữ liệu cần**: `deviceStore`, `meshStore.nodesArray` (top 3), `systemStore.wifi`

**Layout** (v1.5.0 — multi-channel):

```
[ WiFi Card ]  [ Mesh Card ]    ← 2-col stats grid
[ This Device Card ]             ← Product badge + N ChannelCards
│  ┌─ ChannelCard ch0 ──────┐
│  │ Công tắc 1    [ON ●──] │
│  └─────────────────────────┘
│  ┌─ ChannelCard ch1 ──────┐
│  │ Đèn dim  [ON ●──]      │
│  │ ═══════●════  80%      │
│  └─────────────────────────┘
[ Mesh Quick List (top 3) ]      ← Tên node + status dot + channel summary
```

**onMounted**: `device.fetchState()`, `mesh.fetchNodes()`, `system.fetchWifi()`

---

### `MeshView.vue` — `/mesh`

**Dữ liệu cần**: `meshStore`

**Layout** (v1.5.0 — per-channel node cards):

```
[ Filter Tabs: All | Online | Offline ] + [ Search Input ]
[ Online X / Total Y ]
[ NodeCard * N ]
  ├─ Node name + status badge + RSSI bar
  ├─ Product badge (e.g. "SW-3CH-N")
  ├─ ChannelCard × node.channel_count
  │   ├─ Ch0: Công tắc 1 [ON/OFF toggle]
  │   ├─ Ch1: Công tắc 2 [ON/OFF toggle]
  │   └─ Ch2: Đèn dim    [toggle + slider 65%]
  └─ [Details] button → NodeDetailDrawer
```

**NodeDetailDrawer** (slide-up overlay):

- Editable name input
- Grid thông tin: Address, Product ID, Channel Count, Status, RSSI
- Per-channel config: rename channels, view types
- Nút "Save Name" (gọi `mesh.renameNode()`)
- Nút "Remove" → ConfirmDialog → `mesh.removeNode()`

---

### `ScenesView.vue` — `/scenes`

**Dữ liệu cần**: `scenesStore`, `meshStore` (cho create modal), `deviceStore` (cho local channels)

**Layout** (v1.5.0 — per-channel scene targets):

```
[ Header: "Scenes" + "+ New" button ]
[ SceneCard * N ]
  ├─ Tên scene + target count summary
  ├─ Target chips:
  │   ├─ "Local: Ch0 ON, Ch1 OFF 0%"
  │   └─ "0x0010: Ch0 ON, Ch1 ON, Ch2 ON 65%"
  └─ [▶ Activate] button
```

**Create Modal** (slide-up — v1.5.0):

- Input: Scene Name
- Section: "This Device" → per-channel toggle + slider (read current state as default)
- Section: "Mesh Nodes" → danh sách online nodes, mỗi node expand → per-channel toggle + slider
- Mỗi target có ChannelCard × channel_count → user set desired on/level per channel
- Submit → `scenes.createScene(name, targets[])` where each target has `SceneChannelSnapshot[]`

---

### `SettingsView.vue` — `/settings`

**Sections**:

1. **Device** — Tên device (inline edit → `api.saveDeviceName()`), firmware version, MAC, chip model
2. **WiFi** — Current status + [Change Network] → WiFi Scanner Drawer
3. **BLE Mesh** — Info text + link to `/mesh`
4. **About** — Project info

**WiFi Scanner Drawer**:

- Tự động scan khi mở
- List networks với RSSI bar + lock icon
- Click network → show password input → Connect

---

### `DiagnosticsView.vue` — `/diagnostics`

**onMounted**: fetch info + heap + tasks + nvs, bật WS log stream + task stream

**Sections**:

1. **System** — Uptime, boot count, reset reason, CPU freq + Heap bar (free/total với màu theo %)
2. **FreeRTOS Tasks** — Table: name | priority | state (màu) | stack HWM bytes
3. **Live Logs** — Log viewport height 256px, auto-scroll, filter theo level, pause/resume
4. **NVS Storage** — Table: namespace | key | type | value

**onUnmounted**: tắt WS log stream + task stream

---

## 8. Router & App Entry Point

### `src/router/index.ts`

```typescript
routes: [
  { path: '/', name: 'dashboard', component: DashboardView }, // eager
  { path: '/mesh', name: 'mesh', component: () => import('...') }, // lazy
  { path: '/scenes', name: 'scenes', component: () => import('...') }, // lazy
  { path: '/settings', name: 'settings', component: () => import('...') }, // lazy
  { path: '/diagnostics', name: 'diagnostics', component: () => import('...') }, // lazy
]
```

### `src/App.vue`

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useWsStore } from '@/stores/ws'
const ws = useWsStore()
onMounted(() => ws.init()) // Khởi động WebSocket một lần duy nhất
</script>

<template>
  <AppShell>
    <RouterView />
    <!-- Content của từng màn hình -->
  </AppShell>
  <ToastNotification />
  <!-- Global toast overlay -->
</template>
```

---

## 9. Tailwind CSS Configuration

**Cài đặt**: Tailwind CSS v4 (KHÔNG dùng PostCSS — dùng Vite plugin trực tiếp)

```typescript
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [tailwindcss(), vue(), vueDevTools()],
})
```

```css
/* src/assets/main.css */
@import 'tailwindcss'; /* Tailwind v4 directive */

/* Dark theme globals */
body {
  background-color: #0f0f0f;
  color: #f4f4f5;
}
#app {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100dvh;
}
```

**Không cần `tailwind.config.js`** — Tailwind v4 tự detect classes từ source.

---

## 10. Build Process & Nhúng vào ESP32

### Bước 1 — Build WebUI

```bash
cd /home/leslie/WS/rhophismarthomeWebUI
npm run build
```

Output tại `dist/`:

```
dist/
├── index.html                        (0.42 kB gzip: 0.28 kB)
└── assets/
    ├── [hash8].css                   (27 kB  gzip: 5.6 kB — Tailwind)
    ├── [hash8].js                    (121 kB gzip: 46 kB — main bundle)
    └── [hash8].js × N               (lazy chunks: Mesh, Scenes, Settings, Diagnostics)
```

**Tổng gzip size: ~55 kB** — phù hợp LittleFS/SPIFFS partition 256 kB.

> ⚠️ **SPIFFS filename limit**: SPIFFS giới hạn tên object (tên file relative trong partition) tối đa ~32 ký tự.
> Vite mặc định tạo tên file từ SFC component name (vd: `ConfirmDialog.vue_vue_type_script_setup_true_lang-<hash>.js`) — vượt quá giới hạn và gây lỗi `spiffsgen.py: RuntimeError: object name too long`.
>
> **Fix đã áp dụng** — `vite.config.ts`, section `build.rollupOptions.output`:
>
> ```typescript
> build: {
>   rollupOptions: {
>     output: {
>       entryFileNames: 'assets/[hash].js',
>       chunkFileNames: 'assets/[hash].js',
>       assetFileNames: 'assets/[hash].[ext]',
>     },
>   },
> },
> ```
>
> Kết quả: tên file chỉ còn 8 ký tự hash (vd: `Dsy5XEOU.js`) — hoàn toàn trong giới hạn SPIFFS.

### Bước 2 — Copy vào ESP32 SPIFFS image folder

```bash
# Tạo thư mục SPIFFS image
mkdir -p /home/leslie/WS/RhoPhi_Smart_Home_ESP32_FW/middleware/services/webserver_5.2/spiffs_image

# Copy toàn bộ dist
cp -r /home/leslie/WS/rhophismarthomeWebUI/dist/* \
      /home/leslie/WS/RhoPhi_Smart_Home_ESP32_FW/middleware/services/webserver_5.2/spiffs_image/
```

### Bước 3 — Cấu hình partition ESP32

`partitions.csv`:

```
# Name,   Type, SubType, Offset,   Size,   Flags
nvs,      data, nvs,     0x9000,   0x6000,
otadata,  data, ota,     0xf000,   0x2000,
app0,     app,  ota_0,   0x10000,  0x180000,
app1,     app,  ota_1,   0x190000, 0x180000,
spiffs,   data, spiffs,  0x310000, 0x40000,  ← WebUI files ở đây (256 kB)
```

### Bước 4 — CMakeLists.txt của webserver_5.2

```cmake
idf_component_register(
    SRCS "webserver_manager.cpp"
    INCLUDE_DIRS "."
    REQUIRES esp_http_server spiffs nvs_flash
)

# Tạo SPIFFS binary từ folder spiffs_image/
spiffs_create_partition_image(spiffs spiffs_image FLASH_IN_PROJECT)
```

### Bước 5 — Build & Flash firmware

```bash
cd /home/leslie/WS/RhoPhi_Smart_Home_ESP32_FW
idf.py build
idf.py -p /dev/ttyUSB0 flash   # Flash cả firmware + SPIFFS partition
# Hoặc chỉ flash SPIFFS:
idf.py -p /dev/ttyUSB0 spiffs-flash
```

### Script tự động (recommended)

```bash
#!/bin/bash
# deploy_webui.sh — chạy từ thư mục firmware
set -e
echo "=== Build WebUI ==="
cd /home/leslie/WS/rhophismarthomeWebUI
npm run build

echo "=== Copy to SPIFFS image ==="
SPIFFS_DIR=/home/leslie/WS/RhoPhi_Smart_Home_ESP32_FW/middleware/services/webserver_5.2/spiffs_image
rm -rf "$SPIFFS_DIR"
mkdir -p "$SPIFFS_DIR"
cp -r dist/* "$SPIFFS_DIR/"

echo "=== Build Firmware ==="
cd /home/leslie/WS/RhoPhi_Smart_Home_ESP32_FW
idf.py build

echo "=== Flash ==="
idf.py -p /dev/ttyUSB0 flash
echo "Done! Open http://192.168.4.1 in browser"
```

---

## 11. Firmware Webserver Implementation

File: `middleware/services/webserver_5.2/webserver_manager.cpp`
Header: `middleware/services/webserver_5.2/webserver_manager.hpp`
CMake: `middleware/services/webserver_5.2/CMakeLists.txt`

### 11.1 Kiến trúc

```
WebServerManager::init()
  ├── esp_vfs_spiffs_register()     ← Mount SPIFFS partition "spiffs"
  ├── httpd_start()                 ← Khởi động HTTP server port 80
  └── registerHandlers_()
        ├── GET  /ws                → WebSocket upgrade (CONFIG_HTTPD_WS_SUPPORT=y)
        ├── GET  /api/system/info   → JSON: SystemInfo (chip, MAC, uptime, IDF ver)
        ├── GET  /api/diagnostics/system → heap free/min/largest/total
        ├── GET  /api/diagnostics/tasks  → FreeRTOS task list (TODO: vTaskList)
        ├── GET  /api/diagnostics/nvs    → NVS entries (TODO: enumerate)
        ├── GET  /api/device/state  → product, channel_count, channels[], scene_id
        ├── POST /api/device/channel/:ch/state → toggle single channel (v1.5.0)
        ├── POST /api/device/channel/:ch/level → set dimmer level (v1.5.0)
        ├── GET  /api/mesh/nodes    → MeshNetwork (each node has channels[])
        ├── POST /api/mesh/node/:addr/channel/:ch/state → node channel toggle (v1.5.0)
        ├── POST /api/mesh/node/:addr/channel/:ch/level → node dimmer level (v1.5.0)
        ├── POST /api/mesh/node/:addr/name → rename node
        ├── DELETE /api/mesh/node/* → remove node
        ├── GET+POST /api/scenes    → list + create scenes (per-channel snapshots)
        ├── POST /api/scenes/*      → activate scene
        ├── DELETE /api/scenes/*    → delete scene
        ├── GET  /api/wifi/status   → WiFi connection + IP info
        ├── GET  /api/wifi/scan     → scan networks (TODO: async scan)
        ├── POST /api/wifi/connect  → connect to SSID
        ├── POST /api/settings/device → save device name (TODO: NVS persist)
        ├── GET  /assets/*          → serve CSS/JS/ICO từ SPIFFS (cache 1 năm)
        └── GET  /*                 → serve index.html (Vue Router SPA fallback)
```

### 11.2 CMakeLists.txt — Component dependencies

```cmake
idf_component_register(
    SRCS "webserver_manager.cpp"
    INCLUDE_DIRS "."
    REQUIRES esp_http_server spiffs nvs_flash esp_wifi json
             esp_timer esp_netif esp_system
)

spiffs_create_partition_image(spiffs spiffs_image FLASH_IN_PROJECT)
```

> **Tại sao cần từng component:**
> | Component | Headers cung cấp |
> |---|---|
> | `esp_http_server` | `esp_http_server.h` — httpd\_\*, WS APIs |
> | `spiffs` | `esp_spiffs.h` — VFS SPIFFS mount |
> | `nvs_flash` | `nvs_flash.h` — NVS init |
> | `esp_wifi` | `esp_wifi.h`, `esp_wifi_types.h` |
> | `json` | `cJSON.h` (dự phòng, hiện dùng snprintf) |
> | `esp_timer` | `esp_timer.h` — `esp_timer_get_time()` |
> | `esp_netif` | `esp_netif.h` — `esp_netif_get_ip_info()`, `IPSTR`/`IP2STR` |
> | `esp_system` | `esp_system.h` — `esp_get_idf_version()`, `esp_get_free_heap_size()` |

### 11.3 Kconfig — Bật WebSocket support

WebSocket APIs (`httpd_ws_frame_t`, `HTTPD_WS_TYPE_TEXT`, `httpd_ws_recv_frame`, v.v.) trong ESP-IDF được bao bởi `#if CONFIG_HTTPD_WS_SUPPORT`. Cần bật trong:

**`sdkconfig.defaults`** (persist qua `idf.py set-target`):

```
# WebServer — enable WebSocket support
CONFIG_HTTPD_WS_SUPPORT=y
```

**`sdkconfig`** (live build):

```
CONFIG_HTTPD_WS_SUPPORT=y
```

Nếu không bật, compiler sẽ báo:

```
error: 'httpd_ws_frame_t' was not declared in this scope
error: 'HTTPD_WS_TYPE_TEXT' was not declared in this scope
error: 'httpd_uri_t' has no non-static data member named 'is_websocket'
```

### 11.4 Lưu ý C++ compatibility

ESP-IDF 5.5 compile với `-std=gnu++2b`. Một số lưu ý:

| Vấn đề                  | Sai (C99 designated init)                  | Đúng (C++ style)                                                     |
| ----------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| `httpd_uri_t` init      | `{.uri="/ws", .method=HTTP_GET}`           | `httpd_uri_t u = {}; u.uri="/ws"; u.method=HTTP_GET;`                |
| `httpd_ws_frame_t` init | `{.type=HTTPD_WS_TYPE_TEXT, .payload=buf}` | `httpd_ws_frame_t f = {}; f.type=HTTPD_WS_TYPE_TEXT; f.payload=buf;` |
| `is_websocket` field    | Luôn dùng trực tiếp                        | Bao trong `#if CONFIG_HTTPD_WS_SUPPORT`                              |

### 11.5 Path buffer size — format-truncation fix

`handleFile_()` dùng buffer để build đường dẫn SPIFFS:

```cpp
// ❌ Sai — path[256] nhưng SPIFFS_BASE(8) + URI(up to 512) = có thể tràn
char path[256];
snprintf(path, sizeof(path), "%s%s", SPIFFS_BASE, req->uri);

// ✅ Đúng — đủ cho SPIFFS_BASE + URI tối đa
char path[640];
snprintf(path, sizeof(path), "%s%s", SPIFFS_BASE, req->uri);
```

ESP-IDF build với `-Werror=all` nên cảnh báo `format-truncation` trở thành lỗi build.

### 11.6 Các TODO còn lại (domain layer wiring)

| API Endpoint                               | TODO                                                 |
| ------------------------------------------ | ---------------------------------------------------- |
| `/api/device/channel/:ch/state`            | Wire to peripheral/relay control per channel         |
| `/api/device/channel/:ch/level`            | Wire to LEDC PWM per channel                         |
| `/api/mesh/nodes`                          | Wire to MeshNodeDB (multi-channel)                   |
| `/api/mesh/node/:addr/channel/:ch/state`   | Wire to BLE Mesh Generic OnOff Set per channel       |
| `/api/mesh/node/:addr/channel/:ch/level`   | Wire to BLE Mesh Lightness Set per channel           |
| `/api/mesh/node/:addr/name`                | Persist to NVS namespace `mesh_nodes`                |
| `/api/scenes`                              | Wire to SceneList (per-channel snapshots), NVS       |
| `/api/wifi/scan`                           | Implement `esp_wifi_scan_start()` async              |
| `/api/wifi/connect`                        | Wire `esp_wifi_set_config()` + `esp_wifi_connect()`  |
| `/api/settings/device`                     | Persist device name to NVS `system/device_name`      |
| WS `CHANNEL_UPDATE`                        | Push fine-grained per-channel updates                |
| WS log streaming                           | Hook into ESP-IDF log output → `wsBroadcast()`       |
| WS task stats                              | FreeRTOS `uxTaskGetSystemState()` → push every 2s    |

### WebSocket push events (firmware → browser)

| Event            | Trigger                              | Interval   |
| ---------------- | ------------------------------------ | ---------- |
| `HEAP_STATS`     | Timer task                           | 5 giây     |
| `TASK_STATS`     | Khi client subscribe                 | 2 giây     |
| `LOG`            | Khi client subscribe + log hook      | Real-time  |
| `STATE_UPDATE`   | Khi bất kỳ channel nào thay đổi     | On-change  |
| `CHANNEL_UPDATE` | Fine-grained single channel change   | On-change  |
| `NODE_UPDATE`    | Khi node mesh heartbeat              | On-receive |
| `NODE_OFFLINE`   | Khi timeout heartbeat                | On-timeout |
| `WIFI_STATUS`    | Khi WiFi state thay đổi             | On-change  |
| `SCENE_ACTIVATED`| Sau khi scene execute xong           | On-demand  |

---

## 12. Luồng dữ liệu end-to-end

### Ví dụ: User bật channel 1 trên MeshView (v1.5.0)

```
User clicks ChannelCard toggle (channel 1 on node 0x0010)
  │
  ▼
ChannelCard emits toggle(1, true)
  │
  ▼
MeshView: mesh.toggleNodeChannel("0x0010", 1, true)
  │
  ├─► Optimistic: nodes.get("0x0010").channels[1].on = true  (UI cập nhật ngay)
  │
  └─► api.setNodeChannelState("0x0010", 1, true)
        │  POST /api/mesh/node/0x0010/channel/1/state {"on":true}
        ▼
      ESP32 Firmware
        │  BLE Mesh: Generic OnOff Set → node 0x0010, element 1
        │
        ▼
      Node xử lý, gửi status ack
        │
        ▼
      Firmware push WS: {"type":"CHANNEL_UPDATE","payload":{
        "source":"mesh", "addr":"0x0010",
        "channel":{"index":1,"name":"Công tắc 2","type":"onoff","on":true,"level":100}
      }}
        │
        ▼
      wsService.onMessage → useWsStore → meshStore.updateNodeChannel("0x0010", ch)
        │
        ▼
      UI tự cập nhật (reactive) — consistent với hardware
```

### Ví dụ: Live log streaming (DiagnosticsView)

```
DiagnosticsView.onMounted()
  │
  ├─ ws.enableLogStream(true)
  │    └─► wsService.send({type:"SUBSCRIBE_LOG", enabled:true})
  │
  └─ ESP32 firmware bật log hook → gửi LOG events qua WS
       │
       ▼
     wsService.onMessage({type:"LOG", payload:{level,tag,msg,ts}})
       │
       ▼
     useWsStore → systemStore.pushLog(payload)
       │  (auto-format ts_label, circular buffer 200 entries)
       ▼
     DiagnosticsView log viewport cập nhật reactive
     └─ auto-scroll nếu người dùng đang ở cuối
```

---

## 13. Phát triển & Debug

### Dev server với proxy đến ESP32 thật

```typescript
// vite.config.ts (thêm khi develop)
server: {
  proxy: {
    '/api': 'http://192.168.4.1',
    '/ws':  { target: 'ws://192.168.4.1', ws: true },
  }
}
```

Hoặc dùng `.env.local`:

```
VITE_API_BASE=http://192.168.4.1
VITE_WS_URL=ws://192.168.4.1/ws
```

### Mock data khi chưa có firmware

Trong `src/services/api.ts`, có thể thêm mock responses:

```typescript
const MOCK = import.meta.env.VITE_MOCK === 'true'
if (MOCK) return mockData[path] as T
```

### Build size tracking

```bash
npm run build -- --mode production
# Xem gzip sizes trong output — target: tổng < 256kB
```

### Debug WebSocket

Mở browser DevTools → Network → WS → xem frames realtime.

Firmware log tag: `WS_MGR` — tìm trong serial output.

---

## 14. Kiểm thử Webserver sau khi Flash

### 14.1 Kết nối đến ESP32

Sau khi flash, ESP32 bật softAP **ngay trong quá trình khởi tạo** (`WIFI_INIT::Start_SoftAP`), trước khi bất kỳ STA connect nào được thực hiện.

**softAP luôn bật từ boot (v1.4.0)**:

```
SSID:     RhoPhi-XXXXXX  (6 ký tự hex từ 3 byte cuối MAC của AP interface)
Password: (open — không cần mật khẩu)
IP:       192.168.4.1
```

> **v1.4.0 — AP khởi động ở tầng Init (không phải Connect):**  
> Trước v1.4.0 (v1.3.0), AP chỉ start khi `WIFI_CONN::Set_Ap_Config` được chạy — tức là **chỉ khi STA connect được trigger**. Nếu `autoConnect=false` hoặc không có credentials, AP không bao giờ start.  
> Từ v1.4.0, AP được start trong `WIFI_INIT::Start_SoftAP` — luôn chạy khi boot, trước khi giải phóng semaphore cho các task khác.  
> **Files đã sửa:** `middleware/connectivity/wifi_5.2/include/wifi/wifi_enums.hpp`, `src/wifi/wifi_run.cpp`

> **v1.3.0 — SSID đổi từ `PROV_...` thành `RhoPhi-...`:**  
> **Files đã sửa:** `middleware/connectivity/wifi_5.2/src/prov/prov_utilities.cpp`, `src/prov/prov_run.cpp`

**Chế độ WiFi theo từng giai đoạn:**

| Giai đoạn                                     | Mode              | AP? | STA? |
| --------------------------------------------- | ----------------- | --- | ---- |
| Sau `WIFI_INIT::Start_SoftAP`                 | `WIFI_MODE_AP`    | ✅  | No   |
| Sau `WIFI_CONN::Wifi_Start` (nếu STA connect) | `WIFI_MODE_APSTA` | ✅  | ✅   |

**STA mode (đồng thời với AP khi connect)**:

- Nếu đã có credentials trong NVS (`autoConnect=true`), ESP32 kết nối router và nhận IP từ DHCP.
- `WIFI_CONN::Wifi_Init` gọi `esp_wifi_stop()` (không phải `esp_wifi_init()` — đã gọi trong Init), sau đó `Set_Wifi_Mode` nâng cấp lên `WIFI_MODE_APSTA`.

> Dùng **ESP-IDF Monitor** để xem log khởi động:
>
> ```
> I (xxxx) _wifi: WIFI_INIT::Start_SoftAP: AP started, SSID = RhoPhi-AABBCC
> I (xxxx) WS_MGR: WebServer started on port 80
> I (xxxx) WS_MGR: SPIFFS mounted: 187392/262144 bytes used
> ```

---

### 14.2 Test 1 — Mở WebUI trong browser

```
http://192.168.4.1
```

Kỳ vọng:

- Trang load thành công, hiện Dashboard
- Header xanh "● Live" khi WebSocket kết nối
- Các tab điều hướng hoạt động (Mesh, Scenes, Settings, Diagnostics)

> ❌ Nếu trang trắng hoặc 404: SPIFFS chưa mount → xem log `WS_MGR: SPIFFS mount failed`
> ❌ Nếu trang load nhưng "● Disconnected": WebSocket bị block (check CORS / network)

---

### 14.3 Test 2 — REST API bằng curl

Chạy các lệnh sau từ máy tính đã kết nối WiFi ESP32:

**System info:**

```bash
curl http://192.168.4.1/api/system/info
# Kỳ vọng: {"version":"1.0.0","chip_model":"ESP32","mac":"...","uptime_s":42,...}
```

**Heap diagnostics:**

```bash
curl http://192.168.4.1/api/diagnostics/system
# Kỳ vọng: {"free_heap":234000,"min_free_heap":200000,...}
```

**WiFi status:**

```bash
curl http://192.168.4.1/api/wifi/status
# Kỳ vọng: {"connected":false,"ssid":"","ip":"","rssi":0,"channel":0}
# Hoặc nếu đã kết nối: {"connected":true,"ssid":"MyRouter","ip":"192.168.1.10",...}
```

**Device state:**

```bash
curl http://192.168.4.1/api/device/state
# Kỳ vọng (v1.5.0): {"product":"SW-2CH-D","channel_count":2,"scene_id":0,
#   "channels":[{"index":0,"name":"Đèn chính","type":"dimmer","on":true,"level":80},
#               {"index":1,"name":"Đèn phụ","type":"dimmer","on":false,"level":0}]}
```

**Toggle channel 0:**

```bash
curl -X POST http://192.168.4.1/api/device/channel/0/state \
     -H "Content-Type: application/json" \
     -d '{"on":true}'
```

**Set channel 1 dimmer level:**

```bash
curl -X POST http://192.168.4.1/api/device/channel/1/level \
     -H "Content-Type: application/json" \
     -d '{"level":75}'
```

**Mesh nodes:**

```bash
curl http://192.168.4.1/api/mesh/nodes
# Kỳ vọng (v1.5.0): {"self_addr":"0x0001","node_count":1,"online_count":1,"nodes":[
#   {"addr":"0x0010","name":"Living Room","product_id":"SW-3CH-N","channel_count":3,
#    "status":"online","rssi":-55,"last_seen_ms":100,
#    "channels":[{"index":0,"name":"Công tắc 1","type":"onoff","on":true,"level":100},...]}
# ]}
```

---

### 14.4 Test 3 — WebSocket bằng wscat

Cài wscat (nếu chưa có):

```bash
npm install -g wscat
```

Kết nối:

```bash
wscat -c ws://192.168.4.1/ws
```

Sau khi kết nối, gõ lệnh test:

```json
{ "type": "PING" }
```

Kỳ vọng firmware trả về:

```json
{ "type": "PONG" }
```

```json
{ "type": "SUBSCRIBE_LOG", "enabled": true }
```

Kỳ vọng: firmware bắt đầu push log events dạng `{"type":"LOG","payload":{...}}`

---

### 14.5 Test 4 — WebSocket trong Browser DevTools

1. Mở `http://192.168.4.1` trong Chrome/Firefox
2. Mở DevTools → tab **Network** → filter **WS**
3. Click vào connection `/ws`
4. Tab **Messages** — xem frames realtime:
   - Frames màu xanh: browser → firmware (subscribe, ping)
   - Frames màu trắng: firmware → browser (log, heap stats, v.v.)

---

### 14.6 Kiểm tra SPIFFS partition

Từ serial monitor, tìm log:

```
I (xxxx) WS_MGR: SPIFFS mounted: <used>/<total> bytes used
```

Kiểm tra bằng lệnh:

```bash
# Đọc partition table
idf.py partition-table

# Xem nội dung SPIFFS (nếu muốn verify trước khi flash)
python $IDF_PATH/components/spiffs/spiffsgen.py \
  --page-size 256 list \
  build/spiffs.bin
```

---

### 14.7 Troubleshooting nhanh

| Triệu chứng                               | Nguyên nhân                             | Cách fix                                                                                                           |
| ----------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Không thấy SSID `RhoPhi-XXXXXX`           | Firmware cũ (< v1.4.0) hoặc Init fail   | Tìm log `_wifi: WIFI_INIT::Start_SoftAP: AP started` — nếu thiếu, xem warning `esp_netif_create_default_wifi_ap()` |
| SSID hiện `PROV_...` thay vì `RhoPhi-...` | Firmware cũ (< v1.3.0)                  | Flash lại firmware ≥ v1.3.0 — đã đổi prefix trong `prov_utilities.cpp`                                             |
| Browser hiện trang trắng                  | SPIFFS không mount được                 | Xem log `WS_MGR: SPIFFS mount failed`, kiểm tra `partitions.csv` offset/size                                       |
| `404 Not Found` trên tất cả route         | `index.html` không tồn tại trong SPIFFS | Re-flash SPIFFS: `idf.py flash` (bao gồm cả spiffs.bin)                                                            |
| WebSocket "Disconnected" ngay sau kết nối | `CONFIG_HTTPD_WS_SUPPORT` chưa bật      | Kiểm tra `sdkconfig`: phải có `CONFIG_HTTPD_WS_SUPPORT=y`                                                          |
| API trả về đúng nhưng UI không cập nhật   | WS push chưa implement                  | Đây là TODO — tạm thời reload trang                                                                                |
| `curl` trả về `Connection refused`        | Server chưa start                       | Xem log `WS_MGR: WebServer started on port 80` — nếu không có là init fail                                         |
| Flash xong nhưng WebUI cũ                 | SPIFFS không được flash                 | Dùng `idf.py flash` (không phải chỉ `app-flash`) — SPIFFS được include khi có `FLASH_IN_PROJECT`                   |
