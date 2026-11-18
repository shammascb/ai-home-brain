import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';

import '../../automations/data/automation_routine_store.dart';
import '../../automations/domain/automation_routine.dart';
import '../../automations/domain/automation_routine_executor.dart';
import '../../automations/presentation/automations_screen.dart';
import '../../automations/presentation/routine_dialogs.dart';
import '../../devices/domain/device_control_exception.dart';
import '../../devices/domain/device_control_service.dart';
import '../../devices/domain/device_state.dart';
import '../../devices/domain/door_unlock_authenticator.dart';
import '../../voice_assistant/domain/voice_command.dart';
import '../../voice_assistant/domain/voice_command_interpreter.dart';
import '../../voice_assistant/domain/voice_recognition_service.dart';
import '../../voice_assistant/presentation/voice_assistant_screen.dart';
import 'bedroom_detail_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({
    required this.isDarkMode,
    required this.onThemeToggle,
    required this.accountAction,
    required this.accountLabel,
    required this.deviceControlService,
    required this.doorUnlockAuthenticator,
    required this.voiceRecognitionService,
    required this.voiceCommandInterpreter,
    required this.routineStore,
    super.key,
  });

  final bool isDarkMode;
  final VoidCallback onThemeToggle;
  final VoidCallback accountAction;
  final String accountLabel;
  final DeviceControlService deviceControlService;
  final DoorUnlockAuthenticator doorUnlockAuthenticator;
  final VoiceRecognitionService voiceRecognitionService;
  final VoiceCommandInterpreter? voiceCommandInterpreter;
  final AutomationRoutineStore routineStore;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  String _selectedMode = 'Home';
  String _selectedDeviceRoom = 'All';
  int _selectedNavigationIndex = 0;
  bool _isAuthenticatingDoor = false;
  bool _isListening = false;
  bool _isInterpretingVoiceCommand = false;
  bool _isExecutingVoiceAction = false;
  bool _awaitingVoiceDoorLockConfirmation = false;
  int _voiceInterpretationRequestId = 0;
  String _recognizedSpeech = '';
  String? _voiceError;
  String? _voiceActionResult;
  VoiceCommand? _recognizedCommand;
  final ScrollController _dashboardScrollController = ScrollController();
  final GlobalKey _scenesSectionKey = GlobalKey();
  final GlobalKey _devicesSectionKey = GlobalKey();

  @override
  void dispose() {
    _dashboardScrollController.dispose();
    super.dispose();
  }

  String get _firstName {
    final name = widget.accountLabel.split('@').first.trim();
    return name.isEmpty ? 'there' : name.split(RegExp(r'[\s._-]')).first;
  }

  String get _timeGreeting {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  void _openBedroomDetails() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => BedroomDetailScreen(
          deviceControlService: widget.deviceControlService,
          onLightChanged: (isOn) => _performDemoAction(
            isOn ? 'Light ON' : 'Light OFF',
            () => widget.deviceControlService.setLight(isOn),
          ),
          onFanChanged: (isOn) => _performDemoAction(
            isOn ? 'Fan ON' : 'Fan OFF',
            () => widget.deviceControlService.setFan(isOn),
          ),
          onFanSpeedChanged: (speed) => _performDemoAction(
            'Fan speed',
            () => widget.deviceControlService.setFanSpeed(speed),
          ),
          onDoorLockedChanged: _setDoorLocked,
          onDoorOpenChanged: (isOpen) => _performDemoAction(
            'Door sensor',
            () => widget.deviceControlService.setDoorOpen(isOpen),
          ),
        ),
      ),
    );
  }

  void _openLivingRoomControls() {
    setState(() {
      _selectedDeviceRoom = 'Living room';
      _selectedNavigationIndex = 1;
    });
    _showDemoNotice('Opening Living room controls.');
  }

  void _selectNavigation(int index) {
    if (index == 4) {
      widget.accountAction();
      return;
    }

    setState(() => _selectedNavigationIndex = index);
    if (index == 0 && _dashboardScrollController.hasClients) {
      unawaited(
        _dashboardScrollController.animateTo(
          0,
          duration: const Duration(milliseconds: 320),
          curve: Curves.easeOutCubic,
        ),
      );
    }
  }

  Future<void> _runRoutineFromScene(RoutineId id) async {
    final routine = widget.routineStore.routineFor(id);
    final report = await showRoutineExecutionDialog(
      context: context,
      routine: routine,
      deviceControlService: widget.deviceControlService,
      routineStore: widget.routineStore,
    );
    if (!mounted || report == null) return;
    setState(() => _selectedMode = routine.modeChipLabel);
  }

  void _showDemoNotice(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  Future<void> _performDemoAction(
    String action,
    Future<void> Function() operation,
  ) async {
    try {
      await operation();
      if (!mounted) return;
      _showDemoNotice(
        '$action changed in simulation. No physical device was changed.',
      );
    } on DeviceControlException catch (error) {
      if (!mounted) return;
      _showDemoNotice('Action not applied: ${error.message}');
    }
  }

  Future<bool> _confirmWebDoorUnlock() async {
    final result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Confirm Door Unlock'),
        content: const Text(
          'Confirm to simulate unlocking the front door.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Confirm unlock'),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  Future<void> _setDoorLocked(bool isLocked) async {
    if (isLocked) {
      await _performDemoAction(
        'Door lock',
        () => widget.deviceControlService.setDoorLocked(true),
      );
      return;
    }

    setState(() => _isAuthenticatingDoor = true);
    try {
      final authenticated = kIsWeb
          ? await _confirmWebDoorUnlock()
          : await widget.doorUnlockAuthenticator.authenticateForDoorUnlock();
      if (!mounted) return;
      if (!authenticated) {
        _showDemoNotice(
          'Authentication was not confirmed. The simulated door remains locked.',
        );
        return;
      }

      await _performDemoAction(
        'Door unlock',
        () => widget.deviceControlService.setDoorLocked(false),
      );
    } on LocalAuthException catch (error) {
      if (!mounted) return;
      _showDemoNotice(
        'Device authentication failed (${error.code}). '
        'The simulated door remains locked.',
      );
    } finally {
      if (mounted) setState(() => _isAuthenticatingDoor = false);
    }
  }

  Future<void> _toggleVoiceRecognition() async {
    if (_isListening) {
      try {
        await widget.voiceRecognitionService.stop();
      } on PlatformException catch (error) {
        if (!mounted) return;
        setState(() => _voiceError =
            'Could not stop speech recognition: ${error.message ?? error.code}');
      }
      if (mounted) setState(() => _isListening = false);
      return;
    }

    if (_isInterpretingVoiceCommand) {
      _voiceInterpretationRequestId++;
    }

    setState(() {
      _isListening = true;
      _isInterpretingVoiceCommand = false;
      _recognizedSpeech = '';
      _recognizedCommand = null;
      _awaitingVoiceDoorLockConfirmation = false;
      _voiceError = null;
      _voiceActionResult = null;
    });

    try {
      final isAvailable = await widget.voiceRecognitionService.initialize(
        onStatus: _onVoiceStatus,
        onError: _onVoiceError,
      );
      if (!mounted || !_isListening) return;
      if (!isAvailable) {
        setState(() {
          _isListening = false;
          _voiceError =
              'Speech recognition is unavailable. Check microphone permission '
              'and try again.';
        });
        return;
      }

      await widget.voiceRecognitionService.listen(onResult: _onVoiceResult);
    } on PlatformException catch (error) {
      if (!mounted) return;
      setState(() {
        _isListening = false;
        _voiceError =
            'Could not start speech recognition: ${error.message ?? error.code}';
      });
    }
  }

  void _onVoiceStatus(String status) {
    if (!mounted) return;
    final isListening = status == 'listening';
    if (status == 'done') {
      setState(() => _isListening = false);
    } else if (isListening != _isListening) {
      setState(() => _isListening = isListening);
    }
  }

  void _onVoiceError(String message) {
    if (!mounted) return;
    final userMessage = switch (message) {
      'error_speech_timeout' =>
        'No speech was detected. Tap Talk and speak as soon as Listening '
            'appears. Check microphone permission and emulator audio input.',
      'error_no_match' =>
        'I could not recognize those words. Please try a short command again.',
      _ => 'Speech recognition failed: $message',
    };
    setState(() {
      _isListening = false;
      _voiceError = userMessage;
    });
  }

  void _onVoiceResult(String transcript, bool isFinal) {
    if (!mounted) return;
    final words = transcript.trim();
    setState(() {
      _recognizedSpeech = words;
      _voiceError = null;
      _voiceActionResult = null;
      _recognizedCommand = null;
      if (isFinal && words.isEmpty) {
        _voiceError = 'No speech was recognized. Please try again.';
      }
    });
    if (isFinal && words.isNotEmpty) {
      unawaited(_interpretVoiceTranscript(words));
    }
  }

  Future<void> _interpretVoiceTranscript(String transcript) async {
    final requestId = ++_voiceInterpretationRequestId;
    final roomCommand = resolveRoomNavigationCommand(transcript);
    if (roomCommand != null) {
      if (!mounted || requestId != _voiceInterpretationRequestId) return;
      setState(() => _recognizedCommand = roomCommand);
      if (roomCommand.action == VoiceAction.openLivingRoom) {
        _openLivingRoomControls();
      } else {
        _openBedroomDetails();
      }
      return;
    }

    final interpreter = widget.voiceCommandInterpreter;
    if (interpreter == null) {
      setState(() {
        _voiceError =
            'AI voice assistant is not configured. Connect Firebase AI Logic '
            'and try again.';
      });
      return;
    }

    setState(() {
      _isInterpretingVoiceCommand = true;
      _voiceError = null;
    });

    try {
      final command = await interpreter.interpret(transcript);
      if (!mounted || requestId != _voiceInterpretationRequestId) return;
      setState(() => _recognizedCommand = command);

      if (command.action == VoiceAction.unsupported) {
        setState(() => _voiceError =
            'I could not match that request to a home action. Try asking about '
                'Sleep, Morning, Away, the light, fan, door lock, or open a room.');
      } else if (command.action == VoiceAction.openLivingRoom) {
        _openLivingRoomControls();
      } else if (command.action == VoiceAction.openBedroom) {
        _openBedroomDetails();
      } else if (command.isExecutable && !command.requiresConfirmation) {
        await _executeVoiceCommand(command);
      }
    } on VoiceCommandInterpretationException catch (error) {
      if (!mounted || requestId != _voiceInterpretationRequestId) return;
      setState(() => _voiceError = 'AI assistant failed: ${error.message}');
    } finally {
      if (mounted && requestId == _voiceInterpretationRequestId) {
        setState(() => _isInterpretingVoiceCommand = false);
      }
    }
  }

  Future<void> _executeVoiceCommand(VoiceCommand command) async {
    if (!command.isExecutable || _isExecutingVoiceAction) {
      return;
    }

    setState(() {
      _isExecutingVoiceAction = true;
      _voiceActionResult = null;
    });

    try {
      final result = switch (command.action) {
        VoiceAction.sleepMode => await _runSleepRoutine(),
        VoiceAction.morningMode => await _runMorningRoutine(),
        VoiceAction.awayMode => await _runAwayRoutine(),
        VoiceAction.turnLightOn =>
          await _setVoiceDeviceState('Light turned on in simulation.', () {
            return widget.deviceControlService.setLight(true);
          }),
        VoiceAction.turnLightOff =>
          await _setVoiceDeviceState('Light turned off in simulation.', () {
            return widget.deviceControlService.setLight(false);
          }),
        VoiceAction.turnFanOn =>
          await _setVoiceDeviceState('Fan turned on in simulation.', () {
            return widget.deviceControlService.setFan(true);
          }),
        VoiceAction.turnFanOff =>
          await _setVoiceDeviceState('Fan turned off in simulation.', () {
            return widget.deviceControlService.setFan(false);
          }),
        VoiceAction.lockDoor =>
          await _setVoiceDeviceState('Door locked in simulation.', () {
            return widget.deviceControlService.setDoorLocked(true);
          }),
        VoiceAction.unlockDoorBlocked ||
        VoiceAction.openLivingRoom ||
        VoiceAction.openBedroom ||
        VoiceAction.unsupported =>
          null,
      };
      if (!mounted) return;
      if (result != null) {
        setState(
          () => _voiceActionResult = '$result No physical device was changed.',
        );
      }
    } on DeviceControlException catch (error) {
      if (!mounted) return;
      setState(
        () => _voiceActionResult =
            'Routine incomplete: ${error.message} Check the displayed device states.',
      );
    } finally {
      if (mounted) setState(() => _isExecutingVoiceAction = false);
    }
  }

  Future<String> _runVoiceRoutine(RoutineId id) async {
    final routine = widget.routineStore.routineFor(id);
    setState(() => _selectedMode = routine.modeChipLabel);

    final needsDoorConfirm =
        routine.needsExplicitSafetyCheck(widget.deviceControlService.state);
    final report = await const AutomationRoutineExecutor().execute(
      routine: routine,
      deviceControlService: widget.deviceControlService,
      doorSafetyConfirmed: !needsDoorConfirm,
    );
    widget.routineStore.recordExecutionReport(report);

    if (needsDoorConfirm && mounted) {
      setState(() => _awaitingVoiceDoorLockConfirmation = true);
    }

    final summary = report.steps.map((s) => s.message).join(' ');
    if (needsDoorConfirm) {
      return '${routine.title}: $summary Confirm if you want the front door locked.';
    }
    return '${routine.title} (${report.overallStatusLabel}): $summary';
  }

  Future<String> _runSleepRoutine() => _runVoiceRoutine(RoutineId.sleep);

  Future<String> _runMorningRoutine() => _runVoiceRoutine(RoutineId.morning);

  Future<String> _runAwayRoutine() => _runVoiceRoutine(RoutineId.away);

  Future<void> _runVoiceConfirmation() async {
    if (_awaitingVoiceDoorLockConfirmation) {
      await _confirmAwayDoorLock();
      return;
    }
    final command = _recognizedCommand;
    if (command?.action == VoiceAction.lockDoor) {
      await _executeVoiceCommand(command!);
    }
  }

  Future<void> _confirmAwayDoorLock() async {
    if (_isExecutingVoiceAction) return;
    setState(() {
      _isExecutingVoiceAction = true;
      _voiceActionResult = 'Locking the simulated door…';
    });
    try {
      await widget.deviceControlService.setDoorLocked(true);
      if (!mounted) return;
      setState(() {
        _awaitingVoiceDoorLockConfirmation = false;
        _voiceActionResult =
            'Door locked in simulation. No physical device was changed.';
      });
    } on DeviceControlException catch (error) {
      if (!mounted) return;
      setState(
          () => _voiceActionResult = 'Door was not locked: ${error.message}');
    } finally {
      if (mounted) setState(() => _isExecutingVoiceAction = false);
    }
  }

  void _cancelVoiceConfirmation() {
    setState(() {
      _awaitingVoiceDoorLockConfirmation = false;
      _recognizedCommand = null;
      _voiceActionResult =
          'Confirmation canceled. The door was not locked by this request.';
    });
  }

  void _clearVoiceAssistant() {
    _voiceInterpretationRequestId++;
    if (_isListening) {
      unawaited(_toggleVoiceRecognition());
    }
    setState(() {
      _isInterpretingVoiceCommand = false;
      _recognizedSpeech = '';
      _recognizedCommand = null;
      _awaitingVoiceDoorLockConfirmation = false;
      _voiceError = null;
      _voiceActionResult = null;
    });
  }

  Future<String> _setVoiceDeviceState(
    String result,
    Future<void> Function() operation,
  ) async {
    await operation();
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      drawer: Drawer(
        child: SafeArea(
          child: Column(
            children: [
              ListTile(
                leading: Icon(Icons.home_rounded, color: colorScheme.primary),
                title: const Text('AI Home Brain'),
                subtitle: Text(widget.accountLabel),
              ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.home_outlined),
                title: const Text('Home'),
                onTap: () {
                  Navigator.pop(context);
                  _selectNavigation(0);
                },
              ),
              ListTile(
                leading: const Icon(Icons.devices_other_outlined),
                title: const Text('Devices'),
                onTap: () {
                  Navigator.pop(context);
                  _selectNavigation(1);
                },
              ),
              ListTile(
                leading: const Icon(Icons.auto_awesome_outlined),
                title: const Text('Automations'),
                onTap: () {
                  Navigator.pop(context);
                  _selectNavigation(2);
                },
              ),
              ListTile(
                leading: Icon(
                  widget.isDarkMode
                      ? Icons.dark_mode_outlined
                      : Icons.light_mode_outlined,
                ),
                title: const Text('Appearance'),
                subtitle:
                    Text(widget.isDarkMode ? 'Dark theme' : 'Light theme'),
                trailing: Switch.adaptive(
                  value: widget.isDarkMode,
                  onChanged: (_) => widget.onThemeToggle(),
                ),
                onTap: widget.onThemeToggle,
              ),
              const Spacer(),
              ListTile(
                leading: const Icon(Icons.person_outline_rounded),
                title: const Text('Profile and account'),
                onTap: () {
                  Navigator.pop(context);
                  widget.accountAction();
                },
              ),
            ],
          ),
        ),
      ),
      appBar: _selectedNavigationIndex == 2 || _selectedNavigationIndex == 3
          ? null
          : AppBar(
              actions: [
                IconButton(
                  tooltip: 'Notifications',
                  onPressed: () =>
                      _showDemoNotice('Notifications are not configured yet.'),
                  icon: const Icon(Icons.notifications_none_rounded),
                ),
                const SizedBox(width: 12),
              ],
            ),
      body: _selectedNavigationIndex == 3
          ? VoiceAssistantScreen(
              isListening: _isListening,
              isInterpreting: _isInterpretingVoiceCommand,
              isExecuting: _isExecutingVoiceAction,
              recognizedSpeech: _recognizedSpeech,
              command: _recognizedCommand,
              requiresDoorConfirmation: _awaitingVoiceDoorLockConfirmation ||
                  (_recognizedCommand?.requiresConfirmation ?? false),
              error: _voiceError,
              actionResult: _voiceActionResult,
              onListenPressed: _toggleVoiceRecognition,
              onExecuteCommand: _runVoiceConfirmation,
              onCancelConfirmation: _cancelVoiceConfirmation,
              onClear: _clearVoiceAssistant,
              onOpenRooms: () => _selectNavigation(1),
              onOpenLivingRoom: _openLivingRoomControls,
              onOpenBedroom: _openBedroomDetails,
            )
          : _selectedNavigationIndex == 2
              ? AutomationsScreen(
                  routineStore: widget.routineStore,
                  deviceControlService: widget.deviceControlService,
                  activeModeLabel: _selectedMode,
                  onModeActivated: (mode) =>
                      setState(() => _selectedMode = mode),
                  onBackToHome: () => _selectNavigation(0),
                )
              : _selectedNavigationIndex == 1
                  ? _DevicesPage(
                      deviceControlService: widget.deviceControlService,
                      selectedRoom: _selectedDeviceRoom,
                      onRoomSelected: (room) =>
                          setState(() => _selectedDeviceRoom = room),
                      isAuthenticatingDoor: _isAuthenticatingDoor,
                      onLightChanged: (isOn) => _performDemoAction(
                        isOn ? 'Light ON' : 'Light OFF',
                        () => widget.deviceControlService.setLight(isOn),
                      ),
                      onFanChanged: (isOn) => _performDemoAction(
                        isOn ? 'Fan ON' : 'Fan OFF',
                        () => widget.deviceControlService.setFan(isOn),
                      ),
                      onFanSpeedChanged: (speed) => _performDemoAction(
                        'Fan speed',
                        () => widget.deviceControlService.setFanSpeed(speed),
                      ),
                      onDoorLockedChanged: _setDoorLocked,
                      onDoorOpenChanged: (isOpen) => _performDemoAction(
                        'Door sensor',
                        () => widget.deviceControlService.setDoorOpen(isOpen),
                      ),
                      onBedroomPressed: _openBedroomDetails,
                    )
                  : LayoutBuilder(
                      builder: (context, constraints) {
                    final horizontalPadding =
                        constraints.maxWidth >= 700 ? 32.0 : 20.0;
                    final contentWidth =
                        constraints.maxWidth >= 1000 ? 920.0 : double.infinity;

                    return Center(
                      child: SizedBox(
                        width: contentWidth,
                        child: ListView(
                          controller: _dashboardScrollController,
                          padding: EdgeInsets.fromLTRB(
                            horizontalPadding,
                            12,
                            horizontalPadding,
                            32,
                          ),
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        _timeGreeting,
                                        style: theme.textTheme.labelLarge
                                            ?.copyWith(
                                          color: colorScheme.primary,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '$_firstName 👋',
                                        style: theme.textTheme.headlineMedium
                                            ?.copyWith(
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: -0.8,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        'Your home at a glance',
                                        style:
                                            theme.textTheme.bodySmall?.copyWith(
                                          color: colorScheme.onSurfaceVariant,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 12),
                                const _HomeConnectionCard(),
                              ],
                            ),
                            const SizedBox(height: 28),
                            KeyedSubtree(
                              key: _scenesSectionKey,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _DashboardSectionTitle(
                                    title: 'My Scenes',
                                    onViewAll: () => _selectNavigation(2),
                                  ),
                                  const SizedBox(height: 12),
                                  _AutomationModes(
                                    selectedMode: _selectedMode,
                                    onSelected: (mode) {
                                      switch (mode) {
                                        case 'Sleep':
                                          unawaited(
                                            _runRoutineFromScene(
                                              RoutineId.sleep,
                                            ),
                                          );
                                        case 'Morning':
                                          unawaited(
                                            _runRoutineFromScene(
                                              RoutineId.morning,
                                            ),
                                          );
                                        case 'Away':
                                          unawaited(
                                            _runRoutineFromScene(
                                              RoutineId.away,
                                            ),
                                          );
                                        default:
                                          setState(() => _selectedMode = mode);
                                          _showDemoNotice(
                                            '$mode mode selected.',
                                          );
                                      }
                                    },
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 26),
                            KeyedSubtree(
                              key: _devicesSectionKey,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _DashboardSectionTitle(
                                    title: 'Favorite Devices',
                                    onViewAll: () => _selectNavigation(1),
                                  ),
                                  const SizedBox(height: 12),
                                  AnimatedBuilder(
                                    animation: widget.deviceControlService,
                                    builder: (context, _) => _DeviceGrid(
                                      state: widget.deviceControlService.state,
                                      isAuthenticatingDoor:
                                          _isAuthenticatingDoor,
                                      onLightChanged: (isOn) =>
                                          _performDemoAction(
                                        isOn ? 'Light ON' : 'Light OFF',
                                        () => widget.deviceControlService
                                            .setLight(isOn),
                                      ),
                                      onFanChanged: (isOn) =>
                                          _performDemoAction(
                                        isOn ? 'Fan ON' : 'Fan OFF',
                                        () => widget.deviceControlService
                                            .setFan(isOn),
                                      ),
                                      onFanSpeedChanged: (speed) =>
                                          _performDemoAction(
                                        'Fan speed',
                                        () => widget.deviceControlService
                                            .setFanSpeed(speed),
                                      ),
                                      onDoorLockedChanged: _setDoorLocked,
                                      onDoorOpenChanged: (isOpen) =>
                                          _performDemoAction(
                                        'Door sensor',
                                        () => widget.deviceControlService
                                            .setDoorOpen(isOpen),
                                      ),
                                      onBedroomPressed: _openBedroomDetails,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 26),
                            _VoiceAssistantCard(
                              isListening: _isListening,
                              isInterpreting: _isInterpretingVoiceCommand,
                              isExecuting: _isExecutingVoiceAction,
                              recognizedSpeech: _recognizedSpeech,
                              command: _recognizedCommand,
                              requiresDoorConfirmation:
                                  _awaitingVoiceDoorLockConfirmation ||
                                      (_recognizedCommand
                                              ?.requiresConfirmation ??
                                          false),
                              error: _voiceError,
                              actionResult: _voiceActionResult,
                              onListenPressed: _toggleVoiceRecognition,
                              onExecuteCommand: _runVoiceConfirmation,
                              onCancelConfirmation: _cancelVoiceConfirmation,
                            ),
                            const SizedBox(height: 26),
                            const _DashboardSectionTitle(
                              title: 'Recent Activity',
                            ),
                            const SizedBox(height: 12),
                            const _RecentActivityCard(),
                            const SizedBox(height: 18),
                            Text(
                              'Demo dashboard · No home devices are connected. '
                              'Controls and activity are illustrative only.',
                              textAlign: TextAlign.center,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedNavigationIndex,
        onDestinationSelected: _selectNavigation,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.devices_other_outlined),
            selectedIcon: Icon(Icons.devices_other_rounded),
            label: 'Devices',
          ),
          NavigationDestination(
            icon: Icon(Icons.auto_awesome_outlined),
            selectedIcon: Icon(Icons.auto_awesome_rounded),
            label: 'Automations',
          ),
          NavigationDestination(
            icon: Icon(Icons.mic_none_rounded),
            selectedIcon: Icon(Icons.mic_rounded),
            label: 'Assistant',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}

class _DevicesPage extends StatelessWidget {
  const _DevicesPage({
    required this.deviceControlService,
    required this.selectedRoom,
    required this.onRoomSelected,
    required this.isAuthenticatingDoor,
    required this.onLightChanged,
    required this.onFanChanged,
    required this.onFanSpeedChanged,
    required this.onDoorLockedChanged,
    required this.onDoorOpenChanged,
    required this.onBedroomPressed,
  });

  final DeviceControlService deviceControlService;
  final String selectedRoom;
  final ValueChanged<String> onRoomSelected;
  final bool isAuthenticatingDoor;
  final ValueChanged<bool> onLightChanged;
  final ValueChanged<bool> onFanChanged;
  final ValueChanged<int> onFanSpeedChanged;
  final ValueChanged<bool> onDoorLockedChanged;
  final ValueChanged<bool> onDoorOpenChanged;
  final VoidCallback onBedroomPressed;

  static const _rooms = ['All', 'Living room', 'Bedroom', 'Front entry'];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final horizontalPadding =
        MediaQuery.sizeOf(context).width >= 700 ? 32.0 : 20.0;

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 920),
        child: AnimatedBuilder(
          animation: deviceControlService,
          builder: (context, _) => ListView(
            padding: EdgeInsets.fromLTRB(
                horizontalPadding, 20, horizontalPadding, 28),
            children: [
              Text(
                'My Devices',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '3 devices · Simulation only',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 22),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final room in _rooms)
                    ChoiceChip(
                      label: Text(room),
                      selected: selectedRoom == room,
                      onSelected: (_) => onRoomSelected(room),
                    ),
                ],
              ),
              const SizedBox(height: 18),
              _DeviceGrid(
                state: deviceControlService.state,
                isAuthenticatingDoor: isAuthenticatingDoor,
                roomFilter: selectedRoom == 'All' ? null : selectedRoom,
                singleColumn: true,
                onLightChanged: onLightChanged,
                onFanChanged: onFanChanged,
                onFanSpeedChanged: onFanSpeedChanged,
                onDoorLockedChanged: onDoorLockedChanged,
                onDoorOpenChanged: onDoorOpenChanged,
                onBedroomPressed: onBedroomPressed,
              ),
              const SizedBox(height: 20),
              Text(
                'Device controls are simulated. No physical home devices are connected.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DashboardSectionTitle extends StatelessWidget {
  const _DashboardSectionTitle({
    required this.title,
    this.onViewAll,
  });

  final String title;
  final VoidCallback? onViewAll;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.3,
            ),
          ),
        ),
        if (onViewAll != null)
          TextButton(
            onPressed: onViewAll,
            child: const Text('View all'),
          ),
      ],
    );
  }
}

class _HomeConnectionCard extends StatelessWidget {
  const _HomeConnectionCard();

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      width: 124,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.35),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.wifi_off_rounded, color: colorScheme.error, size: 17),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Home offline',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'No devices connected yet',
            style: TextStyle(fontSize: 10, height: 1.3),
          ),
        ],
      ),
    );
  }
}

