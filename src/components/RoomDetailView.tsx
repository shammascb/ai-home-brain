import React from 'react';
import {
  ChevronLeft,
  DoorClosed,
  Fan,
  Lightbulb,
  Lock,
  LockOpen,
  MoreVertical,
} from 'lucide-react';
import { DeviceState } from '../types/smartHome';

interface RoomDetailViewProps {
  deviceState: DeviceState;
  canControlDevices: boolean;
  canUnlockDoor: boolean;
  onBack: () => void;
  onToggleLight: () => void;
  onToggleFan: () => void;
  onChangeFanSpeed: (speed: number) => void;
  onRequestDoorToggle: () => void;
  onToggleDoorSensor: () => void;
  onShowNotice: (msg: string) => void;
}

export const RoomDetailView: React.FC<RoomDetailViewProps> = ({
  deviceState,
  canControlDevices,
  canUnlockDoor,
  onBack,
  onToggleLight,
  onToggleFan,
  onChangeFanSpeed,
  onRequestDoorToggle,
  onToggleDoorSensor,
  onShowNotice,
}) => {
  return (
    <div className="min-h-screen bg-[#F4F7F5] dark:bg-[#101113] text-[#111315] dark:text-[#F4F5F6]">
      {/* AppBar matching BedroomDetailScreen */}
      <header className="h-14 px-2 flex items-center justify-between max-w-[920px] mx-auto">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            title="Back"
            className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-[20px] font-medium">Bedroom</h1>
        </div>
        <button
          type="button"
          title="Bedroom options"
          onClick={() => onShowNotice('Bedroom controls are simulated.')}
          className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </header>

      <div className="max-w-[720px] mx-auto px-[18px] pt-2 pb-7 space-y-5">
        {/* Room photo banner */}
        <div className="relative h-[224px] rounded-[20px] overflow-hidden">
          <img
            src="/src/assets/images/bedroom.jpg"
            alt="Bedroom"
            className="w-full h-full object-cover object-center"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.42) 100%)',
            }}
          />
        </div>

        {/* Lighting Section */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold">Lighting</h2>
            <span className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
              {deviceState.lightOn ? 'On' : 'Off'}
            </span>
          </div>

          <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-white/10 px-3.5 py-3 flex items-center gap-2.5">
            <Lightbulb className="w-5 h-5 text-[#D9821E] dark:text-[#F3A64A] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold">Light</div>
              <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5">
                {deviceState.lightOn ? 'On · Simulated' : 'Off · Simulated'}
              </div>
            </div>
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
        </section>

        {/* Fan Speed Section */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold">Fan Speed</h2>
            <span className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] tabular-nums">
              {deviceState.fanSpeed} of 5
            </span>
          </div>

          <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-white/10 px-3.5 py-3 space-y-2">
            <div className="flex items-center gap-2.5">
              <Fan
                className={`w-5 h-5 text-[#D9821E] dark:text-[#F3A64A] shrink-0 ${
                  deviceState.fanOn ? 'animate-spin' : ''
                }`}
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
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold">Bedroom Fan</div>
                <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5">
                  {deviceState.fanOn ? 'On · Simulated' : 'Off · Simulated'}
                </div>
              </div>
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

            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={deviceState.fanSpeed}
              disabled={!deviceState.fanOn || !canControlDevices}
              onChange={(e) => onChangeFanSpeed(Number(e.target.value))}
              className="w-full accent-[#F3A64A] disabled:opacity-40 cursor-pointer"
            />
          </div>
        </section>

        {/* Door Section */}
        <section className="space-y-2.5">
          <h2 className="text-[16px] font-bold">Door</h2>
          <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-white/10 p-3.5 space-y-3">
            <div className="flex items-center gap-2.5">
              <DoorClosed className="w-5 h-5 text-[#D9821E] dark:text-[#F3A64A] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold">Front Door</div>
                <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5">
                  {deviceState.doorLocked
                    ? 'Locked · Simulated'
                    : 'Unlocked · Simulated'}
                </div>
              </div>
              <button
                type="button"
                disabled={
                  !canControlDevices ||
                  (deviceState.doorLocked && !canUnlockDoor)
                }
                onClick={onRequestDoorToggle}
                className="h-9 px-4 rounded-full bg-[#F3A64A]/20 text-[#D9821E] dark:text-[#FFDDB7] text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-[#F3A64A]/30 disabled:opacity-40 transition"
              >
                {deviceState.doorLocked ? (
                  <LockOpen className="w-4 h-4" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                <span>{deviceState.doorLocked ? 'Unlock' : 'Lock'}</span>
              </button>
            </div>

            <div className="h-px bg-black/10 dark:bg-white/10" />

            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] font-medium">
                  Simulate door open
                </div>
                <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                  {deviceState.doorOpen ? 'Door is open' : 'Door is closed'}
                </div>
              </div>
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

            <p className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
              Unlocking requires phone PIN or biometrics. Voice cannot unlock
              the door.
            </p>
          </div>
        </section>

        <p className="text-center text-[12px] text-neutral-500 dark:text-[#C4C6CF] pt-1">
          Device states are simulated; no physical devices are connected.
        </p>
      </div>
    </div>
  );
};
