import 'package:ai_home_brain/features/devices/data/simulated_device_control_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SimulatedDeviceControlService', () {
    late SimulatedDeviceControlService service;

    setUp(() {
      service = SimulatedDeviceControlService();
    });

    tearDown(() {
      service.dispose();
    });

    test('updates simulated appliance and door states', () async {
      await service.setLight(true);
      await service.setFan(true);
      await service.setFanSpeed(4);
      await service.setDoorOpen(true);
      await service.setDoorLocked(false);

      expect(service.state.lightOn, isTrue);
      expect(service.state.fanOn, isTrue);
      expect(service.state.fanSpeed, 4);
      expect(service.state.doorOpen, isTrue);
      expect(service.state.doorLocked, isFalse);
    });

    test('rejects fan speeds outside the supported range', () async {
      await expectLater(service.setFanSpeed(6), throwsRangeError);
      expect(service.state.fanSpeed, 2);
    });
  });
}
