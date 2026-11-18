import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Cloud,
  CloudOff,
  DoorClosed,
  Fan,
  Filter,
  History,
  Lightbulb,
  Lock,
  Radio,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { StreamConnectionState } from '../lib/hardwareGateway';
import {
  DEVICE_IDS,
  DeviceCommandLog,
  DeviceId,
  DeviceState,
  Esp32StatusPayload,
  HardwareConnectionStatus,
  MonitoredDevice,
} from '../types/smartHome';

interface DevicesMonitoringViewProps {
  deviceState: DeviceState;
  monitoredDevices: MonitoredDevice[];
  commandLogs: DeviceCommandLog[];
  hardwareStatus: HardwareConnectionStatus;
  streamState: StreamConnectionState;
  streamError: string | null;
  onBack: () => void;
  onRefreshAll: () => void;
  onPingDevice: (deviceId: DeviceId) => void;
  onSimulateConnectivity: (deviceId: DeviceId, online: boolean) => void;
  onSimulatePacket: (payload: Esp32StatusPayload) => void;
  onResolveError: (deviceId: DeviceId) => void;
}

function formatClockAndRelative(dt: Date): string {
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  const diffSec = Math.floor((Date.now() - dt.getTime()) / 1000);
  const relative =
    diffSec < 5
      ? 'Just now'
      : diffSec < 60
        ? `${diffSec}s ago`
        : diffSec < 3600
          ? `${Math.floor(diffSec / 60)}m ago`
          : `${Math.floor(diffSec / 3600)}h ago`;
  return `${hh}:${mm}:${ss} (${relative})`;
}

