# AI Home Brain: architecture and delivery status

## System overview

```text
Flutter UI (Dart / Material 3)
  ├─ Firebase Authentication ───── Firebase Auth
  ├─ Family and routine stores ──── Cloud Firestore + firestore.rules
  ├─ Speech recognition ──────────── Android/browser speech service
  ├─ Command interpretation ─────── Firebase AI Logic
  └─ DeviceControlService ───────── SimulatedDeviceControlService
                                      └─ SimulatedEsp32Gateway

Future only: Flutter app → authenticated backend → MQTT over TLS → ESP32
```

There is no HTTP hardware API in the current Flutter project. The code does
not connect to an ESP32, MQTT broker, or bridge. The `Esp32StatusGateway`
interface and simulator describe the status-update boundary for future work;
they are not a hardware integration.

## Technologies and responsibilities

| Area | Current implementation | Responsibility |
| --- | --- | --- |
| App and UI | Flutter, Dart, Material 3 | Mobile-first app shell, screens, controls, and themes |
| Login | `firebase_auth` | Real Firebase account creation, sign-in, Google sign-in, password reset, verification, and sign-out |
| Cloud data | `cloud_firestore` | Verified users' routines, household membership, invites, permissions, and activity logs |
| Voice capture | `speech_to_text` | Captures speech through the device or browser speech service where supported |
| Voice intent | `firebase_ai` | Maps a recognized transcript to one of the app's supported actions |
| Device control | `DeviceControlService` | Keeps the UI independent of a device implementation; currently uses the simulator |
| Device status | `DeviceMonitoringStore` | Shows simulated device state, command history, and connection errors |
| Door confirmation | `local_auth` on Android | Requests phone PIN or biometrics for manual simulated unlocks |
| Tests | `flutter_test`, Firebase Emulator Suite | Exercises app behavior and verifies Cloud Firestore allow/deny rules |

Firebase API keys in a Flutter client identify the Firebase project; they are
not server credentials. Do not put service-account keys or MQTT passwords in
the app.

## Source layout

- `lib/main.dart` initializes Firebase where configured and creates the app
  services.
- `lib/app/` contains Firebase configuration, global theme, and app setup.
- `lib/features/auth/` contains Firebase account operations and the protected
  dashboard gate.
- `lib/features/dashboard/` contains the dashboard, rooms, and control UI.
- `lib/features/automations/` contains routine models, Firestore sync, preview,
  and step-by-step execution.
- `lib/features/devices/` contains control and status interfaces plus their
  simulator implementations.
- `lib/features/family/` contains household data, role permissions, invitations,
  and activity history.
- `lib/features/settings/` summarizes account and capability settings.
- `lib/features/voice_assistant/` contains speech capture and supported voice
  action mapping.
- `firestore.rules` contains the Firestore authorization rules. The rules must
  also be deployed in Firebase; a local file does not protect cloud data by
  itself.

## Main flows

### Login

`FirebaseAuthService` calls Firebase Authentication. `AuthGate` listens to the
Firebase user stream and only opens the dashboard for an authenticated user.
Without a usable Firebase configuration, the app reports that authentication
is unavailable rather than silently creating a local account.

### Manual device action

The screen calls `DeviceControlService`. In the current app that resolves to
`SimulatedDeviceControlService`, which changes in-memory state. The monitoring
store records simulated command results and can inject offline/error states.
The UI says that no physical device was changed.

### Voice action

The speech service captures a transcript. The voice interpreter maps it to a
closed set of `VoiceAction` values. The UI displays the recognized request and
planned action, then asks for confirmation where required. `unlock_door` maps
to a blocked action and is never passed to device control. Voice identity or
speaker verification is not implemented.

### Routine execution

Users can edit Sleep, Morning, and Away actions and review a preview before
running a routine. The executor sends each step to the simulated control
service and reports each result. Door locking is skipped if the contact sensor
reports an open door; routines never unlock the door. Routine definitions can
sync to Firestore for verified users. Execution state and device state remain
simulated and in memory.

### Family permissions and audit history

Each family member uses their own Firebase account. The family store manages
households, invitation codes, roles, granular permissions, and activity logs.
The UI checks permissions before an action, and `firestore.rules` enforces
cloud data access. Physical-device permissions must also be checked by the
future backend; client-side UI checks alone are not sufficient for hardware.