class _DeviceGrid extends StatelessWidget {
  const _DeviceGrid({
    required this.state,
    required this.isAuthenticatingDoor,
    required this.onLightChanged,
    required this.onFanChanged,
    required this.onFanSpeedChanged,
    required this.onDoorLockedChanged,
    required this.onDoorOpenChanged,
    required this.onBedroomPressed,
    this.roomFilter,
    this.singleColumn = false,
  });

  final DeviceState state;
  final bool isAuthenticatingDoor;
  final ValueChanged<bool> onLightChanged;
  final ValueChanged<bool> onFanChanged;
  final ValueChanged<int> onFanSpeedChanged;
  final ValueChanged<bool> onDoorLockedChanged;
  final ValueChanged<bool> onDoorOpenChanged;
  final VoidCallback onBedroomPressed;
  final String? roomFilter;
  final bool singleColumn;

  @override
  Widget build(BuildContext context) {
    void showDoorDetails() {
      var isOpen = state.doorOpen;
      showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (sheetContext) => StatefulBuilder(
          builder: (context, setModalState) => SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Front Door',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 8),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Simulate door open'),
                    value: isOpen,
                    onChanged: (value) {
                      setModalState(() => isOpen = value);
                      onDoorOpenChanged(value);
                    },
                  ),
                  const Text(
                    'Unlocking requires phone PIN or biometrics. '
                    'Voice commands cannot unlock the door.',
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Done'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final cards = [
      _DeviceCard(
        title: 'Light',
        location: 'Living room',
        icon: Icons.lightbulb_outline_rounded,
        imageAsset:
            singleColumn ? 'assets/images/welcome_living_room.jpg' : null,
        status: state.lightOn ? 'ON · Simulated' : 'OFF · Simulated',
        control: Switch.adaptive(
          key: const ValueKey('light-power-toggle'),
          value: state.lightOn,
          onChanged: onLightChanged,
        ),
      ),
      _DeviceCard(
        title: 'Fan',
        location: 'Bedroom',
        icon: Icons.mode_fan_off_outlined,
        imageAsset: singleColumn ? 'assets/images/bedroom.jpg' : null,
        status: state.fanOn ? 'ON · Simulated' : 'OFF · Simulated',
        control: Switch.adaptive(
          key: const ValueKey('fan-power-toggle'),
          value: state.fanOn,
          onChanged: onFanChanged,
        ),
        extra: Text('Speed ${state.fanSpeed} of 5 · Simulated'),
        action: Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: onBedroomPressed,
            style: TextButton.styleFrom(
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.symmetric(horizontal: 6),
              minimumSize: const Size(0, 30),
            ),
            icon: const Icon(Icons.arrow_forward_rounded, size: 15),
            label: const Text('Open Bedroom'),
          ),
        ),
      ),
      _DeviceCard(
        title: 'Door',
        location: 'Front entry',
        icon: Icons.door_front_door_outlined,
        status:
            state.doorLocked ? 'Locked · Simulated' : 'Unlocked · Simulated',
        onMorePressed: showDoorDetails,
        moreTooltip: 'Door details',
        control: IconButton.filledTonal(
          tooltip: state.doorLocked ? 'Unlock door' : 'Lock door',
          visualDensity: VisualDensity.compact,
          constraints: const BoxConstraints.tightFor(width: 32, height: 32),
          padding: EdgeInsets.zero,
          onPressed: isAuthenticatingDoor
              ? null
              : () => onDoorLockedChanged(!state.doorLocked),
          icon: isAuthenticatingDoor
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Icon(
                  state.doorLocked ? Icons.lock_open : Icons.lock_outline,
                ),
        ),
      ),
    ];

    final visibleCards = roomFilter == null
        ? cards
        : cards
            .where(
              (card) =>
                  card.location.toLowerCase() == roomFilter!.toLowerCase(),
            )
            .toList();

    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = singleColumn
            ? 1
            : constraints.maxWidth >= 700
                ? 3
                : constraints.maxWidth >= 460
                    ? 2
                    : 1;
        if (columns == 1) {
          return Column(
            children: [
              for (var i = 0; i < visibleCards.length; i++) ...[
                if (i > 0) const SizedBox(height: 12),
                visibleCards[i],
              ],
            ],
          );
        }

        const spacing = 12.0;
        final itemWidth =
            (constraints.maxWidth - spacing * (columns - 1)) / columns;

        return Wrap(
          spacing: spacing,
          runSpacing: spacing,
          children: [
            for (final card in visibleCards)
              SizedBox(width: itemWidth, child: card),
          ],
        );
      },
    );
  }
}

