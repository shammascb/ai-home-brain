import 'package:speech_to_text/speech_to_text.dart';

import '../domain/voice_recognition_service.dart';

class PhoneVoiceRecognitionService implements VoiceRecognitionService {
  final SpeechToText _speech = SpeechToText();
  Future<bool>? _initialization;
  void Function(String)? _onStatus;
  void Function(String)? _onError;

  @override
  Future<bool> initialize({
    required void Function(String status) onStatus,
    required void Function(String message) onError,
  }) {
    _onStatus = onStatus;
    _onError = onError;
    return _initialization ??= _speech.initialize(
      onStatus: (status) => _onStatus?.call(status),
      onError: (error) => _onError?.call(error.errorMsg),
    );
  }

  @override
  Future<void> listen({
    required void Function(String transcript, bool isFinal) onResult,
  }) async {
    await _speech.listen(
      listenOptions: SpeechListenOptions(
        cancelOnError: true,
        listenFor: const Duration(seconds: 30),
        pauseFor: const Duration(seconds: 5),
        listenMode: ListenMode.confirmation,
      ),
      onResult: (result) => onResult(
        result.recognizedWords,
        result.finalResult,
      ),
    );
  }

  @override
  Future<void> stop() => _speech.stop();
}
