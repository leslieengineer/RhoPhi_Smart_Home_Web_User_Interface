# Backend Data Architecture — RhoPhi Smart Home WebUI

---

| Field        | Value                                        |
| ------------ | -------------------------------------------- |
| Document ID  | WEBUI-DATA-001                               |
| Version      | 1.0.0                                        |
| Status       | Active                                       |
| Last Updated | 2026-02-21                                   |
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

interface DeviceState {
  relay_on: boolean // Trạng thái relay chính
  brightness: number // 0–100 (%)
  scene_id: number // 0 = no scene; >0 = active scene ID
}

// Persisted in NVS namespace "device_state"
// Keys: "relay_on" (bool), "brightness" (u8), "scene_id" (u32)
```

### 3.3 MeshNode

```typescript
// src/types/mesh.ts

type NodeModelType = 'onoff' | 'lightness' | 'switch' | 'unknown'
type NodeOnlineStatus = 'online' | 'offline' | 'provisioning'

interface MeshNode {
  // Identity — from BLE Mesh provisioning
  addr: string // "0x0010" — uint16_t unicast address
  uuid: string // 128-bit device UUID (hex string)
  name: string // user-defined name, persisted NVS "mesh_nodes"
  model_type: NodeModelType // type of peripheral server

  // Runtime state — updated via BLE Mesh messages
  status: NodeOnlineStatus
  relay_on: boolean
  brightness: number // 0–100, 0 if not applicable
  rssi: number | null // dBm, null if unknown
  last_seen_ms: number // uptime ms when last heard from

  // Computed / display
  last_seen_label: string // "Just now" | "2m ago" | "5h ago"
}

interface MeshNetwork {
  self_addr: string // Gateway's own unicast address
  node_count: number // total provisioned nodes
  online_count: number // nodes with status === 'online'
  nodes: MeshNode[]
}

// Persisted in NVS namespace "mesh_nodes"
// Keys: "node_count" (u8), "node_N_addr" (u32), "node_N_name" (string),
//       "node_N_model" (u8 enum), "node_N_uuid" (string)
// Note: online/rssi/last_seen are RAM-only (not persisted)
```

### 3.4 Scene

```typescript
// src/types/scene.ts

interface SceneTarget {
  addr: string // "0x0010" — which node this applies to
  relay_on: boolean
  brightness: number // 0–100
}

interface Scene {
  id: number // auto-increment, persisted
  name: string // user-defined
  targets: SceneTarget[] // per-node state snapshot
  created_at: number // unix timestamp (seconds)
}