## Firestore data model

The active stores use these paths:

| Path | Contents |
| --- | --- |
| `users/{uid}` | User profile and account metadata |
| `users/{uid}/membership/current` | The user's active household and role |
| `users/{uid}/routines/{routineId}` | Custom Sleep, Morning, and Away routine settings |
| `homes/{homeId}` | Household name, owner, and member IDs |
| `homes/{homeId}/members/{memberId}` | Role, invite state, and permission flags |
| `homes/{homeId}/activityLogs/{logId}` | Actor-attributed actions, timestamps, categories, and source |
| `homeInvites/{inviteCode}` | Invited email, role, granted permissions, status, and inviter |

Cloud writes that change household or routine data require a verified email.
Local edits can be used during the current session while an account is
unverified, but those edits do not sync. Device state is not stored in
Firestore by the current app. `firestore.rules` also contains rules for
`homeState` and `activities` documents that the current UI does not write.

## APIs and network boundaries

The current app has no custom REST API and no public ESP32 endpoint. Firebase
Auth, Firestore, and Firebase AI Logic use their Flutter SDKs. Speech capture
uses the platform/browser speech service. Device controls call a local Dart
interface and simulator.

For real hardware, add a separately hosted backend that verifies Firebase ID
tokens and household permissions. The backend should publish MQTT over TLS to
a broker, correlate command IDs with device acknowledgements, expire timed-out
commands, validate telemetry, and report failures to the app. Keep broker
credentials on the server. Do not expose a device or broker directly to the
public internet.

## Security boundaries and limitations

- Authentication is real when Firebase is configured. Firestore rules are the
  cloud authorization boundary and must be deployed and reviewed.
- Android Play Integrity and iOS App Check are initialized for release builds;
  debug builds use platform debug providers. Web App Check is not configured.
- Firestore security rules are exercised against the local emulator by
  `npm --prefix tools/firestore-rules-tests test`. The scenario matrix in
  `firestore.rules.test.ts` is a reference list; the executable assertions are
  in `tools/firestore-rules-tests/rules.test.mjs`.
- The Firestore test CLI is development-only. `npm audit` currently reports 13
  moderate advisories in transitive CLI dependencies; a forced fix would
  downgrade Firebase packages, so it was not applied. These packages are not
  included in the Flutter app or web bundle.
- Manual Android door unlock asks the OS for PIN or biometrics. The web
  confirmation exists only for the simulator and cannot authorize hardware.
- Door unlock is blocked for voice commands. Routines can lock only after
  safety checks and never unlock.
- The app does not perform speaker identification. A voice action is attributed
  to the signed-in account, not the speaker.
- Notifications and push delivery are not configured. Settings reports that
  state instead of showing a false connected status.
- Current Firebase setup supports the web client, Android when its local
  configuration is present, and iOS when its local plist is present and App
  Check is registered in Firebase.
- Scheduled/time-triggered automations are not implemented; routines run when
  a user starts them.

## Feature status

| Feature | Status |
| --- | --- |
| Firebase sign-up, sign-in, Google sign-in, password reset, verification | Implemented when configured |
| Dashboard, light/fan/door controls, room views, fan speed | UI implemented; appliance actions simulated |
| Speech-to-text and supported command interpretation | Implemented where platform speech and Firebase AI are configured |
| Voice door unlocking | Blocked by design |
| Sleep, Morning, Away routines, customization and previews | Implemented; execution simulated |
| Household membership, invites, permissions, activity history | Implemented with Firestore; requires deployed rules and verified email for sync |
| Device monitoring, status, error injection, command log | Implemented as simulation |
| Android phone PIN/biometric gate for manual door unlock | Implemented for the simulated lock |
| Web door unlock | Confirmation for simulation only |
| Physical ESP32 commands and telemetry | Not implemented |
| MQTT over TLS / authenticated device backend | Future integration |
| Push notifications | Not configured |
| Speaker verification / voice profiles | Not implemented |
| Scheduled routines | Not implemented |
| iOS Firebase setup | Implemented; local plist and App Check registration required |

## Build and deployment

Run Flutter checks and the Firestore emulator suite before building. The Pages
build uses:

```sh
flutter build web --release --base-href /ai-home-brain/
```

The generated site is in `build/web`. The repository's Pages workflow runs on
`main`; this checkout should be merged into the source branch before publishing.
