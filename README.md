# AI Home Brain

AI Home Brain is a Flutter smart-home app for controlling lights, a fan, and a
door through buttons, voice commands, and routines. The current app is a
**simulation**: it has no live ESP32 connection and does not control physical
devices.

## What works now

- Firebase email/password and Google sign-in, registration, password reset,
  email verification, and sign-out.
- A responsive Flutter dashboard with light/dark themes, room views, device
  cards, and fan speed controls.
- Phone speech recognition and Firebase AI command interpretation. Voice
  requests are shown before execution, and voice door unlocking is blocked.
- Sleep, Morning, and Away routines with editable actions, a preview, a door
  safety check, and a per-step result.
- Family invitations, member roles, granular permissions, and an activity log
  backed by Cloud Firestore when the account is email-verified.
- Device monitoring screens with simulated online status, command history,
  fault injection, and error recovery.
- A Settings screen that summarizes account, family, device, notification,
  voice, and door safety state.

See [the architecture and feature status](docs/architecture.md) for the
complete list of working, simulated, and unfinished parts.

## Run the Flutter app

Install Flutter 3.47 or newer with Dart 3.12 or newer, then run:

```sh
flutter pub get
flutter run -d chrome
```

To run the web app on a local network:

```sh
flutter run -d web-server --web-hostname 0.0.0.0 --web-port 3000
```

For Android, add the Firebase Android client configuration at
`android/app/google-services.json`, enable Email/Password and Google providers
in Firebase Authentication, and configure the Android app in your Firebase
project. Do not commit service-account credentials. iOS Firebase setup is not
included yet.

## Verify and build

```sh
flutter analyze
flutter test
npm ci --prefix tools/firestore-rules-tests
npm --prefix tools/firestore-rules-tests test
flutter build web --release --base-href /ai-home-brain/
```

The Flutter tests cover app behavior. The separate Firestore emulator suite
checks the cloud authorization rules. The GitHub Pages workflow runs both
before it builds the app. The generated web files are written to `build/web`.

## Project layout

```text
lib/
  app/                 App startup, Firebase setup, and themes
  features/auth/       Firebase sign-in and protected app gate
  features/dashboard/  Home, rooms, and device controls
  features/automations/ Editable routines and safe execution
  features/devices/    Device abstractions, simulator, monitoring
  features/family/     Household membership, permissions, audit history
  features/settings/   Account and feature status overview
  features/voice_assistant/ Speech capture and command interpretation
  shared/              Reusable widgets
docs/                  Architecture and learning guide
test/                  Flutter unit and widget tests
```

## Safety and scope

The current `DeviceControlService` is implemented by
`SimulatedDeviceControlService`; `SimulatedEsp32Gateway` only supplies fake
status updates. A simulated command result is not proof that a physical device
acted. There is no MQTT client or hardware backend in this build. Future
hardware must use a secured backend and TLS, with authentication, permissions,
acknowledgements, timeouts, and connection error handling. Never expose an
ESP32 directly to the public internet.

Voice recognition does not verify the speaker. Door unlocking is never
available by voice. Android asks the OS for the phone PIN or biometrics before
the simulated unlock; the web demo uses a confirmation dialog for the
simulated lock only.

Cloud Firestore access is governed by [`firestore.rules`](firestore.rules),
which must be deployed to the Firebase project. Client checks are not a
replacement for those rules. App Check is initialized for Android; a web App
Check provider still needs configuration for production.

## Learn the system

Read [docs/architecture.md](docs/architecture.md) for the component map,
Firestore paths, security boundaries, and future ESP32 plan. Then follow
[the learning guide](docs/prompts-1-to-3-learning-guide.md) to build and explain
the app feature by feature.
