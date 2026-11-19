import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import {
  Activity,
  Bell,
  Cpu,
  Home,
  Menu,
  Mic,
  Moon,
  Sparkles,
  Sun,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { AuthView } from './components/AuthView';
import { AutomationsView } from './components/AutomationsView';
import { DevicesMonitoringView } from './components/DevicesMonitoringView';
import { DevicesPage, DevicesRoomFilter } from './components/DevicesPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  FamilySectionTab,
  FamilySecurityView,
} from './components/FamilySecurityView';
import { HomeDashboardView } from './components/HomeDashboardView';
import { RoomDetailView } from './components/RoomDetailView';
import { RoutineExecutionModal } from './components/RoutineExecutionModal';
import { VoiceAssistantView } from './components/VoiceAssistantView';
import { WelcomeView } from './components/WelcomeView';
import {
  auth,
  reloadAuthUser,
  sendResetPassword,
  sendVerificationEmail,
  signOutUser,
} from './lib/firebase';
import {
  HouseholdContext,
  acceptHouseholdInvite,
  bootstrapHousehold,
  createHouseholdInvite,
  deriveDisplayName,
  ensureHomeState,
  ensureUserProfile,
  recordHouseholdActivity,
  removeHouseholdMember,
  revokeHouseholdInvite,
  saveHomeState,
  saveRoutine,
  subscribeHomeState,
  subscribeHouseholdData,
  subscribeRoutines,
  updateMemberPermissions,
} from './lib/firestoreSync';
import {
  StreamConnectionState,
  ackToCommandLog,
  hardwareGateway,
} from './lib/hardwareGateway';
import { executeAutomationRoutine } from './lib/routineExecutor';
import {
  AutomationRoutine,
  DEFAULT_DEVICE_STATE,
  DEVICE_IDS,
  DeviceCommandLog,
  DeviceId,
  DeviceState,
  Esp32StatusPayload,
  FamilyActivityEntry,
  FamilyInvite,
  FamilyMember,
  FamilyPermissions,
  FamilyRole,
  HardwareConnectionStatus,
  MonitoredDevice,
  ROUTINE_META,
  RoutineExecutionReport,
  RoutineId,
  SceneMode,
  VoiceAction,
  defaultPermissionsForRole,
  defaultRoutineFor,
} from './types/smartHome';

type MainTab = 'home' | 'devices' | 'automations' | 'voice';
type PushedScreen = 'none' | 'bedroom' | 'telemetry' | 'family';

