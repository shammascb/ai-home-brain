import '../domain/device_control_service.dart';
import '../domain/device_state.dart';

class SimulatedDeviceControlService extends DeviceControlService {
  DeviceState _state = const DeviceState();

  @override
  DeviceState get state => _state;

  @override
  Future<void> setLight(bool isOn) async {
    _update(_state.copyWith(lightOn: isOn));
  }

  @override
  Future<void> setFan(bool isOn) async {
    _update(_state.copyWith(fanOn: isOn));
  }

  @override
  Future<void> setFanSpeed(int speed) async {
    if (speed < 1 || speed > 5) {
      throw RangeError.range(speed, 1, 5, 'speed');
    }
    _update(_state.copyWith(fanSpeed: speed));
  }

  @override
  Future<void> setDoorLocked(bool isLocked) async {
    _update(_state.copyWith(doorLocked: isLocked));
  }

  @override
  Future<void> setDoorOpen(bool isOpen) async {
    _update(_state.copyWith(doorOpen: isOpen));
  }

  void _update(DeviceState state) {
    _state = state;
    notifyListeners();
  }
}
