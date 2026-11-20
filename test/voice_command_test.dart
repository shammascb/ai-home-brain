import 'package:ai_home_brain/features/voice_assistant/domain/voice_command.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('maps an AI-selected action to its supported command', () {
    expect(
      VoiceCommand.fromModelAction('sleep_mode').action,
      VoiceAction.sleepMode,
    );
    expect(
      VoiceCommand.fromModelAction('turn_light_on').action,
      VoiceAction.turnLightOn,
    );
    expect(
      VoiceCommand.fromModelAction('lock_door').requiresConfirmation,
      isTrue,
    );
  });

  test('always blocks AI-selected door unlocks', () {
    final command = VoiceCommand.fromModelAction('unlock_door');

    expect(command.action, VoiceAction.unlockDoorBlocked);
    expect(command.isExecutable, isFalse);
  });

  test('fails closed for an unknown model action', () {
    final command = VoiceCommand.fromModelAction('turn_off_everything');

    expect(command.action, VoiceAction.unsupported);
    expect(command.isExecutable, isFalse);
  });
}