// Persisted in NVS namespace "scenes"
// Keys: "scene_count" (u8)
//       "scene_N_name" (string), "scene_N_count" (u8 — number of targets)
//       "scene_N_T_M_addr" (u32), "scene_N_T_M_relay" (bool), "scene_N_T_M_bright" (u8)
//       "scene_N_ts" (u32 — created_at)
// Max scenes: 10 (NVS key length ≤ 15 chars constraint)
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
├── namespace: "device_state"                                                    ⚠️ Gap G2
│   ├── key: "relay_on"        type: bool    → DeviceState.relay_on
│   ├── key: "brightness"      type: u8      → DeviceState.brightness
│   └── key: "scene_id"        type: u32     → DeviceState.scene_id
│
├── namespace: "mesh_nodes"                                                      ⚠️ Gap G4
│   ├── key: "node_count"      type: u8      → MeshNetwork.node_count
│   ├── key: "node_0_addr"     type: u32     → MeshNode.addr (as uint16)
│   ├── key: "node_0_name"     type: string  → MeshNode.name
│   ├── key: "node_0_model"    type: u8      → MeshNode.model_type (enum)
│   ├── key: "node_0_uuid"     type: string  → MeshNode.uuid
│   ├── key: "node_1_addr"     type: u32
│   ├── key: "node_1_name"     type: string
│   ├── ... (up to node_15, tối đa 16 nodes)
│   └── [note: online/rssi/last_seen không lưu — RAM only]
│
├── namespace: "scenes"                                                          ⚠️ Gap G3
│   ├── key: "scene_count"     type: u8      → số scenes đã tạo
│   ├── key: "s0_name"         type: string  → Scene[0].name
│   ├── key: "s0_ts"           type: u32     → Scene[0].created_at
│   ├── key: "s0_tgt_count"    type: u8      → số targets trong Scene[0]
│   ├── key: "s0t0_addr"       type: u32     → Scene[0].targets[0].addr
│   ├── key: "s0t0_relay"      type: bool    → Scene[0].targets[0].relay_on
│   ├── key: "s0t0_bright"     type: u8      → Scene[0].targets[0].brightness
│   ├── key: "s0t1_addr"       type: u32
│   ├── ... (max 10 scenes × 16 targets = 160 target-sets)
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
  node_N_field   → node_0_addr, node_0_name  (max node index: 15)
  sNtM_field     → s0t0_relay                (scene N, target M)
  s_N_field      → scene_N_name sẽ quá 15 chars → dùng: sN_name
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
  "relay_on": true,
  "brightness": 75,
  "scene_id": 2
}
```

---

### 5.5 `GET /api/mesh/nodes`

```json
{
  "self_addr": "0x0001",
  "node_count": 4,
  "online_count": 3,
  "nodes": [
    {
      "addr": "0x0010",
      "uuid": "a4e57c0000000010",
      "name": "Living Room Light",
      "model_type": "lightness",
      "status": "online",
      "relay_on": true,
      "brightness": 80,
      "rssi": -52,
      "last_seen_ms": 1200
    },
    {
      "addr": "0x0011",
      "uuid": "a4e57c0000000011",
      "name": "Bedroom Switch",
      "model_type": "onoff",
      "status": "online",
      "relay_on": false,
      "brightness": 0,
      "rssi": -68,
      "last_seen_ms": 3400
    },
    {
      "addr": "0x0012",
      "uuid": "a4e57c0000000012",
      "name": "Kitchen Light",
      "model_type": "lightness",
      "status": "offline",
      "relay_on": false,
      "brightness": 0,
      "rssi": null,
      "last_seen_ms": 320000
    }
  ]
}
```

---

### 5.6 `GET /api/scenes`

```json
{
  "scenes": [
    {
      "id": 1,
      "name": "Morning Routine",
      "created_at": 1708473600,
      "targets": [
        { "addr": "0x0010", "relay_on": true, "brightness": 80 },
        { "addr": "0x0011", "relay_on": true, "brightness": 0 },
        { "addr": "0x0012", "relay_on": true, "brightness": 60 }
      ]
    },
    {
      "id": 2,
      "name": "Night Mode",
      "created_at": 1708473700,
      "targets": [
        { "addr": "0x0010", "relay_on": true, "brightness": 20 },
        { "addr": "0x0011", "relay_on": false, "brightness": 0 },
        { "addr": "0x0012", "relay_on": true, "brightness": 15 }
      ]
    }
  ]
}
```

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
    { "namespace": "device_state", "key": "relay_on", "type": "bool", "value": "true", "size": 1 },
    { "namespace": "device_state", "key": "brightness", "type": "u8", "value": "75", "size": 1 },
    { "namespace": "device_state", "key": "scene_id", "type": "u32", "value": "2", "size": 4 },
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
  | { type: 'STATE_UPDATE'; payload: DeviceState }
  | { type: 'NODE_UPDATE'; payload: MeshNode }
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
// Khi user toggle relay từ WebUI, firmware xác nhận và push về:
{ "type": "STATE_UPDATE", "payload": { "relay_on": true, "brightness": 75, "scene_id": 0 } }

// Node heartbeat mất → firmware push:
{ "type": "NODE_OFFLINE", "payload": { "addr": "0x0012", "last_seen_ms": 320000 } }

// Node state thay đổi (do user điều khiển từ switch vật lý):
{ "type": "NODE_UPDATE", "payload": {
    "addr": "0x0010", "name": "Living Room", "model_type": "lightness",
    "status": "online", "relay_on": false, "brightness": 0,
    "rssi": -55, "last_seen_ms": 100
}}

// Log stream:
{ "type": "LOG", "payload": { "level": "INFO", "tag": "_sys", "msg": "WiFi connected", "ts": 12340 } }

// WiFi connect result (async, sau POST /api/wifi/connect):
{ "type": "WIFI_CONNECT_RESULT", "payload": { "success": true, "ip": "192.168.1.105" } }
```

