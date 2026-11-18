import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import mqtt, { MqttClient } from 'mqtt';

export type DeviceId =
  | 'living_room_light'
  | 'bedroom_fan'
  | 'front_door_lock';

export type HardwareTransportMode =
  | 'simulation'
  | 'mqtt_tls'
  | 'secure_bridge';

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

export type HardwareAction =
  | 'light_on'
  | 'light_off'
  | 'fan_on'
  | 'fan_off'
  | 'fan_speed'
  | 'door_lock'
  | 'door_unlock'
  | 'door_sensor_toggle';

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUser;
}

export interface HardwareMonitoredDevice {
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
  timestamp: string;
}

export interface HardwareConnectionStatus {
  mode: HardwareTransportMode;
  configured: boolean;
  hardwareConnected: boolean;
  tlsEnforced: boolean;
  brokerHost: string | null;
  transportLabel: string;
  lastSyncAt: string | null;
  lastErrorCode: HardwareErrorCode | null;
  lastErrorMessage: string | null;
}

export interface SimulatePacketInput {
  deviceId: DeviceId;
  online: boolean;
  rssiDbm: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  timestamp?: string;
}

interface PendingAckWaiter {
  resolve: (ack: { ok: boolean; message: string; errorCode?: HardwareErrorCode }) => void;
  timer: NodeJS.Timeout;
}

const VALID_DEVICE_IDS: ReadonlySet<DeviceId> = new Set([
  'living_room_light',
  'bedroom_fan',
  'front_door_lock',
]);

