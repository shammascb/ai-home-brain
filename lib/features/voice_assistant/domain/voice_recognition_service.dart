abstract interface class VoiceRecognitionService {
  Future<bool> initialize({
    required void Function(String status) onStatus,
    required void Function(String message) onError,
  });

  Future<void> listen({
    required void Function(String transcript, bool isFinal) onResult,
  });

  Future<void> stop();
}
