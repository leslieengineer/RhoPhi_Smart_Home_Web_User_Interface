# WebUI Architecture — RhoPhi Smart Home

---

| Field        | Value                                                 |
| ------------ | ----------------------------------------------------- |
| Document ID  | WEBUI-ARCH-001                                        |
| Version      | 1.0.0                                                 |
| Status       | Active                                                |
| Last Updated | 2026-02-21                                            |
| Tech Stack   | Vue 3 + TypeScript + Vite + Pinia + Vue Router        |
| Target Host  | ESP32 AP (192.168.4.1) — embedded via LittleFS/SPIFFS |
| Relates to   | IMPL-ARCH-001, IMPL-DATA-001, SRS-RHOPHI-001          |

---

## Table of Contents

1. [Tổng quan — WebUI là gì trong project này](#1-tổng-quan--webui-là-gì-trong-project-này)
2. [Kiến trúc tổng thể WebUI](#2-kiến-trúc-tổng-thể-webui)
3. [Information Architecture — Cấu trúc màn hình](#3-information-architecture--cấu-trúc-màn-hình)
4. [Mô tả chi tiết từng màn hình](#4-mô-tả-chi-tiết-từng-màn-hình)
5. [Giao tiếp WebUI ↔ Firmware (API Design)](#5-giao-tiếp-webui--firmware-api-design)
6. [State Management — Pinia Stores](#6-state-management--pinia-stores)
7. [Cấu trúc thư mục Vue project](#7-cấu-trúc-thư-mục-vue-project)
8. [Build và nhúng vào Firmware](#8-build-và-nhúng-vào-firmware)
9. [Quy tắc thiết kế UI](#9-quy-tắc-thiết-kế-ui)
10. [Roadmap WebUI](#10-roadmap-webui)

---

## 1. Tổng quan — WebUI là gì trong project này

### Mô hình triển khai

```
Điện thoại / Laptop
    │
    │  kết nối WiFi tới AP của ESP32
    │  (SSID: RhoPhi_XXXXXX / IP: 192.168.4.1)
    ▼
[ ESP32 WebServer Middleware ]
    │  phục vụ file HTML/JS/CSS từ LittleFS
    │  xử lý REST API: GET/POST /api/...
    │  duy trì WebSocket: ws://192.168.4.1/ws
    ▼
[ Firmware Domain Layer ]
    ├── DeviceState (relay, brightness, scene)
    ├── MeshNodeDB (danh sách nodes trong mesh)
    └── System (wifi config, device info, diagnostics)
```

### Đặc điểm môi trường (khác với web thông thường)

| Đặc điểm                       | Chi tiết                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ |
| **Không có internet**          | WebUI chạy offline hoàn toàn từ flash của ESP32                          |
| **Tài nguyên hạn chế**         | Flash LittleFS thường 1–2MB cho toàn bộ WebUI (HTML + JS + CSS)          |
| **Latency không ổn định**      | WiFi AP mode có thể có jitter — cần timeout/retry tốt                    |
| **Một user tại một thời điểm** | Không cần multi-user auth phức tạp — PIN đơn giản là đủ                  |
| **Realtime quan trọng**        | Trạng thái relay/node phải cập nhật realtime qua WebSocket               |
| **Screen size**                | Ưu tiên mobile (điện thoại 360–430px) nhưng responsive cho tablet/laptop |

---

## 2. Kiến trúc tổng thể WebUI

```
┌────────────────────────────────────────────────────────────────────────┐
│                          VUE 3 APPLICATION                             │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                       VIEWS (Pages)                              │  │
│  │  DashboardView  │  MeshView  │  SettingsView  │  DiagnosticsView │  │
│  └───────────────────────────┬──────────────────────────────────────┘  │
│                              │ composables / stores                     │
│  ┌───────────────────────────▼──────────────────────────────────────┐  │
│  │                    PINIA STORES                                   │  │
│  │  deviceStore  │  meshStore  │  systemStore  │  settingsStore     │  │
│  └───────────────────────────┬──────────────────────────────────────┘  │
│                              │ HTTP + WebSocket                         │
│  ┌───────────────────────────▼──────────────────────────────────────┐  │
│  │                   API / TRANSPORT LAYER                           │  │
│  │  api.ts (fetch wrapper)  │  websocket.ts (WS singleton)          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────▼───────────────┐
              │       ESP32 Firmware           │
              │  WebServer + System + Domain   │
              └───────────────────────────────┘
```

### Các layer trong Vue project

| Layer           | Thư mục            | Vai trò                                                    |
| --------------- | ------------------ | ---------------------------------------------------------- |
| **Views**       | `src/views/`       | Pages: mỗi route = 1 view, orchestrate components          |
| **Components**  | `src/components/`  | Reusable UI blocks (NodeCard, RelayToggle, StatusBadge...) |
| **Stores**      | `src/stores/`      | Global state (Pinia) — nguồn sự thật duy nhất              |
| **Composables** | `src/composables/` | Logic tái sử dụng (useWebSocket, useApi, useToast)         |
| **Services**    | `src/services/`    | HTTP và WebSocket transport (không có Vue dependency)      |
| **Router**      | `src/router/`      | Route definitions + navigation guards                      |
| **Types**       | `src/types/`       | TypeScript interfaces cho API models                       |

---

## 3. Information Architecture — Cấu trúc màn hình

```
App Shell (Header + NavBar + RouterView)
│
├── / → Dashboard (Trang chủ)
│       ├── Trạng thái hệ thống nhanh (WiFi, Mesh, Device)
│       ├── Device của chính ESP32 (relay toggle, brightness)
│       └── Quick mesh overview (số nodes online/offline)
│
├── /mesh → Mesh Network
│       ├── Danh sách tất cả nodes (dạng card grid)
│       ├── Mỗi node: tên, địa chỉ, trạng thái online/offline
│       ├── Toggle relay từng node
│       ├── Điều chỉnh brightness từng node
│       └── [Phase 2] Topology map (cây mesh)
│
├── /scenes → Scenes (Kịch bản)
│       ├── Danh sách scenes đã tạo
│       ├── Kích hoạt scene (apply tất cả nodes)
│       ├── Tạo scene mới từ trạng thái hiện tại
│       └── Xóa / chỉnh sửa scene
│
├── /settings → Cài đặt
│       ├── WiFi Settings (scan, chọn SSID, nhập password)
│       ├── Device Settings (tên thiết bị, device ID)
│       ├── Mesh Settings (provisioning, reset node)
│       └── Firmware (version hiện tại, OTA update)
│
└── /diagnostics → Chẩn đoán hệ thống
        ├── System Info (heap, uptime, boot count, MAC)
        ├── Task Monitor (stack usage từng FreeRTOS task)
        ├── Log Viewer (realtime log qua WebSocket)
        └── NVS Inspector (đọc các key đang lưu)
```

---

## 4. Mô tả chi tiết từng màn hình

### 4.1 Dashboard (`/`)

**Mục đích:** Tổng quan nhanh, hành động thường dùng nhất.

```
┌─────────────────────────────────────────┐
│  🏠 RhoPhi Smart Home        [⚙] [🔔]  │ ← Header
├─────────────────────────────────────────┤
│  ┌─────────────────┐  ┌───────────────┐ │
│  │ 📶 WiFi          │  │ 🔗 BLE Mesh   │ │ ← System status cards
│  │ Connected        │  │ 3 nodes       │ │
│  │ RhoPhi_Home      │  │ 2 online      │ │
│  └─────────────────┘  └───────────────┘ │
│                                          │
│  ─── This Device ───────────────────── │
│  ┌─────────────────────────────────────┐│
│  │  Relay 1            [  ●  ON  ]     ││ ← Main relay toggle
│  │  Brightness         [━━━━━━━●  75%] ││ ← Slider
│  └─────────────────────────────────────┘│
│                                          │
│  ─── Mesh Nodes (Quick) ─────────────── │
│  ● Node A (0x0010)    [  ● ON  ]        │ ← Quick toggle per node
│  ○ Node B (0x0011)    [OFFLINE]         │
│  + 1 more...  → [View All]              │
└─────────────────────────────────────────┘
│  [Dashboard] [Mesh] [Scenes] [Settings] │ ← Bottom NavBar
└─────────────────────────────────────────┘
```

**Components cần:**

- `SystemStatusCard` — WiFi/Mesh connection state
- `RelayToggle` — toggle ON/OFF với visual feedback
- `BrightnessSlider` — slider + giá trị % hiển thị
- `NodeQuickRow` — row gọn cho quick overview

---

### 4.2 Mesh Network (`/mesh`)

**Mục đích:** Quản lý toàn bộ nodes trong BLE Mesh network.

```
┌─────────────────────────────────────────┐
│  ← Mesh Network               [+ Add]   │
├─────────────────────────────────────────┤
│  [All ▼]  🔍 Search...        3/4 online│
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │ ● Living Room Light              │  │  ← NodeCard (online)
│  │   Addr: 0x0010  │ Relay: ●ON     │  │
│  │   Brightness: ████████░░  80%    │  │
│  │   [  Toggle  ]  [  Details  ]    │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ ● Bedroom Switch                 │  │
│  │   Addr: 0x0011  │ Relay: ○ OFF   │  │
│  │   Brightness: N/A                │  │
│  │   [  Toggle  ]  [  Details  ]    │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ ○ Kitchen Light        [OFFLINE] │  │  ← NodeCard (offline)
│  │   Addr: 0x0012  │ Last seen: 5m  │  │
│  │   [  Details  ]                  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**NodeCard — detail view (modal/drawer):**

```
Node Details: Living Room Light
──────────────────────────────
  Name:           [Living Room Light  ] ← editable
  BLE Addr:       0x0010 (readonly)
  Model:          Generic OnOff Server
  Last Seen:      Just now
  RSSI:           -52 dBm

  Control
  ──────
  Relay:          [ ●  ON  ]
  Brightness:     [━━━━━━━━●  80%]

  [Save Name]  [Remove from Mesh]  [Close]
```

**Components cần:**

- `NodeCard` — main card với state + controls
- `NodeDetailDrawer` — slide-up drawer với đầy đủ info
- `NodeFilterBar` — filter by state (All/Online/Offline)
- `NodeSearchBox`

---

### 4.3 Scenes (`/scenes`)

**Mục đích:** Tạo và áp dụng kịch bản ánh sáng/relay.

```
┌─────────────────────────────────────────┐
│  ← Scenes                  [+ New]      │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │ 🌅 Morning Routine               │  │
│  │   Relay: ON | Brightness: 80%    │  │
│  │   Nodes: 3 of 4                  │  │
│  │   [▶ Activate]  [✏ Edit]  [🗑]   │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ 🌙 Night Mode                    │  │
│  │   Relay: ON | Brightness: 20%    │  │
│  │   Nodes: all                     │  │
│  │   [▶ Activate]  [✏ Edit]  [🗑]   │  │
│  └───────────────────────────────────┘  │
│                                          │
│  [+ Create from current state]          │
└─────────────────────────────────────────┘
```

---

### 4.4 Settings (`/settings`)

**Mục đích:** Cấu hình hệ thống — chia thành sub-sections.

```
┌─────────────────────────────────────────┐
│  ← Settings                             │
├─────────────────────────────────────────┤
│                                          │
│  📶 WiFi Connection                     │
│  ─────────────────────────────────────  │
│  Status:    Connected to "RhoPhi_Home"  │
│  Signal:    -48 dBm (Excellent)         │
│  IP:        192.168.1.105               │
│  [Change Network ▶]                     │
│                                          │
│  📱 Device                              │
│  ─────────────────────────────────────  │
│  Name:      [RhoPhi_Gateway_1      ]    │
│  Device ID: A4:E5:7C:12:34:56 (readonly)│
│  [Save]                                 │
│                                          │
│  🔗 BLE Mesh                           │
│  ─────────────────────────────────────  │
│  My Address:   0x0001                   │
│  Network Key:  ******* [Show]           │
│  [Provision New Node ▶]                 │
│  [Reset Mesh Network] ← danger zone     │
│                                          │
│  🔄 Firmware                            │
│  ─────────────────────────────────────  │
│  Version:   v1.2.0 (build 20260221)     │
│  [Check for Updates]                    │
└─────────────────────────────────────────┘
```

**WiFi Change Network Flow (sub-view / modal):**

```
Change WiFi Network
──────────────────
[🔄 Scan]

Available Networks:
  ● RhoPhi_Home      ████████ -42dBm  [Connect]
  ● MyHomeWifi       ██████░░ -58dBm  [Connect]
  ○ Neighbor_5G      ████░░░░ -71dBm  [Connect]

Or enter manually:
  SSID:     [__________________]
  Password: [__________________]
  [Connect]
```

---

### 4.5 Diagnostics (`/diagnostics`)

**Mục đích:** Dành cho developer/power user — monitor hệ thống.

```
┌─────────────────────────────────────────┐
│  ← Diagnostics                          │
├─────────────────────────────────────────┤
│  System Info                            │
│  ─────────────────────────────────────  │
│  Uptime:     2d 14h 33m                 │
│  Free Heap:  142 KB / 320 KB            │
│  Boot Count: 47                         │
│  Chip:       ESP32-WROOM-32 (rev 3)     │
│  MAC:        A4:E5:7C:12:34:56          │
│  IDF Ver:    v5.5.1                     │
│                                          │
│  FreeRTOS Tasks                         │
│  ─────────────────────────────────────  │
│  Task Name     State  Stack Used/Total  │
│  SystemRun     RUN    1.8K/4K           │
│  SystemGPIO    BLK    0.4K/2K           │
│  SystemTimer   BLK    0.3K/2K           │
│  WiFiTask      BLK    2.1K/6K           │
│                                          │
│  System Log  [● LIVE]  [⏸ Pause]        │
│  ─────────────────────────────────────  │
│  [INFO] Boot sequence complete          │
│  [INFO] WiFi connected: RhoPhi_Home     │
│  [INFO] BLE Mesh init done, addr=0x0001 │
│  [WARN] Node 0x0012 unreachable         │
│  ▼ (auto-scroll)                        │
└─────────────────────────────────────────┘
```

---

## 5. Giao tiếp WebUI ↔ Firmware (API Design)

### 5.1 Tổng quan transport

```
WebUI                                  Firmware
  │                                       │
  │── GET /api/system/info ──────────────►│  One-shot: load initial data
  │◄─ 200 { version, uptime, heap... } ───│
  │                                       │
  │── POST /api/device/relay ────────────►│  Commands: user actions
  │   { "state": true }                   │
  │◄─ 200 { "relay_on": true } ──────────│
  │                                       │
  │══ ws://192.168.4.1/ws ══════════════►│  WebSocket: bidirectional realtime
  │◄══ { type:"STATE_UPDATE", ... } ═════│  Push from firmware on state change
```

### 5.2 REST API Endpoints

```
GET  /api/system/info
     Response: { version, uptime_s, free_heap, boot_count, mac, chip, idf_ver }

GET  /api/device/state
     Response: { relay_on, brightness, scene_id, device_name }

POST /api/device/relay
     Body:     { "state": true }
     Response: { "relay_on": true }

POST /api/device/brightness
     Body:     { "level": 75 }
     Response: { "brightness": 75 }

GET  /api/mesh/nodes
     Response: { nodes: [ { addr, name, online, relay_on, brightness, rssi }, ... ] }

POST /api/mesh/node/:addr/relay
     Body:     { "state": true }
     Response: { "addr": "0x0010", "relay_on": true }

POST /api/mesh/node/:addr/name
     Body:     { "name": "Living Room" }
     Response: { "addr": "0x0010", "name": "Living Room" }

DELETE /api/mesh/node/:addr
     Response: { "removed": true }

GET  /api/scenes
     Response: { scenes: [ { id, name, relay_on, brightness }, ... ] }

POST /api/scenes
     Body:     { "name": "Morning" }              ← create from current state
     Response: { id, name, relay_on, brightness }

POST /api/scenes/:id/activate
     Response: { "activated": true }

DELETE /api/scenes/:id
     Response: { "removed": true }

GET  /api/wifi/status
     Response: { connected, ssid, rssi, ip }

GET  /api/wifi/scan
     Response: { networks: [ { ssid, rssi, secure }, ... ] }

POST /api/wifi/connect
     Body:     { "ssid": "MyNetwork", "password": "secret" }
     Response: { "status": "connecting" }         ← async, kết quả qua WS

GET  /api/diagnostics/tasks
     Response: { tasks: [ { name, state, stack_used, stack_total }, ... ] }

POST /api/settings/device
     Body:     { "name": "RhoPhi_Gateway_1" }
     Response: { "name": "RhoPhi_Gateway_1" }
```

### 5.3 WebSocket Protocol

Firmware push event tới WebUI mỗi khi state thay đổi:

```typescript
// WebSocket message format (JSON)
type WsMessage =
  | { type: 'STATE_UPDATE'; payload: DeviceState }
  | { type: 'NODE_UPDATE'; payload: MeshNode }
  | { type: 'NODE_OFFLINE'; payload: { addr: string } }
  | { type: 'WIFI_STATUS'; payload: { connected: boolean; ssid: string; ip: string } }
  | { type: 'LOG'; payload: { level: 'INFO' | 'WARN' | 'ERROR'; msg: string; ts: number } }
  | { type: 'TASK_STATS'; payload: { tasks: TaskInfo[] } } // periodic, every 5s
```

**WebUI → Firmware** (optional, có thể dùng REST thay thế):

```typescript
// WebUI có thể gửi lên WS để subscribe log
{ type: 'SUBSCRIBE_LOG', enabled: true }
{ type: 'PING' }  // keepalive
```

---

## 6. State Management — Pinia Stores

### 6.1 `deviceStore` — Trạng thái thiết bị chính

```typescript
// src/stores/device.ts
interface DeviceState {
  relay_on: boolean
  brightness: number // 0-100
  scene_id: number
  device_name: string
}

export const useDeviceStore = defineStore('device', () => {
  const state = ref<DeviceState>({ relay_on: false, brightness: 100, scene_id: 0, device_name: '' })
  const loading = ref(false)

  async function fetchState() {
    /* GET /api/device/state */
  }
  async function setRelay(on: boolean) {
    /* POST /api/device/relay */
  }
  async function setBrightness(level: number) {
    /* POST /api/device/brightness */
  }

  // Called by WebSocket when firmware pushes update
  function applyServerUpdate(update: Partial<DeviceState>) {
    Object.assign(state.value, update)
  }

  return { state, loading, fetchState, setRelay, setBrightness, applyServerUpdate }
})
```

### 6.2 `meshStore` — Danh sách nodes mesh

```typescript
// src/stores/mesh.ts
interface MeshNode {
  addr: string // "0x0010"
  name: string // "Living Room"
  online: boolean
  relay_on: boolean
  brightness: number
  rssi: number | null
}

export const useMeshStore = defineStore('mesh', () => {
  const nodes = ref<Map<string, MeshNode>>(new Map())

  async function fetchNodes() {
    /* GET /api/mesh/nodes */
  }
  async function toggleNode(addr: string, state: boolean) {
    /* POST /api/mesh/node/:addr/relay */
  }
  async function renameNode(addr: string, name: string) {
    /* POST /api/mesh/node/:addr/name */
  }

  function updateNode(node: Partial<MeshNode> & { addr: string }) {
    const existing = nodes.value.get(node.addr)
    nodes.value.set(node.addr, { ...existing, ...node } as MeshNode)
  }
  function markOffline(addr: string) {
    /* update online = false */
  }

  return {
    nodes,
    nodesArray: computed(() => [...nodes.value.values()]),
    fetchNodes,
    toggleNode,
    renameNode,
    updateNode,
    markOffline,
  }
})
```

### 6.3 `systemStore` — Info hệ thống + WiFi

```typescript
// src/stores/system.ts
export const useSystemStore = defineStore('system', () => {
  const info = ref<SystemInfo | null>(null) // version, heap, uptime...
  const wifi = ref<WifiStatus | null>(null)
  const tasks = ref<TaskInfo[]>([])
  const logs = ref<LogEntry[]>([]) // circular buffer, max 200

  async function fetchInfo() {
    /* GET /api/system/info */
  }
  async function fetchWifi() {
    /* GET /api/wifi/status */
  }
  function pushLog(entry: LogEntry) {
    logs.value.push(entry)
    if (logs.value.length > 200) logs.value.shift()
  }

  return { info, wifi, tasks, logs, fetchInfo, fetchWifi, pushLog }
})
```

### 6.4 `wsStore` — WebSocket singleton

```typescript
// src/stores/ws.ts
// Quản lý 1 WebSocket connection duy nhất cho toàn app
// Nhận message → dispatch tới đúng store

export const useWsStore = defineStore('ws', () => {
  const connected = ref(false)
  let ws: WebSocket | null = null

  function connect(url: string) {
    ws = new WebSocket(url)
    ws.onopen = () => {
      connected.value = true
    }
    ws.onclose = () => {
      connected.value = false
      scheduleReconnect()
    }
    ws.onmessage = (e) => handleMessage(JSON.parse(e.data))
  }

  function handleMessage(msg: WsMessage) {
    const deviceStore = useDeviceStore()
    const meshStore = useMeshStore()
    const systemStore = useSystemStore()

    switch (msg.type) {
      case 'STATE_UPDATE':
        deviceStore.applyServerUpdate(msg.payload)
        break
      case 'NODE_UPDATE':
        meshStore.updateNode(msg.payload)
        break
      case 'NODE_OFFLINE':
        meshStore.markOffline(msg.payload.addr)
        break
      case 'WIFI_STATUS':
        systemStore.wifi = msg.payload
        break
      case 'LOG':
        systemStore.pushLog(msg.payload)
        break
      case 'TASK_STATS':
        systemStore.tasks = msg.payload.tasks
        break
    }
  }

  function scheduleReconnect() {
    setTimeout(() => connect(WS_URL), 3000) // retry after 3s
  }

  return { connected, connect }
})
```

---

## 7. Cấu trúc thư mục Vue project

```
src/
├── main.ts                   Entry point — app init, plugin setup
├── App.vue                   App shell: NavBar + RouterView
│
├── types/                    TypeScript interfaces
│   ├── device.ts             DeviceState, RelayCommand
│   ├── mesh.ts               MeshNode, MeshNetwork
│   ├── system.ts             SystemInfo, TaskInfo, LogEntry
│   └── ws.ts                 WsMessage union type
│
├── services/                 Transport — không phụ thuộc Vue
│   ├── api.ts                fetch wrapper, base URL, error handling
│   └── websocket.ts          WS class, reconnect logic
│
├── composables/              Reusable logic hooks
│   ├── useApi.ts             loading/error state wrapper cho fetch
│   ├── useWebSocket.ts       connect, disconnect, onMessage
│   └── useToast.ts           global notification helper
│
├── stores/                   Pinia global state
│   ├── device.ts             DeviceState + commands
│   ├── mesh.ts               MeshNode list + commands
│   ├── system.ts             SystemInfo + WiFi + Tasks + Logs
│   ├── settings.ts           Device name, preferences
│   └── ws.ts                 WebSocket singleton + dispatch
│
├── router/
│   └── index.ts              Routes: /, /mesh, /scenes, /settings, /diagnostics
│
├── views/                    1 file per route
│   ├── DashboardView.vue
│   ├── MeshView.vue
│   ├── ScenesView.vue
│   ├── SettingsView.vue
│   └── DiagnosticsView.vue
│
├── components/
│   ├── layout/
│   │   ├── AppHeader.vue     Tên app, icon, notification bell
│   │   └── BottomNav.vue     Mobile bottom navigation bar
│   │
│   ├── device/
│   │   ├── RelayToggle.vue   Toggle button + label + loading state
│   │   ├── BrightnessSlider.vue
│   │   └── DeviceCard.vue    This-device card trên Dashboard
│   │
│   ├── mesh/
│   │   ├── NodeCard.vue      Card cho mỗi mesh node
│   │   ├── NodeDetailDrawer.vue  Slide-up detail + controls
│   │   └── NodeFilterBar.vue All/Online/Offline filter
│   │
│   ├── settings/
│   │   ├── WifiCard.vue      WiFi status + change button
│   │   ├── WifiScanner.vue   Scan result list + connect form
│   │   └── DeviceNameCard.vue
│   │
│   ├── scenes/
│   │   ├── SceneCard.vue     Scene item với activate/edit/delete
│   │   └── SceneEditor.vue   Create/edit scene form
│   │
│   ├── diagnostics/
│   │   ├── SystemInfoCard.vue
│   │   ├── TaskTable.vue     FreeRTOS task list
│   │   └── LogViewer.vue     Realtime log, auto-scroll, pause
│   │
│   └── common/
│       ├── StatusBadge.vue   ● Online / ○ Offline / ⚠ Warning
│       ├── LoadingSpinner.vue
│       ├── ConfirmDialog.vue Dangerous actions (Remove Node, Reset Mesh)
│       └── ToastNotification.vue
│
└── assets/
    ├── main.css              Global styles, CSS variables
    └── base.css              Reset, typography, color tokens
```

---

## 8. Build và nhúng vào Firmware

### 8.1 Build WebUI

```bash
cd /home/leslie/WS/rhophismarthomeWebUI

# Development mode — trỏ API tới IP của ESP32 thật
VITE_API_BASE=http://192.168.4.1 npm run dev

# Production build — output vào dist/
npm run build
```

`vite.config.ts` cần thêm config:

```typescript
export default defineConfig({
  // ...existing config
  base: '/', // Quan trọng: path trên ESP32
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Tối ưu size cho flash
    rollupOptions: {
      output: {
        manualChunks: undefined, // Single bundle cho ESP32
      },
    },
  },
  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify(process.env.VITE_API_BASE || ''),
    'import.meta.env.VITE_WS_URL': JSON.stringify(process.env.VITE_WS_URL || ''),
  },
})
```

### 8.2 Copy dist → Firmware project

```bash
# Script copy dist vào firmware
cp -r dist/* /home/leslie/WS/RhoPhi_Smart_Home_ESP32_FW/main/webui/

# Hoặc add vào CMakeLists.txt của firmware như EMBED_FILES
# hoặc copy vào LittleFS data folder
```

### 8.3 Cấu trúc trên Firmware side

```
Firmware project
└── data/                      ← LittleFS root (mount tại /spiffs)
    ├── index.html             ← Main app entry
    ├── assets/
    │   ├── index.[hash].js    ← Vue bundle
    │   └── index.[hash].css   ← Styles
    └── favicon.ico
```

WebServer Middleware trong firmware phục vụ:

- `GET /` → `index.html`
- `GET /assets/*` → file từ LittleFS
- `GET /api/*` → xử lý bởi handler C++
- `GET /ws` → WebSocket upgrade

### 8.4 Environment variables cho các môi trường

```bash
# .env.development  (npm run dev — trỏ tới ESP32 thật)
VITE_API_BASE=http://192.168.4.1
VITE_WS_URL=ws://192.168.4.1/ws

# .env.production  (npm run build — relative path vì cùng host)
VITE_API_BASE=
VITE_WS_URL=
```

Trong `src/services/api.ts`:

```typescript
const BASE = import.meta.env.VITE_API_BASE || window.location.origin
const WS = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws`
```

---

## 9. Quy tắc thiết kế UI

### 9.1 Design tokens (CSS variables)

```css
/* src/assets/base.css */
:root {
  /* Color — Dark theme (mặc định cho embedded) */
  --color-bg: #0f0f0f;
  --color-surface: #1a1a1a;
  --color-surface-2: #252525;
  --color-border: #2e2e2e;
  --color-primary: #4ade80; /* green — online/active */
  --color-danger: #f87171; /* red — offline/error */
  --color-warning: #fbbf24; /* amber — warning */
  --color-text: #f4f4f4;
  --color-text-muted: #888;

  /* Spacing */
  --space-xs: 4px;
  --space-s: 8px;
  --space-m: 16px;
  --space-l: 24px;
  --space-xl: 32px;

  /* Border radius */
  --radius-s: 8px;
  --radius-m: 12px;
  --radius-l: 20px;
}
```

### 9.2 Các nguyên tắc UX

| Nguyên tắc                          | Lý do                                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Optimistic UI**                   | Toggle relay ngay lập tức trên UI, rollback nếu API lỗi. Latency WiFi AP ~50ms nhưng cảm giác tức thì quan trọng hơn. |
| **Loading state rõ ràng**           | Mọi button sau khi nhấn phải disabled + spinner cho đến khi nhận xác nhận từ firmware.                                |
| **Offline detection**               | Khi WebSocket ngắt kết nối: hiện banner "Đang kết nối lại..." — không để user mất phương hướng.                       |
| **Confirm cho hành động nguy hiểm** | "Reset Mesh Network", "Remove Node", "Factory Reset" phải có ConfirmDialog, không để nhấn nhầm.                       |
| **Mobile-first layout**             | Bottom navigation bar, touch-friendly (min 44px tap target), không hover-dependent UI.                                |
| **Dark theme mặc định**             | Phòng tối, điện thoại ban đêm — dark theme giảm chói mắt khi cài đặt hệ thống.                                        |

---

## 10. Roadmap WebUI

### Phase 1 — Foundation (cần làm ngay)

- [ ] Setup router với 5 routes (Dashboard, Mesh, Scenes, Settings, Diagnostics)
- [ ] `AppHeader` và `BottomNav` responsive
- [ ] `deviceStore` + `GET /api/device/state` + `POST /api/device/relay`
- [ ] `RelayToggle` component với optimistic UI
- [ ] WebSocket connect + `STATE_UPDATE` → `deviceStore.applyServerUpdate()`
- [ ] `BrightnessSlider` + debounce (tránh spam API)
- [ ] CSS design tokens + dark theme

### Phase 2 — Mesh Management

- [ ] `meshStore` + `GET /api/mesh/nodes`
- [ ] `NodeCard` + `NodeDetailDrawer`
- [ ] `NodeFilterBar` (All/Online/Offline)
- [ ] Toggle node relay từ WebUI → `POST /api/mesh/node/:addr/relay`
- [ ] WebSocket `NODE_UPDATE` / `NODE_OFFLINE` → auto refresh UI
- [ ] Rename node

### Phase 3 — Settings & Diagnostics

- [ ] WiFi scan + connect UI
- [ ] WebSocket `WIFI_STATUS` → live feedback sau khi thay WiFi
- [ ] `DeviceNameCard` + save tới firmware
- [ ] `SystemInfoCard`, `TaskTable`
- [ ] `LogViewer` — realtime log stream qua WebSocket

### Phase 4 — Scenes & Polish

- [ ] `scenesStore` + CRUD scenes
- [ ] `SceneCard` + `SceneEditor`
- [ ] Activate scene → apply tất cả nodes
- [ ] Toast notifications (thành công / lỗi)
- [ ] `ConfirmDialog` cho destructive actions
- [ ] Bundle size optimization cho flash (< 500KB gzipped)
- [ ] PWA manifest (icon, theme color) cho "Add to Home Screen"

---

_Document: WEBUI-ARCH-001 v1.0.0 — RhoPhi Smart Home WebUI_  
_Xem thêm: [Data Management](../../RhoPhi_Smart_Home_ESP32_FW/docs/Implement/Data_Management.md) | [Firmware Architecture](../../RhoPhi_Smart_Home_ESP32_FW/docs/Implement/Software_Architecture.md)_