export const DevicesMonitoringView: React.FC<DevicesMonitoringViewProps> = ({
  deviceState,
  monitoredDevices,
  commandLogs,
  hardwareStatus,
  streamState,
  streamError,
  onBack,
  onRefreshAll,
  onPingDevice,
  onSimulateConnectivity,
  onSimulatePacket,
  onResolveError,
}) => {
  const [selectedTab, setSelectedTab] = useState<
    'overview' | 'commands' | 'errors'
  >('overview');
  const [commandFilter, setCommandFilter] = useState<
    'all' | 'succeeded' | 'failed'
  >('all');
  const [selectedDeviceFilter, setSelectedDeviceFilter] = useState<
    DeviceId | 'all'
  >('all');
  const [simModalOpen, setSimModalOpen] = useState(false);

  const [simDeviceId, setSimDeviceId] = useState<DeviceId>(
    DEVICE_IDS.livingRoomLight,
  );
  const [simOnline, setSimOnline] = useState(true);
  const [simRssi, setSimRssi] = useState(-59);
  const [simErrCode, setSimErrCode] = useState('ERR_HEARTBEAT_TIMEOUT');
  const [simErrMsg, setSimErrMsg] = useState(
    'ESP32 node missed 3 consecutive MQTT keepalives.',
  );

  const total = monitoredDevices.length;
  const onlineCount = monitoredDevices.filter((d) => d.online).length;
  const offlineCount = total - onlineCount;
  const failedCommands = commandLogs.filter((c) => !c.success);
  const activeErrors = monitoredDevices.filter(
    (d) => !d.online || Boolean(d.lastErrorCode),
  );

  const filteredCommands = commandLogs.filter((c) => {
    if (commandFilter === 'succeeded' && !c.success) return false;
    if (commandFilter === 'failed' && c.success) return false;
    if (selectedDeviceFilter !== 'all' && c.deviceId !== selectedDeviceFilter)
      return false;
    return true;
  });

  const latestSync = monitoredDevices.reduce<Date | null>((latest, d) => {
    if (!latest || d.lastHeartbeatAt > latest) return d.lastHeartbeatAt;
    return latest;
  }, null);

  const stateLabelFor = (id: DeviceId) => {
    if (id === DEVICE_IDS.livingRoomLight) {
      return deviceState.lightOn ? 'ON' : 'OFF';
    }
    if (id === DEVICE_IDS.bedroomFan) {
      return deviceState.fanOn
        ? `ON · Speed ${deviceState.fanSpeed}/5`
        : 'OFF';
    }
    return `${deviceState.doorLocked ? 'Locked' : 'Unlocked'} · ${
      deviceState.doorOpen ? 'Open' : 'Closed'
    }`;
  };

  const iconForDevice = (id: DeviceId) => {
    if (id === DEVICE_IDS.livingRoomLight)
      return <Lightbulb className="w-[22px] h-[22px]" />;
    if (id === DEVICE_IDS.bedroomFan)
      return <Fan className="w-[22px] h-[22px]" />;
    return <DoorClosed className="w-[22px] h-[22px]" />;
  };

  const handleSubmitSim = (e: React.FormEvent) => {
    e.preventDefault();
    onSimulatePacket({
      deviceId: simDeviceId,
      online: simOnline,
      rssiDbm: simOnline ? simRssi : null,
      errorCode: simOnline ? null : simErrCode.trim() || 'ERR_NODE_OFFLINE',
      errorMessage: simOnline
        ? null
        : simErrMsg.trim() || 'ESP32 node unreachable.',
      timestamp: new Date(),
    });
    setSimModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F4F7F5] dark:bg-[#101113] text-[#111315] dark:text-[#F4F5F6]">
      {/* AppBar matching DeviceMonitoringScreen */}
      <header className="h-14 px-2 flex items-center justify-between max-w-[960px] mx-auto">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            title="Back"
            className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-[20px] font-medium">Device Monitoring</h1>
        </div>

        <div className="flex items-center gap-1 pr-2">
          <button
            type="button"
            title="Simulate ESP32 update"
            onClick={() => setSimModalOpen(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <Radio className="w-5 h-5" />
          </button>
          <button
            type="button"
            title="Refresh device status"
            onClick={onRefreshAll}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="max-w-[960px] mx-auto px-[18px] sm:px-8 pt-3 pb-8 space-y-3">
        {/* _TelemetrySummaryStrip */}
        <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 px-4 py-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 sm:divide-x divide-black/10 dark:divide-[#44474F]/35">
            <div className="sm:pr-3">
              <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF]">
                Online
              </div>
              <div
                className={`mt-0.5 text-[22px] font-extrabold tabular-nums ${
                  onlineCount === total
                    ? 'text-emerald-500'
                    : 'text-[#D9821E] dark:text-[#F3A64A]'
                }`}
              >
                {onlineCount}/{total}
              </div>
            </div>
            <div className="sm:px-3">
              <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF]">
                Offline
              </div>
              <div
                className={`mt-0.5 text-[22px] font-extrabold tabular-nums ${
                  offlineCount > 0 ? 'text-rose-500' : ''
                }`}
              >
                {offlineCount}
              </div>
            </div>
            <div className="sm:px-3">
              <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF]">
                Failed cmds
              </div>
              <div
                className={`mt-0.5 text-[22px] font-extrabold tabular-nums ${
                  failedCommands.length > 0 ? 'text-amber-500' : ''
                }`}
              >
                {failedCommands.length}
              </div>
            </div>
            <div className="sm:pl-3">
              <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF]">
                Active errors
              </div>
              <div
                className={`mt-0.5 text-[22px] font-extrabold tabular-nums ${
                  activeErrors.length > 0 ? 'text-rose-500' : ''
                }`}
              >
                {activeErrors.length}
              </div>
            </div>
          </div>
        </div>

        {/* _SimulationNoticeRow */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
          <span className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] tabular-nums">
            {hardwareStatus.mode === 'simulation'
              ? 'Hardware not connected · Running in simulation mode'
              : 'Live ESP32 telemetry'}{' '}
            · Last sync:{' '}
            {latestSync ? formatClockAndRelative(latestSync) : 'Not synced yet'}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSimModalOpen(true)}
              className="h-9 px-3.5 rounded-full border border-black/15 dark:border-white/20 text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition"
            >
              <Radio className="w-[17px] h-[17px]" />
              <span>Simulate ESP32 update</span>
            </button>
            <button
              type="button"
              onClick={onRefreshAll}
              className="h-9 px-3.5 rounded-full bg-[#F3A64A]/20 text-[#D9821E] dark:text-[#FFDDB7] text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-[#F3A64A]/30 transition"
            >
              <RefreshCw className="w-[17px] h-[17px]" />
              <span>Ping all</span>
            </button>
          </div>
        </div>

        {/* SegmentedButton matching DeviceMonitoringTab */}
        <div className="pt-1">
          <div className="grid grid-cols-3 rounded-full border border-black/20 dark:border-white/25 overflow-hidden bg-transparent">
            <button
              type="button"
              onClick={() => setSelectedTab('overview')}
              className={`h-10 px-2 sm:px-3 text-[12px] sm:text-[13px] font-medium inline-flex items-center justify-center gap-1.5 border-r border-black/20 dark:border-white/25 transition ${
                selectedTab === 'overview'
                  ? 'bg-[#F3A64A]/25 text-[#111315] dark:text-[#FFDDB7] font-semibold'
                  : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Activity className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
              <span className="truncate">Overview</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('commands')}
              className={`h-10 px-2 sm:px-3 text-[12px] sm:text-[13px] font-medium inline-flex items-center justify-center gap-1.5 border-r border-black/20 dark:border-white/25 transition ${
                selectedTab === 'commands'
                  ? 'bg-[#F3A64A]/25 text-[#111315] dark:text-[#FFDDB7] font-semibold'
                  : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <History className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
              <span className="truncate">Commands ({commandLogs.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('errors')}
              className={`h-10 px-2 sm:px-3 text-[12px] sm:text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition ${
                selectedTab === 'errors'
                  ? 'bg-[#F3A64A]/25 text-[#111315] dark:text-[#FFDDB7] font-semibold'
                  : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <AlertCircle className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
              <span className="truncate">Errors ({activeErrors.length})</span>
            </button>
          </div>
        </div>

        {/* Tab Body */}
        <div className="pt-1.5">
          {selectedTab === 'overview' && (
            <div className="space-y-5">
              {/* Hardware Integration & Security Readiness Card */}
              <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-[18px] h-[18px] text-[#D9821E] dark:text-[#F3A64A] shrink-0" />
                    <span className="text-[14px] font-bold">
                      Hardware Gateway
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                      hardwareStatus.hardwareConnected
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-[#F3A64A]/20 text-[#B86A12] dark:text-[#FFDDB7]'
                    }`}
                  >
                    {hardwareStatus.mode === 'simulation'
                      ? 'Simulation mode · No hardware connected'
                      : hardwareStatus.hardwareConnected
                        ? `${hardwareStatus.mode === 'mqtt_tls' ? 'MQTT over TLS' : 'Secure Bridge'} · Connected`
                        : 'Hardware disconnected'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px] pt-0.5">
                  <div className="rounded-[12px] bg-[#F4F7F5] dark:bg-[#131518] px-3 py-2">
                    <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF]">
                      Transport
                    </div>
                    <div className="font-semibold mt-0.5 truncate">
                      {hardwareStatus.transportLabel}
                    </div>
                  </div>
                  <div className="rounded-[12px] bg-[#F4F7F5] dark:bg-[#131518] px-3 py-2">
                    <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF]">
                      Status subscription
                    </div>
                    <div className="font-semibold mt-0.5 capitalize">
                      {streamState === 'subscribed'
                        ? 'Subscribed (SSE · Authenticated)'
                        : streamState}
                    </div>
                  </div>
                  <div className="rounded-[12px] bg-[#F4F7F5] dark:bg-[#131518] px-3 py-2">
                    <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF]">
                      Network isolation
                    </div>
                    <div className="font-semibold mt-0.5 inline-flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>TLS · ESP32 behind gateway</span>
                    </div>
                  </div>
                </div>

                {(hardwareStatus.lastErrorMessage || streamError) ? (
                  <div className="flex items-start gap-2 rounded-[12px] bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-[12px] text-rose-500">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      {hardwareStatus.lastErrorCode
                        ? `${hardwareStatus.lastErrorCode}: `
                        : ''}
                      {hardwareStatus.lastErrorMessage || streamError}
                    </span>
                  </div>
                ) : hardwareStatus.mode === 'simulation' ? (
                  <div className="flex items-start gap-2 rounded-[12px] bg-[#F3A64A]/10 border border-[#F3A64A]/25 px-3 py-2 text-[12px] text-[#8A5000] dark:text-[#FFDDB7]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      ESP32 hardware is not connected yet. All device controls,
                      commands, and acknowledgements are simulated safely without
                      requiring MQTT or bridge credentials.
                    </span>
                  </div>
                ) : null}
              </div>

              <div>
                <h2 className="text-[16px] font-bold mb-2.5">
                  Monitored devices
                </h2>
                <div className="space-y-2.5">
                  {monitoredDevices.map((d) => {
                    const isErr = !d.online && Boolean(d.lastErrorCode);
                    const toneClass = d.online
                      ? 'text-emerald-500'
                      : 'text-rose-500';
                    return (
                      <div
                        key={d.deviceId}
                        className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-4 space-y-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-[10px] bg-[#F3A64A]/12 text-[#D9821E] dark:text-[#F3A64A] flex items-center justify-center shrink-0">
                            {iconForDevice(d.deviceId)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[14px] font-bold">
                              {d.name}
                            </div>
                            <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] tabular-nums">
                              {d.room} · {d.nodeId}
                              {d.rssiDbm !== null ? ` · ${d.rssiDbm} dBm` : ''}
                            </div>
                          </div>
                          <div
                            className={`flex items-center gap-1 text-[12px] font-bold ${toneClass}`}
                          >
                            {d.online ? (
                              <Cloud className="w-[17px] h-[17px]" />
                            ) : (
                              <CloudOff className="w-[17px] h-[17px]" />
                            )}
                            <span>{d.online ? 'Online' : 'Offline'}</span>
                          </div>
                        </div>

                        <div className="h-px bg-black/10 dark:bg-white/10" />

                        <div className="flex flex-wrap gap-6">
                          <div>
                            <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF]">
                              Current state
                            </div>
                            <div className="text-[14px] font-bold mt-0.5 tabular-nums">
                              {stateLabelFor(d.deviceId)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF]">
                              Last communication
                            </div>
                            <div className="text-[14px] mt-0.5 tabular-nums">
                              {formatClockAndRelative(d.lastHeartbeatAt)}
                            </div>
                          </div>
                        </div>

                        {(isErr || d.lastErrorMessage) && (
                          <div className="flex items-start gap-1.5 text-[12px] text-rose-500">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                              {d.lastErrorMessage ??
                                'ESP32 node offline (simulated).'}
                            </span>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onPingDevice(d.deviceId)}
                            className="h-9 px-3.5 rounded-full border border-black/15 dark:border-white/20 text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition"
                          >
                            <Activity className="w-4 h-4" />
                            <span>Ping</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onSimulateConnectivity(d.deviceId, !d.online)
                            }
                            className="h-9 px-3 rounded-full text-[13px] font-semibold text-[#D9821E] dark:text-[#F3A64A] inline-flex items-center gap-1.5 hover:bg-[#F3A64A]/10 transition"
                          >
                            {d.online ? (
                              <WifiOff className="w-4 h-4" />
                            ) : (
                              <Wifi className="w-4 h-4" />
                            )}
                            <span>
                              {d.online ? 'Simulate offline' : 'Bring online'}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[16px] font-bold">
                    Recent command history
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSelectedTab('commands')}
                    className="text-[13px] font-semibold text-[#D9821E] dark:text-[#F3A64A]"
                  >
                    All commands · {failedCommands.length} failed
                  </button>
                </div>

                {commandLogs.length === 0 ? (
                  <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[18px] flex items-center gap-3">
                    <History className="w-5 h-5 text-[#D9821E] dark:text-[#F3A64A] shrink-0" />
                    <div>
                      <div className="text-[14px] font-bold">
                        No device commands recorded yet
                      </div>
                      <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5">
                        Control a device from Home, Devices, Automations, or
                        Voice to inspect execution logs.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 overflow-hidden">
                    {commandLogs.slice(0, 4).map((entry, idx) => (
                      <div key={entry.id}>
                        {idx > 0 && (
                          <div className="h-px bg-black/8 dark:bg-white/8 ml-14" />
                        )}
                        <div className="px-4 py-3 flex items-start gap-3">
                          {entry.success ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[14px] font-semibold">
                                {entry.command}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  entry.success
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-rose-500/15 text-rose-500'
                                }`}
                              >
                                {entry.ackStatus === 'timed_out'
                                  ? 'ACK Timeout'
                                  : entry.success
                                    ? entry.simulated !== false
                                      ? 'ACK · Simulated'
                                      : 'ACK · Hardware'
                                    : 'Failed'}
                              </span>
                            </div>
                            <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] tabular-nums">
                              {entry.deviceName} ·{' '}
                              {entry.success ? 'Acknowledged' : 'Failed'} ·{' '}
                              {entry.latencyMs} ms ·{' '}
                              {formatClockAndRelative(entry.timestamp)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[16px] font-bold">Connection errors</h2>
                  <button
                    type="button"
                    onClick={() => setSelectedTab('errors')}
                    className="text-[13px] font-semibold text-[#D9821E] dark:text-[#F3A64A]"
                  >
                    Inspect errors
                  </button>
                </div>

                {activeErrors.length === 0 ? (
                  <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[18px] flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#D9821E] dark:text-[#F3A64A] shrink-0" />
                    <div>
                      <div className="text-[14px] font-bold">
                        No active connection errors
                      </div>
                      <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5">
                        All simulated ESP32 nodes are responding within expected
                        heartbeat intervals.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 overflow-hidden">
                    {activeErrors.slice(0, 3).map((d, idx) => (
                      <div key={d.deviceId}>
                        {idx > 0 && (
                          <div className="h-px bg-black/8 dark:bg-white/8 ml-14" />
                        )}
                        <div className="px-4 py-3 flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                            <div>
                              <div className="text-[14px] font-bold">
                                {d.name} · {d.lastErrorCode ?? 'ERR_OFFLINE'}
                              </div>
                              <div className="text-[12px] text-rose-500 mt-0.5">
                                {d.lastErrorMessage ?? 'Node is unreachable.'}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onResolveError(d.deviceId)}
                            className="text-[13px] font-semibold text-[#D9821E] dark:text-[#F3A64A] shrink-0"
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedTab === 'commands' && (
            <div className="space-y-3">
              <div>
                <h2 className="text-[16px] font-bold">Command history</h2>
                <p className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] tabular-nums mt-0.5">
                  {commandLogs.length} total · {failedCommands.length} failed
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['all', `All (${commandLogs.length})`],
                    [
                      'succeeded',
                      `Succeeded (${commandLogs.length - failedCommands.length})`,
                    ],
                    ['failed', `Failed (${failedCommands.length})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCommandFilter(key)}
                    className={`h-8 px-3 rounded-[10px] text-[12px] font-medium border transition ${
                      commandFilter === key
                        ? 'bg-[#F3A64A]/20 border-[#F3A64A]'
                        : 'bg-white dark:bg-[#1C1E22] border-black/15 dark:border-white/15'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <select
                value={selectedDeviceFilter}
                onChange={(e) =>
                  setSelectedDeviceFilter(e.target.value as DeviceId | 'all')
                }
                aria-label="Filter by device"
                className="w-full h-11 px-3 rounded-[10px] bg-transparent border border-black/25 dark:border-white/25 text-[14px]"
              >
                <option value="all" className="bg-white dark:bg-[#1C1E22]">
                  All devices
                </option>
                {monitoredDevices.map((d) => (
                  <option
                    key={d.deviceId}
                    value={d.deviceId}
                    className="bg-white dark:bg-[#1C1E22]"
                  >
                    {d.name}
                  </option>
                ))}
              </select>

              {filteredCommands.length === 0 ? (
                <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[18px] flex items-center gap-3">
                  <Filter className="w-5 h-5 text-[#D9821E] dark:text-[#F3A64A] shrink-0" />
                  <div>
                    <div className="text-[14px] font-bold">
                      No matching commands
                    </div>
                    <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5">
                      Change the status or device filter, or issue a device
                      command to log an entry.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 overflow-hidden">
                  {filteredCommands.map((entry, idx) => (
                    <div key={entry.id}>
                      {idx > 0 && (
                        <div className="h-px bg-black/8 dark:bg-white/8 ml-14" />
                      )}
                      <div className="px-4 py-3 flex items-start gap-3">
                        {entry.success ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[14px] font-semibold">
                              {entry.command}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                entry.success
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-rose-500/15 text-rose-500'
                              }`}
                            >
                              {entry.ackStatus === 'timed_out'
                                ? 'ACK Timeout'
                                : entry.success
                                  ? entry.simulated !== false
                                    ? 'ACK · Simulated'
                                    : 'ACK · Hardware'
                                  : 'Failed'}
                            </span>
                          </div>
                          <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] tabular-nums">
                            {entry.deviceName} ·{' '}
                            {entry.success ? 'Acknowledged' : 'Failed'} ·{' '}
                            {entry.latencyMs} ms ·{' '}
                            {formatClockAndRelative(entry.timestamp)}
                          </div>
                          {!entry.success && (
                            <div className="text-[12px] text-rose-500 mt-1">
                              {entry.message}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedTab === 'errors' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[16px] font-bold mb-2">
                  Failed commands ({failedCommands.length})
                </h2>
                {failedCommands.length === 0 ? (
                  <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[18px] flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#D9821E] dark:text-[#F3A64A] shrink-0" />
                    <div>
                      <div className="text-[14px] font-bold">
                        No failed commands
                      </div>
                      <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5">
                        Toggle a device offline in Overview and send a command
                        to see failed execution handling.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 overflow-hidden">
                    {failedCommands.map((entry, idx) => (
                      <div key={entry.id}>
                        {idx > 0 && (
                          <div className="h-px bg-black/8 dark:bg-white/8 ml-14" />
                        )}
                        <div className="px-4 py-3 flex items-start gap-3">
                          <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                          <div>
                            <div className="text-[14px] font-semibold">
                              {entry.command}
                            </div>
                            <div className="text-[12px] text-rose-500">
                              {entry.message}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-[16px] font-bold mb-2">
                  Connection errors ({activeErrors.length})
                </h2>
                {activeErrors.length === 0 ? (
                  <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[18px] flex items-center gap-3">
                    <Wifi className="w-5 h-5 text-[#D9821E] dark:text-[#F3A64A] shrink-0" />
                    <div>
                      <div className="text-[14px] font-bold">
                        No connection errors
                      </div>
                      <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5">
                        No ESP32 heartbeat or transport errors have occurred.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 overflow-hidden">
                    {activeErrors.map((d, idx) => (
                      <div key={d.deviceId}>
                        {idx > 0 && (
                          <div className="h-px bg-black/8 dark:bg-white/8 ml-14" />
                        )}
                        <div className="px-4 py-3 flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                            <div>
                              <div className="text-[14px] font-bold">
                                {d.name} · {d.lastErrorCode ?? 'ERR_OFFLINE'}
                              </div>
                              <div className="text-[12px] text-rose-500 mt-0.5">
                                {d.lastErrorMessage ?? 'Node is unreachable.'}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onResolveError(d.deviceId)}
                            className="text-[13px] font-semibold text-[#D9821E] dark:text-[#F3A64A] shrink-0"
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="pt-2 text-center text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
          {hardwareStatus.mode === 'simulation'
            ? 'Simulation mode active · Authenticated hardware gateway ready for MQTT over TLS or secure backend bridge without exposing ESP32s to the public internet.'
            : `Hardware gateway active (${hardwareStatus.transportLabel}) · ESP32 isolated behind TLS gateway.`}
        </p>
      </div>

      {/* Simulate ESP32 Status Update Modal */}
      {simModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitSim}
            className="max-w-[440px] w-full rounded-[24px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-white/10 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] font-semibold">
                Simulate ESP32 status update
              </h2>
              <button
                type="button"
                onClick={() => setSimModalOpen(false)}
                className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
              Send a JSON status frame through Esp32StatusGateway to test future
              ESP32 telemetry handling.
            </p>

            <label className="block space-y-1">
              <span className="text-[12px] font-medium">Target device</span>
              <select
                value={simDeviceId}
                onChange={(e) => setSimDeviceId(e.target.value as DeviceId)}
                className="w-full h-11 px-3 rounded-[10px] bg-transparent border border-black/25 dark:border-white/25 text-sm"
              >
                {monitoredDevices.map((d) => (
                  <option
                    key={d.deviceId}
                    value={d.deviceId}
                    className="bg-white dark:bg-[#1C1E22]"
                  >
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center justify-between py-1">
              <div>
                <div className="text-[14px] font-medium">Report node online</div>
                <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                  {simOnline
                    ? 'Device will report Online with updated heartbeat'
                    : 'Device will report Offline and log a connection error'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={simOnline}
                onClick={() => setSimOnline((v) => !v)}
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  simOnline
                    ? 'bg-[#F3A64A]'
                    : 'bg-neutral-300 dark:bg-white/15'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    simOnline ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {simOnline ? (
              <label className="block space-y-1">
                <span className="text-[12px] font-medium">Wi-Fi RSSI (dBm)</span>
                <input
                  type="number"
                  value={simRssi}
                  onChange={(e) => setSimRssi(Number(e.target.value))}
                  className="w-full h-11 px-3 rounded-[10px] bg-transparent border border-black/25 dark:border-white/25 text-sm"
                />
              </label>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-[12px] font-medium">Error code</span>
                  <input
                    type="text"
                    value={simErrCode}
                    onChange={(e) => setSimErrCode(e.target.value)}
                    className="w-full h-11 px-3 rounded-[10px] bg-transparent border border-black/25 dark:border-white/25 text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[12px] font-medium">
                    Connection error message
                  </span>
                  <textarea
                    rows={2}
                    value={simErrMsg}
                    onChange={(e) => setSimErrMsg(e.target.value)}
                    className="w-full p-3 rounded-[10px] bg-transparent border border-black/25 dark:border-white/25 text-sm"
                  />
                </label>
              </>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSimModalOpen(false)}
                className="px-4 py-2 text-[14px] font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-full bg-[#F3A64A] text-[#101113] text-[14px] font-semibold"
              >
                Send update
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
