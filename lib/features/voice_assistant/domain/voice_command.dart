enum VoiceAction {
  sleepMode,
  morningMode,
  awayMode,
  turnLightOn,
  turnLightOff,
  turnFanOn,
  turnFanOff,
  lockDoor,
  unlockDoorBlocked,
  openLivingRoom,
  openBedroom,
  unsupported,
}

class VoiceCommand {
  const VoiceCommand(this.action);

  factory VoiceCommand.fromModelAction(String action) {
    return VoiceCommand(switch (action) {
      'sleep_mode' => VoiceAction.sleepMode,
      'morning_mode' => VoiceAction.morningMode,
      'away_mode' => VoiceAction.awayMode,
      'turn_light_on' => VoiceAction.turnLightOn,
      'turn_light_off' => VoiceAction.turnLightOff,
      'turn_fan_on' => VoiceAction.turnFanOn,
      'turn_fan_off' => VoiceAction.turnFanOff,
      'lock_door' => VoiceAction.lockDoor,
      'unlock_door' => VoiceAction.unlockDoorBlocked,
      'open_living_room' => VoiceAction.openLivingRoom,
      'open_bedroom' => VoiceAction.openBedroom,
      _ => VoiceAction.unsupported,
    });
  }

  final VoiceAction action;

  bool get requiresConfirmation => action == VoiceAction.lockDoor;

  bool get isExecutable =>
      action != VoiceAction.unlockDoorBlocked &&
      action != VoiceAction.openLivingRoom &&
      action != VoiceAction.openBedroom &&
      action != VoiceAction.unsupported;

  String get description => switch (action) {
    VoiceAction.sleepMode =>
      'Sleep routine: turn the light and fan off; leave the door unchanged.',
    VoiceAction.morningMode =>
      'Morning routine: turn the light on and fan off; leave the door '
          'unchanged.',
    VoiceAction.awayMode =>
      'Away routine: turn the light and fan off. If the door is closed, '
          'ask before locking; if open, do not lock.',
    VoiceAction.turnLightOn => 'Turn the simulated light on.',
    VoiceAction.turnLightOff => 'Turn the simulated light off.',
    VoiceAction.turnFanOn => 'Turn the simulated fan on.',
    VoiceAction.turnFanOff => 'Turn the simulated fan off.',
    VoiceAction.lockDoor => 'Lock the simulated door.',
    VoiceAction.unlockDoorBlocked =>
      'Door unlocking is never available by voice. Use the manual Unlock '
          'button and confirm with your phone PIN or biometrics.',
    VoiceAction.openLivingRoom => 'Open the Living Room controls.',
    VoiceAction.openBedroom => 'Open the Bedroom controls.',
    VoiceAction.unsupported =>
      'I did not recognize that command. Try a supported device, routine, '
          'or room command.',
  };
}

VoiceCommand? resolveRoomNavigationCommand(String transcript) {
  final normalized = _normalizeVoiceTranscript(transcript);
  if (RegExp(r'\b(dont|do not|never|not)\b').hasMatch(normalized) ||
      !RegExp(r'\b(open|show|go|navigate|take)\b').hasMatch(normalized)) {
    return null;
  }

  if (RegExp(r'\bliving room\b').hasMatch(normalized)) {
    return const VoiceCommand(VoiceAction.openLivingRoom);
  }
  if (RegExp(r'\bbedroom\b').hasMatch(normalized)) {
    return const VoiceCommand(VoiceAction.openBedroom);
  }
  return null;
}

/// Resolves the app's common commands without a network or AI request.
///
/// Unknown phrases are left for the configured AI interpreter. Sensitive door
/// unlock requests always resolve to the blocked action and can never execute.
VoiceCommand? resolveLocalVoiceCommand(String transcript) {
  final normalized = _normalizeVoiceTranscript(transcript);
  if (normalized.isEmpty) return null;

  final roomCommand = resolveRoomNavigationCommand(normalized);
  if (roomCommand != null) return roomCommand;

  final mentionsDoor = RegExp(r'\bdoor\b').hasMatch(normalized);
  final requestsUnlock =
      RegExp(r'\b(unlock|unlatch)\b').hasMatch(normalized) ||
      (mentionsDoor && RegExp(r'\b(open|unsecure)\b').hasMatch(normalized));
  if (mentionsDoor && requestsUnlock) {
    return const VoiceCommand(VoiceAction.unlockDoorBlocked);
  }

  final isNegative = RegExp(
    r'\b(dont|do not|never|not|cancel)\b',
  ).hasMatch(normalized);
  if (isNegative) {
    return const VoiceCommand(VoiceAction.unsupported);
  }

  if (RegExp(
    r'\b(sleep mode|good night|bedtime|going to sleep|going to bed)\b',
  ).hasMatch(normalized)) {
    return const VoiceCommand(VoiceAction.sleepMode);
  }
  if (RegExp(r'\b(morning mode|good morning|wake up)\b').hasMatch(normalized)) {
    return const VoiceCommand(VoiceAction.morningMode);
  }
  if (RegExp(
    r'\b(away mode|going outside|going out|leaving home|leave home)\b',
  ).hasMatch(normalized)) {
    return const VoiceCommand(VoiceAction.awayMode);
  }

  if (mentionsDoor && RegExp(r'\b(lock|secure)\b').hasMatch(normalized)) {
    return const VoiceCommand(VoiceAction.lockDoor);
  }

  final requestsOn = RegExp(r'\b(on|enable|start)\b').hasMatch(normalized);
  final requestsOff = RegExp(r'\b(off|disable|stop)\b').hasMatch(normalized);
  if (requestsOn == requestsOff) return null;

  if (RegExp(r'\b(lights?|lamps?)\b').hasMatch(normalized)) {
    return VoiceCommand(
      requestsOn ? VoiceAction.turnLightOn : VoiceAction.turnLightOff,
    );
  }
  if (RegExp(r'\bfan\b').hasMatch(normalized)) {
    return VoiceCommand(
      requestsOn ? VoiceAction.turnFanOn : VoiceAction.turnFanOff,
    );
  }

  return null;
}

String _normalizeVoiceTranscript(String transcript) => transcript
    .toLowerCase()
    .replaceAll("don't", 'do not')
    .replaceAll('dont', 'do not')
    .replaceAll(RegExp(r'[^a-z0-9\s]'), ' ')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();
