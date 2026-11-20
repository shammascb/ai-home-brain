import 'package:material_ui/material_ui.dart';

import '../../devices/domain/device_monitoring.dart';
import '../../family/data/family_management_store.dart';
import '../../family/domain/family_member.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({
    required this.isDarkMode,
    required this.onThemeToggle,
    required this.familyStore,
    required this.monitoringStore,
    required this.onOpenAccount,
    required this.onOpenFamilySecurity,
    required this.onOpenDeviceMonitoring,
    super.key,
  });

  final bool isDarkMode;
  final VoidCallback onThemeToggle;
  final FamilyManagementStore familyStore;
  final DeviceMonitoringStore monitoringStore;
  final VoidCallback onOpenAccount;
  final VoidCallback onOpenFamilySecurity;
  final VoidCallback onOpenDeviceMonitoring;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Personalize your app and review home access.',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: colors.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 22),
                  _SettingsSection(
                    title: 'Appearance',
                    children: [
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        secondary: Icon(
                          isDarkMode
                              ? Icons.dark_mode_outlined
                              : Icons.light_mode_outlined,
                        ),
                        title: const Text('Dark theme'),
                        subtitle: Text(isDarkMode ? 'On' : 'Off'),
                        value: isDarkMode,
                        onChanged: (_) => onThemeToggle(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  _SettingsSection(
                    title: 'Account and family',
                    children: [
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.person_outline_rounded),
                        title: const Text('Profile and sign-in status'),
                        subtitle: Text(familyStore.currentEmail),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: onOpenAccount,
                      ),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.groups_2_outlined),
                        title: const Text('Family members and permissions'),
                        subtitle: Text(
                          '${familyStore.members.length} authorized · '
                          '${familyStore.currentRole.label}',
                        ),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: onOpenFamilySecurity,
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  _SettingsSection(
                    title: 'Home devices',
                    children: [
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.sensors_outlined),
                        title: const Text('Device status and history'),
                        subtitle: Text(
                          '${monitoringStore.onlineCount}/'
                          '${monitoringStore.devices.length} online · '
                          'Simulation mode',
                        ),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: onOpenDeviceMonitoring,
                      ),
                      const _SettingsInfoTile(
                        icon: Icons.notifications_none_rounded,
                        title: 'Notifications',
                        status: 'Not configured',
                        detail:
                            'Push alerts are not active. Device and command '
                            'status can be reviewed in Device Monitoring.',
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  _SettingsSection(
                    title: 'Voice and door safety',
                    children: [
                      const _SettingsInfoTile(
                        icon: Icons.mic_none_rounded,
                        title: 'Voice profiles',
                        status: 'Speaker verification not implemented',
                        detail:
                            'Voice commands use your signed-in account. The '
                            'app does not identify who is speaking.',
                      ),
                      const _SettingsInfoTile(
                        icon: Icons.door_front_door_outlined,
                        title: 'Door unlocking',
                        status: 'Voice unlock disabled',
                        detail: 'Android uses the phone PIN or biometrics. The '
                            'web version asks for confirmation for the '
                            'simulated lock only; it cannot control hardware.',
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.shield_outlined, color: colors.primary),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Hardware connection',
                                  style: theme.textTheme.titleSmall,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'No ESP32 is connected. Controls and device '
                                  'status are simulated. Hardware integration '
                                  'must use a secure backend; the ESP32 must '
                                  'not be exposed to the public internet.',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: colors.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsSection extends StatelessWidget {
  const _SettingsSection({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                title,
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(color: Theme.of(context).colorScheme.primary),
              ),
            ),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _SettingsInfoTile extends StatelessWidget {
  const _SettingsInfoTile({
    required this.icon,
    required this.title,
    required this.status,
    required this.detail,
  });

  final IconData icon;
  final String title;
  final String status;
  final String detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon),
      title: Text(title),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              status,
              style: theme.textTheme.labelMedium?.copyWith(
                color: colors.tertiary,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 3),
            Text(detail),
          ],
        ),
      ),
      isThreeLine: true,
    );
  }
}
