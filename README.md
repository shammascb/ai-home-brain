# AI Home Brain

AI Home Brain is a full-stack smart home web application built with React, Express, Firebase Authentication, Cloud Firestore, Gemini voice command interpretation, and an isolated ESP32 hardware communication gateway (currently operating safely in **Simulation Mode** until physical ESP32 nodes are connected).

---

## 1. Architecture Overview

The application is structured into four cleanly separated layers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Client SPA (React 19 + TypeScript + Vite + Tailwind CSS v4)             │
│  ├── AuthView / WelcomeView       (Firebase Auth + Onboarding)          │
│  ├── HomeDashboardView / Devices  (Scenes, Light, Fan, Door, Voice)     │
│  ├── AutomationsView / Modal      (Sleep, Morning, Away + Safety Check) │
│  ├── DevicesMonitoringView        (Telemetry, ACKs, Packet Simulator)   │
│  ├── FamilySecurityView           (RBAC Members, Invites, Audit Log)    │
│  └── src/lib/hardwareGateway.ts   (Authenticated REST + SSE Client)     │
└───────────────┬─────────────────────────────────────────┬───────────────┘
                │ HTTPS + Firebase RS256 Bearer Token      │ Firebase SDK
                ▼                                         ▼
┌─────────────────────────────────────────┐ ┌─────────────────────────────┐
│ Express Backend (server.ts, Port 3000)  │ │ Firebase Cloud Platform     │
│  ├── POST /api/voice/interpret          │ │  ├── Firebase Auth          │
│  │     └── @google/genai (Gemini)       │ │  │    (Google & Email/Pass) │
│  └── server/hardwareService.ts          │ │  └── Cloud Firestore        │
│        ├── simulation (default, active) │ │       (users, homes, state, │
│        ├── mqtt_tls (future ESP32)      │ │        routines, invites,   │
│        └── secure_bridge (future ESP32) │ │        activityLogs)        │
└───────────────────────────┬─────────────┘ └─────────────────────────────┘
                            │ Outbound TLS only (never exposes ESP32 publicly)
                            ▼
            ┌───────────────────────────────┐
            │ Future Physical ESP32 Nodes   │
            │  • ESP32-LIGHT-01 (Living Rm) │
            │  • ESP32-FAN-02   (Bedroom)   │
            │  • ESP32-LOCK-03  (Entryway)  │
            └───────────────────────────────┘
