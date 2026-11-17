import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../automations/data/automation_routine_store.dart';
import '../../dashboard/presentation/dashboard_screen.dart';
import '../../devices/domain/device_control_service.dart';
import '../../devices/domain/door_unlock_authenticator.dart';
import '../../voice_assistant/domain/voice_command_interpreter.dart';
import '../../voice_assistant/domain/voice_recognition_service.dart';
import '../data/firebase_auth_service.dart';
import 'auth_screen.dart';
import 'profile_screen.dart';
import 'welcome_screen.dart';

class AuthGate extends StatelessWidget {
  const AuthGate({
    required this.authService,
    required this.backendMessage,
    required this.isDarkMode,
    required this.onThemeToggle,
    required this.deviceControlService,
    required this.doorUnlockAuthenticator,
    required this.voiceRecognitionService,
    required this.voiceCommandInterpreter,
    required this.routineStore,
    super.key,
  });

  final FirebaseAuthService? authService;
  final String? backendMessage;
  final bool isDarkMode;
  final VoidCallback onThemeToggle;
  final DeviceControlService deviceControlService;
  final DoorUnlockAuthenticator doorUnlockAuthenticator;
  final VoiceRecognitionService voiceRecognitionService;
  final VoiceCommandInterpreter? voiceCommandInterpreter;
  final AutomationRoutineStore routineStore;

  @override
  Widget build(BuildContext context) {
    final service = authService;
    if (service == null) {
      return AuthScreen(
        authService: null,
        backendMessage: backendMessage,
        isDarkMode: isDarkMode,
        onThemeToggle: onThemeToggle,
      );
    }

    return StreamBuilder<User?>(
      stream: service.userChanges,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _AuthStreamError(error: snapshot.error.toString());
        }
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final user = snapshot.data;
        if (user == null) {
          return AuthScreen(
            authService: service,
            backendMessage: null,
            isDarkMode: isDarkMode,
            onThemeToggle: onThemeToggle,
          );
        }

        return _AuthenticatedHome(
          isDarkMode: isDarkMode,
          onThemeToggle: onThemeToggle,
          deviceControlService: deviceControlService,
          doorUnlockAuthenticator: doorUnlockAuthenticator,
          voiceRecognitionService: voiceRecognitionService,
          voiceCommandInterpreter: voiceCommandInterpreter,
          routineStore: routineStore,
          accountAction: () => showDialog<void>(
            context: context,
            builder: (context) => ProfileDialog(
              user: user,
              authService: service,
            ),
          ),
          accountLabel: user.displayName ?? user.email ?? 'Account',
        );
      },
    );
  }
}

class _AuthenticatedHome extends StatefulWidget {
  const _AuthenticatedHome({
    required this.isDarkMode,
    required this.onThemeToggle,
    required this.deviceControlService,
    required this.doorUnlockAuthenticator,
    required this.voiceRecognitionService,
    required this.voiceCommandInterpreter,
    required this.routineStore,
    required this.accountAction,
    required this.accountLabel,
  });

  final bool isDarkMode;
  final VoidCallback onThemeToggle;
  final DeviceControlService deviceControlService;
  final DoorUnlockAuthenticator doorUnlockAuthenticator;
  final VoiceRecognitionService voiceRecognitionService;
  final VoiceCommandInterpreter? voiceCommandInterpreter;
  final AutomationRoutineStore routineStore;
  final VoidCallback accountAction;
  final String accountLabel;

  @override
  State<_AuthenticatedHome> createState() => _AuthenticatedHomeState();
}

class _AuthenticatedHomeState extends State<_AuthenticatedHome> {
  bool _hasBegun = false;

  @override
  Widget build(BuildContext context) {
    if (!_hasBegun) {
      return WelcomeScreen(
        onBegin: () => setState(() => _hasBegun = true),
      );
    }

    return DashboardScreen(
      isDarkMode: widget.isDarkMode,
      onThemeToggle: widget.onThemeToggle,
      deviceControlService: widget.deviceControlService,
      doorUnlockAuthenticator: widget.doorUnlockAuthenticator,
      voiceRecognitionService: widget.voiceRecognitionService,
      voiceCommandInterpreter: widget.voiceCommandInterpreter,
      routineStore: widget.routineStore,
      accountAction: widget.accountAction,
      accountLabel: widget.accountLabel,
    );
  }
}

class _AuthStreamError extends StatelessWidget {
  const _AuthStreamError({required this.error});

  final String error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text('Authentication status could not be loaded: $error'),
        ),
      ),
    );
  }
}
