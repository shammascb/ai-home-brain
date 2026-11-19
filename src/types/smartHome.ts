export type SceneMode = 'Home' | 'Away' | 'Sleep' | 'Morning';

export interface DeviceState {
  lightOn: boolean;
  fanOn: boolean;
  fanSpeed: number; // 1..5
  doorLocked: boolean;
  doorOpen: boolean;
}

export const DEFAULT_DEVICE_STATE: DeviceState = {
  lightOn: false,
  fanOn: false,
  fanSpeed: 2,
  doorLocked: true,
  doorOpen: false,
};

export type RoutineId = 'sleep' | 'morning' | 'away';
export type BinaryDeviceAction = 'turn_on' | 'turn_off' | 'unchanged';
export type DoorRoutineAction = 'lock_with_safety_check' | 'keep_locked' | 'unchanged';
export type StepCompletionStatus = 'completed' | 'verified' | 'skipped' | 'failed';

export interface AutomationRoutine {
  id: RoutineId;
  lightAction: BinaryDeviceAction;
  fanAction: BinaryDeviceAction;
  fanSpeed: number; // 1..5
  doorAction: DoorRoutineAction;
  requireSafetyConfirmation: boolean;
}

export interface PlannedRoutineAction {
  deviceLabel: string;
  actionLabel: string;
  detail: string;
  isSafetyBlocked?: boolean;
  needsConfirmation?: boolean;
}

export interface RoutineStepResult {
  deviceLabel: string;
  plannedAction: string;
  status: StepCompletionStatus;
  message: string;
}

export interface RoutineExecutionReport {
  routineId: RoutineId;
  routineTitle: string;
  executedAt: Date;
  steps: RoutineStepResult[];
}

export const ROUTINE_META: Record<
  RoutineId,
  { title: string; modeLabel: SceneMode; subtitle: string }
> = {
  sleep: {
    title: 'Sleep Mode',
    modeLabel: 'Sleep',
    subtitle: 'Wind down for the night and verify entry security',
  },
  morning: {
    title: 'Morning Mode',
    modeLabel: 'Morning',
    subtitle: 'Brighten the living space and refresh bedroom airflow',
  },
  away: {
    title: 'Away Mode',
    modeLabel: 'Away',
    subtitle: 'Power down appliances and secure the front door',
  },
};

export function defaultRoutineFor(id: RoutineId): AutomationRoutine {
  switch (id) {
    case 'sleep':
      return {
        id: 'sleep',
        lightAction: 'turn_off',
        fanAction: 'turn_off',
        fanSpeed: 2,
        doorAction: 'lock_with_safety_check',
        requireSafetyConfirmation: true,
      };
    case 'morning':
      return {
        id: 'morning',
        lightAction: 'turn_on',
        fanAction: 'turn_on',
        fanSpeed: 2,
        doorAction: 'keep_locked',
        requireSafetyConfirmation: true,
      };
    case 'away':
      return {
        id: 'away',
        lightAction: 'turn_off',
        fanAction: 'turn_off',
        fanSpeed: 2,
        doorAction: 'lock_with_safety_check',
        requireSafetyConfirmation: true,
      };
  }
}

export const DEVICE_IDS = {
  livingRoomLight: 'living_room_light',
  bedroomFan: 'bedroom_fan',
  frontDoorLock: 'front_door_lock',
} as const;

export type DeviceId = (typeof DEVICE_IDS)[keyof typeof DEVICE_IDS];

export type HardwareTransportMode = 'simulation' | 'mqtt_tls' | 'secure_bridge';

export type CommandAckStatus =
  | 'pending'
  | 'acknowledged'
  | 'timed_out'
  | 'failed';

export type HardwareErrorCode =
  | 'ERR_NOT_CONFIGURED'
  | 'ERR_TLS_REQUIRED'
  | 'ERR_BROKER_DISCONNECTED'
  | 'ERR_BROKER_AUTH'
  | 'ERR_ACK_TIMEOUT'
  | 'ERR_NODE_OFFLINE'
  | 'ERR_BRIDGE_UNREACHABLE'
  | 'ERR_UNAUTHENTICATED'
  | 'ERR_INVALID_COMMAND';

export interface HardwareConnectionStatus {
  mode: HardwareTransportMode;
  configured: boolean;
  hardwareConnected: boolean;
  tlsEnforced: boolean;
  brokerHost: string | null;
  transportLabel: string;
  lastSyncAt: Date | null;
  lastErrorCode: HardwareErrorCode | null;
  lastErrorMessage: string | null;
}

export interface HardwareCommandRequest {
  deviceId: DeviceId;
  action:
    | 'light_on'
    | 'light_off'
    | 'fan_on'
    | 'fan_off'
    | 'fan_speed'
    | 'door_lock'
    | 'door_unlock'
    | 'door_sensor_toggle';
  value?: number | boolean;
  homeId?: string;
}

export interface HardwareCommandAck {
  commandId: string;
  deviceId: DeviceId;
  deviceName: string;
  command: string;
  ackStatus: CommandAckStatus;
  success: boolean;
  simulated: boolean;
  transport: HardwareTransportMode;
  message: string;
  errorCode: HardwareErrorCode | null;
  latencyMs: number;
  timestamp: Date;
}

