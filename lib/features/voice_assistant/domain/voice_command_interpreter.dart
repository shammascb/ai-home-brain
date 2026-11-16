import 'voice_command.dart';

abstract interface class VoiceCommandInterpreter {
  Future<VoiceCommand> interpret(String transcript);
}

class VoiceCommandInterpretationException implements Exception {
  const VoiceCommandInterpretationException(this.message);

  final String message;

  @override
  String toString() => message;
}
