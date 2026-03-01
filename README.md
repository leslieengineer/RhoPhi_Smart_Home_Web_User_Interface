# RhoPhi Smart Home — WebUI

> **Version:** 1.2.0 · **Status:** Active · **Last Updated:** 2026-03-01

WebUI cho hệ thống **RhoPhi Smart Home** chạy embedded trên ESP32, phục vụ qua WiFi SoftAP tại `http://192.168.4.1`. Đây là Git submodule của firmware repo [`RhoPhi_Smart_Home_ESP32_FW`](https://github.com/leslieengineer/RhoPhi_Smart_Home_ESP32_FW).

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Tech Stack](#2-tech-stack)
3. [Cấu trúc thư mục](#3-cấu-trúc-thư-mục)
4. [Cài đặt & Phát triển](#4-cài-đặt--phát-triển)
5. [Build & Deploy lên ESP32](#5-build--deploy-lên-esp32)
6. [Các màn hình (Views)](#6-các-màn-hình-views)
7. [Kiến trúc dữ liệu](#7-kiến-trúc-dữ-liệu)
8. [API Endpoints](#8-api-endpoints)
9. [WebSocket Events](#9-websocket-events)
10. [Environment Variables](#10-environment-variables)
11. [Linting & Formatting](#11-linting--formatting)
12. [Troubleshooting](#12-troubleshooting)
13. [Changelog](#13-changelog)
14. [Tài liệu tham khảo](#14-tài-liệu-tham-khảo)

---

## 1. Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Điện thoại / Laptop                                                        │
│                                                                             │
│    Browser → http://192.168.4.1                                             │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │  WiFi SoftAP (2.4 GHz)
                                 │  SSID: RhoPhi-XXXXXX
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ESP32-C6 (Gateway / Provisioner)                                           │
│                                                                             │
│  ┌──────────────┐   ┌───────────────────┐   ┌────────────────────────────┐ │
│  │  WiFi Driver │   │  HTTP WebServer    │   │  BLE Mesh Provisioner      │ │
│  │  SoftAP mode │◄──│  (esp_http_server) │   │  (ESP-BLE-MESH)            │ │
│  │  192.168.4.1 │   │  + WebSocket /ws  │   │  Manages node network      │ │
│  └──────────────┘   └───────────────────┘   └────────────────────────────┘ │
│                             │                            │                  │
│                      REST API + WS               BLE Mesh ADV               │
│                             │                            │                  │
│                      ┌──────▼────────┐          ┌───────▼──────────┐       │
│                      │ SPIFFS/LittleFS│          │  Node 1 (Switch) │       │
│                      │  index.html   │          │  Node 2 (Switch) │       │
│                      │  assets/      │          │  ...             │       │
│                      └───────────────┘          └──────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Mô hình deployment

- **Build time:** Vue 3 + Vite → `dist/` (HTML + CSS + JS, ~150 KB gzipped)
- **Flash time:** `dist/` được copy vào SPIFFS image → flash vào ESP32
- **Runtime:** ESP32 serve static files từ SPIFFS, REST API từ firmware C++, WebSocket push events realtime

### Phase Roadmap

```
Phase 1 (done): HTTP/WebUI local control                    ✅
Phase 2 (done): +BLE Mesh (provisioner + nodes)             ✅ v1.2.0
Phase 3 (next): +MQTT/Cloud gateway
Phase 4 (future): +Mobile App / OTA
```

---

## 2. Tech Stack

| Thành phần | Thư viện | Phiên bản |
|------------|----------|-----------|
| UI Framework | [Vue 3](https://vuejs.org/) (Composition API + `<script setup>`) | `^3.5.28` |
| Language | TypeScript | `~5.9.3` |
| Build Tool | [Vite](https://vite.dev/) | `^7.3.1` |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) (`@tailwindcss/vite`) | `^4.2.0` |
| State Management | [Pinia](https://pinia.vuejs.org/) | `^3.0.4` |
| Routing | [Vue Router](https://router.vuejs.org/) | `^5.0.2` |
| Type Check | `vue-tsc` | `^3.2.4` |
| Linting | ESLint + oxlint | `^9.39.2` / `~1.47.0` |
| Formatting | Prettier | `3.8.1` |

### Tại sao stack này cho ESP32?

- **Vite** → build output nhỏ, hash-only filenames (tránh SPIFFS path length limit)
- **Tailwind CSS v4** → purge tự động, chỉ output CSS được dùng → bundle nhỏ
- **Vue 3 Composition API** → code splitting tốt, tree-shaking hiệu quả
- **Pinia** → lightweight, TypeScript native
- **Dark theme** → mặc định, phù hợp dùng ban đêm trên điện thoại

---

## 3. Cấu trúc thư mục

```
web_src/
├── src/
│   ├── main.ts                  # App entry point — mount Vue app, init router + pinia
│   ├── App.vue                  # Root component — layout shell, BottomNav
│   │
│   ├── types/                   # TypeScript interfaces (no business logic)
│   │   ├── device.ts            # DeviceState, Channel
│   │   ├── mesh.ts              # MeshNode, MeshNetwork
│   │   ├── scene.ts             # Scene, SceneTarget, SceneChannelSnapshot
│   │   ├── system.ts            # SystemInfo, HeapInfo, TaskInfo, NvsEntry
│   │   ├── wifi.ts              # WifiStatus, WifiNetwork
│   │   └── ws.ts                # FirmwareEvent, ClientEvent (WebSocket types)
│   │
│   ├── services/
│   │   ├── api.ts               # REST API client — typed fetch wrappers
│   │   └── websocket.ts         # WebSocket service — connect/reconnect/typed events
│   │
│   ├── stores/                  # Pinia stores (state + actions)
│   │   ├── device.ts            # deviceStore — local device state, relay, brightness
│   │   ├── mesh.ts              # meshStore — node list, toggle, rename, remove
│   │   ├── scenes.ts            # scenesStore — CRUD scenes
│   │   ├── system.ts            # systemStore — info, heap, tasks, WiFi status
│   │   └── ws.ts                # wsStore — WebSocket connection state
│   │
│   ├── composables/             # Reusable Vue composition functions
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── RelayToggle.vue      # On/Off toggle button
│   │   │   ├── BrightnessSlider.vue # Brightness 0-100 slider
│   │   │   └── ConfirmDialog.vue    # Destructive action confirmation modal
│   │   ├── layout/                  # AppHeader, BottomNav, etc.
│   │   └── icons/                   # SVG icon components
│   │
│   ├── views/                   # Route-level page components
│   │   ├── DashboardView.vue    # Home: WiFi/Mesh status, local device control
│   │   ├── MeshView.vue         # Mesh node list, filter, search, detail drawer
│   │   ├── ScenesView.vue       # Scene list, create, activate, delete
│   │   ├── SettingsView.vue     # WiFi scan+connect, device name
│   │   ├── DiagnosticsView.vue  # Heap, tasks, NVS viewer
│   │   └── HomeView.vue         # Redirect/landing
│   │
│   ├── router/
│   │   └── index.ts             # Vue Router — 5 routes, lazy-loaded views
│   │
│   └── assets/                  # Static assets (images, fonts)
│
├── public/                      # Files copied as-is to dist/ root
├── dist/                        # Build output → copied to ESP32 SPIFFS
│
├── docsWeb/                     # Architecture & API documentation
│   ├── WebUI_Architecture.md    # UI design, screen wireframes, roadmap
│   ├── WebUI_Backend_Data.md    # Data models, API schema, WebSocket events
│   └── WebUI_Implementation.md  # Implementation guide, build process, troubleshooting
│
├── deploy_webui.sh              # Build + copy dist → SPIFFS image folder
├── vite.config.ts               # Vite config — hash-only filenames for SPIFFS
├── tsconfig.json                # TypeScript config root
├── tsconfig.app.json            # App TypeScript config
├── tsconfig.node.json           # Node TypeScript config (vite.config.ts)
├── eslint.config.ts             # ESLint flat config
├── .oxlintrc.json               # oxlint config
└── .prettierrc.json             # Prettier config
```

---

## 4. Cài đặt & Phát triển

### Yêu cầu hệ thống

| Dependency | Phiên bản tối thiểu | Cách cài |
|------------|--------------------|-----------| 
| Node.js | `^20.19.0` hoặc `>=22.12.0` | [nodejs.org](https://nodejs.org/) hoặc `nvm` |
| npm | `>=10` | Đi kèm Node.js |
| Git | bất kỳ | `sudo apt install git` |

### Cài dependencies

```sh
cd web_src
npm install
```

### Chạy dev server (hot-reload)

```sh
npm run dev
```

Dev server khởi động tại `http://localhost:5173`. Proxy API calls tới ESP32 thật bằng cách set `VITE_API_BASE`:

```sh
# Trỏ API về ESP32 thật (kết nối WiFi AP của board)
VITE_API_BASE=http://192.168.4.1 VITE_WS_URL=ws://192.168.4.1/ws npm run dev
```

Hoặc tạo file `.env.local`:

```env
VITE_API_BASE=http://192.168.4.1
VITE_WS_URL=ws://192.168.4.1/ws
```

### Type-check

```sh
npm run type-check
```

---

## 5. Build & Deploy lên ESP32

### Build only

```sh
npm run build
# Output: dist/
```

Build output (v1.2.0 verified):

```
dist/index.html             0.42 kB │ gzip:  0.28 kB
dist/assets/CX4MGlJz.css   27.52 kB │ gzip:  5.66 kB
dist/assets/D_FzhMDT.js   120.97 kB │ gzip: 46.63 kB
✓ 60 modules transformed, built in 4.21s
```

> **Tại sao filename là hash?** Vite config dùng `entryFileNames: 'assets/[hash].js'` để tránh SPIFFS path-length limit. Xem [`vite.config.ts`](./vite.config.ts).

### Deploy script (build + copy → SPIFFS image)

```sh
# Build WebUI + copy vào SPIFFS image folder
./deploy_webui.sh

# Build WebUI + copy + rebuild firmware + flash
./deploy_webui.sh --flash

# Flash lên port khác
PORT=/dev/ttyACM2 ./deploy_webui.sh --flash
```

Script sẽ thực hiện 3 bước:

1. Chạy `npm run build` → tạo `dist/`
2. Copy `dist/*` → `middleware/services/webserver_5.2/spiffs_image/`
3. *(Nếu `--flash`)* Chạy `idf.py build && idf.py flash`

### Manual deploy

```sh
# 1. Build
npm run build

# 2. Copy dist vào SPIFFS image folder
SPIFFS_DIR="../middleware/services/webserver_5.2/spiffs_image"
rm -rf "$SPIFFS_DIR" && mkdir -p "$SPIFFS_DIR"
cp -r dist/* "$SPIFFS_DIR/"

# 3. Build + flash firmware (từ root firmware repo)
cd ..
source /home/leslie/esp/v5.5.3/esp-idf/export.sh
idf.py -DDEVICE_PROFILE_SELECT=GATEWAY build
idf.py -p /dev/ttyACM2 flash
```

### Flash scripts nhanh (từ firmware root)

```sh
./flash_provisioner.sh    # Provisioner/Gateway (ttyACM2)
./flash_node.sh           # Nodes (ttyACM0, ttyACM1)
```

---

## 6. Các màn hình (Views)

### Dashboard (`/`)

Status tổng quan + điều khiển thiết bị local:

```
┌─────────────────────────────┐
│  📶 WiFi     🔗 BLE Mesh    │  ← Status cards (SSID, RSSI, node count)
│  Connected   2/2 Online     │
├─────────────────────────────┤
│  💡 This Device             │  ← Local relay toggle (optimistic UI)
│  [  ON  ]  ████░░ 80%       │     + Brightness slider (debounced)
├─────────────────────────────┤
│  🌐 Mesh Nodes              │
│  Node1 0x0005  ●  [  ON  ] │  ← Top 3 nodes, link → MeshView
│  Node2 0x0006  ●  [ OFF  ] │
└─────────────────────────────┘
```

**Stores:** `deviceStore`, `meshStore`, `systemStore`

---

### Mesh (`/mesh`)

Quản lý tất cả BLE Mesh nodes:

```
┌─────────────────────────────┐
│  🔍 Search...  [All▾]       │  ← Search by name/addr + filter (All/Online/Offline)
├─────────────────────────────┤
│  ● Node1  0x0005  12s ago   │
│    [  ON  ]  ████░░ 80%     │  ← NodeCard: relay toggle + brightness
│    RSSI: -65 dBm  ████░     │     Click → detail drawer
├─────────────────────────────┤
│  ● Node2  0x0006  5s ago    │
│    [ OFF  ]  ░░░░░░ 0%      │
└─────────────────────────────┘
```

**Detail drawer** (slide-in từ bottom): rename node, remove node (ConfirmDialog), xem addr / channel count / product ID.

**Stores:** `meshStore`

---

### Scenes (`/scenes`)

Tạo và activate scene (snapshot trạng thái tất cả nodes):

```
┌─────────────────────────────┐
│  [+ New Scene]              │
├─────────────────────────────┤
│  🎬 Evening Mode            │
│  3 targets  [ Activate ]    │
│                   [Delete]  │
├─────────────────────────────┤
│  🎬 All Off                 │
│  2 targets  [ Activate ]    │
└─────────────────────────────┘
```

**Stores:** `scenesStore` · **Status:** UI scaffold, cần kết nối API đầy đủ

---

### Settings (`/settings`)

```
┌─────────────────────────────┐
│  📡 WiFi                    │
│  Current: Not connected     │
│  [Scan Networks]            │
│  ┌─ SSID ─────────────────┐ │
│  │ MyNetwork        -60dBm│ │
│  │ NeighborNet      -75dBm│ │
│  └───────────────────────┘ │
│  Password: [__________]    │
│  [Connect]                 │
├─────────────────────────────┤
│  🏷️  Device Name            │
│  [RhoPhi Gateway    ] [Save]│
└─────────────────────────────┘
```

---

### Diagnostics (`/diagnostics`)

```
┌─────────────────────────────┐
│  🧠 Heap Memory             │
│  Free: 182 KB / 296 KB      │
│  Min ever: 170 KB           │
├─────────────────────────────┤
│  📋 Tasks                   │
│  Name        CPU%  Stack HWM│
│  sys_run     12%   1204 B   │
│  bt_host_hs  8%    890 B    │
├─────────────────────────────┤
│  💾 NVS Entries             │
│  wifi/ssid  [string] "..."  │
│  mesh/nodes [blob]  ...     │
└─────────────────────────────┘
```

---

## 7. Kiến trúc dữ liệu

### Type definitions (`src/types/`)

```typescript
// device.ts
interface DeviceState {
  relay_on: boolean
  brightness: number        // 0-100
  scene_id: number
  device_name: string
}

// mesh.ts
interface MeshNode {
  addr: string              // "0x0005"
  name: string
  status: 'online' | 'offline'
  relay_on: boolean
  brightness: number
  last_seen_ms: number      // ms since last heartbeat
  rssi: number | null
  product_id?: string
  channel_count?: number
  channels?: NodeChannel[]  // v1.1.0+
}

// ws.ts — Firmware → Browser events
type FirmwareEvent =
  | { type: 'STATE_UPDATE'; payload: Partial<DeviceState> }
  | { type: 'NODE_UPDATE'; payload: MeshNode }
  | { type: 'NODE_OFFLINE'; payload: { addr: string } }
  | { type: 'HEAP'; payload: HeapInfo }
  | { type: 'LOG'; payload: { level: string; tag: string; msg: string } }
```

### Store → API mapping

```
deviceStore  ──► GET  /api/device/state
                 POST /api/device/relay
                 POST /api/device/brightness
                 WS STATE_UPDATE → applyServerUpdate()

meshStore    ──► GET    /api/mesh/nodes
                 POST   /api/mesh/node/:addr/relay
                 POST   /api/mesh/node/:addr/name
                 DELETE /api/mesh/node/:addr
                 WS NODE_UPDATE / NODE_OFFLINE

systemStore  ──► GET /api/system/info
                 GET /api/wifi/status
                 GET /api/diagnostics/system
                 GET /api/diagnostics/tasks
                 GET /api/diagnostics/nvs

scenesStore  ──► GET    /api/scenes
                 POST   /api/scenes
                 POST   /api/scenes/:id/activate
                 DELETE /api/scenes/:id
```

---

## 8. API Endpoints

Base URL: `http://192.168.4.1` (khi connect tới ESP32 AP)  
Dev: set `VITE_API_BASE=http://192.168.4.1` hoặc để trống (relative paths)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/system/info` | Firmware version, MAC, platform, uptime |
| `GET` | `/api/device/state` | Trạng thái thiết bị local (relay, brightness) |
| `POST` | `/api/device/relay` | `{ state: boolean }` — bật/tắt relay |
| `POST` | `/api/device/brightness` | `{ level: number }` — set brightness 0-100 |
| `GET` | `/api/mesh/nodes` | Danh sách tất cả mesh nodes |
| `POST` | `/api/mesh/node/:addr/relay` | Toggle relay node |
| `POST` | `/api/mesh/node/:addr/brightness` | Set brightness node |
| `POST` | `/api/mesh/node/:addr/name` | Đổi tên node |
| `DELETE` | `/api/mesh/node/:addr` | Xóa node khỏi DB |
| `GET` | `/api/scenes` | Danh sách scenes |
| `POST` | `/api/scenes` | Tạo scene mới |
| `POST` | `/api/scenes/:id/activate` | Activate scene |
| `DELETE` | `/api/scenes/:id` | Xóa scene |
| `GET` | `/api/wifi/status` | Trạng thái WiFi (SSID, RSSI, IP) |
| `GET` | `/api/wifi/scan` | Scan WiFi networks xung quanh |
| `POST` | `/api/wifi/connect` | `{ ssid, password }` — connect STA |
| `POST` | `/api/settings/device` | `{ name }` — đổi tên thiết bị |
| `GET` | `/api/diagnostics/system` | Heap free/min, chip info |
| `GET` | `/api/diagnostics/tasks` | FreeRTOS task list (CPU%, stack HWM) |
| `GET` | `/api/diagnostics/nvs` | NVS entries |

---

## 9. WebSocket Events

**URL:** `ws://192.168.4.1/ws`

### Firmware → Browser (push events)

```json
// Trạng thái local device thay đổi
{ "type": "STATE_UPDATE", "payload": { "relay_on": true, "brightness": 80 } }

// Node mesh cập nhật
{ "type": "NODE_UPDATE", "payload": { "addr": "0x0005", "status": "online", "relay_on": true } }

// Node offline
{ "type": "NODE_OFFLINE", "payload": { "addr": "0x0005" } }

// Heap stats (mỗi 10s)
{ "type": "HEAP", "payload": { "free_bytes": 186320, "min_free_bytes": 174208 } }

// Log stream
{ "type": "LOG", "payload": { "level": "I", "tag": "BLEMesh", "msg": "heartbeat received" } }
```

### Browser → Firmware (client events)

```json
{ "type": "SUBSCRIBE_LOG", "level": "W" }
{ "type": "PING" }
```

### Auto-reconnect

`websocket.ts` tự động reconnect sau 3 giây nếu mất kết nối. Tất cả stores giữ state cũ trong lúc reconnecting.

---

## 10. Environment Variables

Tạo `.env.local` (không commit) để override:

```env
# URL gốc của REST API — bỏ trống khi serve từ ESP32 (relative path)
VITE_API_BASE=http://192.168.4.1

# WebSocket URL — auto-detect từ window.location.host nếu bỏ trống
VITE_WS_URL=ws://192.168.4.1/ws
```

**Production (trên ESP32):** Cả hai đều để trống — app dùng relative paths và `ws://{window.location.host}/ws`.

---

## 11. Linting & Formatting

```sh
npm run lint          # ESLint + oxlint, auto-fix
npm run format        # Prettier
npm run type-check    # vue-tsc type check (không emit)
```

Cấu hình:
- **ESLint:** `eslint.config.ts` — Vue + TypeScript rules
- **oxlint:** `.oxlintrc.json` — fast Rust-based linter
- **Prettier:** `.prettierrc.json` — tab width 2, single quotes

---

## 12. Troubleshooting

| Triệu chứng | Nguyên nhân | Fix |
|-------------|-------------|-----|
| Browser thấy SSID nhưng không vào được WebUI | BLE Mesh scan duty 100% (firmware < v1.2.0) | Flash firmware ≥ v1.2.0 |
| Trang trắng sau flash | SPIFFS không được flash | Dùng `idf.py flash` không phải `idf.py app-flash` |
| `404 Not Found` tất cả routes | `index.html` không có trong SPIFFS | Chạy lại `./deploy_webui.sh --flash` |
| WebSocket "Disconnected" ngay lập tức | `CONFIG_HTTPD_WS_SUPPORT=n` | Thêm `CONFIG_HTTPD_WS_SUPPORT=y` vào `sdkconfig.defaults` |
| Mesh nodes không hiện | `GET /api/mesh/nodes` fail | Xem console, kiểm tra firmware init MeshNodeDB |
| Node relay toggle không phản hồi | LED GPIO không drive (firmware < v1.2.0) | Flash firmware ≥ v1.2.0 |
| `npm run build` fail — type error | Vue types không match | Chạy `npm run type-check` để xem chi tiết |
| CSS không apply đúng | Tailwind purge | Restart dev server, tránh dynamic class concat |

### Debug với browser DevTools

```
Network → filter XHR    → xem REST API calls
Network → filter WS     → xem WebSocket frames
Console → Vue DevTools  → inspect Pinia store state
Application → Storage   → xem persisted state
```

### Kiểm tra firmware từ CLI

```sh
# Monitor boot log — tìm firmware version
idf.py -p /dev/ttyACM2 monitor
# Expect: W (_sys) _sys: Firmware Ver: 1.2.0

# Test API trực tiếp
curl http://192.168.4.1/api/system/info
curl http://192.168.4.1/api/mesh/nodes
curl http://192.168.4.1/api/device/state
```

---

## 13. Changelog

### v1.2.0 (2026-03-01) — BLE Mesh Milestone ✅

**Firmware milestone:** BLE Mesh operational + WiFi SoftAP stable đồng thời.

**WebUI changes:**
- Bump `package.json` version `0.0.0` → `1.2.0`
- Build verified: `npm run build` → ✓ 60 modules, 0 errors, 0 type errors
- `DashboardView`: BLE Mesh status card — `onlineCount/nodeCount` + gateway addr
- `MeshView`: Relay toggle gửi `POST /api/mesh/node/:addr/relay` → firmware apply GPIO (fix KAN-30 #06)
- `websocket.ts`: Auto-reconnect 3s, typed `FirmwareEvent` union
- Docs: 3 docsWeb files updated lên version tương ứng

**Firmware fixes ảnh hưởng WebUI:**
- WiFi SoftAP ổn định khi BLE Mesh bật → WebUI accessible
- LED/relay GPIO được drive khi nhận mesh command
- `/api/system/info` trả về `version: "1.2.0"`

**Known limitations:**
- BLE Mesh response latency cao hơn so với standalone (hardware trade-off — single antenna TDM)
- Scenes: UI scaffold, chưa kết nối API đầy đủ
- Settings WiFi connect: chưa test end-to-end

---

### v1.1.0 (2026-02-28) — Multi-Channel Model

- `Channel` type: `{ index, type, name, on, brightness }`
- `MeshNode.channels[]` — per-channel state
- `SceneChannelSnapshot` — per-channel scene targets
- `CHANNEL_UPDATE` WebSocket event type
- API: `/api/device/channel/:ch/state`, `/api/mesh/node/:addr/channel/:ch/state`
- Dashboard → ChannelCards loop thay relay đơn
- Backward compat: `normalizeDeviceState()` convert legacy flat → `channels[0]`

---

### v1.0.0 (2026-02-01) — Initial

- Vue 3 + Vite + TypeScript + Tailwind CSS v4 + Pinia + Vue Router
- 5 views: Dashboard, Mesh, Scenes, Settings, Diagnostics
- REST API client (`api.ts`) — typed fetch wrappers
- WebSocket service (`websocket.ts`) — auto-reconnect
- `RelayToggle`, `BrightnessSlider`, `ConfirmDialog` components
- Dark theme, mobile-first layout
- `deploy_webui.sh` script

---

## 14. Tài liệu tham khảo

### Docs trong repo (`docsWeb/`)

| File | Nội dung |
|------|---------|
| [`WebUI_Architecture.md`](./docsWeb/WebUI_Architecture.md) | UI design, screen wireframes, API design, Pinia stores design, build process, roadmap |
| [`WebUI_Backend_Data.md`](./docsWeb/WebUI_Backend_Data.md) | Data models (TypeScript + C++), NVS layout, API response schema, WebSocket event schema |
| [`WebUI_Implementation.md`](./docsWeb/WebUI_Implementation.md) | Implementation guide, component catalog, firmware webserver impl, e2e data flow, troubleshooting |

### Firmware repo (parent)

| File | Nội dung |
|------|---------|
| [`docs/Mesh/WiFi_BLE_Mesh_Coexistence_Analysis.md`](../docs/Mesh/WiFi_BLE_Mesh_Coexistence_Analysis.md) | Root cause + solution A+B+C cho WiFi+BLE coexistence |
| [`docs/logwork/KAN-30 #06.md`](../docs/logwork/) | Chi tiết fix coex issue → firmware v1.2.0 |
| [`docs/Implement/Software_Architecture.md`](../docs/Implement/Software_Architecture.md) | Firmware software architecture |
| [`docs/Implement/Data_Management.md`](../docs/Implement/Data_Management.md) | NVS + data persistence design |

### External

- [Vue 3 Docs](https://vuejs.org/guide/introduction.html)
- [Vite Docs](https://vite.dev/guide/)
- [Pinia Docs](https://pinia.vuejs.org/introduction.html)
- [Tailwind CSS v4](https://tailwindcss.com/docs/v4-beta)
- [ESP-IDF HTTP Server](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/protocols/esp_http_server.html)
- [ESP-BLE-MESH](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-guides/esp-ble-mesh/ble-mesh-index.html)

---

_README v1.2.0 — RhoPhi Smart Home WebUI_
