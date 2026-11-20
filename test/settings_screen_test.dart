import 'package:ai_home_brain/features/devices/data/simulated_device_control_service.dart';
import 'package:ai_home_brain/features/devices/data/simulated_device_monitoring_store.dart';
import 'package:ai_home_brain/features/family/data/family_management_store.dart';
import 'package:ai_home_brain/features/settings/presentation/settings_screen.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Settings explains simulation and unavailable services', (
    WidgetTester tester,
  ) async {
    final deviceControl = SimulatedDeviceControlService();
    final monitoring = SimulatedDeviceMonitoringStore(
      deviceControlService: deviceControl,
    );
    final family = FamilyManagementStore();
    addTearDown(() {
      family.dispose();
      monitoring.dispose();
      deviceControl.dispose();
    });

    await tester.pumpWidget(
      MaterialApp(
        home: SettingsScreen(
          isDarkMode: true,
          onThemeToggle: () {},
          familyStore: family,
          monitoringStore: monitoring,
          onOpenAccount: () {},
          onOpenFamilySecurity: () {},
          onOpenDeviceMonitoring: () {},
        ),
      ),
    );

    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('Not configured'), findsOneWidget);
    expect(find.text('Speaker verification not implemented'), findsOneWidget);
    expect(find.text('Voice unlock disabled'), findsOneWidget);
    expect(find.textContaining('Simulation mode'), findsOneWidget);
    expect(find.textContaining('No ESP32 is connected.'), findsOneWidget);
  });
}