class _DeviceCard extends StatelessWidget {
  const _DeviceCard({
    required this.title,
    required this.location,
    required this.icon,
    required this.status,
    required this.control,
    this.imageAsset,
    this.extra,
    this.action,
    this.onMorePressed,
    this.moreTooltip,
  });

  final String title;
  final String location;
  final IconData icon;
  final String status;
  final Widget control;
  final String? imageAsset;
  final Widget? extra;
  final Widget? action;
  final VoidCallback? onMorePressed;
  final String? moreTooltip;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (imageAsset != null)
            SizedBox(
              height: 132,
              width: double.infinity,
              child: Image.asset(imageAsset!, fit: BoxFit.cover),
            ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: colorScheme.primary.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(icon, color: colorScheme.primary, size: 20),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          Text(
                            location,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall
                                ?.copyWith(
                                  color: colorScheme.onSurfaceVariant,
                                ),
                          ),
                        ],
                      ),
                    ),
                    if (onMorePressed == null)
                      Icon(
                        Icons.more_horiz_rounded,
                        color: colorScheme.onSurfaceVariant,
                        size: 20,
                      )
                    else
                      IconButton(
                        tooltip: moreTooltip,
                        visualDensity: VisualDensity.compact,
                        constraints:
                            const BoxConstraints.tightFor(width: 28, height: 28),
                        padding: EdgeInsets.zero,
                        onPressed: onMorePressed,
                        icon: const Icon(Icons.more_horiz_rounded, size: 19),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        status,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: colorScheme.onSurfaceVariant,
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                    ),
                    control,
                  ],
                ),
                if (extra != null) ...[
                  const SizedBox(height: 4),
                  DefaultTextStyle(
                    style: Theme.of(context).textTheme.bodySmall!.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                    child: extra!,
                  ),
                ],
                if (action != null) ...[
                  const SizedBox(height: 2),
                  action!,
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AutomationModes extends StatelessWidget {
  const _AutomationModes({
    required this.selectedMode,
    required this.onSelected,
  });

  final String selectedMode;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    const modes = [
      ('Home', Icons.home_outlined),
      ('Away', Icons.directions_walk_outlined),
      ('Sleep', Icons.nights_stay_outlined),
      ('Morning', Icons.wb_sunny_outlined),
    ];

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final (label, icon) in modes)
          ChoiceChip(
            avatar: Icon(
              icon,
              size: 16,
              color: selectedMode == label
                  ? colorScheme.onPrimary
                  : colorScheme.onSurfaceVariant,
            ),
            label: Text(label),
            selected: selectedMode == label,
            selectedColor: colorScheme.primary,
            backgroundColor: colorScheme.surface,
            labelStyle: TextStyle(
              color: selectedMode == label
                  ? colorScheme.onPrimary
                  : colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
            onSelected: (_) => onSelected(label),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            side: BorderSide.none,
          ),
      ],
    );
  }
}

