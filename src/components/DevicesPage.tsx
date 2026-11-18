import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  DoorClosed,
  Fan,
  Lightbulb,
  Lock,
  LockOpen,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { DeviceState, MonitoredDevice } from '../types/smartHome';

export type DevicesRoomFilter =
  | 'All'
  | 'Living room'
  | 'Bedroom'
  | 'Front entry';

interface DevicesPageProps {
  deviceState: DeviceState;
  monitoredDevices: MonitoredDevice[];
  selectedRoom: DevicesRoomFilter;
  onSelectRoom: (room: DevicesRoomFilter) => void;
  canControlDevices: boolean;
  canUnlockDoor: boolean;
  onToggleLight: () => void;
  onToggleFan: () => void;
  onRequestDoorToggle: () => void;
  onToggleDoorSensor: () => void;
  onOpenBedroom: () => void;
  onOpenMonitoring: () => void;
}

const ROOMS: DevicesRoomFilter[] = [
  'All',
  'Living room',
  'Bedroom',
  'Front entry',
];

export const DevicesPage: React.FC<DevicesPageProps> = ({
  deviceState,
  monitoredDevices,
  selectedRoom,
  onSelectRoom,
  canControlDevices,
  canUnlockDoor,
  onToggleLight,
  onToggleFan,
  onRequestDoorToggle,
  onToggleDoorSensor,
  onOpenBedroom,
  onOpenMonitoring,
}) => {
  const [doorDetailsOpen, setDoorDetailsOpen] = useState(false);

  const onlineCount = monitoredDevices.filter((d) => d.online).length;
  const activeErrors = monitoredDevices.filter(
    (d) => !d.online || Boolean(d.lastErrorCode),
  ).length;

  return (
    <div className="max-w-[920px] w-full mx-auto px-5 sm:px-8 pt-5 pb-7">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">
            My Devices
          </h1>
          <p className="mt-1.5 text-[14px] text-neutral-500 dark:text-[#C4C6CF] tabular-nums">
            {onlineCount}/{monitoredDevices.length} online · {activeErrors}{' '}
            active error{activeErrors === 1 ? '' : 's'} · Simulation only
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenMonitoring}
          className="h-10 px-4 rounded-full border border-black/15 dark:border-white/20 text-[13px] font-semibold inline-flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 shrink-0 transition"
        >
          <Activity className="w-[18px] h-[18px]" />
          <span>Monitoring</span>
        </button>
      </div>

      {/* Centered room filter ChoiceChips */}
      <div className="mt-[22px] flex flex-wrap justify-center gap-2">
        {ROOMS.map((room) => {
          const active = selectedRoom === room;
          return (
            <button
              key={room}
              type="button"
              onClick={() => onSelectRoom(room)}
              className={`h-9 px-3.5 rounded-[10px] text-[13px] font-medium border transition ${
                active
                  ? 'bg-[#F3A64A]/20 border-[#F3A64A] text-[#111315] dark:text-[#FFDDB7]'
                  : 'bg-white dark:bg-[#1C1E22] border-black/15 dark:border-white/15 text-neutral-600 dark:text-[#C4C6CF]'
              }`}
            >
              {room}
            </button>
          );
        })}
      </div>

      {/* Single-column device cards with room hero images */}
      <div className="mt-[18px] space-y-3">
        {(selectedRoom === 'All' || selectedRoom === 'Living room') && (
          <div className="rounded-[18px] overflow-hidden bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25">
            <img
              src="/src/assets/images/welcome_living_room.jpg"
              alt="Living room"
              className="w-full h-[132px] object-cover"
            />
            <div className="p-[14px]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-[10px] bg-[#F3A64A]/14 text-[#D9821E] dark:text-[#F3A64A] flex items-center justify-center shrink-0">
                  <Lightbulb className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold">Light</div>
                  <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF]">
                    Living room
                  </div>
                </div>
                <MoreHorizontal className="w-5 h-5 text-neutral-400 dark:text-[#C4C6CF]" />
              </div>

              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-500 dark:text-[#C4C6CF]">
                  {deviceState.lightOn ? 'ON · Simulated' : 'OFF · Simulated'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={deviceState.lightOn}
                  disabled={!canControlDevices}
                  onClick={onToggleLight}
                  className={`relative w-12 h-7 rounded-full transition-colors disabled:opacity-40 ${
                    deviceState.lightOn
                      ? 'bg-[#F3A64A]'
                      : 'bg-neutral-300 dark:bg-white/15'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      deviceState.lightOn ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {(selectedRoom === 'All' || selectedRoom === 'Bedroom') && (
          <div className="rounded-[18px] overflow-hidden bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25">
            <img
              src="/src/assets/images/bedroom.jpg"
              alt="Bedroom"
              className="w-full h-[132px] object-cover"
            />
            <div className="p-[14px]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-[10px] bg-[#F3A64A]/14 text-[#D9821E] dark:text-[#F3A64A] flex items-center justify-center shrink-0">
                  <Fan
                    className={`w-5 h-5 ${deviceState.fanOn ? 'animate-spin' : ''}`}
                    style={
                      deviceState.fanOn
                        ? {
                            animationDuration: `${Math.max(
                              0.4,
                              2.2 - deviceState.fanSpeed * 0.32,
                            )}s`,
                          }
                        : undefined
                    }
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold">Fan</div>
                  <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF]">
                    Bedroom
                  </div>
                </div>
                <MoreHorizontal className="w-5 h-5 text-neutral-400 dark:text-[#C4C6CF]" />
              </div>

              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-500 dark:text-[#C4C6CF]">
                  {deviceState.fanOn ? 'ON · Simulated' : 'OFF · Simulated'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={deviceState.fanOn}
                  disabled={!canControlDevices}
                  onClick={onToggleFan}
                  className={`relative w-12 h-7 rounded-full transition-colors disabled:opacity-40 ${
                    deviceState.fanOn
                      ? 'bg-[#F3A64A]'
                      : 'bg-neutral-300 dark:bg-white/15'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      deviceState.fanOn ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="mt-1 text-[12px] text-neutral-500 dark:text-[#C4C6CF] tabular-nums">
                Speed {deviceState.fanSpeed} of 5 · Simulated
              </div>
              <div className="flex justify-end mt-0.5">
                <button
                  type="button"
                  onClick={onOpenBedroom}
                  className="text-[12px] font-semibold text-[#D9821E] dark:text-[#F3A64A] inline-flex items-center gap-1 hover:underline py-0.5"
                >
                  <ArrowRight className="w-[15px] h-[15px]" />
                  <span>Open Bedroom</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {(selectedRoom === 'All' || selectedRoom === 'Front entry') && (
          <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[14px]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-[10px] bg-[#F3A64A]/14 text-[#D9821E] dark:text-[#F3A64A] flex items-center justify-center shrink-0">
                <DoorClosed className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold">Door</div>
                <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF]">
                  Front entry
                </div>
              </div>
              <button
                type="button"
                title="Door details"
                onClick={() => setDoorDetailsOpen(true)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-500 dark:text-[#C4C6CF] hover:bg-black/5 dark:hover:bg-white/10"
              >
                <MoreHorizontal className="w-[19px] h-[19px]" />
              </button>
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-500 dark:text-[#C4C6CF]">
                {deviceState.doorLocked
                  ? 'Locked · Simulated'
                  : 'Unlocked · Simulated'}
              </span>
              <button
                type="button"
                title={deviceState.doorLocked ? 'Unlock door' : 'Lock door'}
                disabled={
                  !canControlDevices ||
                  (deviceState.doorLocked && !canUnlockDoor)
                }
                onClick={onRequestDoorToggle}
                className="w-8 h-8 rounded-full bg-[#F3A64A]/20 text-[#D9821E] dark:text-[#FFDDB7] flex items-center justify-center hover:bg-[#F3A64A]/30 disabled:opacity-40 transition"
              >
                {deviceState.doorLocked ? (
                  <LockOpen className="w-4 h-4" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-5 text-center text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
        Device controls are simulated. No physical home devices are connected.
      </p>

      {doorDetailsOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setDoorDetailsOpen(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] bg-white dark:bg-[#1C1E22] p-5 pb-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-bold">Front Door</h3>
              <button
                type="button"
                onClick={() => setDoorDetailsOpen(false)}
                className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[15px]">Simulate door open</span>
              <button
                type="button"
                role="switch"
                aria-checked={deviceState.doorOpen}
                disabled={!canControlDevices}
                onClick={onToggleDoorSensor}
                className={`relative w-12 h-7 rounded-full transition-colors disabled:opacity-40 ${
                  deviceState.doorOpen
                    ? 'bg-[#F3A64A]'
                    : 'bg-neutral-300 dark:bg-white/15'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    deviceState.doorOpen ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <p className="text-[13px] text-neutral-600 dark:text-[#C4C6CF]">
              Unlocking requires phone PIN or biometrics. Voice commands cannot
              unlock the door.
            </p>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setDoorDetailsOpen(false)}
                className="text-[14px] font-semibold text-[#D9821E] dark:text-[#F3A64A] px-3 py-1.5"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
