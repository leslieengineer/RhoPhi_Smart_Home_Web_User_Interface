# Backend Data Architecture — RhoPhi Smart Home WebUI

---

| Field        | Value                                        |
| ------------ | -------------------------------------------- |
| Document ID  | WEBUI-DATA-001                               |
| Version      | 1.1.0                                        |
| Status       | Active                                       |
| Last Updated | 2026-02-28                                   |
| Relates to   | WEBUI-ARCH-001, IMPL-DATA-001, IMPL-ARCH-001 |

---

## Table of Contents

1. [Tổng quan — Backend là gì trong hệ thống này](#1-tổng-quan--backend-là-gì-trong-hệ-thống-này)
2. [Nguồn dữ liệu — Data Sources Inventory](#2-nguồn-dữ-liệu--data-sources-inventory)
3. [Data Models — Schema định nghĩa tất cả entities](#3-data-models--schema-định-nghĩa-tất-cả-entities)
4. [NVS Storage Layout — Persistent data mapping](#4-nvs-storage-layout--persistent-data-mapping)
5. [API Response Mapping — Firmware → JSON → WebUI](#5-api-response-mapping--firmware--json--webui)
6. [WebSocket Event Schema — Push data format](#6-websocket-event-schema--push-data-format)
7. [Luồng dữ liệu theo từng màn hình UI](#7-luồng-dữ-liệu-theo-từng-màn-hình-ui)
8. [Firmware C++ Data Structures](#8-firmware-c-data-structures)
9. [Constraints và giới hạn của ESP32](#9-constraints-và-giới-hạn-của-esp32)
10. [Implementation Checklist](#10-implementation-checklist)

---

## 1. Tổng quan — Backend là gì trong hệ thống này

### Không có "server" truyền thống

Trong project này, **không có** Node.js / Python / SQL Server nào cả. Firmware ESP32 **chính là backend**:

```
┌──────────────────────────────────────────────────────────────────────┐
│                      ESP32 Firmware = Backend                        │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │   "Database" = NVS Flash Partition (key-value persistent)      │  │
│  │   namespace "system"  │ "device_state" │ "mesh_nodes" │ ...    │  │
│  └──────────────────┬─────────────────────────────────────────────┘  │
│                     │ load on boot / save on change                   │
│  ┌──────────────────▼─────────────────────────────────────────────┐  │
│  │   "RAM Database" = C++ Domain Objects (runtime state)          │  │
│  │   System{} │ DeviceState{} │ MeshNodeDB{} │ SceneList{}        │  │
│  └──────────────────┬─────────────────────────────────────────────┘  │
│                     │ serialized to JSON on demand                    │
│  ┌──────────────────▼─────────────────────────────────────────────┐  │
│  │   "API Layer" = HTTP WebServer + WebSocket                     │  │
│  │   GET /api/...  │  POST /api/...  │  ws://192.168.4.1/ws       │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                              │ JSON over WiFi
┌─────────────────────────────▼────────────────────────────────────────┐
│                      WebUI (Vue 3 / Pinia)                           │
│   Pinia Stores = Client-side cache / mirror của firmware state       │
└──────────────────────────────────────────────────────────────────────┘
```

**Hai tầng lưu trữ:**

| Tầng            | Công nghệ             | Vai trò              | Lifetime              |
| --------------- | --------------------- | -------------------- | --------------------- |
| **Persistent**  | ESP-IDF NVS (flash)   | Sống qua reboot      | Vĩnh viễn đến khi xóa |
| **Runtime RAM** | C++ objects trên heap | State đang hoạt động | Tắt nguồn → mất       |

---

## 2. Nguồn dữ liệu — Data Sources Inventory

Mỗi thông tin hiển thị trên WebUI đến từ một nguồn cụ thể trong firmware:

### 2.1 Dashboard — nguồn từ đâu?

| UI Element                           | Nguồn trong Firmware                        | Persist?                  | Cập nhật qua                |
| ------------------------------------ | ------------------------------------------- | ------------------------- | --------------------------- |
| WiFi status (Connected/Disconnected) | `System::sysWifiConnState`                  | ❌ RAM                    | WS push `WIFI_STATUS`       |
| WiFi SSID đang kết nối               | `wifi->getConnectedSSID()`                  | ✅ NVS `"wifi"` namespace | REST `GET /api/wifi/status` |
| WiFi signal (RSSI)                   | `wifi->getRSSI()`                           | ❌ RAM                    | REST (poll mỗi 10s)         |
| Mesh: số nodes / online              | `MeshNodeDB::nodeCount()` / `onlineCount()` | ✅ NVS `"mesh_nodes"`     | WS push `NODE_UPDATE`       |
| Relay state (this device)            | `DeviceState::relay_on`                     | ✅ NVS `"device_state"`   | WS push `STATE_UPDATE`      |
| Brightness (this device)             | `DeviceState::brightness`                   | ✅ NVS `"device_state"`   | WS push `STATE_UPDATE`      |
| **Channel states (this device)**     | `DeviceManager::channels[]`                 | ✅ NVS `"dev_ch"` ns      | WS push `STATE_UPDATE` / `CHANNEL_UPDATE` |
| Active Scene                         | `DeviceState::scene_id`                     | ✅ NVS `"device_state"`   | WS push `STATE_UPDATE`      |

### 2.2 Mesh View — nguồn từ đâu?

| UI Element           | Nguồn trong Firmware     | Persist?                | Cập nhật qua                          |
| -------------------- | ------------------------ | ----------------------- | ------------------------------------- |
| Danh sách nodes      | `MeshNodeDB::nodes[]`    | ✅ NVS `"mesh_nodes"`   | REST `GET /api/mesh/nodes`            |
| Tên node             | `MeshNode::name`         | ✅ NVS `"mesh_nodes"`   | REST `POST /api/mesh/node/:addr/name` |
| BLE address          | `MeshNode::unicast_addr` | ✅ NVS (BLE mesh stack) | Readonly                              |
| Online/Offline       | `MeshNode::online`       | ❌ RAM (heartbeat)      | WS push `NODE_OFFLINE`                |
| Relay state của node | `MeshNode::relay_on`     | ✅ NVS `"mesh_nodes"`   | WS push `NODE_UPDATE`                 |
| Brightness của node  | `MeshNode::brightness`   | ✅ NVS `"mesh_nodes"`   | WS push `NODE_UPDATE`                 |
| **Channel states**   | `MeshNode::channels[]`   | ✅ NVS `"mesh_nodes"`   | WS push `NODE_UPDATE` / `CHANNEL_UPDATE` |
| **Channel count**    | `MeshNode::channel_count`| ✅ NVS (from Composition Data) | Readonly sau provision        |
| RSSI của node        | `MeshNode::rssi`         | ❌ RAM                  | WS push `NODE_UPDATE`                 |
| Last seen timestamp  | `MeshNode::last_seen_ms` | ❌ RAM                  | WS push `NODE_OFFLINE`                |
| Model (OnOff/Light)  | `MeshNode::model_type`   | ✅ NVS `"mesh_nodes"`   | Readonly sau provision                |

### 2.3 Settings — nguồn từ đâu?

| UI Element            | Nguồn trong Firmware               | Persist?                       | Cập nhật qua                     |
| --------------------- | ---------------------------------- | ------------------------------ | -------------------------------- |
| Device name           | `System::deviceName`               | ✅ NVS `"system"/"deviceName"` | REST `POST /api/settings/device` |
| Device ID (MAC)       | `System::getDeviceID()` ← từ eFuse | ❌ Hardware                    | REST `GET /api/system/info`      |
| Firmware version      | `APP_VERSION` define               | ❌ Compile-time                | REST `GET /api/system/info`      |
| WiFi scan list        | `wifi->scan()`                     | ❌ RAM (temporary)             | REST `GET /api/wifi/scan`        |
| Mesh unicast addr     | BLE mesh stack                     | ✅ BLE mesh NVS partition      | REST `GET /api/mesh/info`        |
| Mesh net key (masked) | BLE mesh stack                     | ✅ BLE mesh NVS partition      | REST `GET /api/mesh/info`        |

### 2.4 Diagnostics — nguồn từ đâu?

| UI Element                 | Nguồn trong Firmware                                                  | API                           |
| -------------------------- | --------------------------------------------------------------------- | ----------------------------- |
| Free heap                  | `esp_get_free_heap_size()`                                            | `GET /api/diagnostics/system` |
| Min free heap ever         | `heap_caps_get_minimum_free_size(MALLOC_CAP_DEFAULT)`                 | `GET /api/diagnostics/system` |
| Largest free block         | `heap_caps_get_largest_free_block(MALLOC_CAP_DEFAULT)`                | `GET /api/diagnostics/system` |
| Uptime                     | `esp_timer_get_time() / 1000000`                                      | `GET /api/diagnostics/system` |
| Boot count                 | `System::bootCount` (NVS `"system"/"bootCount"`)                      | `GET /api/diagnostics/system` |
| Chip model                 | `esp_chip_info()`                                                     | `GET /api/system/info`        |
| IDF version                | `esp_get_idf_version()`                                               | `GET /api/system/info`        |
| Reset reason               | `esp_reset_reason_to_name()`                                          | `GET /api/system/info`        |
| Task list                  | `uxTaskGetNumberOfTasks()` + `uxTaskGetStackHighWaterMark()` per task | `GET /api/diagnostics/tasks`  |
| Task name                  | `pcTaskGetName(taskHandle)`                                           | `GET /api/diagnostics/tasks`  |
| Task priority              | `uxTaskPriorityGet(taskHandle)`                                       | `GET /api/diagnostics/tasks`  |
| Task stack high water mark | `uxTaskGetStackHighWaterMark(taskHandle)`                             | `GET /api/diagnostics/tasks`  |
| System log                 | `System::routeLogByValue()`                                           | WS stream `LOG` events        |
| NVS keys                   | `nvs_iterator` API                                                    | `GET /api/diagnostics/nvs`    |

---

## 3. Data Models — Schema định nghĩa tất cả entities

### 3.1 SystemInfo

```typescript
// src/types/system.ts

interface SystemInfo {
  // Firmware identity
  version: string // "1.2.0"  ← APP_VERSION
  build_date: string // "2026-02-21"
  idf_version: string // "v5.5.1"

  // Hardware
  chip_model: string // "ESP32-WROOM-32"
  chip_revision: number // 3
  mac: string // "A4:E5:7C:12:34:56"
  device_id: string // "A4E57C123456"  ← derived from MAC
  device_name: string // "RhoPhi_Gateway_1"

  // Runtime stats
  uptime_s: number // seconds since boot
  boot_count: number // from NVS "system/bootCount"
  reset_reason: string // "POWERON" | "SW" | "TASK_WDT" | ...
  cpu_freq_mhz: number // 240
}

interface HeapInfo {
  free_heap: number // bytes — esp_get_free_heap_size()
  min_free_heap: number // bytes — all-time minimum since boot
  largest_free_block: number // bytes — largest contiguous free block
  total_heap: number // bytes — total DRAM heap
  // All values in bytes; UI converts to KB
}

interface TaskInfo {
  name: string // pcTaskGetName()
  priority: number // uxTaskPriorityGet()
  stack_hwm: number // words — uxTaskGetStackHighWaterMark()
  stack_hwm_bytes: number // hwm * 4 (bytes)
  state: 'RUN' | 'RDY' | 'BLK' | 'SUS' | 'DEL'
}

// Known tasks in this firmware (for display order in UI):
// ipc0, ipc1, esp_timer, tmr_svc, tiT (TCP/IP),
// sys_evt, wifi, SystemRun, SystemGPIO, SystemTimer,
// IndRun (WS2812), SNTPRun, main, IDLE0, IDLE1
```

### 3.2 DeviceState

```typescript
// src/types/device.ts
// v1.1.0: Multi-channel model

type ChannelType = 'onoff' | 'dimmer' | 'level' | 'rgb' | 'sensor'

interface Channel {
  index: number
  type: ChannelType
  name: string        // User-editable ("Đèn phòng khách")
  on: boolean
  brightness: number  // 0-100 (meaningful for dimmer/level only)
}

interface DeviceState {
  product: string       // "RhoPhi Switch 2G"
  product_id: string    // "SW2G"
  device_name: string   // User-editable device name
  channel_count: number
  channels: Channel[]   // ← NEW (v1.1.0): per-channel state
  scene_id: number      // 0 = no scene; >0 = active scene ID

  // Legacy compat (maps to channels[0]):
  relay_on?: boolean
  brightness?: number
}

// Persisted in NVS:
//   namespace "dev_state": "product", "ch_count", "chN_on", "chN_level", "chN_name", "chN_type"
//   namespace "dev_ch": "ch_count" (u8), "ch0_on" (bool), "ch0_bri" (u8),
//                       "ch0_name" (string), "ch0_type" (u8), "ch1_on", ...
```

> **Backward compat:** Frontend `normalizeDeviceState()` converts legacy flat `{relay_on, brightness}`
> responses into `channels[0]` automatically. See [MESH-DEV-001 §10.3](../../docs/Mesh/Devices.md).

### 3.3 MeshNode

```typescript
// src/types/mesh.ts
// v1.1.0: Multi-channel per remote node

type NodeModelType = 'onoff' | 'lightness' | 'switch' | 'unknown'
type NodeOnlineStatus = 'online' | 'offline' | 'provisioning'

interface NodeChannel {
  index: number
  type: ChannelType       // reuse from device.ts
  name: string
  on: boolean
  brightness: number
  element_addr: string    // BLE Mesh element unicast address ("0x0011")
}

interface MeshNode {
  // Identity — from BLE Mesh provisioning
  addr: string              // "0x0010" — primary unicast address
  uuid: string              // 128-bit device UUID (hex string)
  name: string              // user-defined name, persisted NVS
  product_id: string        // "SW2G", "DM1G" — identifies product variant
  model_type: NodeModelType // Kept for backward compat

  // Multi-channel state (v1.1.0)
  channel_count: number
  channels: NodeChannel[]   // ← NEW: per-channel state

  // Runtime state
  status: NodeOnlineStatus
  rssi: number | null       // dBm, null if unknown
  last_seen_ms: number      // uptime ms when last heard from

  // Legacy compat (maps to channels[0]):
  relay_on: boolean
  brightness: number

  // Computed / display
  last_seen_label: string
}

interface MeshNetwork {
  self_addr: string
  node_count: number
  online_count: number
  nodes: MeshNode[]
}

// Persisted in NVS namespace "mesh_nodes":
//   "node_count" (u8), "node_N_addr" (u32), "node_N_name" (string),
//   "node_N_model" (u8), "node_N_uuid" (string), "node_N_chcnt" (u8)
// Note: online/rssi/last_seen are RAM-only (not persisted)
// Channel count + types inferred from BLE Mesh Composition Data at provision time
```

> **How gateway knows node channels:** After provisioning, gateway sends `Config Composition Data Get`
> to each node. The response lists BLE Mesh elements + SIG models → maps to `channel_count` + `ChannelType`.
> See [MESH-DEV-001 §10.11](../../docs/Mesh/Devices.md).

### 3.4 Scene

```typescript
// src/types/scene.ts
// v1.1.0: Multi-channel scene snapshots

interface SceneChannelSnapshot {
  index: number
  on: boolean
  brightness: number
}

interface SceneTarget {
  addr: string                        // "0x0010" — which node
  channels: SceneChannelSnapshot[]    // ← NEW: per-channel state for this node
  // Legacy compat:
  relay_on?: boolean
  brightness?: number
}

interface SceneLocalSnapshot {
  channels: SceneChannelSnapshot[]    // ← NEW: local device channel states
}

interface Scene {
  id: number
  name: string
  targets: SceneTarget[]              // Remote mesh node targets
  local_channels?: SceneLocalSnapshot // ← NEW: local device channels in scene
  created_at: number                  // unix timestamp (seconds)
}

// Persisted in NVS namespace "scenes"
// Keys: "scene_count" (u8)
//       "sN_name" (string), "sN_ts" (u32), "sN_tgt_count" (u8)
//       "sNtM_addr" (u32), "sNtM_chcnt" (u8)
//       "sNtMcK_on" (bool), "sNtMcK_bri" (u8)  — K = channel index
//       "sN_lch_cnt" (u8), "sNlcK_on" (bool), "sNlcK_bri" (u8) — local channels
// Max scenes: 10, max targets per scene: 16, max channels per target: 4
```

### 3.5 WiFiInfo

```typescript
// src/types/wifi.ts

interface WifiNetwork {
  ssid: string
  rssi: number // dBm
  secure: boolean // has password
  channel: number
}

interface WifiStatus {
  connected: boolean
  ssid: string | null // null if disconnected
  ip: string | null // "192.168.1.105"
  rssi: number | null // dBm
  channel: number | null
  gateway: string | null // "192.168.1.1"
}
```

### 3.6 LogEntry

```typescript
// src/types/system.ts (continued)

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

interface LogEntry {
  id: number // auto-increment client-side (for Vue key)
  level: LogLevel
  msg: string
  tag: string // e.g. "_sys", "wifi", "nvs"
  ts: number // uptime milliseconds from firmware
  ts_label: string // formatted: "00:02:34.123"
}
// Circular buffer: max 200 entries in LogViewer store
```

### 3.7 NvsEntry (Diagnostics)

```typescript
interface NvsEntry {
  namespace: string // "system" | "device_state" | "mesh_nodes" | ...
  key: string // "bootCount" | "relay_on" | ...
  type: 'u8' | 'u32' | 'i32' | 'bool' | 'string' | 'blob'
  value: string // always string representation
  size: number // bytes
}
```

---

## 4. NVS Storage Layout — Persistent data mapping

### Toàn bộ NVS layout với key ≤ 15 chars (ESP-IDF constraint)

```
NVS Flash Partition (default_nvs)
│
├── namespace: "system"
│   ├── key: "bootCount"       type: u32     → SystemInfo.boot_count
│   ├── key: "runStackSizeK"   type: u8      → (internal) System run task stack
│   ├── key: "gpioStackSizeK"  type: u8      → (internal) GPIO task stack
│   ├── key: "timerStackSizeK" type: u8      → (internal) Timer task stack
│   └── key: "deviceName"      type: string  → SystemInfo.device_name          ⚠️ Gap G1
│
├── namespace: "dev_state"                                                       ⚠️ Gap G2
│   ├── key: "product"         type: string  → DeviceState.product  (e.g. "SW-2CH-N")
│   ├── key: "ch_count"        type: u8      → DeviceState.channel_count (1–6)
│   ├── key: "scene_id"        type: u32     → DeviceState.scene_id
│   │
│   │   ── Per-channel (N = 0 … ch_count-1) ──
│   ├── key: "chN_name"        type: string  → channels[N].name  (e.g. "Đèn chính")
│   ├── key: "chN_type"        type: u8      → channels[N].type  (0=onoff, 1=dimmer)
│   ├── key: "chN_on"          type: bool    → channels[N].on
│   └── key: "chN_level"       type: u8      → channels[N].level (0–100, dimmer only)
│
├── namespace: "mesh_nodes"                                                      ⚠️ Gap G4
│   ├── key: "node_count"      type: u8      → MeshNetwork.node_count
│   ├── key: "n0_addr"         type: u32     → MeshNode.addr (as uint16)
│   ├── key: "n0_name"         type: string  → MeshNode.name
│   ├── key: "n0_model"        type: u8      → MeshNode.model_type (enum)
│   ├── key: "n0_uuid"         type: string  → MeshNode.uuid
│   ├── key: "n0_prodid"       type: string  → MeshNode.product_id  (e.g. "SW-2CH-N")
│   ├── key: "n0_chcnt"        type: u8      → MeshNode.channel_count
│   │   ── Per-channel (K = 0 … n0_chcnt-1) ──
│   ├── key: "n0c0_name"       type: string  → MeshNode.channels[0].name
│   ├── key: "n0c0_type"       type: u8      → MeshNode.channels[0].type
│   ├── key: "n0c1_name"       type: string  → MeshNode.channels[1].name
│   ├── ... (up to node_15, mỗi node tối đa 6 channels)
│   └── [note: online/rssi/last_seen không lưu — RAM only; on/level cũng RAM only]
│
├── namespace: "scenes"                                                          ⚠️ Gap G3
│   ├── key: "scene_count"     type: u8      → số scenes đã tạo
│   ├── key: "s0_name"         type: string  → Scene[0].name
│   ├── key: "s0_ts"           type: u32     → Scene[0].created_at
│   ├── key: "s0_tgt_count"    type: u8      → số targets trong Scene[0]
│   ├── key: "s0t0_addr"       type: u32     → Scene[0].targets[0].addr
│   ├── key: "s0t0_chcnt"      type: u8      → targets[0].channels.length
│   │   ── Per-channel snapshot (K = 0 … s0t0_chcnt-1) ──
│   ├── key: "s0t0c0_on"       type: bool    → targets[0].channels[0].on
│   ├── key: "s0t0c0_lvl"      type: u8      → targets[0].channels[0].level
│   ├── key: "s0t0c1_on"       type: bool    → targets[0].channels[1].on
│   ├── ... (max 10 scenes × 16 targets × 6 channels)
│   └── [note: key length: "s9t15c5_on" = 10 chars → ≤ 15 OK]
│
├── namespace: "wifi"          (internal — wifi middleware manages this)
│   └── [SSID, password, provisioning — do not touch from app layer]
│
├── namespace: "sntp"          (internal — sntp middleware manages this)
│   └── [timezone, NTP server]
│
├── namespace: "indication"    (internal — indication middleware manages this)
│   └── [LED pattern, brightness config]
│
└── namespace: "nvs.net80211"  (ESP-IDF BLE Mesh stack — DO NOT TOUCH)
    └── [NetKey, AppKey, provisioning DB, unicast addresses]
```

### NVS key naming convention

```
Quy tắc đặt tên key (NVS limit: 15 chars):
  chN_field      → ch0_on, ch2_level         (local device channel N)
  nN_field       → n0_addr, n0_name          (mesh node N config)
  nNcK_field     → n0c0_name, n0c1_type      (mesh node N, channel K config)
  sNtM_field     → s0t0_addr                 (scene N, target M)
  sNtMcK_field   → s0t0c0_on, s0t0c1_lvl    (scene N, target M, channel K)
  [note: "s9t15c5_on" = 10 chars, "n15c5_name" = 10 chars → well within 15 limit]
```

---

## 5. API Response Mapping — Firmware → JSON → WebUI

### 5.1 `GET /api/system/info`

Nguồn firmware: `System::getSystemInfo()` (cần implement)

```json
{
  "version": "1.2.0",
  "build_date": "2026-02-21",
  "idf_version": "v5.5.1",
  "chip_model": "ESP32-WROOM-32",
  "chip_revision": 3,
  "mac": "A4:E5:7C:12:34:56",
  "device_id": "A4E57C123456",
  "device_name": "RhoPhi_Gateway_1",
  "uptime_s": 87345,
  "boot_count": 47,
  "reset_reason": "POWERON",
  "cpu_freq_mhz": 240
}
```

Firmware C++ sources:

```cpp
// Tổng hợp từ nhiều IDF APIs:
esp_chip_info_t chip; esp_chip_info(&chip);
esp_get_idf_version()               → idf_version
esp_timer_get_time() / 1000000ULL   → uptime_s
System::bootCount                   → boot_count (NVS)
System::getDeviceID()               → device_id, mac
esp_reset_reason()                  → reset_reason
APP_VERSION define                  → version
```

---

### 5.2 `GET /api/diagnostics/system`

```json
{
  "free_heap": 142560,
  "min_free_heap": 98304,
  "largest_free_block": 65536,
  "total_heap": 327680,
  "uptime_s": 87345
}
```

Firmware C++ sources:

```cpp
esp_get_free_heap_size()
heap_caps_get_minimum_free_size(MALLOC_CAP_DEFAULT)
heap_caps_get_largest_free_block(MALLOC_CAP_DEFAULT)
heap_caps_get_total_size(MALLOC_CAP_INTERNAL)
esp_timer_get_time() / 1000000ULL
```

---

### 5.3 `GET /api/diagnostics/tasks`

Nguồn: `System::printTaskInfo()` — đã implement, cần thêm JSON output

```json
{
  "tasks": [
    { "name": "ipc0", "priority": 24, "stack_hwm": 512, "state": "BLK" },
    { "name": "ipc1", "priority": 24, "stack_hwm": 512, "state": "BLK" },
    { "name": "esp_timer", "priority": 22, "stack_hwm": 1024, "state": "BLK" },
    { "name": "tmr_svc", "priority": 1, "stack_hwm": 2048, "state": "BLK" },
    { "name": "tiT", "priority": 18, "stack_hwm": 1536, "state": "BLK" },
    { "name": "sys_evt", "priority": 20, "stack_hwm": 1024, "state": "BLK" },
    { "name": "wifi", "priority": 23, "stack_hwm": 2176, "state": "BLK" },
    { "name": "SystemRun", "priority": 5, "stack_hwm": 1843, "state": "RUN" },
    { "name": "SystemGPIO", "priority": 4, "stack_hwm": 415, "state": "BLK" },
    { "name": "SystemTimer", "priority": 3, "stack_hwm": 312, "state": "BLK" },
    { "name": "IndRun", "priority": 4, "stack_hwm": 512, "state": "BLK" },
    { "name": "SNTPRun", "priority": 5, "stack_hwm": 768, "state": "BLK" },
    { "name": "main", "priority": 1, "stack_hwm": 512, "state": "BLK" },
    { "name": "IDLE0", "priority": 0, "stack_hwm": 256, "state": "RDY" },
    { "name": "IDLE1", "priority": 0, "stack_hwm": 256, "state": "RDY" }
  ]
}
```

---

### 5.4 `GET /api/device/state`

```json
{
  "product": "RhoPhi Switch 2G",
  "product_id": "SW2G",
  "device_name": "RhoPhi Gateway",
  "channel_count": 2,
  "channels": [
    { "index": 0, "type": "onoff", "name": "Switch 1", "on": true, "brightness": 100 },
    { "index": 1, "type": "onoff", "name": "Switch 2", "on": false, "brightness": 0 }
  ],
  "scene_id": 2,
  "relay_on": true,
  "brightness": 100
}
```

> **v1.1.0:** Response now includes `channels[]` array. Legacy `relay_on`/`brightness` kept for backward compat (maps to channels[0]).

---

### 5.5 `GET /api/mesh/nodes`

```json
{
  "self_addr": "0x0001",
  "node_count": 3,
  "online_count": 2,
  "nodes": [
    {
      "addr": "0x0010",
      "uuid": "a4e57c0000000010",
      "name": "Living Room Light",
      "product_id": "SW2G",
      "model_type": "onoff",
      "status": "online",
      "channel_count": 2,
      "channels": [
        { "index": 0, "type": "onoff", "name": "Switch 1", "on": true, "brightness": 100,
          "element_addr": "0x0010" },
        { "index": 1, "type": "onoff", "name": "Switch 2", "on": false, "brightness": 0,
          "element_addr": "0x0011" }
      ],
      "rssi": -52,
      "last_seen_ms": 1200,
      "relay_on": true,
      "brightness": 100
    },
    {
      "addr": "0x0012",
      "uuid": "a4e57c0000000012",
      "name": "Bedroom Dimmer",
      "product_id": "DM1G",
      "model_type": "lightness",
      "status": "online",
      "channel_count": 1,
      "channels": [
        { "index": 0, "type": "dimmer", "name": "Dimmer 1", "on": true, "brightness": 60,
          "element_addr": "0x0012" }
      ],
      "rssi": -65,
      "last_seen_ms": 800,
      "relay_on": true,
      "brightness": 60
    },
    {
      "addr": "0x0014",
      "uuid": "a4e57c0000000014",
      "name": "Kitchen Light",
      "product_id": "SW1G",
      "model_type": "onoff",
      "status": "offline",
      "channel_count": 1,
      "channels": [
        { "index": 0, "type": "onoff", "name": "Switch 1", "on": false, "brightness": 0,
          "element_addr": "0x0014" }
      ],
      "rssi": null,
      "last_seen_ms": 320000,
      "relay_on": false,
      "brightness": 0
    }
  ]
}
```

> **v1.1.0:** Each node now has `channels[]`, `channel_count`, `product_id`. Legacy flat `relay_on/brightness` kept for backward compat.

---

### 5.6 `GET /api/scenes`

```json
{
  "scenes": [
    {
      "id": 1,
      "name": "Morning Routine",
      "created_at": 1708473600,
      "local_channels": {
        "channels": [
          { "index": 0, "on": true, "brightness": 100 },
          { "index": 1, "on": true, "brightness": 100 }
        ]
      },
      "targets": [
        {
          "addr": "0x0010",
          "channels": [
            { "index": 0, "on": true, "brightness": 100 },
            { "index": 1, "on": false, "brightness": 0 }
          ]
        },
        {
          "addr": "0x0012",
          "channels": [
            { "index": 0, "on": true, "brightness": 60 }
          ]
        }
      ]
    },
    {
      "id": 2,
      "name": "Night Mode",
      "created_at": 1708473700,
      "local_channels": {
        "channels": [
          { "index": 0, "on": false, "brightness": 0 },
          { "index": 1, "on": false, "brightness": 0 }
        ]
      },
      "targets": [
        {
          "addr": "0x0010",
          "channels": [
            { "index": 0, "on": true, "brightness": 20 },
            { "index": 1, "on": false, "brightness": 0 }
          ]
        },
        {
          "addr": "0x0012",
          "channels": [
            { "index": 0, "on": true, "brightness": 15 }
          ]
        }
      ]
    }
  ]
}
```

> **v1.1.0:** Scene targets now snapshot **per-channel** state. `local_channels` included for local device.
> Legacy `relay_on/brightness` per target deprecated.

---

### 5.7 `GET /api/wifi/status`

```json
{
  "connected": true,
  "ssid": "RhoPhi_Home",
  "ip": "192.168.1.105",
  "gateway": "192.168.1.1",
  "rssi": -48,
  "channel": 6
}
```

---

### 5.8 `GET /api/wifi/scan`

```json
{
  "networks": [
    { "ssid": "RhoPhi_Home", "rssi": -42, "secure": true, "channel": 6 },
    { "ssid": "MyHomeWifi", "rssi": -58, "secure": true, "channel": 11 },
    { "ssid": "Neighbor_5G", "rssi": -71, "secure": true, "channel": 3 },
    { "ssid": "OpenNetwork", "rssi": -75, "secure": false, "channel": 1 }
  ]
}
```

---

### 5.9 `GET /api/diagnostics/nvs`

```json
{
  "entries": [
    { "namespace": "system", "key": "bootCount", "type": "u32", "value": "47", "size": 4 },
    { "namespace": "system", "key": "runStackSizeK", "type": "u8", "value": "8", "size": 1 },
    { "namespace": "system", "key": "gpioStackSizeK", "type": "u8", "value": "5", "size": 1 },
    { "namespace": "system", "key": "timerStackSizeK", "type": "u8", "value": "4", "size": 1 },
    {
      "namespace": "system",
      "key": "deviceName",
      "type": "string",
      "value": "RhoPhi_Gateway_1",
      "size": 16
    },
    { "namespace": "dev_state", "key": "product", "type": "string", "value": "SW-2CH-D", "size": 8 },
    { "namespace": "dev_state", "key": "ch_count", "type": "u8", "value": "2", "size": 1 },
    { "namespace": "dev_state", "key": "ch0_on", "type": "bool", "value": "true", "size": 1 },
    { "namespace": "dev_state", "key": "ch0_level", "type": "u8", "value": "80", "size": 1 },
    { "namespace": "dev_state", "key": "ch0_name", "type": "string", "value": "Đèn chính", "size": 12 },
    { "namespace": "dev_state", "key": "ch0_type", "type": "u8", "value": "1", "size": 1 },
    { "namespace": "dev_state", "key": "ch1_on", "type": "bool", "value": "false", "size": 1 },
    { "namespace": "dev_state", "key": "ch1_level", "type": "u8", "value": "0", "size": 1 },
    { "namespace": "mesh_nodes", "key": "node_count", "type": "u8", "value": "3", "size": 1 },
    {
      "namespace": "mesh_nodes",
      "key": "node_0_name",
      "type": "string",
      "value": "Living Room Light",
      "size": 18
    }
  ]
}
```

---

## 6. WebSocket Event Schema — Push data format

### Tất cả event types

```typescript
// Firmware → WebUI (push on state change)
type FirmwareToWebEvent =
  | { type: 'STATE_UPDATE'; payload: DeviceState }        // DeviceState now has channels[] (v1.1.0)
  | { type: 'NODE_UPDATE'; payload: MeshNode }            // MeshNode now has channels[] (v1.1.0)
  | { type: 'CHANNEL_UPDATE'; payload: {                  // ← NEW (v1.1.0): fine-grained single-channel push
      source: 'local' | 'mesh'
      addr?: string              // Mesh node addr (omitted for local)
      channel: Channel           // Updated channel state
    }}
  | { type: 'NODE_OFFLINE'; payload: { addr: string; last_seen_ms: number } }
  | { type: 'WIFI_STATUS'; payload: WifiStatus }
  | { type: 'LOG'; payload: LogEntry }
  | { type: 'TASK_STATS'; payload: { tasks: TaskInfo[] } } // every 5s if client subscribed
  | { type: 'HEAP_STATS'; payload: HeapInfo } // every 5s if client subscribed
  | { type: 'WIFI_CONNECT_RESULT'; payload: { success: boolean; ip?: string; error?: string } }
  | {
      type: 'SCENE_ACTIVATED'
      payload: { scene_id: number; results: { addr: string; ok: boolean }[] }
    }
  | { type: 'PONG' }

// WebUI → Firmware (optional subscriptions)
type WebToFirmwareEvent =
  | { type: 'SUBSCRIBE_LOG'; enabled: boolean }
  | { type: 'SUBSCRIBE_TASKS'; enabled: boolean } // pull task stats periodically
  | { type: 'PING' }
```

### Ví dụ payload thực tế

```json
// Khi boot hoặc bất kỳ channel nào thay đổi — firmware push toàn bộ DeviceState:
{ "type": "STATE_UPDATE", "payload": {
    "product": "SW-2CH-D", "channel_count": 2, "scene_id": 0,
    "channels": [
      { "index": 0, "name": "Đèn chính", "type": "dimmer", "on": true,  "level": 80 },
      { "index": 1, "name": "Đèn phụ",   "type": "dimmer", "on": false, "level": 0  }
    ]
}}

// Fine-grained: chỉ 1 channel local thay đổi (toggle từ nút vật lý):
{ "type": "CHANNEL_UPDATE", "payload": {
    "source": "local",
    "channel": { "index": 0, "name": "Đèn chính", "type": "dimmer", "on": true, "level": 80 }
}}

// Node heartbeat mất → firmware push:
{ "type": "NODE_OFFLINE", "payload": { "addr": "0x0012", "last_seen_ms": 320000 } }

// Node state thay đổi (toàn bộ node info, bao gồm channels):
{ "type": "NODE_UPDATE", "payload": {
    "addr": "0x0010", "name": "Living Room", "product_id": "SW-3CH-N",
    "channel_count": 3, "status": "online", "rssi": -55, "last_seen_ms": 100,
    "channels": [
      { "index": 0, "name": "Công tắc 1", "type": "onoff",  "on": true,  "level": 100 },
      { "index": 1, "name": "Công tắc 2", "type": "onoff",  "on": false, "level": 0   },
      { "index": 2, "name": "Đèn dim",    "type": "dimmer", "on": true,  "level": 65  }
    ]
}}

// Fine-grained: 1 channel trên mesh node thay đổi:
{ "type": "CHANNEL_UPDATE", "payload": {
    "source": "mesh", "addr": "0x0010",
    "channel": { "index": 2, "name": "Đèn dim", "type": "dimmer", "on": true, "level": 65 }
}}

// Log stream:
{ "type": "LOG", "payload": { "level": "INFO", "tag": "_sys", "msg": "WiFi connected", "ts": 12340 } }

// WiFi connect result (async, sau POST /api/wifi/connect):
{ "type": "WIFI_CONNECT_RESULT", "payload": { "success": true, "ip": "192.168.1.105" } }

// Scene activated → per-channel results:
{ "type": "SCENE_ACTIVATED", "payload": {
    "scene_id": 1,
    "results": [
      { "addr": "local", "ok": true },
      { "addr": "0x0010", "ok": true },
      { "addr": "0x0012", "ok": false }
    ]
}}
```

---

## 7. Luồng dữ liệu theo từng màn hình UI

### 7.1 Dashboard — boot sequence

```
1. App.vue mounted()
   → wsStore.connect("ws://192.168.4.1/ws")
   → deviceStore.fetchState()     → GET /api/device/state
       (response chứa product, channel_count, channels[])
   → systemStore.fetchInfo()      → GET /api/system/info
   → meshStore.fetchNodes()       → GET /api/mesh/nodes
   → systemStore.fetchWifi()      → GET /api/wifi/status

2. WebSocket established
   → WS push STATE_UPDATE   → deviceStore.applyServerUpdate()
       (cập nhật toàn bộ channels[])
   → WS push CHANNEL_UPDATE → deviceStore.updateChannel(payload.channel)
       (cập nhật đúng 1 channel theo index — fine-grained)
   → WS push NODE_UPDATE    → meshStore.updateNode()
   → WS push WIFI_STATUS    → systemStore.wifi = payload

3. User nhấn toggle trên ChannelCard (channel 0)
   → deviceStore.setChannelState(0, true)
     → POST /api/device/channel/0/state {on: true}
     [optimistic: channels[0].on = true ngay]
   → Firmware xử lý → push WS CHANNEL_UPDATE {source:"local", channel:{index:0, on:true, ...}}
     [confirm: store đã đúng, không cần rollback]

4. User kéo slider trên ChannelCard (channel 1, dimmer)
   → deviceStore.setChannelLevel(1, 75)
     → POST /api/device/channel/1/level {level: 75}
     [optimistic: channels[1].level = 75 ngay]
   → Firmware xử lý → push WS CHANNEL_UPDATE {source:"local", channel:{index:1, level:75, ...}}
```

### 7.2 Mesh View — load + realtime

```
1. MeshView.vue mounted()
   → meshStore.fetchNodes()  →  GET /api/mesh/nodes
   → hiển thị tất cả NodeCards từ meshStore.nodesArray
     (mỗi NodeCard render N ChannelCards theo node.channels[])

2. Realtime (WebSocket đã connected từ App.vue)
   → WS NODE_UPDATE    → meshStore.updateNode(payload)  → NodeCard re-render toàn bộ channels
   → WS CHANNEL_UPDATE → meshStore.updateNodeChannel(addr, ch)  → chỉ 1 ChannelCard re-render
   → WS NODE_OFFLINE   → meshStore.markOffline(addr)    → NodeCard shows offline badge

3. Toggle node channel (e.g. channel 1 trên node 0x0010)
   → meshStore.toggleNodeChannel("0x0010", 1, true)
     →  POST /api/mesh/node/0x0010/channel/1/state {on: true}
     [optimistic: cập nhật channels[1].on ngay]
   → Firmware gửi relay command qua BLE Mesh → đợi ack
     → push WS CHANNEL_UPDATE {source:"mesh", addr:"0x0010", channel:{index:1, on:true,...}}

4. Adjust node channel brightness (channel 2, dimmer)
   → meshStore.setNodeChannelLevel("0x0010", 2, 65)
     →  POST /api/mesh/node/0x0010/channel/2/level {level: 65}
     [optimistic: cập nhật channels[2].level ngay]
   → Firmware gửi level command → đợi ack → push WS CHANNEL_UPDATE

5. Rename node
   → POST /api/mesh/node/0x0010/name {name: "Phòng khách"}
   → 200 OK → meshStore.updateNode({addr: "0x0010", name: "Phòng khách"})
   → NVS saved by firmware in "mesh_nodes" namespace
```

### 7.3 Settings — WiFi change (async flow)

```
1. User nhấn [Scan]
   → GET /api/wifi/scan  (có thể mất 2–3 giây, show spinner)
   → nhận { networks: [...] }  → hiển thị danh sách

2. User chọn network + nhập password → [Connect]
   → POST /api/wifi/connect { ssid: "NewNetwork", password: "..." }
   → Firmware trả 200 { status: "connecting" } ngay  (async!)
   → WebUI show "Đang kết nối..." với loading indicator

3. Firmware thử kết nối WiFi (mất 5–15s)
   → Thành công: push WS WIFI_CONNECT_RESULT { success: true, ip: "..." }
                 + push WS WIFI_STATUS { connected: true, ssid: "NewNetwork", ... }
   → Thất bại:   push WS WIFI_CONNECT_RESULT { success: false, error: "AUTH_FAIL" }

4. WebUI nhận WS event → toast notification
   [⚠️ Nếu mất kết nối AP trong lúc đổi WiFi → WS ngắt → WebUI tự reconnect sau 3s]
```

### 7.4 Diagnostics — realtime log

```
1. DiagnosticsView.vue mounted()
   → systemStore.fetchInfo()        → GET /api/diagnostics/system
   → systemStore.fetchTasks()       → GET /api/diagnostics/tasks
   → wsStore.send({ type: 'SUBSCRIBE_LOG', enabled: true })
   → wsStore.send({ type: 'SUBSCRIBE_TASKS', enabled: true })

2. Firmware bắt đầu push LOG events theo từng log entry
   → WS LOG event → systemStore.pushLog(payload) → LogViewer re-render

3. Firmware push TASK_STATS mỗi 5 giây (khi được subscribe)
   → WS TASK_STATS → systemStore.tasks = payload.tasks → TaskTable re-render

4. DiagnosticsView.vue beforeUnmount()
   → wsStore.send({ type: 'SUBSCRIBE_LOG',   enabled: false })
   → wsStore.send({ type: 'SUBSCRIBE_TASKS', enabled: false })
   [giải phóng, firmware không push nữa]
```

---

## 8. Firmware C++ Data Structures

Các struct này cần được định nghĩa trong firmware để map trực tiếp thành JSON responses:

### 8.1 SystemInfo struct (cần implement)

```cpp
// main/include/system_defs.hpp — thêm vào
struct SYS_InfoResponse {
    char   version[16];          // APP_VERSION
    char   build_date[16];       // __DATE__
    char   idf_version[16];      // esp_get_idf_version()
    char   chip_model[24];       // "ESP32-WROOM-32"
    uint8_t chip_revision;       // esp_chip_info().revision
    char   mac[18];              // "A4:E5:7C:12:34:56"
    char   device_id[13];        // "A4E57C123456"
    char   device_name[32];      // System::deviceName
    uint32_t uptime_s;           // esp_timer_get_time() / 1e6
    uint32_t boot_count;         // System::bootCount
    char   reset_reason[16];     // esp_reset_reason_to_name()
    uint32_t cpu_freq_mhz;       // CONFIG_ESP32_DEFAULT_CPU_FREQ_MHZ
};

struct SYS_HeapResponse {
    uint32_t free_heap;
    uint32_t min_free_heap;
    uint32_t largest_free_block;
    uint32_t total_heap;
    uint32_t uptime_s;
};

struct SYS_TaskInfoItem {
    char     name[16];
    uint32_t priority;
    uint32_t stack_hwm;          // words
    uint32_t stack_hwm_bytes;    // hwm * 4
    uint8_t  state;              // eTaskState enum
};
```

### 8.2 Channel + MeshNode structs (cần implement)

```cpp
// domain/peripheral/channel.hpp — cần tạo
#define MAX_CHANNELS_PER_DEVICE 6
#define MAX_CHANNEL_NAME 24

enum class ChannelType : uint8_t {
    OnOff  = 0,   // simple relay — toggle only
    Dimmer = 1,   // relay + brightness 0–100
};

struct Channel {
    uint8_t      index;                       // 0-based channel index
    char         name[MAX_CHANNEL_NAME];      // user-defined name (NVS persisted)
    ChannelType  type;                        // NVS persisted
    bool         on;                          // runtime state (NVS persisted for local device)
    uint8_t      level;                       // 0–100, meaningful for Dimmer only (NVS persisted for local)
};

// domain/mesh/mesh_node.hpp — cần tạo
#define MAX_MESH_NODES 16
#define MAX_NODE_NAME  32

struct MeshNode {
    uint16_t     unicast_addr;                // BLE Mesh address
    char         uuid[33];                    // 16-byte UUID as hex string
    char         name[MAX_NODE_NAME];         // user-defined name (NVS persisted)
    char         product_id[16];              // e.g. "SW-3CH-N" (NVS persisted)
    uint8_t      channel_count;               // 1–6 (NVS persisted, discovered via Composition Data)

    // Per-channel state — up to MAX_CHANNELS_PER_DEVICE
    Channel      channels[MAX_CHANNELS_PER_DEVICE];

    // Runtime — RAM only, not persisted
    bool         online;
    int8_t       rssi;                        // dBm; 0 = unknown
    int64_t      last_seen_us;                // esp_timer_get_time() when last heard
};

class MeshNodeDB {
public:
    static MeshNodeDB* getInstance();

    bool        addNode(const MeshNode& node);
    bool        removeNode(uint16_t addr);
    MeshNode*   findNode(uint16_t addr);

    // Per-channel state updates
    void        updateChannelState(uint16_t addr, uint8_t ch_index, bool on, uint8_t level, int8_t rssi);
    void        updateAllChannels(uint16_t addr, const Channel* channels, uint8_t count, int8_t rssi);

    void        markOffline(uint16_t addr);
    uint8_t     nodeCount()   const;
    uint8_t     onlineCount() const;

    // NVS persistence (config only: addr, name, uuid, product_id, channel_count, channel names/types)
    void        loadFromNVS();
    void        saveToNVS();

private:
    MeshNode    nodes_[MAX_MESH_NODES];
    uint8_t     count_ = 0;
};
```

### 8.3 JSON Serializer (cần implement)

```cpp
// middleware/webserver/json_serializer.hpp — cần tạo
// Dùng cJSON (đã có trong ESP-IDF) hoặc ArduinoJson

#include "cJSON.h"

class JsonSerializer {
public:
    // Serialize SystemInfo
    static std::string systemInfo(const SYS_InfoResponse& info);

    // Serialize HeapInfo
    static std::string heapInfo(const SYS_HeapResponse& heap);

    // Serialize task list
    static std::string taskList(const SYS_TaskInfoItem* tasks, uint8_t count);

    // Serialize device state (multi-channel — v1.1.0)
    static std::string deviceState(const char* product, uint8_t channel_count,
                                    const Channel* channels, uint32_t scene_id);

    // Serialize single channel (for CHANNEL_UPDATE WS push — v1.1.0)
    static std::string channelUpdate(const char* source, const char* addr,
                                      const Channel& channel);

    // Serialize mesh nodes (multi-channel — v1.1.0)
    static std::string meshNodes(const MeshNode* nodes, uint8_t count,
                                  uint16_t self_addr);

    // Serialize single node (for NODE_UPDATE WS push — multi-channel)
    static std::string meshNodeUpdate(const MeshNode& node);

    // Serialize scenes (multi-channel snapshots — v1.1.0)
    static std::string sceneList(const Scene* scenes, uint8_t count);

    // Serialize WiFi status
    static std::string wifiStatus(bool connected, const char* ssid,
                                   const char* ip, int8_t rssi, uint8_t channel);

    // Serialize WiFi scan result
    static std::string wifiScanResult(const wifi_ap_record_t* aps, uint16_t count);

    // Serialize NVS entries (diagnostics)
    static std::string nvsEntries();

private:
    // Helper: serialize Channel array → cJSON array (v1.1.0)
    static cJSON* channelsToJson(const Channel* channels, uint8_t count);
};
```

---

## 9. Constraints và giới hạn của ESP32

### 9.1 NVS constraints

| Constraint           | Giá trị           | Hệ quả                                                        |
| -------------------- | ----------------- | ------------------------------------------------------------- |
| Key length max       | 15 chars          | Dùng tên ngắn: `"s0t0_relay"` thay `"scene_0_target_0_relay"` |
| Namespace length max | 15 chars          | OK: `"device_state"` = 12 chars                               |
| String value max     | 4000 bytes        | OK cho tên node/scene                                         |
| NVS partition size   | ~24KB (default)   | Max ~50 namespaces, ~500 keys tổng                            |
| Concurrent access    | Không thread-safe | Luôn dùng `semNVSEntry` semaphore trước khi open              |

### 9.2 RAM constraints

| Resource                                 | Giá trị                            | Hệ quả                            |
| ---------------------------------------- | ---------------------------------- | --------------------------------- |
| Free DRAM heap                           | ~150–200KB                         | JSON buffer: max 4KB per response |
| JSON cJSON node                          | ~40 bytes/node                     | 50 fields → ~2KB                  |
| Channel struct                           | ~32 bytes                          | 6 ch × 32B = ~192B per device     |
| MeshNodeDB (16 nodes × 6 ch)            | ~16 × (~80B + 6×32B) = ~4.4KB     | OK — fits in DRAM                 |
| SceneList (10 scenes × 16 targets × 6ch) | ~10 × 16 × (4B + 6×3B) = ~3.5KB  | OK                                |
| Log circular buffer (200 entries × 120B) | ~24KB                              | Giới hạn còn lại ~180B/entry      |

### 9.3 WebSocket constraints

| Constraint         | Recommendation                               |
| ------------------ | -------------------------------------------- |
| Frame size         | Max 1024 bytes per WS frame                  |
| Concurrent clients | Max 2 (một client WebUI)                     |
| LOG stream         | Chỉ push khi client subscribe — tránh spam   |
| TASK_STATS         | Push mỗi 5s, không realtime                  |
| NODE_UPDATE        | Push ngay khi có BLE message — critical path |

### 9.4 Flash / LittleFS constraints

| Resource           | Giá trị             | Hệ quả                                     |
| ------------------ | ------------------- | ------------------------------------------ |
| LittleFS partition | ~1MB (tùy cấu hình) | WebUI bundle phải < 800KB (gzipped ~200KB) |
| File count max     | ~50 files           | Vite build → dist/ thường 5–10 files       |
| Serving speed      | ~50KB/s qua WiFi AP | index.html phải < 20KB gzipped             |

---

## 10. Implementation Checklist

### Backend (Firmware) — thứ tự ưu tiên

**Phase 1 — Core data (làm ngay)**

- [ ] `struct SYS_InfoResponse` + `GET /api/system/info` handler
- [ ] `GET /api/diagnostics/system` (heap + uptime)
- [ ] `GET /api/diagnostics/tasks` — JSON wrapper cho `printTaskInfo()` đã có
- [ ] `Channel` struct + `ChannelType` enum (domain/peripheral/channel.hpp)
- [ ] `GET /api/device/state` — multi-channel response (product, channel_count, channels[])
- [ ] `POST /api/device/channel/:ch/state` — toggle single channel
- [ ] `POST /api/device/channel/:ch/level` — set dimmer level
- [ ] `NvsDeviceStateRepository` implement — per-channel keys: `chN_on`, `chN_level`, etc. (Gap G2)
- [ ] WebSocket push `STATE_UPDATE` (full state) + `CHANNEL_UPDATE` (single channel)
- [ ] `System::deviceName` persist vào NVS (Gap G1)
- [ ] WebSocket push `LOG` events khi client subscribe

**Phase 2 — Mesh data**

- [ ] `MeshNode` struct with `Channel channels[]` + `MeshNodeDB` class (Gap G4)
- [ ] Composition Data Get → discover `channel_count` + `product_id` of provisioned nodes
- [ ] `GET /api/mesh/nodes` — serialize toàn bộ MeshNodeDB (each node has channels[])
- [ ] `POST /api/mesh/node/:addr/channel/:ch/state` — gửi BLE Mesh per-channel command
- [ ] `POST /api/mesh/node/:addr/channel/:ch/level` — gửi BLE Mesh level command
- [ ] `POST /api/mesh/node/:addr/name` — rename + save NVS
- [ ] `DELETE /api/mesh/node/:addr` — deprovision + remove từ DB
- [ ] WebSocket push `NODE_UPDATE` (full node state) khi nhận BLE Mesh callback
- [ ] WebSocket push `CHANNEL_UPDATE` {source:"mesh"} cho fine-grained updates
- [ ] WebSocket push `NODE_OFFLINE` khi timeout heartbeat

**Phase 3 — Settings & Scenes**

- [ ] `GET /api/wifi/status` + `GET /api/wifi/scan` + `POST /api/wifi/connect`
- [ ] WebSocket push `WIFI_CONNECT_RESULT` + `WIFI_STATUS`
- [ ] `Scene` struct with `SceneChannelSnapshot[]` per target + `NvsSceneRepository` (Gap G3)
- [ ] `GET /api/scenes` — multi-channel scene response
- [ ] `POST /api/scenes` — create scene with per-channel snapshots
- [ ] `POST /api/scenes/:id/activate` — activate per-channel targets
- [ ] `DELETE /api/scenes/:id`
- [ ] `GET /api/diagnostics/nvs` — NVS iterator

### Frontend (WebUI) — mapping với backend

| Frontend Store             | Backend Phase | API endpoint                                |
| -------------------------- | ------------- | ------------------------------------------- |
| `systemStore.info`         | Phase 1       | `GET /api/system/info`                      |
| `systemStore.heap`         | Phase 1       | `GET /api/diagnostics/system`               |
| `systemStore.tasks`        | Phase 1       | `GET /api/diagnostics/tasks`                |
| `systemStore.logs`         | Phase 1       | WS `LOG` events                             |
| `deviceStore.state`        | Phase 1       | `GET /api/device/state` (channels[])        |
| `deviceStore.channelState` | Phase 1       | `POST /api/device/channel/:ch/state`        |
| `deviceStore.channelLevel` | Phase 1       | `POST /api/device/channel/:ch/level`        |
| `meshStore.nodes`          | Phase 2       | `GET /api/mesh/nodes` (each node.channels[])|
| `meshStore.nodeChannel`    | Phase 2       | `POST /api/mesh/node/:addr/channel/:ch/*`   |
| `systemStore.wifi`         | Phase 3       | `GET /api/wifi/status`                      |
| `scenesStore.scenes`       | Phase 3       | `GET /api/scenes` (per-channel snapshots)   |

---

_Document: WEBUI-DATA-001 v1.1.0 — RhoPhi Smart Home WebUI Backend Data Architecture (Multi-Channel)_  
_Xem thêm: [WebUI Architecture](./WebUI_Architecture.md) | [Firmware Data Management](../../RhoPhi_Smart_Home_ESP32_FW/docs/Implement/Data_Management.md)_
