import 'dart:async';

import 'package:ai_home_brain/app/ai_home_brain_app.dart';
import 'package:ai_home_brain/app/firebase_config.dart';
import 'package:ai_home_brain/features/auth/data/firebase_auth_service.dart';
import 'package:ai_home_brain/features/dashboard/presentation/dashboard_screen.dart';
import 'package:ai_home_brain/features/devices/data/simulated_device_control_service.dart';
import 'package:ai_home_brain/features/devices/domain/door_unlock_authenticator.dart';
import 'package:ai_home_brain/features/voice_assistant/domain/voice_command.dart';
import 'package:ai_home_brain/features/voice_assistant/domain/voice_command_interpreter.dart';
import 'package:ai_home_brain/features/voice_assistant/domain/voice_recognition_service.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('resolves room-opening phrases without requiring the AI service', () {
    expect(
      resolveRoomNavigationCommand('Open the living room')?.action,
      VoiceAction.openLivingRoom,
    );
    expect(
      resolveRoomNavigationCommand('Please open the bedroom')?.action,
      VoiceAction.openBedroom,
    );
    expect(
      resolveRoomNavigationCommand('Turn on the bedroom light'),
      isNull,
    );
    expect(
      resolveRoomNavigationCommand("Don't open the bedroom"),
      isNull,
    );
  });

  testWidgets('shows real-backend setup status and switches themes',
      (tester) async {
    await tester.pumpWidget(
      const AiHomeBrainApp(
        authService: null,
        backendMessage: FirebaseConfig.setupMessage,
      ),
    );

    expect(find.text('AI Home Brain'), findsOneWidget);
    expect(find.text('Welcome Back!'), findsOneWidget);
    expect(
      find.textContaining('Firebase Authentication is not connected yet'),
      findsOneWidget,
    );

    final initialTheme = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(initialTheme.themeMode, ThemeMode.dark);

    await tester.tap(find.byTooltip('Switch to light theme'));
    await tester.pumpAndSettle();

    final updatedTheme = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(updatedTheme.themeMode, ThemeMode.light);
    expect(find.byTooltip('Switch to dark theme'), findsOneWidget);
  });

  testWidgets('validates sign-in input without pretending to authenticate',
      (tester) async {
    await tester.pumpWidget(
      const AiHomeBrainApp(
        authService: null,
        backendMessage: FirebaseConfig.setupMessage,
      ),
    );

    await tester.ensureVisible(find.text('Sign in'));
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('Enter your email address.'), findsOneWidget);
    expect(find.text('Enter your password.'), findsOneWidget);
    expect(find.text('Your devices'), findsNothing);
  });

  testWidgets('validates registration and matching passwords', (tester) async {
    await tester.pumpWidget(
      const AiHomeBrainApp(
        authService: null,
        backendMessage: FirebaseConfig.setupMessage,
      ),
    );

    final createAccountLink = find.text('New here? Create an account');
    await tester.ensureVisible(createAccountLink);
    await tester.tap(createAccountLink);
    await tester.pumpAndSettle();
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Alex Example');
    await tester.enterText(fields.at(1), 'alex@example.com');
    await tester.enterText(fields.at(2), 'securepass123');
    await tester.enterText(fields.at(3), 'different');
    await tester.tap(find.text('Create account'));
    await tester.pumpAndSettle();

    expect(find.text('Passwords do not match.'), findsOneWidget);
    expect(find.text('Your devices'), findsNothing);
  });

  testWidgets('sign-in shows welcome then lets user open the dashboard',
      (tester) async {
    final authService = _FakeFirebaseAuthService();
    addTearDown(authService.dispose);

    await tester.pumpWidget(
      AiHomeBrainApp(authService: authService),
    );
    authService.emit(null);
    await tester.pumpAndSettle();

    expect(find.text('Welcome Back!'), findsOneWidget);
    expect(find.text('Live Better\nWith Smart\nSpaces'), findsNothing);

    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'alex@example.com');
    await tester.enterText(fields.at(1), 'securepass123');
    await tester.ensureVisible(find.text('Sign in'));
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('Live Better\nWith Smart\nSpaces'), findsOneWidget);
    expect(find.text('Favorite Devices'), findsNothing);

    await tester.tap(find.text("Let's Begin"));
    await tester.pumpAndSettle();
    expect(find.text('Favorite Devices'), findsOneWidget);
  });

  testWidgets('dashboard shows device states and demo controls',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final deviceService = SimulatedDeviceControlService();
    addTearDown(deviceService.dispose);
    final authenticator = _FakeDoorUnlockAuthenticator();

    await tester.pumpWidget(
      MaterialApp(
        home: DashboardScreen(
          isDarkMode: true,
          onThemeToggle: () {},
          accountAction: () {},
          accountLabel: 'Alex Example',
          deviceControlService: deviceService,
          doorUnlockAuthenticator: authenticator,
          voiceRecognitionService: _FakeVoiceRecognitionService(),
          voiceCommandInterpreter: _FakeVoiceCommandInterpreter(),
        ),
      ),
    );

    expect(find.text('Alex 👋'), findsOneWidget);
    expect(find.text('Home offline'), findsOneWidget);
    expect(find.text('Light'), findsOneWidget);
    expect(find.text('Fan'), findsOneWidget);
    expect(find.text('Door'), findsOneWidget);
    expect(find.text('My Scenes'), findsOneWidget);
    expect(find.text('Morning'), findsOneWidget);
    expect(find.text('Favorite Devices'), findsOneWidget);
    expect(tester.getRect(find.text('Morning')).right, lessThanOrEqualTo(390));
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Morning'));
    await tester.pumpAndSettle();
    expect(find.text('Morning mode selected.'), findsOneWidget);
    expect(find.text('Devices'), findsOneWidget);
    await tester.tap(find.text('Devices'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
      1,
    );
    expect(find.text('My Devices'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('device-location-Front entry')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('device-image-Living room')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('device-image-Bedroom')),
      findsOneWidget,
    );

    final bedroomRoomFilter = find.widgetWithText(ChoiceChip, 'Bedroom');
    await tester.ensureVisible(bedroomRoomFilter);
    await tester.tap(bedroomRoomFilter);
    await tester.pumpAndSettle();
    expect(find.text('Fan'), findsOneWidget);
    expect(find.text('Light'), findsNothing);
    final allRoomFilter = find.widgetWithText(ChoiceChip, 'All');
    await tester.ensureVisible(allRoomFilter);
    await tester.tap(allRoomFilter);
    await tester.pumpAndSettle();
    expect(find.text('Light'), findsOneWidget);
    final frontEntryLocation =
        find.byKey(const ValueKey('device-location-Front entry'));
    await tester.ensureVisible(frontEntryLocation);
    expect(tester.getRect(frontEntryLocation).left, greaterThanOrEqualTo(0));
    expect(tester.getRect(frontEntryLocation).right, lessThanOrEqualTo(390));

    final lightPowerToggle = find.byKey(const ValueKey('light-power-toggle'));
    await tester.ensureVisible(lightPowerToggle);
    await tester.tap(lightPowerToggle);
    await tester.pumpAndSettle();

    expect(deviceService.state.lightOn, isTrue);
    expect(find.text('ON · Simulated'), findsOneWidget);
    expect(
        find.textContaining('No physical device was changed.'), findsOneWidget);

    final fanPowerToggle = find.byKey(const ValueKey('fan-power-toggle'));
    await tester.ensureVisible(fanPowerToggle);
    await tester.tap(fanPowerToggle);
    await tester.pumpAndSettle();
    expect(deviceService.state.fanOn, isTrue);
    expect(find.text('Speed 2 of 5 · Simulated'), findsOneWidget);
    await tester.drag(find.byType(ListView).first, const Offset(0, 120));
    await tester.pumpAndSettle();
    final bedroomDetails = find.text('Open Bedroom');
    await tester.ensureVisible(bedroomDetails);
    await tester.tap(bedroomDetails);
    await tester.pumpAndSettle();
    expect(find.text('Bedroom'), findsWidgets);
    expect(find.text('Fan Speed'), findsOneWidget);
    expect(find.text('Front Door'), findsOneWidget);
    await tester.drag(find.byType(Slider), const Offset(80, 0));
    await tester.pumpAndSettle();
    expect(deviceService.state.fanSpeed, greaterThan(2));
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();

    final doorDetailsButton = find.byTooltip('Door details');
    await tester.ensureVisible(doorDetailsButton);
    await tester.tap(doorDetailsButton);
    await tester.pumpAndSettle();
    expect(
      find.text('Unlocking requires phone PIN or biometrics. '
          'Voice commands cannot unlock the door.'),
      findsOneWidget,
    );

    final doorOpenControl = find.text('Simulate door open');
    await tester.ensureVisible(doorOpenControl);
    await tester.tap(doorOpenControl);
    await tester.pumpAndSettle();
    expect(deviceService.state.doorOpen, isTrue);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();

    final unlockButton = find.byTooltip('Unlock door');
    await tester.ensureVisible(unlockButton);
    await tester.tap(unlockButton);
    await tester.pumpAndSettle();
    expect(authenticator.called, isTrue);
    expect(deviceService.state.doorLocked, isTrue);

    authenticator.result = true;
    await tester.tap(unlockButton);
    await tester.pumpAndSettle();
    expect(deviceService.state.doorLocked, isFalse);
    expect(find.text('Unlocked · Simulated'), findsOneWidget);

    final lockButton = find.byTooltip('Lock door');
    await tester.ensureVisible(lockButton);
    await tester.tap(lockButton);
    await tester.pumpAndSettle();
    expect(deviceService.state.doorLocked, isTrue);

    await tester.tap(find.text('Home'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first, const Offset(0, -600));
    await tester.pumpAndSettle();
    expect(find.text('Voice assistant'), findsOneWidget);
    expect(find.text('Recent Activity'), findsOneWidget);
  });

  testWidgets('assistant tab opens the animated voice command screen',
      (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final deviceService = SimulatedDeviceControlService();
    addTearDown(deviceService.dispose);
    final voiceService = _FakeVoiceRecognitionService();

    await tester.pumpWidget(
      MaterialApp(
        home: DashboardScreen(
          isDarkMode: true,
          onThemeToggle: () {},
          accountAction: () {},
          accountLabel: 'Alex Example',
          deviceControlService: deviceService,
          doorUnlockAuthenticator: _FakeDoorUnlockAuthenticator(),
          voiceRecognitionService: voiceService,
          voiceCommandInterpreter: _FakeVoiceCommandInterpreter(),
        ),
      ),
    );

    await tester.tap(find.text('Assistant'));
    await tester.pump();
    expect(find.text('Tap the microphone to speak'), findsOneWidget);
    expect(find.text('Living Room'), findsOneWidget);
    expect(find.text('Bedroom'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('Living Room'));
    await tester.pumpAndSettle();
    expect(find.text('My Devices'), findsOneWidget);
    expect(find.text('Light'), findsOneWidget);
    expect(find.text('Fan'), findsNothing);

    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Assistant'));
    await tester.pump();
    await tester.tap(find.byTooltip('Start listening'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Listening…'), findsOneWidget);

    voiceService.emit('Turn on the light');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Requested action'), findsOneWidget);
    expect(
        find.text('Light turned on in simulation. '
            'No physical device was changed.'),
        findsOneWidget);
    expect(deviceService.state.lightOn, isTrue);

    final roomsButton = find.text('Rooms');
    await tester.ensureVisible(roomsButton);
    await tester.tap(roomsButton);
    await tester.pumpAndSettle();
    expect(find.text('My Devices'), findsOneWidget);

    await tester.tap(find.text('Assistant'));
    await tester.pump();
    await tester.tap(find.byTooltip('Start listening'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    voiceService.emit('Open living room');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('My Devices'), findsOneWidget);
    expect(find.text('Light'), findsOneWidget);
    expect(find.text('Fan'), findsNothing);

    await tester.tap(find.text('Assistant'));
    await tester.pump();
    await tester.tap(find.byTooltip('Start listening'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    voiceService.emit('Open bedroom');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Bedroom'), findsWidgets);
    expect(find.text('Fan Speed'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('room voice navigation works without the AI interpreter',
      (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final deviceService = SimulatedDeviceControlService();
    addTearDown(deviceService.dispose);
    final voiceService = _FakeVoiceRecognitionService();

    await tester.pumpWidget(
      MaterialApp(
        home: DashboardScreen(
          isDarkMode: true,
          onThemeToggle: () {},
          accountAction: () {},
          accountLabel: 'Alex Example',
          deviceControlService: deviceService,
          doorUnlockAuthenticator: _FakeDoorUnlockAuthenticator(),
          voiceRecognitionService: voiceService,
          voiceCommandInterpreter: null,
        ),
      ),
    );

    await tester.tap(find.text('Assistant'));
    await tester.pump();
    await tester.tap(find.byTooltip('Start listening'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    voiceService.emit('Open the living room');
    await tester.pump();

    expect(find.text('My Devices'), findsOneWidget);
    expect(find.text('Light'), findsOneWidget);
    expect(find.text('Fan'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('voice commands require confirmation and cannot unlock doors',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final deviceService = SimulatedDeviceControlService();
    addTearDown(deviceService.dispose);
    await deviceService.setDoorLocked(false);
    final authenticator = _FakeDoorUnlockAuthenticator();
    final voiceService = _FakeVoiceRecognitionService();

    await tester.pumpWidget(
      MaterialApp(
        home: DashboardScreen(
          isDarkMode: true,
          onThemeToggle: () {},
          accountAction: () {},
          accountLabel: 'Alex Example',
          deviceControlService: deviceService,
          doorUnlockAuthenticator: authenticator,
          voiceRecognitionService: voiceService,
          voiceCommandInterpreter: _FakeVoiceCommandInterpreter(),
        ),
      ),
    );

    final talkButton = find.text('Talk');
    await tester.ensureVisible(talkButton);
    await tester.tap(talkButton);
    await tester.pumpAndSettle();
    voiceService.emit('lock the door');
    await tester.pumpAndSettle();

    expect(find.text('Recognized speech: “lock the door”'), findsOneWidget);
    expect(find.text('Confirm and lock'), findsOneWidget);
    expect(deviceService.state.doorLocked, isFalse);

    await tester.tap(find.text('Confirm and lock'));
    await tester.pumpAndSettle();
    expect(deviceService.state.doorLocked, isTrue);

    await tester.tap(find.text('Talk'));
    await tester.pumpAndSettle();
    voiceService.emit('unlock the door');
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Door unlocking is never available by voice.'),
      findsOneWidget,
    );
    expect(deviceService.state.doorLocked, isTrue);
    expect(authenticator.called, isFalse);
  });

  testWidgets('voice commands run simulated device and mode actions',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final deviceService = SimulatedDeviceControlService();
    addTearDown(deviceService.dispose);
    final voiceService = _FakeVoiceRecognitionService();

    await tester.pumpWidget(
      MaterialApp(
        home: DashboardScreen(
          isDarkMode: true,
          onThemeToggle: () {},
          accountAction: () {},
          accountLabel: 'Alex Example',
          deviceControlService: deviceService,
          doorUnlockAuthenticator: _FakeDoorUnlockAuthenticator(),
          voiceRecognitionService: voiceService,
          voiceCommandInterpreter: _FakeVoiceCommandInterpreter(),
        ),
      ),
    );

    final talkButton = find.text('Talk');
    await tester.ensureVisible(talkButton);
    await tester.tap(talkButton);
    await tester.pumpAndSettle();
    voiceService.emit('Turn on the light');
    await tester.pumpAndSettle();
    expect(find.text('Action: Turn the simulated light on.'), findsOneWidget);

    expect(deviceService.state.lightOn, isTrue);
    expect(
      find.text(
          'Light turned on in simulation. No physical device was changed.'),
      findsOneWidget,
    );

    await tester.tap(talkButton);
    await tester.pumpAndSettle();
    voiceService.emit('Good morning');
    await tester.pumpAndSettle();
    expect(deviceService.state.lightOn, isTrue);
    expect(deviceService.state.fanOn, isFalse);
    expect(
      find.textContaining(
        'Morning routine complete: light is on, fan is off; door unchanged.',
      ),
      findsOneWidget,
    );
    expect(
      tester
          .widget<ChoiceChip>(
            find.widgetWithText(ChoiceChip, 'Morning'),
          )
          .selected,
      isTrue,
    );

    await tester.tap(talkButton);
    await tester.pumpAndSettle();
    voiceService.emit('I am going to sleep');
    await tester.pumpAndSettle();
    expect(deviceService.state.lightOn, isFalse);
    expect(deviceService.state.fanOn, isFalse);
    expect(
      tester
          .widget<ChoiceChip>(
            find.widgetWithText(ChoiceChip, 'Sleep'),
          )
          .selected,
      isTrue,
    );
    expect(
      find.textContaining('Sleep routine complete'),
      findsOneWidget,
    );
  });

  testWidgets('away routine skips an open door and confirms a closed door',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final deviceService = SimulatedDeviceControlService();
    addTearDown(deviceService.dispose);
    await deviceService.setDoorLocked(false);
    final voiceService = _FakeVoiceRecognitionService();

    await tester.pumpWidget(
      MaterialApp(
        home: DashboardScreen(
          isDarkMode: true,
          onThemeToggle: () {},
          accountAction: () {},
          accountLabel: 'Alex Example',
          deviceControlService: deviceService,
          doorUnlockAuthenticator: _FakeDoorUnlockAuthenticator(),
          voiceRecognitionService: voiceService,
          voiceCommandInterpreter: _FakeVoiceCommandInterpreter(),
        ),
      ),
    );

    final talkButton = find.text('Talk');
    await tester.ensureVisible(talkButton);
    await tester.tap(talkButton);
    await tester.pumpAndSettle();
    voiceService.emit('I am going outside');
    await tester.pumpAndSettle();

    expect(deviceService.state.lightOn, isFalse);
    expect(deviceService.state.fanOn, isFalse);
    expect(deviceService.state.doorLocked, isFalse);
    expect(find.text('Confirm and lock'), findsOneWidget);
    expect(
      find.textContaining('The door is closed; confirm'),
      findsOneWidget,
    );

    await tester.tap(find.text('Confirm and lock'));
    await tester.pumpAndSettle();
    expect(deviceService.state.doorLocked, isTrue);

    await deviceService.setDoorLocked(false);
    await deviceService.setDoorOpen(true);
    await deviceService.setLight(true);
    await deviceService.setFan(true);
    await tester.tap(talkButton);
    await tester.pumpAndSettle();
    voiceService.emit('I am going outside');
    await tester.pumpAndSettle();

    expect(deviceService.state.lightOn, isFalse);
    expect(deviceService.state.fanOn, isFalse);
    expect(deviceService.state.doorLocked, isFalse);
    expect(
      find.textContaining('The door is open, so it was not locked'),
      findsOneWidget,
    );
    expect(find.text('Confirm and lock'), findsNothing);
  });

  testWidgets('speech timeout explains how to restore microphone input',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final deviceService = SimulatedDeviceControlService();
    addTearDown(deviceService.dispose);
    final voiceService = _FakeVoiceRecognitionService();

    await tester.pumpWidget(
      MaterialApp(
        home: DashboardScreen(
          isDarkMode: true,
          onThemeToggle: () {},
          accountAction: () {},
          accountLabel: 'Alex Example',
          deviceControlService: deviceService,
          doorUnlockAuthenticator: _FakeDoorUnlockAuthenticator(),
          voiceRecognitionService: voiceService,
          voiceCommandInterpreter: _FakeVoiceCommandInterpreter(),
        ),
      ),
    );

    final talkButton = find.text('Talk');
    await tester.ensureVisible(talkButton);
    await tester.tap(talkButton);
    await tester.pumpAndSettle();
    voiceService.emitError('error_speech_timeout');
    await tester.pumpAndSettle();

    expect(
      find.textContaining('No speech was detected. Tap Talk'),
      findsOneWidget,
    );
  });

  testWidgets('new speech supersedes an unfinished AI response',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final deviceService = SimulatedDeviceControlService();
    addTearDown(deviceService.dispose);
    await deviceService.setLight(true);
    await deviceService.setFan(true);
    final voiceService = _FakeVoiceRecognitionService();
    final interpreter = _PendingVoiceCommandInterpreter();

    await tester.pumpWidget(
      MaterialApp(
        home: DashboardScreen(
          isDarkMode: true,
          onThemeToggle: () {},
          accountAction: () {},
          accountLabel: 'Alex Example',
          deviceControlService: deviceService,
          doorUnlockAuthenticator: _FakeDoorUnlockAuthenticator(),
          voiceRecognitionService: voiceService,
          voiceCommandInterpreter: interpreter,
        ),
      ),
    );

    final talkButton = find.text('Talk');
    await tester.ensureVisible(talkButton);
    await tester.tap(talkButton);
    await tester.pump();
    voiceService.emit('I am going to sleep');
    await tester.pump();

    expect(
      find.textContaining('AI is understanding your request'),
      findsOneWidget,
    );
    expect(find.text('Talk'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Talk'),
          )
          .onPressed,
      isNotNull,
    );

    await tester.pump(const Duration(seconds: 25));
    await tester.pump();

    expect(find.textContaining('AI is understanding your request'),
        findsOneWidget);
    await tester.tap(find.text('Talk'));
    await tester.pump();
    expect(
        find.text('Listening… Tell me what you need at home.'), findsOneWidget);

    voiceService.emit('Good morning');
    await tester.pump();

    interpreter.complete(
      'I am going to sleep',
      VoiceCommand.fromModelAction('sleep_mode'),
    );
    await tester.pumpAndSettle();
    expect(deviceService.state.lightOn, isTrue);
    expect(deviceService.state.fanOn, isTrue);

    interpreter.complete(
      'Good morning',
      VoiceCommand.fromModelAction('morning_mode'),
    );
    await tester.pumpAndSettle();

    expect(deviceService.state.lightOn, isTrue);
    expect(deviceService.state.fanOn, isFalse);
    expect(
        find.textContaining('Gemini took too long to respond'), findsNothing);
  });
}

class _FakeFirebaseAuthService implements FirebaseAuthService {
  final _users = StreamController<User?>.broadcast(sync: true);

  @override
  Stream<User?> get userChanges => _users.stream;

  void emit(User? user) => _users.add(user);

  @override
  Future<void> signIn({
    required String email,
    required String password,
  }) async {
    emit(_FakeUser());
  }

  @override
  Future<void> register({
    required String displayName,
    required String email,
    required String password,
  }) async {
    emit(_FakeUser());
  }

  @override
  Future<void> sendPasswordReset(String email) async {}

  @override
  Future<void> signOut() async {
    emit(null);
  }

  Future<void> dispose() => _users.close();
}

class _FakeUser implements User {
  @override
  String? get displayName => 'Alex Example';

  @override
  String? get email => 'alex@example.com';

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeDoorUnlockAuthenticator implements DoorUnlockAuthenticator {
  bool result = false;
  bool called = false;

  @override
  Future<bool> authenticateForDoorUnlock() async {
    called = true;
    return result;
  }
}

class _FakeVoiceRecognitionService implements VoiceRecognitionService {
  void Function(String transcript, bool isFinal)? _onResult;
  void Function(String status)? _onStatus;
  void Function(String message)? _onError;

  @override
  Future<bool> initialize({
    required void Function(String status) onStatus,
    required void Function(String message) onError,
  }) async {
    _onStatus = onStatus;
    _onError = onError;
    return true;
  }

  @override
  Future<void> listen({
    required void Function(String transcript, bool isFinal) onResult,
  }) async {
    _onResult = onResult;
    _onStatus?.call('listening');
  }

  @override
  Future<void> stop() async {
    _onStatus?.call('done');
  }

  void emit(String transcript) {
    _onResult?.call(transcript, true);
    _onStatus?.call('done');
  }

  void emitError(String message) {
    _onError?.call(message);
  }
}

class _FakeVoiceCommandInterpreter implements VoiceCommandInterpreter {
  @override
  Future<VoiceCommand> interpret(String transcript) async {
    final action = switch (transcript.toLowerCase()) {
      'i am going to sleep' => 'sleep_mode',
      'good morning' => 'morning_mode',
      'i am going outside' => 'away_mode',
      'turn on the light' => 'turn_light_on',
      'open living room' => 'open_living_room',
      'open bedroom' => 'open_bedroom',
      'lock the door' => 'lock_door',
      'unlock the door' => 'unlock_door',
      _ => 'unsupported',
    };
    return VoiceCommand.fromModelAction(action);
  }
}

class _PendingVoiceCommandInterpreter implements VoiceCommandInterpreter {
  final Map<String, Completer<VoiceCommand>> _pendingCommands = {};

  void complete(String transcript, VoiceCommand command) {
    _pendingCommands[transcript]!.complete(command);
  }

  @override
  Future<VoiceCommand> interpret(String transcript) {
    return (_pendingCommands[transcript] ??= Completer<VoiceCommand>()).future;
  }
}
