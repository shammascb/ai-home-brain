import 'package:flutter/foundation.dart';
import 'package:local_auth/local_auth.dart';

import '../domain/door_unlock_authenticator.dart';

class LocalDeviceUnlockAuthenticator implements DoorUnlockAuthenticator {
  LocalDeviceUnlockAuthenticator([LocalAuthentication? localAuth])
      : _localAuth = localAuth ?? LocalAuthentication();

  final LocalAuthentication _localAuth;

  @override
  Future<bool> authenticateForDoorUnlock() async {
    // Web unlocking is handled by DashboardScreen as a simulation-only
    // confirmation. This authenticator must never treat an unsupported
    // platform as successfully authenticated if it is reused elsewhere.
    if (kIsWeb) return false;
    return _localAuth.authenticate(
      localizedReason: 'Confirm to simulate unlocking the front door.',
      biometricOnly: false,
      sensitiveTransaction: true,
      persistAcrossBackgrounding: true,
    );
  }
}