const VALID_ACTIONS: ReadonlySet<HardwareAction> = new Set([
  'light_on',
  'light_off',
  'fan_on',
  'fan_off',
  'fan_speed',
  'door_lock',
  'door_unlock',
  'door_sensor_toggle',
]);

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID?.trim() || 'ai-home-brain-6df82';

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedCerts: { certs: Record<string, string>; expiresAt: number } | null =
  null;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  if (cachedCerts && Date.now() < cachedCerts.expiresAt) {
    return cachedCerts.certs;
  }

  const res = await fetch(GOOGLE_CERTS_URL, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public certificates (${res.status}).`);
  }

  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = {
    certs,
    expiresAt: Date.now() + Math.max(60, maxAgeSec) * 1000,
  };
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const json = Buffer.from(segment, 'base64url').toString('utf8');
  return JSON.parse(json) as T;
}

async function verifyFirebaseIdToken(idToken: string): Promise<AuthenticatedUser> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT.');
  }

  const [encodedHeader, encodedPayload, encodedSig] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(
    encodedHeader,
  );
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported JWT algorithm or missing key ID.');
  }

  const certs = await getFirebasePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    throw new Error('Unknown signing certificate key ID.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  const validSignature = verifier.verify(
    certPem,
    Buffer.from(encodedSig, 'base64url'),
  );
  if (!validSignature) {
    throw new Error('Invalid Firebase ID token signature.');
  }

  const payload = decodeBase64UrlJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
  }>(encodedPayload);

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error('Firebase ID token has expired.');
  }
  if (!payload.iat || payload.iat > nowSec + 300) {
    throw new Error('Invalid Firebase ID token issue timestamp.');
  }
  if (payload.auth_time && payload.auth_time > nowSec + 300) {
    throw new Error('Invalid Firebase auth_time claim.');
  }
  if (payload.aud !== FIREBASE_PROJECT_ID) {
    throw new Error('Token audience does not match this Firebase project.');
  }
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error('Token issuer does not match this Firebase project.');
  }
  if (!payload.sub || payload.sub.length > 128) {
    throw new Error('Invalid Firebase subject.');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: Boolean(payload.email_verified),
  };
}

export async function requireAuthenticatedUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';

  if (!token) {
    res.status(401).json({
      errorCode: 'ERR_UNAUTHENTICATED',
      error: 'Authentication required to communicate with smart home hardware.',
    });
    return;
  }

  try {
    req.authUser = await verifyFirebaseIdToken(token);
    next();
  } catch (err) {
    console.error('[hardwareAuth] token verification failed:', err);
    res.status(401).json({
      errorCode: 'ERR_UNAUTHENTICATED',
      error: 'Invalid or expired Firebase ID token.',
    });
  }
}

function formatCommandLabel(
  action: HardwareAction,
  value?: number | boolean,
): string {
  switch (action) {
    case 'light_on':
      return 'Light ON';
    case 'light_off':
      return 'Light OFF';
    case 'fan_on':
      return 'Fan ON';
    case 'fan_off':
      return 'Fan OFF';
    case 'fan_speed':
      return `Fan speed ${typeof value === 'number' ? value : 2}`;
    case 'door_lock':
      return 'Door locked';
    case 'door_unlock':
      return 'Door unlocked';
    case 'door_sensor_toggle':
      return 'Door sensor';
  }
}

function sanitizeBrokerHost(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    return parsed.host || null;
  } catch {
    return null;
  }
}

function isLocalPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1') {
    return true;
  }
  if (/^10\./.test(lower) || /^192\.168\./.test(lower)) return true;
  const match172 = /^172\.(\d+)\./.exec(lower);
  if (match172) {
    const octet = Number(match172[1]);
    if (octet >= 16 && octet <= 31) return true;
  }
  return false;
}

function looksLikePlaceholder(value: string): boolean {
  return /^(MY_|YOUR_|CHANGEME|PLACEHOLDER|EXAMPLE)/i.test(value.trim());
}

class HardwareCommunicationService {
  private devices: HardwareMonitoredDevice[];
  private commandHistory: HardwareCommandAck[] = [];
  private streamClients = new Set<Response>();
  private mqttClient: MqttClient | null = null;
  private pendingAcks = new Map<string, PendingAckWaiter>();

  private mode: HardwareTransportMode = 'simulation';
  private configured = false;
  private hardwareConnected = false;
  private brokerHost: string | null = null;
  private lastSyncAt: string | null = null;
  private lastErrorCode: HardwareErrorCode | null = null;
  private lastErrorMessage: string | null = null;

  private readonly commandTimeoutMs: number;
  private readonly topicPrefix: string;

  constructor() {
    const now = new Date().toISOString();
    this.devices = [
      {
        deviceId: 'living_room_light',
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
        deviceId: 'bedroom_fan',
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
        deviceId: 'front_door_lock',
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

    const parsedTimeout = Number(process.env.ESP32_COMMAND_TIMEOUT_MS || 5000);
    this.commandTimeoutMs =
      Number.isFinite(parsedTimeout) && parsedTimeout >= 500
        ? Math.min(parsedTimeout, 30000)
        : 5000;
    this.topicPrefix =
      process.env.MQTT_TOPIC_PREFIX?.trim() || 'ai-home-brain';

    this.initializeTransport();
  }

  private initializeTransport(): void {
    const requestedMode = (
      process.env.HARDWARE_MODE?.trim() || 'simulation'
    ).toLowerCase();

    // Requirement: In simulation mode, never require MQTT/bridge env vars and never attempt real hardware connections.
    if (requestedMode === 'simulation') {
      this.mode = 'simulation';
      this.configured = false;
      this.hardwareConnected = false;
      this.brokerHost = null;
      this.lastErrorCode = null;
      this.lastErrorMessage = null;
      return;
    }

    if (requestedMode === 'mqtt_tls' || requestedMode === 'mqtt') {
      const mqttUrl = process.env.MQTT_BROKER_URL?.trim() || '';
      const mqttUsername = process.env.MQTT_USERNAME?.trim() || '';
      const mqttPassword = process.env.MQTT_PASSWORD?.trim() || '';
      const caPem = process.env.MQTT_CA_CERT_PEM?.trim() || '';

      if (!mqttUrl || looksLikePlaceholder(mqttUrl)) {
        this.fallbackToSimulationWithError(
          'ERR_NOT_CONFIGURED',
          'HARDWARE_MODE is mqtt_tls, but MQTT_BROKER_URL is not configured. Running in simulation mode (hardware not connected).',
        );
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(mqttUrl);
      } catch {
        this.fallbackToSimulationWithError(
          'ERR_NOT_CONFIGURED',
          'Invalid MQTT_BROKER_URL format. Running in simulation mode (hardware not connected).',
        );
        return;
      }

      if (parsed.protocol !== 'mqtts:' && parsed.protocol !== 'wss:') {
        this.fallbackToSimulationWithError(
          'ERR_TLS_REQUIRED',
          'Plaintext MQTT is blocked. Configure mqtts:// or wss:// with TLS. Running in simulation mode.',
        );
        return;
      }

      if (isLocalPrivateHost(parsed.hostname)) {
        this.fallbackToSimulationWithError(
          'ERR_TLS_REQUIRED',
          'Direct local/private ESP32 host rejected. Use a TLS MQTT broker outside direct public exposure.',
        );
        return;
      }

      if (
        !mqttUsername ||
        !mqttPassword ||
        looksLikePlaceholder(mqttUsername) ||
        looksLikePlaceholder(mqttPassword)
      ) {
        this.fallbackToSimulationWithError(
          'ERR_BROKER_AUTH',
          'MQTT_USERNAME and MQTT_PASSWORD must be securely configured for mqtt_tls mode. Running in simulation mode.',
        );
        return;
      }

      if (caPem && !caPem.includes('BEGIN CERTIFICATE')) {
        this.fallbackToSimulationWithError(
          'ERR_TLS_REQUIRED',
          'MQTT_CA_CERT_PEM must be a valid PEM certificate. Running in simulation mode.',
        );
        return;
      }

      this.mode = 'mqtt_tls';
      this.configured = true;
      this.brokerHost = parsed.host;
      this.connectMqttOverTls(mqttUrl, mqttUsername, mqttPassword, caPem);
      return;
    }

    if (requestedMode === 'secure_bridge') {
      const bridgeUrl = process.env.ESP32_BRIDGE_API_URL?.trim() || '';
      const bridgeToken = process.env.ESP32_BRIDGE_API_TOKEN?.trim() || '';

      if (!bridgeUrl || looksLikePlaceholder(bridgeUrl)) {
        this.fallbackToSimulationWithError(
          'ERR_NOT_CONFIGURED',
          'HARDWARE_MODE is secure_bridge, but ESP32_BRIDGE_API_URL is missing. Running in simulation mode (hardware not connected).',
        );
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(bridgeUrl);
      } catch {
        this.fallbackToSimulationWithError(
          'ERR_NOT_CONFIGURED',
          'Invalid ESP32_BRIDGE_API_URL format. Running in simulation mode (hardware not connected).',
        );
        return;
      }

      if (parsed.protocol !== 'https:') {
        this.fallbackToSimulationWithError(
          'ERR_TLS_REQUIRED',
          'ESP32_BRIDGE_API_URL must use HTTPS with TLS. Running in simulation mode.',
        );
        return;
      }

      if (isLocalPrivateHost(parsed.hostname)) {
        this.fallbackToSimulationWithError(
          'ERR_TLS_REQUIRED',
          'Direct local/private ESP32 bridge host rejected. Running in simulation mode.',
        );
        return;
      }

      if (
        !bridgeToken ||
        bridgeToken.length < 16 ||
        looksLikePlaceholder(bridgeToken)
      ) {
        this.fallbackToSimulationWithError(
          'ERR_BROKER_AUTH',
          'ESP32_BRIDGE_API_TOKEN is missing or too short (minimum 16 characters). Running in simulation mode.',
        );
        return;
      }

      this.mode = 'secure_bridge';
      this.configured = true;
      this.hardwareConnected = true;
      this.brokerHost = parsed.host;
      this.lastSyncAt = new Date().toISOString();
      return;
    }

    this.fallbackToSimulationWithError(
      'ERR_NOT_CONFIGURED',
      `Unknown HARDWARE_MODE "${requestedMode}". Running in simulation mode (hardware not connected).`,
    );
  }

  private fallbackToSimulationWithError(
    code: HardwareErrorCode,
    message: string,
  ): void {
    this.mode = 'simulation';
    this.configured = false;
    this.hardwareConnected = false;
    this.brokerHost = null;
    this.recordTransportError(code, message);
  }

  private connectMqttOverTls(
    brokerUrl: string,
    username: string,
    password: string,
    caPem: string,
  ): void {
    const clientIdPrefix =
      process.env.MQTT_CLIENT_ID_PREFIX?.trim() || 'ai-home-brain-gateway';

    const client = mqtt.connect(brokerUrl, {
      clientId: `${clientIdPrefix}-${crypto.randomBytes(4).toString('hex')}`,
      username,
      password,
      ca: caPem ? caPem.replace(/\\n/g, '\n') : undefined,
      rejectUnauthorized: true,
      reconnectPeriod: 5000,
      connectTimeout: 8000,
      keepalive: 30,
      clean: true,
    });

    this.mqttClient = client;

    client.on('connect', () => {
      this.hardwareConnected = true;
      this.lastErrorCode = null;
      this.lastErrorMessage = null;
      this.lastSyncAt = new Date().toISOString();

      client.subscribe(
        [
          `${this.topicPrefix}/+/devices/+/status`,
          `${this.topicPrefix}/+/devices/+/ack`,
        ],
        { qos: 1 },
        (err) => {
          if (err) {
            this.recordTransportError(
              'ERR_BROKER_DISCONNECTED',
              `Failed to subscribe to ESP32 topics: ${err.message}`,
            );
          }
        },
      );
      this.broadcast('hardware:status', this.getConnectionStatus());
    });

    client.on('message', (topic, payloadBuffer) => {
      try {
        const text = payloadBuffer.toString('utf8');
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (topic.endsWith('/ack')) {
          const commandId =
            typeof parsed.commandId === 'string' ? parsed.commandId : '';
          const waiter = this.pendingAcks.get(commandId);
          if (waiter) {
            clearTimeout(waiter.timer);
            this.pendingAcks.delete(commandId);
            waiter.resolve({
              ok: parsed.success !== false,
              message:
                typeof parsed.message === 'string'
                  ? parsed.message
                  : 'Command acknowledged by ESP32 node.',
              errorCode:
                parsed.success === false ? 'ERR_NODE_OFFLINE' : undefined,
            });
          }
        } else if (topic.endsWith('/status')) {
          const deviceId = parsed.deviceId as DeviceId;
          if (VALID_DEVICE_IDS.has(deviceId)) {
            this.applyStatusPacket({
              deviceId,
              online: parsed.online !== false,
              rssiDbm:
                typeof parsed.rssiDbm === 'number' ? parsed.rssiDbm : null,
              errorCode:
                typeof parsed.errorCode === 'string' ? parsed.errorCode : null,
              errorMessage:
                typeof parsed.errorMessage === 'string'
                  ? parsed.errorMessage
                  : null,
              timestamp: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.error('[mqtt] malformed device payload:', err);
      }
    });

    client.on('error', (err) => {
      const isAuth = /not authorized|bad user name|auth/i.test(err.message);
      this.hardwareConnected = false;
      this.recordTransportError(
        isAuth ? 'ERR_BROKER_AUTH' : 'ERR_BROKER_DISCONNECTED',
        `MQTT over TLS error: ${err.message}`,
      );
    });

    client.on('offline', () => {
      this.hardwareConnected = false;
      this.recordTransportError(
        'ERR_BROKER_DISCONNECTED',
        'MQTT over TLS broker connection went offline.',
      );
    });
  }

  private recordTransportError(code: HardwareErrorCode, message: string): void {
    this.lastErrorCode = code;
    this.lastErrorMessage = message;
    this.broadcast('hardware:error', {
      errorCode: code,
      errorMessage: message,
      timestamp: new Date().toISOString(),
      status: this.getConnectionStatus(),
    });
  }

  public getConnectionStatus(): HardwareConnectionStatus {
    const transportLabel =
      this.mode === 'mqtt_tls'
        ? `MQTT over TLS (${this.brokerHost ?? 'unconfigured'})`
        : this.mode === 'secure_bridge'
          ? `Secure Backend API (${this.brokerHost ?? 'unconfigured'})`
          : 'Hardware not connected · Simulation mode';

    return {
      mode: this.mode,
      configured: this.configured,
      hardwareConnected: this.hardwareConnected,
      tlsEnforced: true,
      brokerHost:
        this.mode === 'simulation'
          ? null
          : this.brokerHost ??
            sanitizeBrokerHost(process.env.MQTT_BROKER_URL || ''),
      transportLabel,
      lastSyncAt: this.lastSyncAt,
      lastErrorCode: this.lastErrorCode,
      lastErrorMessage: this.lastErrorMessage,
    };
  }

  public getDevices(): HardwareMonitoredDevice[] {
    return this.devices;
  }

  public getCommandHistory(): HardwareCommandAck[] {
    return this.commandHistory;
  }

  public subscribeStream(res: Response, uid: string): () => void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    this.streamClients.add(res);

    const snapshot = {
      uid,
      status: this.getConnectionStatus(),
      devices: this.devices,
      commands: this.commandHistory,
      timestamp: new Date().toISOString(),
    };
    res.write(`event: hardware:snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

    const keepalive = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
      }
    }, 20000);

    return () => {
      clearInterval(keepalive);
      this.streamClients.delete(res);
    };
  }

  private broadcast(event: string, data: unknown): void {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.streamClients) {
      if (!client.writableEnded) {
        client.write(frame);
      } else {
        this.streamClients.delete(client);
      }
    }
  }

  public async publishCommand(params: {
    user: AuthenticatedUser;
    deviceId: DeviceId;
    action: HardwareAction;
    value?: number | boolean;
    homeId?: string;
  }): Promise<HardwareCommandAck> {
    if (!VALID_DEVICE_IDS.has(params.deviceId)) {
      throw new HardwareServiceError(
        400,
        'ERR_INVALID_COMMAND',
        `Unknown deviceId "${String(params.deviceId)}".`,
      );
    }
    if (!VALID_ACTIONS.has(params.action)) {
      throw new HardwareServiceError(
        400,
        'ERR_INVALID_COMMAND',
        `Unsupported command action "${String(params.action)}".`,
      );
    }

    const device = this.devices.find((d) => d.deviceId === params.deviceId)!;
    const commandLabel = formatCommandLabel(params.action, params.value);
    const commandId = `cmd_${crypto.randomUUID()}`;
    const startedAt = Date.now();
    const homeId = (params.homeId || 'default').replace(/[^a-zA-Z0-9_-]/g, '');

    if (!device.online) {
      const ack: HardwareCommandAck = {
        commandId,
        deviceId: device.deviceId,
        deviceName: device.name,
        command: commandLabel,
        ackStatus: 'failed',
        success: false,
        simulated: this.mode === 'simulation',
        transport: this.mode,
        message: `${device.name} is offline (${this.mode === 'simulation' ? 'simulated ESP32 unreachable' : 'ESP32 node unreachable'}).`,
        errorCode: 'ERR_NODE_OFFLINE',
        latencyMs: Date.now() - startedAt + 2400,
        timestamp: new Date().toISOString(),
      };
      this.recordCommandAck(ack);
      return ack;
    }

    if (this.mode === 'mqtt_tls') {
      if (!this.mqttClient || !this.hardwareConnected) {
        const ack: HardwareCommandAck = {
          commandId,
          deviceId: device.deviceId,
          deviceName: device.name,
          command: commandLabel,
          ackStatus: 'failed',
          success: false,
          simulated: false,
          transport: 'mqtt_tls',
          message: 'MQTT over TLS broker is not connected.',
          errorCode: 'ERR_BROKER_DISCONNECTED',
          latencyMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
        };
        this.recordCommandAck(ack);
        return ack;
      }

      const topic = `${this.topicPrefix}/${homeId}/devices/${device.deviceId}/cmd`;
      const envelope = JSON.stringify({
        commandId,
        deviceId: device.deviceId,
        nodeId: device.nodeId,
        action: params.action,
        value: params.value ?? null,
        issuedByUid: params.user.uid,
        timestamp: new Date().toISOString(),
      });

      const ackPromise = new Promise<{
        ok: boolean;
        message: string;
        errorCode?: HardwareErrorCode;
      }>((resolve) => {
        const timer = setTimeout(() => {
          this.pendingAcks.delete(commandId);
          resolve({
            ok: false,
            message: `Timed out after ${this.commandTimeoutMs}ms waiting for ESP32 acknowledgement.`,
            errorCode: 'ERR_ACK_TIMEOUT',
          });
        }, this.commandTimeoutMs);
        this.pendingAcks.set(commandId, { resolve, timer });
      });

      await new Promise<void>((resolve, reject) => {
        this.mqttClient!.publish(topic, envelope, { qos: 1 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const outcome = await ackPromise;
      const ack: HardwareCommandAck = {
        commandId,
        deviceId: device.deviceId,
        deviceName: device.name,
        command: commandLabel,
        ackStatus: outcome.ok
          ? 'acknowledged'
          : outcome.errorCode === 'ERR_ACK_TIMEOUT'
            ? 'timed_out'
            : 'failed',
        success: outcome.ok,
        simulated: false,
        transport: 'mqtt_tls',
        message: outcome.message,
        errorCode: outcome.ok ? null : outcome.errorCode ?? 'ERR_ACK_TIMEOUT',
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      };
      if (outcome.ok) {
        this.lastSyncAt = ack.timestamp;
      } else {
        this.recordTransportError(
          ack.errorCode ?? 'ERR_ACK_TIMEOUT',
          ack.message,
        );
      }
      this.recordCommandAck(ack);
      return ack;
    }

    if (this.mode === 'secure_bridge') {
      const bridgeUrl = process.env.ESP32_BRIDGE_API_URL!.trim();
      const bridgeToken = process.env.ESP32_BRIDGE_API_TOKEN!.trim();
      try {
        const res = await fetch(`${bridgeUrl.replace(/\/$/, '')}/commands`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bridgeToken}`,
          },
          body: JSON.stringify({
            commandId,
            homeId,
            deviceId: device.deviceId,
            nodeId: device.nodeId,
            action: params.action,
            value: params.value ?? null,
            issuedByUid: params.user.uid,
          }),
          signal: AbortSignal.timeout(this.commandTimeoutMs),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          acknowledged?: boolean;
          message?: string;
          errorCode?: HardwareErrorCode;
        };

        const ok = res.ok && payload.acknowledged !== false;
        const ack: HardwareCommandAck = {
          commandId,
          deviceId: device.deviceId,
          deviceName: device.name,
          command: commandLabel,
          ackStatus: ok ? 'acknowledged' : 'failed',
          success: ok,
          simulated: false,
          transport: 'secure_bridge',
          message:
            payload.message ||
            (ok
              ? `${commandLabel} acknowledged by secure hardware bridge.`
              : `Bridge rejected command (${res.status}).`),
          errorCode: ok ? null : payload.errorCode ?? 'ERR_BRIDGE_UNREACHABLE',
          latencyMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
        };
        if (ok) this.lastSyncAt = ack.timestamp;
        this.recordCommandAck(ack);
        return ack;
      } catch (err) {
        const isTimeout = err instanceof Error && err.name === 'TimeoutError';
        const ack: HardwareCommandAck = {
          commandId,
          deviceId: device.deviceId,
          deviceName: device.name,
          command: commandLabel,
          ackStatus: isTimeout ? 'timed_out' : 'failed',
          success: false,
          simulated: false,
          transport: 'secure_bridge',
          message: isTimeout
            ? `Secure bridge timed out after ${this.commandTimeoutMs}ms.`
            : 'Secure hardware bridge is unreachable.',
          errorCode: isTimeout ? 'ERR_ACK_TIMEOUT' : 'ERR_BRIDGE_UNREACHABLE',
          latencyMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
        };
        this.recordTransportError(ack.errorCode!, ack.message);
        this.recordCommandAck(ack);
        return ack;
      }
    }

    // Simulation mode: no physical ESP32 connected; never attempt external hardware calls.
    const nowIso = new Date().toISOString();
    this.devices = this.devices.map((d) =>
      d.deviceId === device.deviceId ? { ...d, lastHeartbeatAt: nowIso } : d,
    );
    this.lastSyncAt = nowIso;

    const ack: HardwareCommandAck = {
      commandId,
      deviceId: device.deviceId,
      deviceName: device.name,
      command: commandLabel,
      ackStatus: 'acknowledged',
      success: true,
      simulated: true,
      transport: 'simulation',
      message: `${commandLabel} acknowledged in simulation mode (hardware not connected).`,
      errorCode: null,
      latencyMs: Math.max(12, Date.now() - startedAt + 24),
      timestamp: nowIso,
    };
    this.recordCommandAck(ack);
    return ack;
  }

  private recordCommandAck(ack: HardwareCommandAck): void {
    this.commandHistory = [ack, ...this.commandHistory.slice(0, 49)];
    this.broadcast('command:ack', ack);
  }

  public pingDevices(targetDeviceId?: DeviceId): {
    devices: HardwareMonitoredDevice[];
    pingedDevice: HardwareMonitoredDevice | null;
  } {
    const nowIso = new Date().toISOString();
    if (targetDeviceId) {
      if (!VALID_DEVICE_IDS.has(targetDeviceId)) {
        throw new HardwareServiceError(
          400,
          'ERR_INVALID_COMMAND',
          `Unknown deviceId "${String(targetDeviceId)}".`,
        );
      }
      this.devices = this.devices.map((d) =>
        d.deviceId === targetDeviceId && d.online
          ? { ...d, lastHeartbeatAt: nowIso }
          : d,
      );
      const found =
        this.devices.find((d) => d.deviceId === targetDeviceId) ?? null;
      if (found) {
        this.broadcast('device:status', found);
      }
      this.lastSyncAt = nowIso;
      return { devices: this.devices, pingedDevice: found };
    }

    this.devices = this.devices.map((d) =>
      d.online ? { ...d, lastHeartbeatAt: nowIso } : d,
    );
    this.lastSyncAt = nowIso;
    for (const d of this.devices) {
      this.broadcast('device:status', d);
    }
    return { devices: this.devices, pingedDevice: null };
  }

  public applyStatusPacket(input: SimulatePacketInput): HardwareMonitoredDevice {
    if (!VALID_DEVICE_IDS.has(input.deviceId)) {
      throw new HardwareServiceError(
        400,
        'ERR_INVALID_COMMAND',
        `Unknown deviceId "${String(input.deviceId)}".`,
      );
    }

    const nowIso = input.timestamp || new Date().toISOString();
    const safeRssi =
      typeof input.rssiDbm === 'number' && Number.isFinite(input.rssiDbm)
        ? Math.max(-120, Math.min(-10, Math.round(input.rssiDbm)))
        : null;
    const safeErrorCode = input.errorCode
      ? String(input.errorCode).trim().slice(0, 64)
      : 'ERR_NODE_OFFLINE';
    const safeErrorMessage = input.errorMessage
      ? String(input.errorMessage).trim().slice(0, 240)
      : 'ESP32 node simulated offline.';

    let updated: HardwareMonitoredDevice | null = null;
    this.devices = this.devices.map((d) => {
      if (d.deviceId !== input.deviceId) return d;
      updated = {
        ...d,
        online: input.online,
        rssiDbm: input.online ? safeRssi ?? d.rssiDbm ?? -58 : null,
        lastHeartbeatAt: nowIso,
        lastErrorCode: input.online ? null : safeErrorCode,
        lastErrorMessage: input.online ? null : safeErrorMessage,
      };
      return updated;
    });

    this.lastSyncAt = nowIso;
    if (updated) {
      this.broadcast('device:status', updated);
    }
    return updated!;
  }

  public resolveDeviceError(deviceId: DeviceId): HardwareMonitoredDevice {
    return this.applyStatusPacket({
      deviceId,
      online: true,
      rssiDbm: -58,
      errorCode: null,
      errorMessage: null,
    });
  }
}

export class HardwareServiceError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: HardwareErrorCode;

  constructor(
    statusCode: number,
    errorCode: HardwareErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export const hardwareService = new HardwareCommunicationService();
