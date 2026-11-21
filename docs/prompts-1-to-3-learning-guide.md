# AI Home Brain: build, learn, test, document, present

Use this guide to understand the app rather than treating it as generated UI.
For the architecture, database paths, and feature status, see
[`architecture.md`](architecture.md).

## Learning loop

For each feature:

1. **Build:** find the UI, domain model, and service that own the behavior.
2. **Learn:** trace one user action through those layers.
3. **Test:** read or add a focused test for the expected behavior and safety
   boundary.
4. **Document:** update feature status and note any simulation or external
   setup.
5. **Present:** explain what is real, what is simulated, and what would be
   needed for production.

## Project map

- `lib/main.dart` initializes Firebase and creates app services.
- `lib/app/` contains the root app widget, themes, and Firebase client config.
- `lib/features/auth/` handles account flows and protects the dashboard.
- `lib/features/dashboard/` displays rooms and invokes device-control methods.
- `lib/features/devices/` defines the control/monitoring abstractions and the
  simulator implementations.
- `lib/features/voice_assistant/` captures speech and maps it to supported
  actions.
- `lib/features/automations/` defines and runs Sleep, Morning, and Away
  routines.
- `lib/features/family/` manages household members, permissions, invites, and
  audit history.
- `lib/features/settings/` explains account and capability status.
- `firestore.rules` protects the cloud documents used by the app.
- `test/` contains Flutter tests for core behavior and screens.

## Prompt-by-prompt study plan

### 1. Foundation

Start with `AiHomeBrainApp` and `AppTheme`. The root widget owns the theme and
creates shared services once. Feature directories group related code so the
dashboard does not need to know how Firebase or speech recognition works.

**Explain:** Flutter screens are widget trees; `ChangeNotifier` services expose
state changes so listening widgets can rebuild.

### 2. Login and accounts

Follow `FirebaseAuthService` → `AuthGate` → `DashboardScreen`. Firebase decides
whether a credential is valid. `AuthGate` observes the signed-in user stream
and opens the protected app only for an authenticated account.

**Try:** register, sign in, request a password reset, check email verification,
and sign out. Firebase Console providers and authorized domains must be
configured for the relevant platform.

### 3. Dashboard

The dashboard is in `lib/features/dashboard/presentation/`. It shows mode,
room, light, fan, door, voice, and activity controls. The current device values
come from the simulator; a displayed change does not mean a real appliance
changed.

### 4. Appliance controls

Trace a switch to `DeviceControlService`, then to
`SimulatedDeviceControlService`. The interface is the future replacement point
for another device implementation. Current state and simulated device status
are in memory.

**Explain:** keeping UI and device service separate makes it possible to
replace the simulator without rewriting every screen.

### 5. Voice assistant

The speech service captures a transcript; `VoiceCommandInterpreter` converts
it to a closed set of actions. The UI previews actions and asks for confirmation
where needed. `VoiceCommand.fromModelAction` maps any voice unlock request to a
blocked action.

**Important:** speech recognition is not speaker verification. The signed-in
account is known; the person speaking is not.

### 6. Automations

Read `AutomationRoutine`, `AutomationRoutineStore`, and
`AutomationRoutineExecutor`. Routines are editable, shown in a preview, then
executed one step at a time. The report records completed, skipped, and failed
steps. Lock actions check that the door sensor is closed and, when configured,
that the user confirmed the safety prompt. Routines never unlock doors.

**Try:** run Sleep Mode with the simulated door open and observe the skipped
door step.

### 7. Family and permissions

`FamilyManagementStore` holds the household data and syncs verified users to
Firestore. `FamilyPermissions` controls device actions, routines, voice,
manual door unlock, and family management. UI checks improve feedback;
Firestore rules protect cloud data. A future hardware backend must enforce
permissions again on the server.

**Try:** create an invite, set guest permissions, and inspect the activity
history. Invitations require a separate authenticated family account to accept.

### 8. Device monitoring

`DeviceMonitoringStore` presents device status, last communication, simulated
command history, and injected faults. `SimulatedEsp32Gateway` sends fake status
updates through the same Dart interface intended for a future status source.

**Try:** mark a simulated device offline, attempt a command, then resolve the
error. Confirm that the UI reports failure rather than success.

### 9. ESP32 preparation

The current boundary is `DeviceControlService` plus `Esp32StatusGateway`. No
hardware transport is implemented. A real deployment needs an authenticated
backend that validates Firebase identity and permissions, then connects to a
TLS MQTT broker or secure bridge and waits for correlated command
acknowledgements. Keep broker credentials off the phone and never expose the
ESP32 directly to the public internet.

### 10. Final review

Before presenting or deploying:

```sh
flutter analyze
flutter test
flutter build web --release --base-href /ai-home-brain/
```

Review [`architecture.md`](architecture.md) for completed, simulated, and
unfinished features. In particular, hardware, push notifications, speaker
verification, scheduled routines, and web App Check remain unfinished. iOS
Firebase setup requires the local plist and Firebase App Check registration.
Do not describe simulated hardware as connected.

## Short presentation outline

1. **Problem:** one app gives household members clear manual, voice, and
   routine controls.
2. **Architecture:** Flutter UI → feature services → Firebase for accounts and
   cloud household data; device controls currently use a simulator.
3. **Safety:** account permissions, manual device authentication for unlock,
   voice-unlock block, closed-door check before routine locking, and command
   results that distinguish simulation from hardware.
4. **Limitations:** no physical ESP32, no push delivery, no voice identity
   verification, and local iOS Firebase/App Check configuration is required.
5. **Next step:** build the authenticated TLS hardware backend and ESP32
   firmware, then test command acknowledgement, offline behavior, and access
   rules before connecting any real lock.
