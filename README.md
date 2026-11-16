# AI Home Brain

AI Home Brain is a Flutter and Dart mobile-first smart-home app. It includes a
responsive home dashboard, reusable UI components, dark/light themes, and
Firebase Authentication flows for registration, login, password reset,
profile display, and logout.

## Authentication status

Firebase is Google's online backend service. Firebase Authentication securely
creates and checks user accounts, and can later work with Firestore to store
app data. Authentication is implemented with the real Firebase Authentication
SDK; it is **not simulated**. The Android app is connected to the AI Home Brain
Firebase project, and email/password signup has been verified. The local
Android configuration file is excluded from Git; another checkout needs its
own Firebase project configuration before authentication will work.

Every family member can register a separate account. Linking accounts to one
shared household, assigning roles, and inviting members are not implemented
yet; they require a secure household/invitation backend and access rules.
Dashboard automation selection and recent activity are illustrative only.
Appliance controls use an in-memory simulated device service: light and fan
controls, fan speed, and door lock/sensor state update only the app's simulated
state. The dashboard labels these states as simulated and reports that no
physical device was changed. No appliance or hardware is connected. Door
unlocking requires the phone's PIN or biometrics; voice alone cannot unlock it.

The voice assistant uses the phone's speech-recognition service where
available, then uses Firebase AI Logic with Gemini to interpret natural
language as one of a limited set of home actions. The app displays the
recognized words and its safe action plan. Sleep turns the light and fan off;
Morning turns the light on and fan off; Away turns both off and asks before
locking a closed door. If the door sensor says open, Away does not lock it.
Voice-based unlock requests are always rejected. Appliance actions remain
simulated and are not connected to real hardware.

## Architecture

The project uses a lightweight, feature-oriented structure:

- `lib/app/` owns app-wide configuration, including theme data and `MaterialApp`.
- `lib/features/auth/` owns the Firebase auth service and login/registration
  screens. `AuthGate` listens to Firebase's user state and protects the
  dashboard.
- `lib/features/dashboard/` owns the dashboard screen and its feature-specific UI.
- `lib/features/devices/` separates device state and the control-service
  contract from its in-memory simulated implementation. A future ESP32/MQTT
  integration can replace the implementation without coupling device logic to
  dashboard widgets. Door unlocking uses a separate phone-authentication
  interface.
- `lib/features/voice_assistant/` separates the phone speech-recognition
  adapter, Firebase AI Logic interpreter, and approved action model. The LLM
  can choose only from app-defined actions; UI code applies door safety checks
  and sends device changes through the simulated service.
- `lib/shared/` contains reusable widgets that can be shared across features.
- `test/` covers simulated device behavior, supported voice commands, and
  confirmation and unlock-safety flows.

Voice assistant, routines, household membership, and settings can be added
under `lib/features/` without placing all app logic in the dashboard. MQTT
should be introduced later behind a dedicated service/repository rather than
coupling the UI directly to it.

## Technologies

- **Flutter / Dart** for a single mobile-first codebase with a path to Android
  and iOS.
- **Material 3** for accessible, adaptive components and consistent theming.
- **Firebase Authentication** for real email/password accounts, sign-in,
  password reset, and session state.
- **local_auth** for phone PIN/biometric confirmation before door-unlock
  simulation.
- **speech_to_text** for phone-based speech recognition and transcription.
- **Firebase AI Logic / Gemini** to interpret transcribed natural-language
  home requests as a constrained action.
- **Firebase App Check** to help protect direct client access to the AI service.
- **Flutter tests** for simulated device-service behavior and UI behavior
  without physical devices.

Cloud Firestore household membership and MQTT over TLS are planned
integrations, not implemented in this iteration.

## Connect your Firebase project

1. Create a Firebase project and register an Android app with package name
   `com.example.ai_home_brain`.
2. Download `google-services.json` from the Firebase console and place it at
   `android/app/google-services.json`. This file is ignored by Git and should
   not be sent to others.
3. In Firebase Console, open **Authentication → Get started → Sign-in method**
   and enable **Email/Password**.
4. Run the app:

```sh
flutter run -d emulator-5554
```

The Android Google Services Gradle plugin reads the configuration file and
provides Firebase options to the Firebase SDK. The file contains client
configuration, not server credentials; never add a service-account key to the
app. iOS requires its own Firebase app registration and configuration and is
not set up yet.

## Enable Gemini for the voice assistant

1. In the Firebase console, open **AI Services → AI Logic → Get started** for
   this project and choose the **Gemini Developer API** provider.
2. Complete the setup so the required APIs are enabled and App Check is
   enforced for Firebase AI Logic.
3. Run the app in debug mode:

   ```sh
   flutter run -d emulator-5554
   ```

4. The debug App Check provider prints a debug token in the run output. In the
   Firebase console, open **App Check → Apps → Manage debug tokens** for this
   Android app and register that token. Keep the token private and never commit
   it to the project.
5. Try a spoken request such as “I am going to sleep.” The app sends only the
   transcript to Gemini and accepts only known action names. Model usage may
   be subject to provider quotas or charges.

The app uses the App Check debug provider for debug builds and Play Integrity
for Android release builds. The AI integration currently runs on Android;
iOS still needs Firebase and App Check configuration.

## Run locally

Install the Flutter SDK, then run:

```sh
flutter pub get
flutter run
```

Run the app tests with:

```sh
flutter test
```

For a beginner-friendly explanation of Prompts 1-3, the app architecture, and
what is real versus demo-only, see
[docs/prompts-1-to-3-learning-guide.md](docs/prompts-1-to-3-learning-guide.md).
