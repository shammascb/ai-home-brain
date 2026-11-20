import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import '../domain/voice_command.dart';

class VoiceAssistantScreen extends StatelessWidget {
  const VoiceAssistantScreen({
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
    required this.onClear,
    required this.onOpenRooms,
    required this.onOpenLivingRoom,
    required this.onOpenBedroom,
    this.accountName,
    this.roleLabel,
    this.voiceEnabled = true,
    this.onOpenFamilySecurity,
    super.key,
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
  final VoidCallback onClear;
  final VoidCallback onOpenRooms;
  final VoidCallback onOpenLivingRoom;
  final VoidCallback onOpenBedroom;
  final String? accountName;
  final String? roleLabel;
  final bool voiceEnabled;
  final VoidCallback? onOpenFamilySecurity;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final status = !voiceEnabled
        ? 'Voice commands disabled for this account'
        : isListening
        ? 'Listening…'
        : isInterpreting
        ? 'Understanding your request…'
        : isExecuting
        ? 'Working on it…'
        : 'Tap the microphone to speak';
    final accountText = accountName == null || accountName!.trim().isEmpty
        ? 'Signed-in account'
        : roleLabel == null || roleLabel!.trim().isEmpty
        ? accountName!
        : '$accountName ($roleLabel)';

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            theme.scaffoldBackgroundColor,
            colors.surface,
            theme.scaffoldBackgroundColor,
          ],
        ),
      ),
      child: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final compact = constraints.maxHeight < 700;
            final orbSize = math
                .min(
                  270.0,
                  math.min(
                    math.max(160.0, constraints.maxWidth - 40),
                    constraints.maxHeight * (compact ? 0.28 : 0.34),
                  ),
                )
                .toDouble();

            return Column(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: EdgeInsets.fromLTRB(20, compact ? 12 : 20, 20, 12),
                    child: Column(
                      children: [
                        Text(
                          'Voice assistant',
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: colors.onSurface,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: colors.surface.withValues(alpha: 0.94),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: voiceEnabled
                                  ? colors.outlineVariant.withValues(
                                      alpha: 0.38,
                                    )
                                  : colors.error.withValues(alpha: 0.45),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(
                                    voiceEnabled
                                        ? Icons.verified_user_outlined
                                        : Icons.mic_off_rounded,
                                    size: 16,
                                    color: voiceEnabled
                                        ? colors.primary
                                        : colors.error,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      'Account: $accountText',
                                      style: theme.textTheme.labelMedium
                                          ?.copyWith(
                                            color: colors.onSurface,
                                            fontWeight: FontWeight.w600,
                                          ),
                                    ),
                                  ),
                                  if (onOpenFamilySecurity != null)
                                    TextButton(
                                      onPressed: onOpenFamilySecurity,
                                      style: TextButton.styleFrom(
                                        foregroundColor: colors.primary,
                                        visualDensity: VisualDensity.compact,
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                        ),
                                      ),
                                      child: const Text('Security'),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(
                                voiceEnabled
                                    ? 'Commands use your signed-in account. Voice identity checks are not enabled; voice cannot unlock the door.'
                                    : 'A household admin disabled voice commands for this '
                                          'account. You can still review permissions in Security.',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: colors.onSurfaceVariant,
                                  fontSize: 12,
                                  height: 1.35,
                                ),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(height: compact ? 10 : 18),
                        _VoiceOrb(
                          isActive: isListening || isInterpreting,
                          size: orbSize,
                        ),
                        SizedBox(height: compact ? 12 : 20),
                        Text(
                          status,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: colors.onSurface,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Try “Turn on the light”, “Turn off the fan”, '
                          '“Good morning”, or “I am going outside”. You can '
                          'also say “Open living room” or “Open bedroom”.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: colors.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: onOpenLivingRoom,
                                icon: const Icon(
                                  Icons.weekend_outlined,
                                  size: 18,
                                ),
                                label: const Text('Living Room'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: colors.onSurface,
                                  side: BorderSide(color: colors.outlineVariant),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: onOpenBedroom,
                                icon: const Icon(Icons.bed_outlined, size: 18),
                                label: const Text('Bedroom'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: colors.onSurface,
                                  side: BorderSide(color: colors.outlineVariant),
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (recognizedSpeech.isNotEmpty ||
                            error != null ||
                            command != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 14),
                            child: Column(
                              children: [
                                if (recognizedSpeech.isNotEmpty)
                                  _AssistantMessage(
                                    title: 'I heard',
                                    message: '“$recognizedSpeech”',
                                  ),
                                if (command != null) ...[
                                  const SizedBox(height: 10),
                                  _AssistantMessage(
                                    title: 'Requested action',
                                    message: command!.description,
                                  ),
                                ],
                                if (error != null) ...[
                                  const SizedBox(height: 10),
                                  _AssistantMessage(
                                    title: 'Could not complete',
                                    message: error!,
                                    isError: true,
                                  ),
                                ],
                                if (actionResult != null) ...[
                                  const SizedBox(height: 10),
                                  _AssistantMessage(
                                    title: 'Status',
                                    message: actionResult!,
                                  ),
                                ],
                                if (requiresDoorConfirmation &&
                                    command?.isExecutable == true) ...[
                                  const SizedBox(height: 12),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: FilledButton(
                                          onPressed: isExecuting
                                              ? null
                                              : onExecuteCommand,
                                          child: Text(
                                            isExecuting
                                                ? 'Working…'
                                                : 'Confirm and lock',
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      OutlinedButton(
                                        onPressed: isExecuting
                                            ? null
                                            : onCancelConfirmation,
                                        child: const Text('Cancel'),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    'Voice commands cannot unlock the door.',
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      color: colors.onSurfaceVariant,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(
                          onPressed: onOpenRooms,
                          icon: const Icon(Icons.meeting_room_outlined),
                          label: const Text('Rooms'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: colors.onSurface,
                            side: BorderSide(color: colors.outlineVariant),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(20, 4, 20, compact ? 8 : 16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      IconButton.filled(
                        tooltip: !voiceEnabled
                            ? 'Voice commands disabled for this account'
                            : isListening
                            ? 'Stop listening'
                            : 'Start listening',
                        onPressed: isExecuting || !voiceEnabled
                            ? null
                            : onListenPressed,
                        style: IconButton.styleFrom(
                          backgroundColor: colors.primary,
                          foregroundColor: colors.onPrimary,
                          disabledBackgroundColor:
                              colors.surfaceContainerHighest,
                          disabledForegroundColor: colors.onSurfaceVariant,
                          fixedSize: const Size(64, 64),
                        ),
                        icon: Icon(
                          !voiceEnabled
                              ? Icons.mic_off_rounded
                              : isListening
                              ? Icons.stop_rounded
                              : Icons.mic_rounded,
                          size: 28,
                        ),
                      ),
                      const SizedBox(width: 24),
                      IconButton.outlined(
                        tooltip: 'Clear voice response',
                        onPressed: isExecuting ? null : onClear,
                        style: IconButton.styleFrom(
                          foregroundColor: colors.onSurfaceVariant,
                          fixedSize: const Size(52, 52),
                          side: BorderSide(color: colors.outlineVariant),
                        ),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _AssistantMessage extends StatelessWidget {
  const _AssistantMessage({
    required this.title,
    required this.message,
    this.isError = false,
  });

  final String title;
  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceContainerHighest.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isError
              ? colors.error.withValues(alpha: 0.4)
              : colors.outlineVariant.withValues(alpha: 0.32),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              color: colors.primary,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            message,
            style: TextStyle(
              color: isError ? colors.error : colors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class _VoiceOrb extends StatefulWidget {
  const _VoiceOrb({required this.isActive, required this.size});

  final bool isActive;
  final double size;

  @override
  State<_VoiceOrb> createState() => _VoiceOrbState();
}

class _VoiceOrbState extends State<_VoiceOrb>
    with SingleTickerProviderStateMixin {
  late final AnimationController _animationController;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animationController,
      builder: (context, child) {
        final pulse = _animationController.value;
        final colors = Theme.of(context).colorScheme;
        return Transform.scale(
          scale: widget.isActive ? 0.98 + pulse * 0.04 : 1,
          child: SizedBox(
            width: widget.size,
            height: widget.size,
            child: CustomPaint(
              painter: _VoiceOrbPainter(
                phase: pulse,
                color: colors.primary.withValues(
                  alpha: widget.isActive ? 0.88 : 0.58,
                ),
              ),
              child: Center(
                child: Container(
                  width: 112,
                  height: 112,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        colors.primaryContainer,
                        colors.surfaceContainerHighest,
                      ],
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: colors.primary.withValues(
                          alpha: widget.isActive ? 0.36 : 0.18,
                        ),
                        blurRadius: 38,
                        spreadRadius: 8,
                      ),
                    ],
                    border: Border.all(
                      color: colors.outlineVariant.withValues(alpha: 0.42),
                    ),
                  ),
                  child: Icon(
                    Icons.graphic_eq_rounded,
                    color: colors.onPrimaryContainer,
                    size: 54,
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _VoiceOrbPainter extends CustomPainter {
  const _VoiceOrbPainter({required this.phase, required this.color});

  final double phase;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final baseRadius = size.shortestSide * 0.18;
    for (var index = 0; index < 5; index++) {
      final radius = baseRadius + index * size.shortestSide * 0.055 + phase * 6;
      final opacity = (0.32 - index * 0.045).clamp(0.08, 0.32);
      final paint = Paint()
        ..color = color.withValues(alpha: opacity)
        ..style = PaintingStyle.stroke
        ..strokeWidth = index == 0 ? 1.4 : 0.8;
      canvas.drawCircle(center, radius, paint);
    }
  }

  @override
  bool shouldRepaint(_VoiceOrbPainter oldDelegate) =>
      oldDelegate.phase != phase || oldDelegate.color != color;
}
