import { auth } from './firebase';
import {
  DeviceCommandLog,
  DeviceId,
  Esp32StatusPayload,
  HardwareCommandAck,
  HardwareCommandRequest,
  HardwareConnectionStatus,
  MonitoredDevice,
} from '../types/smartHome';

interface RawMonitoredDevice {
  deviceId: DeviceId;
  name: string;
  room: string;
  nodeId: string;
  firmware: string;
  online: boolean;
  rssiDbm: number | null;
  lastHeartbeatAt: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

interface RawHardwareStatus {
  mode: HardwareConnectionStatus['mode'];
  configured: boolean;
  hardwareConnected: boolean;
  tlsEnforced: boolean;
  brokerHost: string | null;
  transportLabel: string;
  lastSyncAt: string | null;
  lastErrorCode: HardwareConnectionStatus['lastErrorCode'];
  lastErrorMessage: string | null;
}

interface RawCommandAck {
  commandId: string;
  deviceId: DeviceId;
  deviceName: string;
  command: string;
  ackStatus: HardwareCommandAck['ackStatus'];
  success: boolean;
  simulated: boolean;
  transport: HardwareCommandAck['transport'];
  message: string;
  errorCode: HardwareCommandAck['errorCode'];
  latencyMs: number;
  timestamp: string;
}

export type StreamConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'subscribed'
  | 'reconnecting'
  | 'error';

export interface HardwareStreamCallbacks {
  onSnapshot: (snapshot: {
    status: HardwareConnectionStatus;
    devices: MonitoredDevice[];
    commands: DeviceCommandLog[];
  }) => void;
  onDeviceStatus: (device: MonitoredDevice) => void;
  onCommandAck: (ack: HardwareCommandAck) => void;
  onTransportStatus: (status: HardwareConnectionStatus) => void;
  onConnectionStateChange: (
    state: StreamConnectionState,
    errorMessage?: string | null,
  ) => void;
}

function hydrateDevice(raw: RawMonitoredDevice): MonitoredDevice {
  return {
    ...raw,
    lastHeartbeatAt: new Date(raw.lastHeartbeatAt),
  };
}

function hydrateStatus(raw: RawHardwareStatus): HardwareConnectionStatus {
  return {
    ...raw,
    lastSyncAt: raw.lastSyncAt ? new Date(raw.lastSyncAt) : null,
  };
}

function hydrateAck(raw: RawCommandAck): HardwareCommandAck {
  return {
    ...raw,
    timestamp: new Date(raw.timestamp),
  };
}

export function ackToCommandLog(ack: HardwareCommandAck): DeviceCommandLog {
  return {
    id: ack.commandId,
    commandId: ack.commandId,
    deviceId: ack.deviceId,
    deviceName: ack.deviceName,
    command: ack.command,
    success: ack.success,
    ackStatus: ack.ackStatus,
    simulated: ack.simulated,
    transport: ack.transport,
    message: ack.message,
    latencyMs: ack.latencyMs,
    timestamp: ack.timestamp,
  };
}

class Esp32HardwareGateway {
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required before sending device commands.');
    }
    const token = await user.getIdToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  public async publishCommand(
    request: HardwareCommandRequest,
  ): Promise<HardwareCommandAck> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/hardware/command', {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    const body = (await res.json().catch(() => null)) as
      | (RawCommandAck & { error?: string })
      | null;

    if (body && typeof body.commandId === 'string') {
      const ack = hydrateAck(body);
      if (!ack.success) {
        throw new Error(ack.message);
      }
      return ack;
    }