function createInitialMonitoredDevices(): MonitoredDevice[] {
  const now = new Date();
  return [
    {
      deviceId: DEVICE_IDS.livingRoomLight,
      name: 'Living Room Light',
      room: 'Living Room',
      nodeId: 'ESP32-LIGHT-01',
      firmware: 'v2.4.1',
      online: true,
      rssiDbm: -54,
      lastHeartbeatAt: now,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    {
      deviceId: DEVICE_IDS.bedroomFan,
      name: 'Bedroom Fan',
      room: 'Bedroom',
      nodeId: 'ESP32-FAN-02',
      firmware: 'v2.4.1',
      online: true,
      rssiDbm: -61,
      lastHeartbeatAt: now,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    {
      deviceId: DEVICE_IDS.frontDoorLock,
      name: 'Front Entry Door',
      room: 'Entryway',
      nodeId: 'ESP32-LOCK-03',
      firmware: 'v2.5.0',
      online: true,
      rssiDbm: -57,
      lastHeartbeatAt: now,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  ];
}

function formatRoleLabel(role: FamilyRole): string {
  if (role === 'owner') return 'Owner';
  if (role === 'adult') return 'Adult';
  return 'Guest';
}

function activePermissionLabels(p: FamilyPermissions): string[] {
  const labels: string[] = [];
  if (p.canControlDevices) labels.push('Lights & fan');
  if (p.canRunAutomations) labels.push('Automations');
  if (p.canUseVoiceCommands) labels.push('Voice');
  if (p.canUnlockDoor) labels.push('Door unlock');
  if (p.canManageFamily) labels.push('Family admin');
  return labels;
}

function SmartHomeShell() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [hasBegun, setHasBegun] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [pushedScreen, setPushedScreen] = useState<PushedScreen>('none');
  const [automationsInSubScreen, setAutomationsInSubScreen] = useState(false);
  const [devicesRoomFilter, setDevicesRoomFilter] =
    useState<DevicesRoomFilter>('All');
  const [familyInitialTab, setFamilyInitialTab] =
    useState<FamilySectionTab>('members');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [selectedMode, setSelectedMode] = useState<SceneMode>('Home');
  const [deviceState, setDeviceState] =
    useState<DeviceState>(DEFAULT_DEVICE_STATE);
  const deviceStateRef = useRef<DeviceState>(DEFAULT_DEVICE_STATE);
  deviceStateRef.current = deviceState;

  const [routines, setRoutines] = useState<
    Record<RoutineId, AutomationRoutine>
  >({
    sleep: defaultRoutineFor('sleep'),
    morning: defaultRoutineFor('morning'),
    away: defaultRoutineFor('away'),
  });
  const [activeRoutineModal, setActiveRoutineModal] =
    useState<AutomationRoutine | null>(null);
  const [lastReport, setLastReport] = useState<RoutineExecutionReport | null>(
    null,
  );

  const [monitoredDevices, setMonitoredDevices] = useState<MonitoredDevice[]>(
    createInitialMonitoredDevices,
  );
  const monitoredRef = useRef<MonitoredDevice[]>(monitoredDevices);
  monitoredRef.current = monitoredDevices;

  const [commandLogs, setCommandLogs] = useState<DeviceCommandLog[]>([]);
  const [hardwareStatus, setHardwareStatus] =
    useState<HardwareConnectionStatus>({
      mode: 'simulation',
      configured: false,
      hardwareConnected: false,
      tlsEnforced: true,
      brokerHost: null,
      transportLabel: 'Hardware not connected · Simulation mode',
      lastSyncAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
  const [streamState, setStreamState] =
    useState<StreamConnectionState>('disconnected');
  const [streamError, setStreamError] = useState<string | null>(null);

  const [household, setHousehold] = useState<HouseholdContext>({
    homeId: 'home_local',
    homeName: 'My Smart Home',
    homeOwnerId: 'local-owner',
    memberUids: ['local-owner'],
  });
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<FamilyInvite[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<FamilyInvite[]>([]);
  const [activities, setActivities] = useState<FamilyActivityEntry[]>([]);

  const [doorUnlockConfirmOpen, setDoorUnlockConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (!u) {
        setHasBegun(false);
        setActiveTab('home');
        setPushedScreen('none');
        setDrawerOpen(false);
        setProfileOpen(false);
        setActiveRoutineModal(null);
        setDoorUnlockConfirmOpen(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!user.emailVerified) {
      setHousehold({
        homeId: `home_${user.uid}`,
        homeName: 'My Smart Home',
        homeOwnerId: user.uid,
        memberUids: [user.uid],
      });
      return;
    }

    let cancelled = false;
    let unsubHomeState: (() => void) | null = null;
    let unsubRoutines: (() => void) | null = null;
    let unsubHousehold: (() => void) | null = null;

    const init = async () => {
      await ensureUserProfile(user);
      await ensureHomeState(user);
      if (cancelled) return;

      unsubHomeState = subscribeHomeState(user.uid, (data) => {
        setSelectedMode(data.selectedMode);
        setDeviceState(data.state);
      });

      unsubRoutines = subscribeRoutines(user.uid, (routine) => {
        setRoutines((prev) => ({ ...prev, [routine.id]: routine }));
      });

      const ctx = await bootstrapHousehold(user);
      if (cancelled) return;
      setHousehold(ctx);

      unsubHousehold = subscribeHouseholdData(ctx.homeId, user, {
        onHome: setHousehold,
        onMembers: setMembers,
        onOutgoingInvites: setOutgoingInvites,
        onIncomingInvites: setIncomingInvites,
        onActivities: setActivities,
      });
    };

    void init().catch((err) => {
      console.error('Sync bootstrap error:', err);
      showToast(err instanceof Error ? err.message : 'Cloud sync error.');
    });

    return () => {
      cancelled = true;
      unsubHomeState?.();
      unsubRoutines?.();
      unsubHousehold?.();
    };
  }, [user, showToast]);

  const currentMember = useMemo(
    () =>
      members.find(
        (m) => m.uid === user?.uid || m.memberId === user?.uid,
      ) ?? null,
    [members, user?.uid],
  );

  const currentRole: FamilyRole = currentMember?.role ?? 'owner';
  const permissions: FamilyPermissions =
    currentMember?.permissions ?? defaultPermissionsForRole(currentRole);

  const upsertCommandLog = useCallback((entry: DeviceCommandLog) => {
    setCommandLogs((prev) => {
      const deduped = prev.filter((item) => item.id !== entry.id);
      return [entry, ...deduped].slice(0, 50);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = hardwareGateway.subscribe({
      onSnapshot: (snapshot) => {
        setHardwareStatus(snapshot.status);
        setMonitoredDevices(snapshot.devices);
        setCommandLogs(snapshot.commands);
      },
      onDeviceStatus: (device) => {
        setMonitoredDevices((prev) =>
          prev.map((d) => (d.deviceId === device.deviceId ? device : d)),
        );
      },
      onCommandAck: (ack) => {
        upsertCommandLog(ackToCommandLog(ack));
      },
      onTransportStatus: (status) => {
        setHardwareStatus(status);
      },
      onConnectionStateChange: (nextState, errMsg) => {
        setStreamState(nextState);
        setStreamError(errMsg ?? null);
      },
    });
    return () => unsubscribe();
  }, [user, upsertCommandLog]);

  const appendCommandLog = useCallback(
    (
      deviceId: DeviceId,
      deviceName: string,
      command: string,
      success: boolean,
      message: string,
    ) => {
      upsertCommandLog({
        id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        deviceId,
        deviceName,
        command,
        success,
        ackStatus: success ? 'acknowledged' : 'failed',
        simulated: hardwareStatus.mode === 'simulation',
        transport: hardwareStatus.mode,
        message,
        latencyMs: success ? 28 + Math.floor(Math.random() * 24) : 2500,
        timestamp: new Date(),
      });
    },
    [upsertCommandLog, hardwareStatus.mode],
  );

  const assertOnline = useCallback(
    (deviceId: DeviceId, name: string, command: string) => {
      const node = monitoredRef.current.find((d) => d.deviceId === deviceId);
      if (node && !node.online && streamState !== 'subscribed') {
        const msg = `${name} is offline (simulated ESP32 unreachable).`;
        appendCommandLog(deviceId, name, command, false, msg);
        throw new Error(msg);
      }
    },
    [appendCommandLog, streamState],
  );

  const persistState = useCallback(
    async (
      nextState: DeviceState,
      nextMode: SceneMode,
      activity?: {
        title: string;
        detail: string;
        category: FamilyActivityEntry['category'];
        source: FamilyActivityEntry['source'];
      },
    ) => {
      deviceStateRef.current = nextState;
      setDeviceState(nextState);
      setSelectedMode(nextMode);
      if (user) {
        await saveHomeState(user, nextMode, nextState);
        if (activity) {
          await recordHouseholdActivity({
            user,
            household,
            actorRole: currentRole,
            actionTitle: activity.title,
            detail: activity.detail,
            category: activity.category,
            source: activity.source,
          });
        }
      }
    },
    [user, household, currentRole],
  );

  const setLight = useCallback(
    async (
      isOn: boolean,
      source: FamilyActivityEntry['source'] = 'dashboard',
    ) => {
      if (!permissions.canControlDevices) {
        throw new Error(
          `Permission denied: your account (${formatRoleLabel(currentRole)}) cannot control household devices.`,
        );
      }
      assertOnline(
        DEVICE_IDS.livingRoomLight,
        'Living Room Light',
        isOn ? 'Light ON' : 'Light OFF',
      );
      const ack = await hardwareGateway.publishCommand({
        deviceId: DEVICE_IDS.livingRoomLight,
        action: isOn ? 'light_on' : 'light_off',
        homeId: household.homeId,
      });
      upsertCommandLog(ackToCommandLog(ack));
      const next = { ...deviceStateRef.current, lightOn: isOn };
      await persistState(next, selectedMode, {
        title: `Light ${isOn ? 'ON' : 'OFF'}${ack.simulated ? ' (simulated)' : ''}`,
        detail: 'Updated via dashboard controls',
        category: 'device',
        source,
      });
    },
    [
      permissions.canControlDevices,
      currentRole,
      assertOnline,
      household.homeId,
      upsertCommandLog,
      persistState,
      selectedMode,
    ],
  );

  const setFan = useCallback(
    async (
      isOn: boolean,
      source: FamilyActivityEntry['source'] = 'dashboard',
    ) => {
      if (!permissions.canControlDevices) {
        throw new Error(
          `Permission denied: your account (${formatRoleLabel(currentRole)}) cannot control household devices.`,
        );
      }
      assertOnline(
        DEVICE_IDS.bedroomFan,
        'Bedroom Fan',
        isOn ? 'Fan ON' : 'Fan OFF',
      );
      const ack = await hardwareGateway.publishCommand({
        deviceId: DEVICE_IDS.bedroomFan,
        action: isOn ? 'fan_on' : 'fan_off',
        homeId: household.homeId,
      });
      upsertCommandLog(ackToCommandLog(ack));
      const next = { ...deviceStateRef.current, fanOn: isOn };
      await persistState(next, selectedMode, {
        title: `Fan ${isOn ? 'ON' : 'OFF'}${ack.simulated ? ' (simulated)' : ''}`,
        detail: `Speed ${next.fanSpeed}/5`,
        category: 'device',
        source,
      });
    },
    [
      permissions.canControlDevices,
      currentRole,
      assertOnline,
      household.homeId,
      upsertCommandLog,
      persistState,
      selectedMode,
    ],
  );

  const setFanSpeed = useCallback(
    async (speed: number) => {
      if (!permissions.canControlDevices) {
        throw new Error(
          `Permission denied: your account (${formatRoleLabel(currentRole)}) cannot control household devices.`,
        );
      }
      const clamped = Math.max(1, Math.min(5, Math.round(speed)));
      assertOnline(DEVICE_IDS.bedroomFan, 'Bedroom Fan', `Fan speed ${clamped}`);
      const ack = await hardwareGateway.publishCommand({
        deviceId: DEVICE_IDS.bedroomFan,
        action: 'fan_speed',
        value: clamped,
        homeId: household.homeId,
      });
      upsertCommandLog(ackToCommandLog(ack));
      const next = { ...deviceStateRef.current, fanSpeed: clamped };
      await persistState(next, selectedMode, {
        title: `Fan speed ${clamped}/5${ack.simulated ? ' (simulated)' : ''}`,
        detail: 'Bedroom controls',
        category: 'device',
        source: 'devices',
      });
    },
    [
      permissions.canControlDevices,
      currentRole,
      assertOnline,
      household.homeId,
      upsertCommandLog,
      persistState,
      selectedMode,
    ],
  );

  const setDoorLocked = useCallback(
    async (
      locked: boolean,
      source: FamilyActivityEntry['source'] = 'dashboard',
    ) => {
      if (!permissions.canControlDevices) {
        throw new Error(
          `Permission denied: your account (${formatRoleLabel(currentRole)}) cannot control household devices.`,
        );
      }
      if (!locked && !permissions.canUnlockDoor) {
        throw new Error(
          `Permission denied: your account (${formatRoleLabel(currentRole)}) cannot unlock the front door.`,
        );
      }
      assertOnline(
        DEVICE_IDS.frontDoorLock,
        'Front Entry Door',
        locked ? 'Door locked' : 'Door unlocked',
      );
      const ack = await hardwareGateway.publishCommand({
        deviceId: DEVICE_IDS.frontDoorLock,
        action: locked ? 'door_lock' : 'door_unlock',
        homeId: household.homeId,
      });
      upsertCommandLog(ackToCommandLog(ack));
      const next = { ...deviceStateRef.current, doorLocked: locked };
      await persistState(next, selectedMode, {
        title: `${locked ? 'Door locked' : 'Door unlocked'}${ack.simulated ? ' (simulated)' : ''}`,
        detail: 'Updated via dashboard controls',
        category: 'door',
        source,
      });
    },
    [
      permissions.canControlDevices,
      permissions.canUnlockDoor,
      currentRole,
      assertOnline,
      household.homeId,
      upsertCommandLog,
      persistState,
      selectedMode,
    ],
  );

  const handleToggleDoorSensor = async () => {
    try {
      if (!permissions.canControlDevices) {
        throw new Error(
          `Permission denied: your account (${formatRoleLabel(currentRole)}) cannot control household devices.`,
        );
      }
      assertOnline(DEVICE_IDS.frontDoorLock, 'Front Entry Door', 'Door sensor');
      const nextOpen = !deviceStateRef.current.doorOpen;
      const ack = await hardwareGateway.publishCommand({
        deviceId: DEVICE_IDS.frontDoorLock,
        action: 'door_sensor_toggle',
        value: nextOpen,
        homeId: household.homeId,
      });
      upsertCommandLog(ackToCommandLog(ack));
      const next = { ...deviceStateRef.current, doorOpen: nextOpen };
      await persistState(next, selectedMode, {
        title: `Door sensor ${nextOpen ? 'open' : 'closed'}${ack.simulated ? ' (simulated)' : ''}`,
        detail: 'Simulated contact sensor state',
        category: 'door',
        source: 'dashboard',
      });
      showToast(
        'Door sensor changed in simulation. No physical device was changed.',
      );
    } catch (err) {
      showToast(
        err instanceof Error
          ? `Action not applied: ${err.message}`
          : 'Action failed.',
      );
    }
  };

  const handleRequestDoorToggle = () => {
    if (deviceState.doorLocked) {
      if (!permissions.canUnlockDoor) {
        showToast(
          `Permission denied: your account (${formatRoleLabel(currentRole)}) cannot unlock the front door.`,
        );
        return;
      }
      setDoorUnlockConfirmOpen(true);
    } else {
      void setDoorLocked(true)
        .then(() =>
          showToast(
            'Door locked changed in simulation. No physical device was changed.',
          ),
        )
        .catch((err) =>
          showToast(
            err instanceof Error
              ? `Action not applied: ${err.message}`
              : 'Failed to lock door.',
          ),
        );
    }
  };

  const handleRunRoutine = async (
    routine: AutomationRoutine,
    doorSafetyConfirmed: boolean,
  ): Promise<RoutineExecutionReport> => {
    const report = await executeAutomationRoutine(
      routine,
      {
        getState: () => deviceStateRef.current,
        setLight: async (on) => setLight(on, 'automations'),
        setFan: async (on) => setFan(on, 'automations'),
        setFanSpeed: async (speed) => setFanSpeed(speed),
        setDoorLocked: async (locked) => setDoorLocked(locked, 'automations'),
      },
      doorSafetyConfirmed,
    );
    setLastReport(report);
    const modeLabel = ROUTINE_META[routine.id].modeLabel;
    await persistState(deviceStateRef.current, modeLabel, {
      title: `Ran ${report.routineTitle}`,
      detail: `${report.steps.length} steps processed`,
      category: 'automation',
      source: 'automations',
    });
    return report;
  };

  const handleOpenRoutinePreview = (id: RoutineId) => {
    const routine = routines[id];
    if (!permissions.canRunAutomations) {
      showToast(
        `Permission denied: your account (${formatRoleLabel(currentRole)}) cannot run automation routines.`,
      );
      return;
    }
    setActiveRoutineModal(routine);
  };

  const handleExecuteVoiceAction = async (
    action: VoiceAction,
    transcript: string,
  ): Promise<string> => {
    if (!permissions.canUseVoiceCommands) {
      throw new Error('Permission denied: voice commands are disabled for your account.');
    }
    if (action === 'turn_light_on') {
      await setLight(true, 'voice');
      return 'Light turned on in simulation.';
    }
    if (action === 'turn_light_off') {
      await setLight(false, 'voice');
      return 'Light turned off in simulation.';
    }
    if (action === 'turn_fan_on') {
      await setFan(true, 'voice');
      return 'Fan turned on in simulation.';
    }
    if (action === 'turn_fan_off') {
      await setFan(false, 'voice');
      return 'Fan turned off in simulation.';
    }
    if (action === 'lock_door') {
      if (deviceStateRef.current.doorOpen) {
        throw new Error(
          'Door sensor reports the front door is OPEN. Close the door before locking.',
        );
      }
      await setDoorLocked(true, 'voice');
      return 'Door locked in simulation.';
    }
    if (
      action === 'sleep_mode' ||
      action === 'morning_mode' ||
      action === 'away_mode'
    ) {
      if (!permissions.canRunAutomations) {
        throw new Error('Permission denied: your account cannot run routines.');
      }
      const id: RoutineId =
        action === 'sleep_mode'
          ? 'sleep'
          : action === 'morning_mode'
            ? 'morning'
            : 'away';
      const report = await handleRunRoutine(routines[id], true);
      if (user) {
        await recordHouseholdActivity({
          user,
          household,
          actorRole: currentRole,
          actionTitle: `Voice: ${report.routineTitle}`,
          detail: `Spoken: "${transcript}"`,
          category: 'voice',
          source: 'voice',
        });
      }
      const hasFailures = report.steps.some((s) => s.status === 'failed');
      const hasSkipped = report.steps.some((s) => s.status === 'skipped');
      if (hasFailures) {
        return `${report.routineTitle} completed with errors. Check Automations for details.`;
      }
      if (hasSkipped) {
        return `${report.routineTitle} completed with skipped steps.`;
      }
      return `${report.routineTitle} completed.`;
    }
    throw new Error('Action is not executable.');
  };

  const handleSimulatePacket = (payload: Esp32StatusPayload) => {
    void hardwareGateway
      .simulateStatusPacket(payload)
      .then((updated) => {
        setMonitoredDevices((prev) =>
          prev.map((d) => (d.deviceId === updated.deviceId ? updated : d)),
        );
        showToast(
          payload.online
            ? 'Simulated ESP32 heartbeat received (online).'
            : `Simulated fault recorded (${payload.errorCode ?? 'OFFLINE'}).`,
        );
      })
      .catch((err) => {
        showToast(
          err instanceof Error ? err.message : 'Failed to deliver packet.',
        );
      });
  };

  const handleSimulateConnectivity = (deviceId: DeviceId, online: boolean) => {
    void hardwareGateway
      .simulateStatusPacket({
        deviceId,
        online,
        rssiDbm: online ? -58 : null,
        errorCode: online ? null : 'ERR_NODE_OFFLINE',
        errorMessage: online ? null : 'ESP32 node simulated offline.',
        timestamp: new Date(),
      })
      .then((updated) => {
        setMonitoredDevices((prev) =>
          prev.map((d) => (d.deviceId === updated.deviceId ? updated : d)),
        );
        showToast(
          online
            ? 'Simulated ESP32 node is back online.'
            : 'Simulated ESP32 node offline.',
        );
      })
      .catch((err) => {
        showToast(
          err instanceof Error ? err.message : 'Failed to update node status.',
        );
      });
  };

  const handleResolveError = (deviceId: DeviceId) => {
    void hardwareGateway
      .resolveError(deviceId)
      .then((updated) => {
        setMonitoredDevices((prev) =>
          prev.map((d) => (d.deviceId === updated.deviceId ? updated : d)),
        );
        showToast('Connection error resolved.');
      })
      .catch((err) => {
        showToast(
          err instanceof Error ? err.message : 'Failed to resolve error.',
        );
      });
  };

  const openLivingRoomControls = () => {
    setDevicesRoomFilter('Living room');
    setPushedScreen('none');
    setActiveTab('devices');
    showToast('Opening Living room controls.');
  };

  const openFamilyScreen = (tab: FamilySectionTab = 'members') => {
    setFamilyInitialTab(tab);
    setPushedScreen('family');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F7F5] dark:bg-[#101113]">
        <div className="w-8 h-8 rounded-full border-2 border-[#F3A64A] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode((d) => !d)}
      />
    );
  }

  const accountName = deriveDisplayName(user);
  const firstName = accountName.split(/[\s._-]+/)[0] || 'there';

  if (!hasBegun) {
    return <WelcomeView onBegin={() => setHasBegun(true)} />;
  }

  const pendingInvitesCount = outgoingInvites.filter(
    (inv) => inv.status === 'pending',
  ).length;
  const activeErrorsCount = monitoredDevices.filter(
    (d) => !d.online || Boolean(d.lastErrorCode),
  ).length;
  const onlineCount = monitoredDevices.filter((d) => d.online).length;

  // ==================== PUSHED SUB-SCREENS ====================
  if (pushedScreen === 'bedroom') {
    return (
      <>
        <RoomDetailView
          deviceState={deviceState}
          canControlDevices={permissions.canControlDevices}
          canUnlockDoor={permissions.canUnlockDoor}
          onBack={() => setPushedScreen('none')}
          onToggleLight={() =>
            void setLight(!deviceState.lightOn, 'devices')
              .then(() =>
                showToast(
                  `${!deviceState.lightOn ? 'Light ON' : 'Light OFF'} changed in simulation. No physical device was changed.`,
                ),
              )
              .catch((err) =>
                showToast(err instanceof Error ? err.message : 'Failed.'),
              )
          }
          onToggleFan={() =>
            void setFan(!deviceState.fanOn, 'devices')
              .then(() =>
                showToast(
                  `${!deviceState.fanOn ? 'Fan ON' : 'Fan OFF'} changed in simulation. No physical device was changed.`,
                ),
              )
              .catch((err) =>
                showToast(err instanceof Error ? err.message : 'Failed.'),
              )
          }
          onChangeFanSpeed={(speed) =>
            void setFanSpeed(speed)
              .then(() =>
                showToast(
                  'Fan speed changed in simulation. No physical device was changed.',
                ),
              )
              .catch((err) =>
                showToast(err instanceof Error ? err.message : 'Failed.'),
              )
          }
          onRequestDoorToggle={handleRequestDoorToggle}
          onToggleDoorSensor={() => void handleToggleDoorSensor()}
          onShowNotice={showToast}
        />
        <DoorUnlockDialog
          open={doorUnlockConfirmOpen}
          onCancel={() => setDoorUnlockConfirmOpen(false)}
          onConfirm={() => {
            setDoorUnlockConfirmOpen(false);
            void setDoorLocked(false)
              .then(() =>
                showToast(
                  'Door unlocked changed in simulation. No physical device was changed.',
                ),
              )
              .catch((err) =>
                showToast(
                  err instanceof Error ? err.message : 'Unlock failed.',
                ),
              );
          }}
        />
        <FloatingSnack message={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  if (pushedScreen === 'telemetry') {
    return (
      <>
        <DevicesMonitoringView
          deviceState={deviceState}
          monitoredDevices={monitoredDevices}
          commandLogs={commandLogs}
          hardwareStatus={hardwareStatus}
          streamState={streamState}
          streamError={streamError}
          onBack={() => setPushedScreen('none')}
          onRefreshAll={() => {
            void hardwareGateway
              .ping()
              .then((devices) => {
                setMonitoredDevices(devices);
                showToast(
                  hardwareStatus.mode === 'simulation'
                    ? 'Simulated ESP32 status refresh completed.'
                    : 'ESP32 status refresh completed.',
                );
              })
              .catch((err) => {
                showToast(
                  err instanceof Error ? err.message : 'Status refresh failed.',
                );
              });
          }}
          onPingDevice={(id) => {
            void hardwareGateway
              .ping(id)
              .then((devices) => {
                setMonitoredDevices(devices);
                const found = devices.find((d) => d.deviceId === id);
                if (!found) return;
                showToast(
                  found.online
                    ? `${found.name} responded (${found.rssiDbm ?? -58} dBm).`
                    : `${found.name} is offline; timeout recorded.`,
                );
              })
              .catch((err) => {
                showToast(
                  err instanceof Error ? err.message : 'Ping failed.',
                );
              });
          }}
          onSimulateConnectivity={handleSimulateConnectivity}
          onSimulatePacket={handleSimulatePacket}
          onResolveError={handleResolveError}
        />
        <FloatingSnack message={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  if (pushedScreen === 'family') {
    return (
      <>
        <FamilySecurityView
          homeName={household.homeName}
          currentUid={user.uid}
          currentName={accountName}
          currentEmail={user.email ?? 'No email address'}
          currentProviderIds={user.providerData.map((p) => p.providerId)}
          currentEmailVerified={user.emailVerified}
          currentRole={currentRole}
          currentPermissions={permissions}
          canManageFamily={permissions.canManageFamily}
          initialTab={familyInitialTab}
          members={members}
          outgoingInvites={outgoingInvites}
          incomingInvites={incomingInvites}
          activities={activities}
          onBack={() => setPushedScreen('none')}
          onShowNotice={showToast}
          onInviteMember={async (params) => {
            return await createHouseholdInvite({
              user,
              household,
              displayName: params.displayName,
              invitedEmail: params.email,
              role: params.role,
              permissions: params.permissions,
            });
          }}
          onRevokeInvite={revokeHouseholdInvite}
          onAcceptInvite={async (code) => {
            await acceptHouseholdInvite(user, code);
            const nextCtx = await bootstrapHousehold(user);
            setHousehold(nextCtx);
          }}
          onUpdateMemberPermissions={async (member, role, perms) => {
            await updateMemberPermissions({
              homeId: household.homeId,
              member,
              role,
              permissions: perms,
            });
          }}
          onRemoveMember={async (member) => {
            await removeHouseholdMember(household.homeId, member.memberId);
          }}
          onResendVerification={async () => {
            await sendVerificationEmail();
            showToast(
              `Verification email sent to ${user.email}. Check your inbox and tap Refresh status.`,
            );
          }}
          onRefreshVerification={async () => {
            await reloadAuthUser();
            setUser(
              auth.currentUser ? ({ ...auth.currentUser } as User) : null,
            );
            showToast('Account status refreshed.');
          }}
          onSendPasswordReset={async () => {
            if (!user.email) return;
            await sendResetPassword(user.email);
            showToast(`Password reset email sent to ${user.email}.`);
          }}
        />
        <FloatingSnack message={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  const showTopAppBar = activeTab === 'home' || activeTab === 'devices';
  const showBottomBar = !(
    activeTab === 'automations' && automationsInSubScreen
  );

  // ==================== MAIN SCAFFOLD (APPBAR + DRAWER + BODY + BOTTOM NAVIGATIONBAR) ====================
  return (
    <div className="min-h-screen bg-[#F4F7F5] dark:bg-[#101113] text-[#111315] dark:text-[#F4F5F6] flex flex-col">
      {showTopAppBar && (
        <header className="sticky top-0 z-30 h-14 px-2 sm:px-4 bg-[#F4F7F5]/95 dark:bg-[#101113]/95 backdrop-blur-md flex items-center justify-between">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-0.5 pr-1">
            <button
              type="button"
              title="Device Monitoring"
              onClick={() => setPushedScreen('telemetry')}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition"
            >
              <Activity className="w-5 h-5" />
            </button>
            <button
              type="button"
              title="Family & Security"
              onClick={() => openFamilyScreen('members')}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition"
            >
              <Users className="w-5 h-5" />
            </button>
            <button
              type="button"
              title="Notifications"
              onClick={() => showToast('Notifications are not configured yet.')}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition"
            >
              <Bell className="w-5 h-5" />
            </button>
          </div>
        </header>
      )}

      <main className={`flex-1 ${showBottomBar ? 'pb-20' : ''}`}>
        {activeTab === 'home' && (
          <HomeDashboardView
            firstName={firstName}
            accountName={accountName}
            homeName={household.homeName}
            roleLabel={formatRoleLabel(currentRole)}
            memberCount={members.length}
            pendingInviteCount={pendingInvitesCount}
            selectedMode={selectedMode}
            deviceState={deviceState}
            monitoredDevices={monitoredDevices}
            activities={activities}
            canControlDevices={permissions.canControlDevices}
            canUnlockDoor={permissions.canUnlockDoor}
            voiceEnabled={permissions.canUseVoiceCommands}
            onSelectHomeMode={() => {
              void persistState(deviceState, 'Home', {
                title: 'Switched scene to Home',
                detail: 'Scene selector',
                category: 'automation',
                source: 'dashboard',
              });
              showToast('Scene set to Home.');
            }}
            onRunRoutineFromScene={handleOpenRoutinePreview}
            onToggleLight={() =>
              void setLight(!deviceState.lightOn, 'dashboard')
                .then(() =>
                  showToast(
                    `${!deviceState.lightOn ? 'Light ON' : 'Light OFF'} changed in simulation. No physical device was changed.`,
                  ),
                )
                .catch((err) =>
                  showToast(
                    err instanceof Error
                      ? `Action not applied: ${err.message}`
                      : 'Failed.',
                  ),
                )
            }
            onToggleFan={() =>
              void setFan(!deviceState.fanOn, 'dashboard')
                .then(() =>
                  showToast(
                    `${!deviceState.fanOn ? 'Fan ON' : 'Fan OFF'} changed in simulation. No physical device was changed.`,
                  ),
                )
                .catch((err) =>
                  showToast(
                    err instanceof Error
                      ? `Action not applied: ${err.message}`
                      : 'Failed.',
                  ),
                )
            }
            onRequestDoorToggle={handleRequestDoorToggle}
            onToggleDoorSensor={() => void handleToggleDoorSensor()}
            onOpenBedroom={() => setPushedScreen('bedroom')}
            onOpenDevicesTab={() => setActiveTab('devices')}
            onOpenAutomationsTab={() => setActiveTab('automations')}
            onOpenMonitoring={() => setPushedScreen('telemetry')}
            onOpenFamilyTab={openFamilyScreen}
            onExecuteVoiceAction={handleExecuteVoiceAction}
            onOpenLivingRoom={openLivingRoomControls}
          />
        )}

        {activeTab === 'devices' && (
          <DevicesPage
            deviceState={deviceState}
            monitoredDevices={monitoredDevices}
            selectedRoom={devicesRoomFilter}
            onSelectRoom={setDevicesRoomFilter}
            canControlDevices={permissions.canControlDevices}
            canUnlockDoor={permissions.canUnlockDoor}
            onToggleLight={() =>
              void setLight(!deviceState.lightOn, 'devices')
                .then(() =>
                  showToast(
                    `${!deviceState.lightOn ? 'Light ON' : 'Light OFF'} changed in simulation. No physical device was changed.`,
                  ),
                )
                .catch((err) =>
                  showToast(
                    err instanceof Error
                      ? `Action not applied: ${err.message}`
                      : 'Failed.',
                  ),
                )
            }
            onToggleFan={() =>
              void setFan(!deviceState.fanOn, 'devices')
                .then(() =>
                  showToast(
                    `${!deviceState.fanOn ? 'Fan ON' : 'Fan OFF'} changed in simulation. No physical device was changed.`,
                  ),
                )
                .catch((err) =>
                  showToast(
                    err instanceof Error
                      ? `Action not applied: ${err.message}`
                      : 'Failed.',
                  ),
                )
            }
            onRequestDoorToggle={handleRequestDoorToggle}
            onToggleDoorSensor={() => void handleToggleDoorSensor()}
            onOpenBedroom={() => setPushedScreen('bedroom')}
            onOpenMonitoring={() => setPushedScreen('telemetry')}
          />
        )}

        {activeTab === 'automations' && (
          <AutomationsView
            routines={routines}
            activeModeLabel={selectedMode}
            deviceState={deviceState}
            canRunAutomations={permissions.canRunAutomations}
            lastReport={lastReport}
            onBackToHome={() => setActiveTab('home')}
            onPreviewAndRun={(r) => setActiveRoutineModal(r)}
            onRoutineDenied={(r) =>
              showToast(
                `Permission denied: your account (${formatRoleLabel(currentRole)}) cannot run ${ROUTINE_META[r.id].title}.`,
              )
            }
            onSaveRoutine={async (r) => {
              const previous = routines[r.id];
              setRoutines((prev) => ({ ...prev, [r.id]: r }));
              try {
                await saveRoutine(user, r);
                showToast(`${ROUTINE_META[r.id].title} saved.`);
              } catch (err) {
                setRoutines((prev) => ({ ...prev, [r.id]: previous }));
                showToast(
                  err instanceof Error ? err.message : 'Failed to save routine.',
                );
                throw err;
              }
            }}
            onResetRoutine={async (id) => {
              const previous = routines[id];
              const def = defaultRoutineFor(id);
              setRoutines((prev) => ({ ...prev, [id]: def }));
              try {
                await saveRoutine(user, def);
                showToast(`${ROUTINE_META[id].title} reset to defaults.`);
              } catch (err) {
                setRoutines((prev) => ({ ...prev, [id]: previous }));
                showToast(
                  err instanceof Error ? err.message : 'Failed to reset routine.',
                );
              }
            }}
            onSubScreenChange={setAutomationsInSubScreen}
          />
        )}

        {activeTab === 'voice' && (
          <VoiceAssistantView
            accountName={accountName}
            roleLabel={formatRoleLabel(currentRole)}
            voiceEnabled={permissions.canUseVoiceCommands}
            onExecuteAction={handleExecuteVoiceAction}
            onOpenRooms={() => setActiveTab('devices')}
            onOpenLivingRoom={openLivingRoomControls}
            onOpenBedroom={() => setPushedScreen('bedroom')}
            onOpenFamilySecurity={() => openFamilyScreen('security')}
          />
        )}
      </main>

      {/* Bottom Material 3 NavigationBar matching dashboard_screen.dart */}
      {showBottomBar && (
        <nav className="fixed bottom-0 left-0 right-0 z-30 h-[76px] bg-white dark:bg-[#191B1F] border-t border-black/8 dark:border-[#44474F]/35 grid grid-cols-5">
          {(
            [
              { id: 'home' as const, label: 'Home', icon: Home },
              { id: 'devices' as const, label: 'Devices', icon: Cpu },
              {
                id: 'automations' as const,
                label: 'Automations',
                icon: Sparkles,
              },
              { id: 'voice' as const, label: 'Assistant', icon: Mic },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className="flex flex-col items-center justify-center gap-1 text-[11px]"
              >
                <span
                  className={`w-14 h-8 rounded-full flex items-center justify-center transition ${
                    active
                      ? 'bg-[#F3A64A]/20 text-[#D9821E] dark:text-[#FFDDB7]'
                      : 'text-neutral-600 dark:text-[#C4C6CF]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <span
                  className={`px-0.5 truncate max-w-full ${
                    active
                      ? 'font-semibold text-[#111315] dark:text-white'
                      : 'font-medium text-neutral-600 dark:text-[#C4C6CF]'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="flex flex-col items-center justify-center gap-1 text-[11px]"
          >
            <span className="w-14 h-8 rounded-full flex items-center justify-center text-neutral-600 dark:text-[#C4C6CF] hover:bg-black/5 dark:hover:bg-white/5 transition">
              <UserIcon className="w-5 h-5" />
            </span>
            <span className="px-0.5 truncate max-w-full font-medium text-neutral-600 dark:text-[#C4C6CF]">
              Profile
            </span>
          </button>
        </nav>
      )}

      {/* Slide-out Drawer matching dashboard_screen.dart */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/55 flex"
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            className="w-[300px] max-w-[85vw] bg-white dark:bg-[#191B1F] h-full p-3 flex flex-col justify-between shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="px-3 py-3.5 flex items-center gap-3">
                <Home className="w-6 h-6 text-[#D9821E] dark:text-[#F3A64A] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold truncate">
                    AI Home Brain
                  </div>
                  <div className="text-[13px] text-neutral-500 dark:text-[#C4C6CF] truncate">
                    {accountName}
                  </div>
                </div>
              </div>

              <div className="h-px bg-black/10 dark:bg-white/10 my-1.5" />

              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('home');
                    setDrawerOpen(false);
                  }}
                  className="w-full px-3 py-3 rounded-xl flex items-center gap-3 text-left text-[14px] font-medium hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Home className="w-5 h-5 text-neutral-600 dark:text-[#C4C6CF]" />
                  <span>Home</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('devices');
                    setDrawerOpen(false);
                  }}
                  className="w-full px-3 py-3 rounded-xl flex items-center gap-3 text-left text-[14px] font-medium hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Cpu className="w-5 h-5 text-neutral-600 dark:text-[#C4C6CF]" />
                  <span>Devices</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setPushedScreen('telemetry');
                  }}
                  className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-left hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Activity className="w-5 h-5 text-neutral-600 dark:text-[#C4C6CF] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium">
                      Device Monitoring
                    </div>
                    <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                      {onlineCount}/{monitoredDevices.length} online ·{' '}
                      {activeErrorsCount} error
                      {activeErrorsCount === 1 ? '' : 's'}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('automations');
                    setDrawerOpen(false);
                  }}
                  className="w-full px-3 py-3 rounded-xl flex items-center gap-3 text-left text-[14px] font-medium hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Sparkles className="w-5 h-5 text-neutral-600 dark:text-[#C4C6CF]" />
                  <span>Automations</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    openFamilyScreen('members');
                  }}
                  className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-left hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Users className="w-5 h-5 text-neutral-600 dark:text-[#C4C6CF] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium">
                      Family &amp; Security
                    </div>
                    <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                      {members.length} authorized ·{' '}
                      {formatRoleLabel(currentRole)}
                    </div>
                  </div>
                </button>

                <div
                  onClick={() => setIsDarkMode((d) => !d)}
                  className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isDarkMode ? (
                      <Moon className="w-5 h-5 text-neutral-600 dark:text-[#C4C6CF] shrink-0" />
                    ) : (
                      <Sun className="w-5 h-5 text-neutral-600 dark:text-[#C4C6CF] shrink-0" />
                    )}
                    <div>
                      <div className="text-[14px] font-medium">Appearance</div>
                      <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                        {isDarkMode ? 'Dark theme' : 'Light theme'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isDarkMode}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDarkMode((d) => !d);
                    }}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      isDarkMode
                        ? 'bg-[#F3A64A]'
                        : 'bg-neutral-300 dark:bg-white/15'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        isDarkMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setDrawerOpen(false);
                setProfileOpen(true);
              }}
              className="w-full px-3 py-3 rounded-xl flex items-center gap-3 text-left text-[14px] font-medium hover:bg-black/5 dark:hover:bg-white/5"
            >
              <UserIcon className="w-5 h-5 text-neutral-600 dark:text-[#C4C6CF]" />
              <span>Profile and account</span>
            </button>
          </aside>
        </div>
      )}

      {/* Routine Preview & Execution Modal (from Home Scenes or Automations) */}
      {activeRoutineModal && (
        <RoutineExecutionModal
          routine={activeRoutineModal}
          deviceState={deviceState}
          onExecute={handleRunRoutine}
          onClose={() => setActiveRoutineModal(null)}
        />
      )}

      {/* Door Unlock Confirmation Modal */}
      <DoorUnlockDialog
        open={doorUnlockConfirmOpen}
        onCancel={() => setDoorUnlockConfirmOpen(false)}
        onConfirm={() => {
          setDoorUnlockConfirmOpen(false);
          void setDoorLocked(false)
            .then(() =>
              showToast(
                'Door unlocked changed in simulation. No physical device was changed.',
              ),
            )
            .catch((err) =>
              showToast(err instanceof Error ? err.message : 'Unlock failed.'),
            );
        }}
      />

      {/* ProfileDialog matching profile_screen.dart */}
      {profileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
          onClick={() => !signingOut && setProfileOpen(false)}
        >
          <div
            className="max-w-[400px] w-full rounded-[24px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-white/10 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[22px] font-semibold">Your profile</h2>

            <div className="space-y-1.5">
              <div className="text-[16px] font-semibold">{accountName}</div>
              <div className="text-[14px] text-neutral-500 dark:text-[#C4C6CF]">
                {user.email ?? 'No email address'}
              </div>
              <div
                className={`pt-2 text-[12px] font-semibold ${
                  user.emailVerified ? 'text-emerald-500' : 'text-amber-500'
                }`}
              >
                {user.emailVerified
                  ? 'Firebase account · Email verified'
                  : 'Firebase account · Email not verified'}
              </div>
              <div className="text-[12px] pt-1">
                Household: {household.homeName} ({formatRoleLabel(currentRole)})
              </div>
              <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                Permissions: {activePermissionLabels(permissions).join(', ')}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={signingOut}
                onClick={() => {
                  setProfileOpen(false);
                  openFamilyScreen('members');
                }}
                className="px-3 py-2 text-[13px] font-semibold text-[#D9821E] dark:text-[#F3A64A]"
              >
                Family &amp; security
              </button>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => setProfileOpen(false)}
                className="px-3 py-2 text-[13px] font-medium"
              >
                Close
              </button>
              <button
                type="button"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  try {
                    await signOutUser();
                    setProfileOpen(false);
                  } finally {
                    setSigningOut(false);
                  }
                }}
                className="px-4 py-2 rounded-full bg-[#F3A64A]/20 text-[#D9821E] dark:text-[#FFDDB7] text-[13px] font-semibold hover:bg-[#F3A64A]/30"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </div>
        </div>
      )}

      <FloatingSnack message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

const DoorUnlockDialog: React.FC<{
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ open, onCancel, onConfirm }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
      <div className="max-w-sm w-full rounded-[24px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-white/10 p-6 space-y-4">
        <h2 className="text-[20px] font-semibold">Confirm Door Unlock</h2>
        <p className="text-[14px] text-neutral-600 dark:text-[#C4C6CF]">
          Confirm to simulate unlocking the front door.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-[14px] font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-5 py-2 rounded-full bg-[#F3A64A] text-[#101113] text-[14px] font-semibold"
          >
            Confirm unlock
          </button>
        </div>
      </div>
    </div>
  );
};

const FloatingSnack: React.FC<{
  message: string | null;
  onClose: () => void;
}> = ({ message, onClose }) => {
  if (!message) return null;
  return (
    <div className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-40 rounded-[12px] bg-[#1C1E22] dark:bg-white text-white dark:text-[#101113] px-4 py-3 text-[13px] font-medium shadow-lg flex items-center justify-between gap-3">
      <span>{message}</span>
      <button type="button" onClick={onClose} className="opacity-70">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <SmartHomeShell />
    </ErrorBoundary>
  );
}