export interface MonitoredDevice {
  deviceId: DeviceId;
  name: string;
  room: string;
  nodeId: string;
  firmware: string;
  online: boolean;
  rssiDbm: number | null;
  lastHeartbeatAt: Date;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface DeviceCommandLog {
  id: string;
  commandId?: string;
  deviceId: DeviceId;
  deviceName: string;
  command: string;
  success: boolean;
  ackStatus?: CommandAckStatus;
  simulated?: boolean;
  transport?: HardwareTransportMode;
  message: string;
  latencyMs: number;
  timestamp: Date;
}

export interface Esp32StatusPayload {
  deviceId: DeviceId;
  online: boolean;
  rssiDbm: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  timestamp: Date;
}

export type FamilyRole = 'owner' | 'adult' | 'guest';
export type MemberStatus = 'active' | 'invited';
export type InviteStatus = 'pending' | 'accepted' | 'revoked';
export type ActivityCategory =
  | 'device'
  | 'door'
  | 'automation'
  | 'voice'
  | 'family'
  | 'security';
export type ActivitySource =
  | 'dashboard'
  | 'devices'
  | 'automations'
  | 'voice'
  | 'family';

export interface FamilyPermissions {
  canControlDevices: boolean;
  canRunAutomations: boolean;
  canUseVoiceCommands: boolean;
  canUnlockDoor: boolean;
  canManageFamily: boolean;
}

export function defaultPermissionsForRole(role: FamilyRole): FamilyPermissions {
  switch (role) {
    case 'owner':
      return {
        canControlDevices: true,
        canRunAutomations: true,
        canUseVoiceCommands: true,
        canUnlockDoor: true,
        canManageFamily: true,
      };
    case 'adult':
      return {
        canControlDevices: true,
        canRunAutomations: true,
        canUseVoiceCommands: true,
        canUnlockDoor: true,
        canManageFamily: false,
      };
    case 'guest':
      return {
        canControlDevices: true,
        canRunAutomations: false,
        canUseVoiceCommands: true,
        canUnlockDoor: false,
        canManageFamily: false,
      };
  }
}

export interface FamilyMember {
  memberId: string;
  homeId: string;
  homeOwnerId: string;
  uid: string;
  displayName: string;
  email: string;
  role: FamilyRole;
  status: MemberStatus;
  permissions: FamilyPermissions;
  inviteCode: string;
  addedByUid: string;
  viewerUids: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FamilyInvite {
  inviteCode: string;
  homeId: string;
  homeName: string;
  homeOwnerId: string;
  invitedEmail: string;
  displayName: string;
  role: FamilyRole;
  permissions: FamilyPermissions;
  status: InviteStatus;
  invitedByUid: string;
  invitedByName: string;
  acceptedByUid: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FamilyActivityEntry {
  logId: string;
  homeId: string;
  actorUid: string;
  actorName: string;
  actorEmail: string;
  actorRole: FamilyRole;
  actionTitle: string;
  detail: string;
  category: ActivityCategory;
  source: ActivitySource;
  viewerUids: string[];
  createdAt: Date;
}

export type VoiceAction =
  | 'sleep_mode'
  | 'morning_mode'
  | 'away_mode'
  | 'turn_light_on'
  | 'turn_light_off'
  | 'turn_fan_on'
  | 'turn_fan_off'
  | 'lock_door'
  | 'unlock_door'
  | 'open_living_room'
  | 'open_bedroom'
  | 'unsupported';

export const VOICE_ACTION_DETAILS: Record<
  VoiceAction,
  {
    description: string;
    isExecutable: boolean;
    requiresConfirmation: boolean;
  }
> = {
  sleep_mode: {
    description:
      'Sleep routine: turn the light and fan off; run door safety verification.',
    isExecutable: true,
    requiresConfirmation: false,
  },
  morning_mode: {
    description:
      'Morning routine: turn the light on and fan on; keep front door locked.',
    isExecutable: true,
    requiresConfirmation: false,
  },
  away_mode: {
    description:
      'Away routine: turn the light and fan off. If the door is closed, lock with safety check.',
    isExecutable: true,
    requiresConfirmation: false,
  },
  turn_light_on: {
    description: 'Turn the Living Room Light ON.',
    isExecutable: true,
    requiresConfirmation: false,
  },
  turn_light_off: {
    description: 'Turn the Living Room Light OFF.',
    isExecutable: true,
    requiresConfirmation: false,
  },
  turn_fan_on: {
    description: 'Turn the Bedroom Fan ON.',
    isExecutable: true,
    requiresConfirmation: false,
  },
  turn_fan_off: {
    description: 'Turn the Bedroom Fan OFF.',
    isExecutable: true,
    requiresConfirmation: false,
  },
  lock_door: {
    description: 'Lock the Front Entry Door.',
    isExecutable: true,
    requiresConfirmation: true,
  },
  unlock_door: {
    description:
      'Door unlocking is never available by voice. Use the manual Unlock button and confirm explicitly.',
    isExecutable: false,
    requiresConfirmation: false,
  },
  open_living_room: {
    description: 'Open Living Room controls.',
    isExecutable: false,
    requiresConfirmation: false,
  },
  open_bedroom: {
    description: 'Open Bedroom controls.',
    isExecutable: false,
    requiresConfirmation: false,
  },
  unsupported: {
    description:
      'Command not recognized. Try turning on the light, adjusting the fan, running a scene, or opening a room.',
    isExecutable: false,
    requiresConfirmation: false,
  },
};