class _VoiceAssistantCard extends StatelessWidget {
  const _VoiceAssistantCard({
    required this.isListening,
    required this.isInterpreting,
    required this.isExecuting,
    required this.recognizedSpeech,
    required this.command,
    required this.requiresDoorConfirmation,
    required this.error,
    required this.actionResult,
    required this.onListenPressed,
    required this.onExecuteCommand,
    required this.onCancelConfirmation,
  });

  final bool isListening;
  final bool isInterpreting;
  final bool isExecuting;
  final String recognizedSpeech;
  final VoiceCommand? command;
  final bool requiresDoorConfirmation;
  final String? error;
  final String? actionResult;
  final VoidCallback onListenPressed;
  final VoidCallback onExecuteCommand;
  final VoidCallback onCancelConfirmation;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      color: colorScheme.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Voice assistant',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: colorScheme.onPrimaryContainer,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              'Try: “Turn on the light” or “Good morning.”',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colorScheme.onPrimaryContainer,
                  ),
            ),
            const SizedBox(height: 14),
            FilledButton.tonalIcon(
              onPressed: isExecuting ? null : onListenPressed,
              icon: Icon(
                isListening
                    ? Icons.stop_circle_outlined
                    : Icons.mic_none_rounded,
              ),
              label: Text(isListening ? 'Stop listening' : 'Talk'),
            ),
            if (isListening) ...[
              const SizedBox(height: 10),
              const Text('Listening… Tell me what you need at home.'),
            ],
            if (isInterpreting) ...[
              const SizedBox(height: 10),
              const Text(
                'AI is understanding your request… Tap Talk to start another '
                'command while it works.',
              ),
            ],
            if (recognizedSpeech.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                'Recognized speech: “$recognizedSpeech”',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ],
            if (command != null) ...[
              const SizedBox(height: 8),
              Text('Action: ${command!.description}'),
              if (requiresDoorConfirmation) ...[
                const SizedBox(height: 6),
                const Text('Please confirm before locking the simulated door.'),
              ],
              if (command!.isExecutable && requiresDoorConfirmation) ...[
                const SizedBox(height: 10),
                FilledButton(
                  onPressed: isExecuting ? null : onExecuteCommand,
                  child: Text(
                    isExecuting ? 'Working…' : 'Confirm and lock',
                  ),
                ),
                TextButton(
                  onPressed: isExecuting ? null : onCancelConfirmation,
                  child: const Text('Not now'),
                ),
              ],
            ],
            if (isExecuting && actionResult == null) ...[
              const SizedBox(height: 10),
              const Text('Running the requested action…'),
            ],
            if (error != null) ...[
              const SizedBox(height: 10),
              Text(
                error!,
                style: TextStyle(color: colorScheme.error),
              ),
            ],
            if (actionResult != null) ...[
              const SizedBox(height: 10),
              Text(
                actionResult!,
                style: TextStyle(color: colorScheme.onPrimaryContainer),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RecentActivityCard extends StatelessWidget {
  const _RecentActivityCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: Column(
        children: [
          _ActivityRow(
            icon: Icons.lightbulb_outline_rounded,
            title: 'Living room light switched off',
            time: 'Today · Example',
          ),
          Divider(height: 1, indent: 64),
          _ActivityRow(
            icon: Icons.nights_stay_outlined,
            title: 'Sleep mode selected',
            time: 'Yesterday · Example',
          ),
        ],
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({
    required this.icon,
    required this.title,
    required this.time,
  });

  final IconData icon;
  final String title;
  final String time;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return ListTile(
      leading: Icon(icon, color: colorScheme.primary),
      title: Text(title, style: Theme.of(context).textTheme.bodyMedium),
      subtitle: Text(time),
      dense: true,
    );
  }
}