---

## 7. Luồng dữ liệu theo từng màn hình UI

### 7.1 Dashboard — boot sequence

```
1. App.vue mounted()
   → wsStore.connect("ws://192.168.4.1/ws")
   → deviceStore.fetchState()     → GET /api/device/state
   → systemStore.fetchInfo()      → GET /api/system/info
   → meshStore.fetchNodes()       → GET /api/mesh/nodes
   → systemStore.fetchWifi()      → GET /api/wifi/status

2. WebSocket established
   → WS push STATE_UPDATE  → deviceStore.applyServerUpdate()
   → WS push NODE_UPDATE   → meshStore.updateNode()
   → WS push WIFI_STATUS   → systemStore.wifi = payload

3. User nhấn Relay toggle
   → deviceStore.setRelay(true)   → POST /api/device/relay {state:true}
     [optimistic: store.relay_on = true ngay]
   → Firmware xử lý → push WS STATE_UPDATE {relay_on: true}
     [confirm: không cần rollback vì WS xác nhận]
```

### 7.2 Mesh View — load + realtime

```
1. MeshView.vue mounted()
   → meshStore.fetchNodes()  →  GET /api/mesh/nodes
   → hiển thị tất cả NodeCards từ meshStore.nodesArray

2. Realtime (WebSocket đã connected từ App.vue)
   → WS NODE_UPDATE  → meshStore.updateNode(payload)  → NodeCard re-render
   → WS NODE_OFFLINE → meshStore.markOffline(addr)    → NodeCard shows offline badge

3. Toggle node relay
   → meshStore.toggleNode("0x0010", true)  →  POST /api/mesh/node/0x0010/relay
     [optimistic: cập nhật Map ngay]
   → Firmware gửi relay command qua BLE Mesh → đợi ack → push WS NODE_UPDATE

4. Rename node
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

### 8.2 MeshNode struct (cần implement)

```cpp
// domain/mesh/mesh_node.hpp — cần tạo
#define MAX_MESH_NODES 16
#define MAX_NODE_NAME  32

enum class NodeModelType : uint8_t {
    Unknown   = 0,
    OnOff     = 1,
    Lightness = 2,
    Switch    = 3,
};

struct MeshNode {
    uint16_t     unicast_addr;              // BLE Mesh address
    char         uuid[33];                  // 16-byte UUID as hex string
    char         name[MAX_NODE_NAME];       // user-defined name (NVS persisted)
    NodeModelType model_type;               // (NVS persisted)

    // Runtime — RAM only, not persisted
    bool         online;
    bool         relay_on;
    uint8_t      brightness;                // 0–100
    int8_t       rssi;                      // dBm; 0 = unknown
    int64_t      last_seen_us;              // esp_timer_get_time() when last heard
};

class MeshNodeDB {
public:
    static MeshNodeDB* getInstance();

    bool        addNode(const MeshNode& node);
    bool        removeNode(uint16_t addr);
    MeshNode*   findNode(uint16_t addr);
    void        updateState(uint16_t addr, bool relay_on, uint8_t brightness, int8_t rssi);
    void        markOffline(uint16_t addr);
    uint8_t     nodeCount()   const;
    uint8_t     onlineCount() const;

    // NVS persistence
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

    // Serialize device state
    static std::string deviceState(bool relay_on, uint8_t brightness, uint32_t scene_id);

    // Serialize mesh nodes
    static std::string meshNodes(const MeshNode* nodes, uint8_t count,
                                  uint16_t self_addr);

    // Serialize single node (for WebSocket push)
    static std::string meshNodeUpdate(const MeshNode& node);