```

### Key Architectural Decisions
- **Separate Hardware Communication Service**: All device telemetry, command publishing, acknowledgement correlation, and transport validation live in `server/hardwareService.ts` and `src/lib/hardwareGateway.ts`, isolated from React UI components.
- **No Direct Public Exposure of ESP32**: The browser never connects directly to an ESP32 IP or local broker. Commands flow from the authenticated client → Express backend (`/api/hardware/*`) → TLS-encrypted MQTT broker (`mqtts://`/`wss://`) or HTTPS bridge (`https://`).
- **Honest Simulation Mode**: When `HARDWARE_MODE="simulation"` (default), no external MQTT or bridge connections are attempted and no MQTT credentials are required. UI banners explicitly indicate `"Hardware not connected · Simulation mode"`.

---

## 2. Technologies Used

| Layer | Technology / Package | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React `19.0.1`, TypeScript `7.0.2`, Vite `8.3.0` | Component UI and SPA bundling |
| **Styling & Icons** | Tailwind CSS `4.3.3` (`@tailwindcss/vite`), `lucide-react` | Material 3-inspired light/dark adaptive UI |
| **Authentication & DB** | `firebase` `13.4.0` (Firebase Auth + Cloud Firestore) | User sign-in, session management, real-time cloud state sync |
| **Backend Server** | Node.js + `express` `4.21.2` + `tsx` / `esbuild` | Single-port (3000) SPA serving, REST API, SSE telemetry stream |
| **Voice / AI** | `@google/genai` `3.6.0` (`gemini-4-hydrogen`) + Web Speech API | Speech-to-text capture & structured JSON intent classification |
| **Hardware Transport** | `mqtt` `5.16.1` + Server-Sent Events (SSE) | QoS 1 MQTT over TLS client (`mqtts://`/`wss://`) & real-time UI updates |

---

## 3. Firestore Database Schema

Project ID: `ai-home-brain-6df82`  
Database ID: `ai-studio-remixaihomebrain-ebc7971c-bff2-4404-9dc4-4db9ac7abe1e`

### Per-User Collections
- **`users/{uid}`**: User profile (`uid`, `displayName`, `email`, `createdAt`, `updatedAt`).
- **`users/{uid}/homeState/default`**: Synced scene & device state (`ownerId`, `selectedMode` [`Home` \| `Away` \| `Sleep` \| `Morning`], `lightOn`, `fanOn`, `fanSpeed` [1–5], `doorLocked`, `doorOpen`, `updatedAt`).
- **`users/{uid}/routines/{routineId}`** (`sleep`, `morning`, `away`): Customized routine actions (`routineId`, `lightAction`, `fanAction`, `fanSpeed`, `doorAction`, `requireSafetyConfirmation`, `updatedAt`).
- **`users/{uid}/membership/current`**: Active household pointer (`uid`, `homeId`, `role`, `updatedAt`).

### Shared Household Collections
- **`homes/{homeId}`**: Household metadata (`homeId`, `name`, `ownerId`, `memberUids`, `createdAt`, `updatedAt`).
- **`homes/{homeId}/members/{memberId}`**: Member record and granular RBAC flags (`uid`, `displayName`, `email`, `role` [`owner` \| `adult` \| `guest`], `status`, `canControlDevices`, `canRunAutomations`, `canUseVoiceCommands`, `canUnlockDoor`, `canManageFamily`, `viewerUids`).
- **`homes/{homeId}/activityLogs/{logId}`**: User-attributed audit trail (`actorUid`, `actorName`, `actorEmail`, `actorRole`, `actionTitle`, `detail`, `category`, `source`, `viewerUids`, `createdAt`).
- **`homeInvites/{inviteCode}`**: Household invitations (`inviteCode`, `homeId`, `homeName`, `invitedEmail`, `role`, granular permission booleans, `status` [`pending` \| `accepted` \| `revoked`], `invitedByUid`, `acceptedByUid`).

> **Note on Email Verification**: Cloud Firestore writes in `src/lib/firestoreSync.ts` check `user.emailVerified` before syncing profile, home state, routines, and activity logs. Unverified email/password accounts can still test the local simulator and request verification emails under **Family & Security → Security**.

---

## 4. Backend API Reference

All routes except `GET /api/health` require a Firebase ID token in the `Authorization: Bearer <idToken>` header, cryptographically verified by the backend using Google's RS256 public X.509 certificates.

### Public Health Endpoint
- **`GET /api/health`**
  - Returns server readiness, whether `GEMINI_API_KEY` is present, active `hardwareMode`, and `hardwareConfigured`.

### Voice Interpretation API (Authenticated)
- **`POST /api/voice/interpret`**
  - **Body**: `{ "transcript": "string (max 400 chars)" }`
  - **Behavior**: Resolves room navigation shortcuts locally (`open_living_room`, `open_bedroom`) or sends the transcript to Gemini (`gemini-4-hydrogen`) with strict JSON schema output.
  - **Allowed Actions**: `sleep_mode`, `morning_mode`, `away_mode`, `turn_light_on`, `turn_light_off`, `turn_fan_on`, `turn_fan_off`, `lock_door`, `unlock_door`, `open_living_room`, `open_bedroom`, `unsupported`.
  - **Safety**: `unlock_door` is always classified so the UI explicitly rejects voice-triggered unlocking.

### Hardware Gateway APIs (Authenticated)
- **`GET /api/hardware/status`**: Returns current `HardwareConnectionStatus`, monitored ESP32 nodes, and the last 50 command ACK logs.
- **`GET /api/hardware/stream`**: Server-Sent Events (`text/event-stream`) stream emitting `hardware:snapshot`, `device:status`, `command:ack`, `hardware:status`, and `hardware:error` events with 20s keepalives.
- **`POST /api/hardware/command`**: Publishes a typed device command (`light_on`, `light_off`, `fan_on`, `fan_off`, `fan_speed`, `door_lock`, `door_unlock`, `door_sensor_toggle`) and returns a correlated `HardwareCommandAck` (`200` on ACK, `504` on `ERR_ACK_TIMEOUT`, `503` on offline/disconnected).
- **`POST /api/hardware/ping`**: Refreshes device heartbeat timestamps (`deviceId` optional) and broadcasts updated status over SSE.
- **`POST /api/hardware/simulate-packet`**: Injects a simulated ESP32 telemetry status/fault packet (`online`, `rssiDbm`, `errorCode`, `errorMessage`) for testing error recovery.
- **`POST /api/hardware/resolve-error`**: Clears active error codes and restores a simulated node to online status.

---

## 5. Security Architecture

1. **Cryptographic Token Verification (`server/hardwareService.ts`)**: `requireAuthenticatedUser` validates JWT headers (`alg === RS256`), fetches & caches Google public certificates, verifies signature, and enforces `exp`, `iat`, `auth_time`, `aud`, and `iss` for project `ai-home-brain-6df82`. No hardcoded API keys or bypass tokens exist.
2. **Role-Based Access Control (RBAC)**:
   - Roles (`owner`, `adult`, `guest`) map to 5 granular permissions (`canControlDevices`, `canRunAutomations`, `canUseVoiceCommands`, `canUnlockDoor`, `canManageFamily`).
   - Permissions are enforced both in the UI (disabled controls & confirmation dialogs) and inside action handlers (`setLight`, `setFan`, `setFanSpeed`, `setDoorLocked`, `handleToggleDoorSensor`, `handleExecuteVoiceAction`).
3. **Door Safety Rules**:
   - **Voice Unlock Disabled**: Voice commands can never unlock the front door (`unlock_door` is always rejected by `VOICE_ACTION_DETAILS`).
   - **Voice Lock Confirmation**: Voice `"lock the door"` requires explicit UI button confirmation (`Confirm and lock`) and blocks if the door contact sensor reports `doorOpen === true`.
   - **Manual Unlock Confirmation**: UI door unlock requires explicit `Confirm Door Unlock` modal approval and `canUnlockDoor` permission.
   - **Automation Safety Check**: Sleep, Morning, and Away modes verify `doorOpen === false` and optional user safety confirmation before locking.
4. **Transport & Header Hardening**:
   - Plaintext `mqtt://` and `http://` bridges are rejected (`ERR_TLS_REQUIRED`).
   - Private/local hosts (`localhost`, `127.0.0.1`, `10.x`, `172.16-31.x`, `192.168.x`) are rejected for remote hardware transport URLs so the gateway never relies on unencrypted LAN shortcuts or direct device exposure.
   - Express sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, disables `X-Powered-By`, and caps JSON bodies at `256kb`.
5. **Known Limitation (Disclosed in UI)**: Speaker/voice-print biometric verification is **not** implemented; voice actions rely on the currently signed-in account and its assigned permissions.

---

## 6. Future ESP32 Integration Guide

The app runs in `HARDWARE_MODE="simulation"` by default with zero hardware secrets required. When you are ready to connect physical ESP32 devices:

### Option A: MQTT over TLS (`HARDWARE_MODE="mqtt_tls"`)
1. Configure these environment secrets in your hosting / AI Studio Secrets panel:
   - `HARDWARE_MODE="mqtt_tls"`
   - `MQTT_BROKER_URL="mqtts://your-tls-broker.example.com:8883"` (must be `mqtts://` or `wss://`, non-private hostname)
   - `MQTT_USERNAME` and `MQTT_PASSWORD`
   - `MQTT_CA_CERT_PEM` (optional custom CA PEM)
   - `MQTT_TOPIC_PREFIX` (defaults to `ai-home-brain`)
   - `ESP32_COMMAND_TIMEOUT_MS` (defaults to `5000`, range `500`–`30000`)
2. **Topic Contracts** (QoS 1):
   - **Command Publish**: `{prefix}/{homeId}/devices/{deviceId}/cmd`  
     Payload: `{ commandId, deviceId, nodeId, action, value, issuedByUid, timestamp }`
   - **ESP32 Acknowledgement**: `{prefix}/{homeId}/devices/{deviceId}/ack`  
     Payload: `{ commandId, success, message }`
   - **ESP32 Status Telemetry**: `{prefix}/{homeId}/devices/{deviceId}/status`  
     Payload: `{ deviceId, online, rssiDbm, errorCode, errorMessage }`

### Option B: Secure Backend Bridge (`HARDWARE_MODE="secure_bridge"`)
1. Configure:
   - `HARDWARE_MODE="secure_bridge"`
   - `ESP32_BRIDGE_API_URL="https://bridge.example.com"` (must be `https://`, non-private hostname)
   - `ESP32_BRIDGE_API_TOKEN` (minimum 16 characters; sent as `Authorization: Bearer <token>`)
2. Bridge receives `POST {ESP32_BRIDGE_API_URL}/commands` with `{ commandId, homeId, deviceId, nodeId, action, value, issuedByUid }` and returns `{ acknowledged: boolean, message?: string, errorCode?: string }`.

If any required credential is missing, malformed, non-TLS, or uses placeholder prefixes (`MY_`, `YOUR_`, `CHANGEME`, `PLACEHOLDER`, `EXAMPLE`), `HardwareCommunicationService` automatically falls back to `simulation` mode and reports a structured error code (`ERR_NOT_CONFIGURED`, `ERR_TLS_REQUIRED`, `ERR_BROKER_AUTH`) in **Device Monitoring**.

---

## 7. Feature Status Summary

### Completed Features
- Firebase Authentication (Email/Password registration & sign-in, Google OAuth popup, password reset, email verification status & resend)
- Light/Dark Material 3 adaptive theme + responsive mobile/desktop shell (Bottom Nav, Slide-out Drawer, Profile Modal)
- Dashboard Scenes (`Home`, `Away`, `Sleep`, `Morning`), Favorite Devices, and Recent Activity feed
- Living Room & Bedroom room views, fan speed slider (`1`–`5`) with dynamic fan animation, and room filters (`All`, `Living room`, `Bedroom`, `Front entry`)
- Customizable Automation Routines (`Sleep Mode`, `Morning Mode`, `Away Mode`) with device picker, safety preview modal, open-door safety block, and step-by-step execution report
- Gemini Voice Assistant (`/api/voice/interpret` + Web Speech API + typed command fallback + room navigation shortcuts + voice door-unlock block)
- Family & Security RBAC (Owner/Adult/Guest presets, 5 granular permissions, invite code generation/acceptance/revocation, user-attributed activity logs with filters)
- Hardware Gateway architecture (`/api/hardware/*`, RS256 token verification, SSE stream with auto-reconnect, ACK correlation, packet/fault simulation, error resolution)

### Simulated Features (No Physical Hardware Attached)
- Living Room Light (`ESP32-LIGHT-01`), Bedroom Fan (`ESP32-FAN-02`), Front Door Lock & Contact Sensor (`ESP32-LOCK-03`) states and toggles
- ESP32 Wi-Fi RSSI telemetry, heartbeat pings, offline fault injection, and simulated command ACKs (`ACK · Simulated`)

### Incomplete / Future Scope
- **Physical ESP32 Firmware & Live Hardware Connection**: Hardware nodes are not purchased/connected yet; `HARDWARE_MODE` remains `simulation`.
- **Push Notifications**: Top-bar notification bell currently displays `"Notifications are not configured yet."` (no FCM/APNs push pipeline).
- **Phone Biometric / PIN Hardware Prompt**: Door unlock uses an in-app confirmation modal rather than WebAuthn/device OS biometric prompt.
- **Speaker / Voice-Print Identity Verification**: Explicitly noted in UI as unimplemented.
- **Multi-User Shared Device State Sync**: `homeState` and `routines` are stored under `users/{uid}/...` per signed-in user rather than a single shared household `homes/{homeId}/state` document, and hardware gateway state in `server/hardwareService.ts` is in-memory per server process.

---

## 8. Running Locally

```bash
npm install
npm run lint     # TypeScript type-check (tsc --noEmit)
npm run build    # Production Vite build + esbuild server bundle
npm run dev      # Start Express + Vite dev server on http://localhost:3000
```