    throw new Error(
      body?.error || `Hardware gateway rejected command (HTTP ${res.status}).`,
    );
  }

  public async ping(deviceId?: DeviceId): Promise<MonitoredDevice[]> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/hardware/ping', {
      method: 'POST',
      headers,
      body: JSON.stringify(deviceId ? { deviceId } : {}),
    });
    const data = (await res.json().catch(() => ({}))) as {
      devices?: RawMonitoredDevice[];
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || 'Failed to ping ESP32 nodes.');
    }
    return (data.devices ?? []).map(hydrateDevice);
  }

  public async simulateStatusPacket(
    payload: Esp32StatusPayload,
  ): Promise<MonitoredDevice> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/hardware/simulate-packet', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        timestamp: payload.timestamp.toISOString(),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      device?: RawMonitoredDevice;
      error?: string;
    };
    if (!res.ok || !data.device) {
      throw new Error(data.error || 'Failed to deliver status packet.');
    }
    return hydrateDevice(data.device);
  }

  public async resolveError(deviceId: DeviceId): Promise<MonitoredDevice> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/hardware/resolve-error', {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      device?: RawMonitoredDevice;
      error?: string;
    };
    if (!res.ok || !data.device) {
      throw new Error(data.error || 'Failed to resolve connection error.');
    }
    return hydrateDevice(data.device);
  }

  public subscribe(callbacks: HardwareStreamCallbacks): () => void {
    let closed = false;
    let attempt = 0;
    let activeController: AbortController | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      if (closed) return;
      callbacks.onConnectionStateChange(
        attempt === 0 ? 'connecting' : 'reconnecting',
        null,
      );

      try {
        const user = auth.currentUser;
        if (!user) {
          callbacks.onConnectionStateChange(
            'disconnected',
            'Sign in to subscribe to hardware telemetry.',
          );
          return;
        }
        const token = await user.getIdToken();
        activeController = new AbortController();

        const res = await fetch('/api/hardware/stream', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal: activeController.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Subscription stream unavailable (HTTP ${res.status}).`);
        }

        attempt = 0;
        callbacks.onConnectionStateChange('subscribed', null);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!closed) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let splitIdx = buffer.indexOf('\n\n');
          while (splitIdx !== -1) {
            const rawBlock = buffer.slice(0, splitIdx);
            buffer = buffer.slice(splitIdx + 2);
            this.dispatchSseBlock(rawBlock, callbacks);
            splitIdx = buffer.indexOf('\n\n');
          }
        }

        if (!closed) {
          throw new Error('Hardware status stream closed by server.');
        }
      } catch (err) {
        if (closed) return;
        const message =
          err instanceof Error
            ? err.message
            : 'Hardware status subscription error.';
        callbacks.onConnectionStateChange('error', message);

        attempt += 1;
        const delayMs = Math.min(15000, 1500 * Math.pow(2, attempt - 1));
        reconnectTimer = setTimeout(() => {
          void connect();
        }, delayMs);
      }
    };

    void connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      activeController?.abort();
      callbacks.onConnectionStateChange('disconnected', null);
    };
  }

  private dispatchSseBlock(
    block: string,
    callbacks: HardwareStreamCallbacks,
  ): void {
    const lines = block.split('\n');
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;

    try {
      const parsed = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
      if (eventName === 'hardware:snapshot') {
        callbacks.onSnapshot({
          status: hydrateStatus(parsed.status as RawHardwareStatus),
          devices: ((parsed.devices as RawMonitoredDevice[]) ?? []).map(
            hydrateDevice,
          ),
          commands: ((parsed.commands as RawCommandAck[]) ?? []).map((c) =>
            ackToCommandLog(hydrateAck(c)),
          ),
        });
      } else if (eventName === 'device:status') {
        callbacks.onDeviceStatus(
          hydrateDevice(parsed as unknown as RawMonitoredDevice),
        );
      } else if (eventName === 'command:ack') {
        callbacks.onCommandAck(hydrateAck(parsed as unknown as RawCommandAck));
      } else if (eventName === 'hardware:status') {
        callbacks.onTransportStatus(
          hydrateStatus(parsed as unknown as RawHardwareStatus),
        );
      } else if (eventName === 'hardware:error') {
        if (parsed.status) {
          callbacks.onTransportStatus(
            hydrateStatus(parsed.status as RawHardwareStatus),
          );
        }
        callbacks.onConnectionStateChange(
          'error',
          typeof parsed.errorMessage === 'string'
            ? parsed.errorMessage
            : 'Hardware transport error.',
        );
      }
    } catch (err) {
      console.error('[hardwareGateway] failed to parse SSE frame:', err);
    }
  }
}

export const hardwareGateway = new Esp32HardwareGateway();