    // Serialize scenes
    static std::string sceneList(const Scene* scenes, uint8_t count);

    // Serialize WiFi status
    static std::string wifiStatus(bool connected, const char* ssid,
                                   const char* ip, int8_t rssi, uint8_t channel);

    // Serialize WiFi scan result
    static std::string wifiScanResult(const wifi_ap_record_t* aps, uint16_t count);

    // Serialize NVS entries (diagnostics)
    static std::string nvsEntries();
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

| Resource                                 | Giá trị               | Hệ quả                            |
| ---------------------------------------- | --------------------- | --------------------------------- |
| Free DRAM heap                           | ~150–200KB            | JSON buffer: max 4KB per response |
| JSON cJSON node                          | ~40 bytes/node        | 50 fields → ~2KB                  |
| MeshNodeDB (16 nodes)                    | ~16 × ~100B = ~1.6KB  | OK                                |
| SceneList (10 scenes × 16 targets)       | ~10 × 16 × 12B = ~2KB | OK                                |
| Log circular buffer (200 entries × 120B) | ~24KB                 | Giới hạn còn lại ~180B/entry      |

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
- [ ] `GET /api/device/state` + `POST /api/device/relay` + `POST /api/device/brightness`
- [ ] `NvsDeviceStateRepository` implement (Gap G2)
- [ ] WebSocket push `STATE_UPDATE` khi relay/brightness thay đổi
- [ ] `System::deviceName` persist vào NVS (Gap G1)
- [ ] WebSocket push `LOG` events khi client subscribe

**Phase 2 — Mesh data**

- [ ] `MeshNode` struct + `MeshNodeDB` class (Gap G4)
- [ ] `GET /api/mesh/nodes` — serialize toàn bộ MeshNodeDB
- [ ] `POST /api/mesh/node/:addr/relay` — gửi BLE Mesh message
- [ ] `POST /api/mesh/node/:addr/name` — rename + save NVS
- [ ] `DELETE /api/mesh/node/:addr` — deprovision + remove từ DB
- [ ] WebSocket push `NODE_UPDATE` khi nhận BLE Mesh callback
- [ ] WebSocket push `NODE_OFFLINE` khi timeout heartbeat

**Phase 3 — Settings & Scenes**

- [ ] `GET /api/wifi/status` + `GET /api/wifi/scan` + `POST /api/wifi/connect`
- [ ] WebSocket push `WIFI_CONNECT_RESULT` + `WIFI_STATUS`
- [ ] `Scene` struct + `NvsSceneRepository` (Gap G3)
- [ ] `GET /api/scenes` + `POST /api/scenes` + `POST /api/scenes/:id/activate`
- [ ] `DELETE /api/scenes/:id`
- [ ] `GET /api/diagnostics/nvs` — NVS iterator

### Frontend (WebUI) — mapping với backend

| Frontend Store       | Backend Phase | API endpoint                  |
| -------------------- | ------------- | ----------------------------- |
| `systemStore.info`   | Phase 1       | `GET /api/system/info`        |
| `systemStore.heap`   | Phase 1       | `GET /api/diagnostics/system` |
| `systemStore.tasks`  | Phase 1       | `GET /api/diagnostics/tasks`  |
| `systemStore.logs`   | Phase 1       | WS `LOG` events               |
| `deviceStore.state`  | Phase 1       | `GET /api/device/state`       |
| `meshStore.nodes`    | Phase 2       | `GET /api/mesh/nodes`         |
| `systemStore.wifi`   | Phase 3       | `GET /api/wifi/status`        |
| `scenesStore.scenes` | Phase 3       | `GET /api/scenes`             |

---

_Document: WEBUI-DATA-001 v1.0.0 — RhoPhi Smart Home WebUI Backend Data Architecture_  
_Xem thêm: [WebUI Architecture](./WebUI_Architecture.md) | [Firmware Data Management](../../RhoPhi_Smart_Home_ESP32_FW/docs/Implement/Data_Management.md)_
