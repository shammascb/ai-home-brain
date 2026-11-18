import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  DoorClosed,
  Fan,
  Footprints,
  History,
  Home,
  Lightbulb,
  Lock,
  LockOpen,
  Mic,
  MicOff,
  Moon,
  MoreHorizontal,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  Users,
  UserCog,
  WifiOff,
  X,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import {
  DeviceState,
  FamilyActivityEntry,
  MonitoredDevice,
  RoutineId,
  SceneMode,
  VOICE_ACTION_DETAILS,
  VoiceAction,
} from '../types/smartHome';

interface HomeDashboardViewProps {
  firstName: string;
  accountName: string;
  homeName: string;
  roleLabel: string;
  memberCount: number;
  pendingInviteCount: number;
  selectedMode: SceneMode;
  deviceState: DeviceState;
  monitoredDevices: MonitoredDevice[];
  activities: FamilyActivityEntry[];
  canControlDevices: boolean;
  canUnlockDoor: boolean;
  voiceEnabled: boolean;
  onSelectHomeMode: () => void;
  onRunRoutineFromScene: (id: RoutineId) => void;
  onToggleLight: () => void;
  onToggleFan: () => void;
  onRequestDoorToggle: () => void;
  onToggleDoorSensor: () => void;
  onOpenBedroom: () => void;
  onOpenDevicesTab: () => void;
  onOpenAutomationsTab: () => void;
  onOpenMonitoring: () => void;
  onOpenFamilyTab: (tab: 'members' | 'activity' | 'security') => void;
  onExecuteVoiceAction: (action: VoiceAction, transcript: string) => Promise<string>;
  onOpenLivingRoom: () => void;
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatActivityTime(dt: Date): string {
  const diffSec = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  const hour = String(dt.getHours()).padStart(2, '0');
  const minute = String(dt.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export const HomeDashboardView: React.FC<HomeDashboardViewProps> = ({
  firstName,
  accountName,
  homeName,
  roleLabel,
  memberCount,
  pendingInviteCount,
  selectedMode,
  deviceState,
  monitoredDevices,
  activities,
  canControlDevices,
  canUnlockDoor,
  voiceEnabled,
  onSelectHomeMode,
  onRunRoutineFromScene,
  onToggleLight,
  onToggleFan,
  onRequestDoorToggle,
  onToggleDoorSensor,
  onOpenBedroom,
  onOpenDevicesTab,
  onOpenAutomationsTab,
  onOpenMonitoring,
  onOpenFamilyTab,
  onExecuteVoiceAction,
  onOpenLivingRoom,
}) => {
  const [doorDetailsOpen, setDoorDetailsOpen] = useState(false);

  // Inline Voice Assistant Card state (matches _VoiceAssistantCard in dashboard_screen.dart)
  const [isListening, setIsListening] = useState(false);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [recognizedSpeech, setRecognizedSpeech] = useState('');
  const [recognizedAction, setRecognizedAction] = useState<VoiceAction | null>(
    null,
  );
  const [requiresDoorConfirm, setRequiresDoorConfirm] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceResult, setVoiceResult] = useState<string | null>(null);
  const [showTextBox, setShowTextBox] = useState(false);
  const [typedPhrase, setTypedPhrase] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore cleanup stop errors
      }
    };
  }, []);

  const onlineCount = monitoredDevices.filter((d) => d.online).length;
  const offlineCount = monitoredDevices.length - onlineCount;
  const activeErrors = monitoredDevices.filter(
    (d) => !d.online || Boolean(d.lastErrorCode),
  ).length;

  const modes: Array<{ label: SceneMode; icon: React.ReactNode }> = [
    { label: 'Home', icon: <Home className="w-4 h-4" /> },
    { label: 'Away', icon: <Footprints className="w-4 h-4" /> },
    { label: 'Sleep', icon: <Moon className="w-4 h-4" /> },
    { label: 'Morning', icon: <Sun className="w-4 h-4" /> },
  ];

  const interpretTranscript = async (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    if (!voiceEnabled) {
      setVoiceError(`Voice commands are disabled for this account (${roleLabel}).`);
      return;
    }

    setRecognizedSpeech(clean);
    setVoiceError(null);
    setVoiceResult(null);
    setRecognizedAction(null);
    setRequiresDoorConfirm(false);
    setIsInterpreting(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setVoiceError('Sign in to use the voice assistant.');
        return;
      }
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/voice/interpret', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ transcript: clean }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        action?: VoiceAction;
        error?: string;
      };

      if (!res.ok) {
        setVoiceError(data.error || `AI assistant failed (HTTP ${res.status}).`);
        return;
      }

      const action = data.action ?? 'unsupported';
      setRecognizedAction(action);
      const meta = VOICE_ACTION_DETAILS[action];

      if (action === 'open_living_room') {
        onOpenLivingRoom();
        return;
      }
      if (action === 'open_bedroom') {
        onOpenBedroom();
        return;
      }
      if (!meta.isExecutable) {
        setVoiceError(meta.description);
        return;
      }
      if (meta.requiresConfirmation) {
        setRequiresDoorConfirm(true);
        return;
      }

      setIsExecuting(true);
      const summary = await onExecuteVoiceAction(action, clean);
      setVoiceResult(`${summary} No physical device was changed.`);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'AI assistant failed.');
    } finally {
      setIsInterpreting(false);
      setIsExecuting(false);
    }
  };

  const handleTalkPress = () => {
    if (!voiceEnabled) {
      setVoiceError(`Voice commands are disabled for your account (${roleLabel}).`);
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const RecognitionCtor =
      win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!RecognitionCtor) {
      setShowTextBox(true);
      setVoiceError(
        'Microphone speech recognition is unavailable in this browser. Type your command below.',
      );
      return;
    }

    try {
      const rec = new RecognitionCtor();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        const text = ev.results[0]?.[0]?.transcript ?? '';
        setIsListening(false);
        if (text.trim()) void interpretTranscript(text);
      };
      rec.onerror = () => {
        setIsListening(false);
        setShowTextBox(true);
        setVoiceError('Microphone unavailable. Type a command below to test.');
      };
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
      setVoiceError(null);
      setIsListening(true);
      rec.start();
    } catch {
      setIsListening(false);
      setShowTextBox(true);
    }
  };

  const visibleActivities = activities.slice(0, 4);

  return (
    <div className="max-w-[920px] w-full mx-auto px-5 sm:px-8 pt-3 pb-8">
      {/* Greeting Header + _HomeConnectionCard */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-[#D9821E] dark:text-[#F3A64A]">
            {getTimeGreeting()}
          </div>
          <h1 className="mt-1 text-[28px] sm:text-[30px] font-extrabold tracking-[-0.8px] leading-tight truncate">
            {firstName} 👋
          </h1>
          <p className="mt-1 text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
            Your home at a glance
          </p>
        </div>

        {/* _HomeConnectionCard (width: 146) */}
        <button
          type="button"
          onClick={onOpenMonitoring}
          className="w-[146px] shrink-0 p-3 rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/15 dark:border-[#44474F]/45 text-left hover:border-[#F3A64A]/50 transition"
        >
          <div className="flex items-center gap-1.5">
            {offlineCount > 0 ? (
              <WifiOff className="w-[17px] h-[17px] text-rose-500 shrink-0" />
            ) : (
              <Activity
                className={`w-[17px] h-[17px] shrink-0 ${
                  activeErrors > 0 ? 'text-amber-500' : 'text-emerald-500'
                }`}
              />
            )}
            <span className="text-[11px] font-bold truncate tabular-nums">
              {onlineCount}/{monitoredDevices.length} online
            </span>
          </div>
          <p className="mt-1.5 text-[10px] leading-[1.3] text-neutral-500 dark:text-[#C4C6CF]">
            {activeErrors > 0
              ? `${activeErrors} active alert${activeErrors === 1 ? '' : 's'} · Simulated`
              : 'Simulated · Tap to monitor'}
          </p>
        </button>
      </div>

      {/* My Scenes */}
      <div className="mt-7">
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-extrabold tracking-[-0.3px]">
            My Scenes
          </h2>
          <button
            type="button"
            onClick={onOpenAutomationsTab}
            className="text-[13px] font-semibold text-[#D9821E] dark:text-[#F3A64A] px-2 py-1 rounded-lg hover:bg-[#F3A64A]/10 transition"
          >
            View all
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {modes.map((m) => {
            const selected = selectedMode === m.label;
            return (
              <button
                key={m.label}
                type="button"
                onClick={() => {
                  if (m.label === 'Sleep') onRunRoutineFromScene('sleep');
                  else if (m.label === 'Morning') onRunRoutineFromScene('morning');
                  else if (m.label === 'Away') onRunRoutineFromScene('away');
                  else onSelectHomeMode();
                }}
                className={`h-9 px-3.5 rounded-[12px] text-[13px] font-semibold inline-flex items-center gap-2 transition ${
                  selected
                    ? 'bg-[#F3A64A] text-[#101113]'
                    : 'bg-white dark:bg-[#1C1E22] text-neutral-600 dark:text-[#C4C6CF] hover:text-[#111315] dark:hover:text-white'
                }`}
              >
                {m.icon}
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Favorite Devices */}
      <div className="mt-[26px]">
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-extrabold tracking-[-0.3px]">
            Favorite Devices
          </h2>
          <button
            type="button"
            onClick={onOpenDevicesTab}
            className="text-[13px] font-semibold text-[#D9821E] dark:text-[#F3A64A] px-2 py-1 rounded-lg hover:bg-[#F3A64A]/10 transition"
          >
            View all
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* Light Card */}
          <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[14px] flex flex-col justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-[10px] bg-[#F3A64A]/14 text-[#D9821E] dark:text-[#F3A64A] flex items-center justify-center shrink-0">
                <Lightbulb className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold truncate">Light</div>
                <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF] truncate">
                  Living room
                </div>
              </div>
              <MoreHorizontal className="w-5 h-5 text-neutral-400 dark:text-[#C4C6CF] shrink-0" />
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-neutral-500 dark:text-[#C4C6CF] truncate">
                {deviceState.lightOn ? 'ON · Simulated' : 'OFF · Simulated'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={deviceState.lightOn}
                aria-label="Toggle Light"
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

          {/* Fan Card */}
          <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[14px] flex flex-col justify-between">
            <div>
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
                  <div className="text-[14px] font-bold truncate">Fan</div>
                  <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF] truncate">
                    Bedroom
                  </div>
                </div>
                <MoreHorizontal className="w-5 h-5 text-neutral-400 dark:text-[#C4C6CF] shrink-0" />
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-neutral-500 dark:text-[#C4C6CF] truncate">
                  {deviceState.fanOn ? 'ON · Simulated' : 'OFF · Simulated'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={deviceState.fanOn}
                  aria-label="Toggle Fan"
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
            </div>

            <div className="mt-1">
              <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] tabular-nums">
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

          {/* Door Card */}
          <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[14px] flex flex-col justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-[10px] bg-[#F3A64A]/14 text-[#D9821E] dark:text-[#F3A64A] flex items-center justify-center shrink-0">
                <DoorClosed className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold truncate">Door</div>
                <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF] truncate">
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

            <div className="mt-2.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-neutral-500 dark:text-[#C4C6CF] truncate">
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
        </div>
      </div>

      {/* _VoiceAssistantCard (primaryContainer color) */}
      <div className="mt-[26px] rounded-[18px] bg-[#FFDDB7] dark:bg-[#5E3A00] text-[#2C1600] dark:text-[#FFDDB7] p-[18px]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[16px] font-bold">Voice assistant</h3>
          <button
            type="button"
            onClick={() => onOpenFamilyTab('security')}
            className="text-[12px] font-semibold hover:underline truncate"
          >
            {accountName} · {roleLabel}
          </button>
        </div>

        <p className="mt-1 text-[12px] leading-relaxed opacity-90">
          {voiceEnabled
            ? 'Try: “Turn on the light” or “Good morning.” Speaker verification is not implemented; commands use your signed-in account.'
            : `Voice commands are disabled for this account (${roleLabel}).`}
        </p>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isExecuting || !voiceEnabled}
            onClick={handleTalkPress}
            className="h-10 px-4 rounded-full bg-white/75 dark:bg-black/25 text-[#2C1600] dark:text-[#FFDDB7] text-[13px] font-semibold inline-flex items-center gap-2 hover:bg-white/90 dark:hover:bg-black/35 disabled:opacity-45 transition"
          >
            {!voiceEnabled ? (
              <MicOff className="w-4 h-4" />
            ) : isListening ? (
              <Square className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
            <span>
              {!voiceEnabled
                ? 'Voice disabled'
                : isListening
                  ? 'Stop listening'
                  : 'Talk'}
            </span>
          </button>

          {voiceEnabled && (
            <button
              type="button"
              onClick={() => setShowTextBox((v) => !v)}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition"
            >
              {showTextBox ? 'Hide text' : 'Type command'}
            </button>
          )}
        </div>

        {showTextBox && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void interpretTranscript(typedPhrase);
              setTypedPhrase('');
            }}
            className="mt-3 flex items-center gap-2"
          >
            <input
              type="text"
              value={typedPhrase}
              onChange={(e) => setTypedPhrase(e.target.value)}
              placeholder='Try "Turn on the light" or "Good morning"'
              className="flex-1 h-9 px-3 rounded-xl bg-white/70 dark:bg-black/30 text-xs placeholder:opacity-60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!typedPhrase.trim() || isInterpreting || isExecuting}
              className="h-9 px-3.5 rounded-xl bg-[#2C1600] dark:bg-[#FFDDB7] text-[#FFDDB7] dark:text-[#2C1600] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Run</span>
            </button>
          </form>
        )}

        {isListening && (
          <p className="mt-2.5 text-[13px]">
            Listening… Tell me what you need at home.
          </p>
        )}
        {isInterpreting && (
          <p className="mt-2.5 text-[13px]">
            AI is understanding your request… Tap Talk to start another command
            while it works.
          </p>
        )}
        {recognizedSpeech && (
          <p className="mt-3 text-[13px] font-semibold">
            Recognized speech: “{recognizedSpeech}”
          </p>
        )}
        {recognizedAction && (
          <div className="mt-2 space-y-2 text-[13px]">
            <p>Action: {VOICE_ACTION_DETAILS[recognizedAction].description}</p>
            {requiresDoorConfirm && (
              <>
                <p>Please confirm before locking the simulated door.</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isExecuting}
                    onClick={async () => {
                      setIsExecuting(true);
                      try {
                        const res = await onExecuteVoiceAction(
                          recognizedAction,
                          recognizedSpeech,
                        );
                        setRequiresDoorConfirm(false);
                        setVoiceResult(res);
                      } catch (err) {
                        setVoiceError(
                          err instanceof Error ? err.message : 'Failed.',
                        );
                      } finally {
                        setIsExecuting(false);
                      }
                    }}
                    className="h-9 px-4 rounded-full bg-[#2C1600] dark:bg-[#F3A64A] text-white dark:text-[#101113] text-xs font-semibold"
                  >
                    {isExecuting ? 'Working…' : 'Confirm and lock'}
                  </button>
                  <button
                    type="button"
                    disabled={isExecuting}
                    onClick={() => {
                      setRequiresDoorConfirm(false);
                      setRecognizedAction(null);
                      setVoiceResult(
                        'Confirmation canceled. The door was not locked by this request.',
                      );
                    }}
                    className="h-9 px-3 text-xs font-semibold"
                  >
                    Not now
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {voiceError && (
          <p className="mt-2.5 text-[13px] text-rose-700 dark:text-rose-300 font-medium">
            {voiceError}
          </p>
        )}
        {voiceResult && (
          <p className="mt-2.5 text-[13px] font-medium">{voiceResult}</p>
        )}
      </div>

      {/* Family & Access */}
      <div className="mt-[26px]">
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-extrabold tracking-[-0.3px]">
            Family &amp; Access
          </h2>
          <button
            type="button"
            onClick={() => onOpenFamilyTab('members')}
            className="text-[13px] font-semibold text-[#D9821E] dark:text-[#F3A64A] px-2 py-1 rounded-lg hover:bg-[#F3A64A]/10 transition"
          >
            View all
          </button>
        </div>

        <div className="mt-3 rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#F3A64A]/12 text-[#D9821E] dark:text-[#F3A64A] flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-bold truncate">{homeName}</div>
              <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                {memberCount} authorized · {pendingInviteCount} pending · Role:{' '}
                <span className="capitalize">{roleLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenFamilyTab('members')}
              className="h-9 px-3.5 rounded-full bg-[#F3A64A]/18 text-[#D9821E] dark:text-[#FFDDB7] text-[13px] font-semibold inline-flex items-center gap-2 hover:bg-[#F3A64A]/28 transition"
            >
              <UserCog className="w-[18px] h-[18px]" />
              <span>Members &amp; permissions</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenFamilyTab('activity')}
              className="h-9 px-3.5 rounded-full border border-black/15 dark:border-white/20 text-[13px] font-medium inline-flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 transition"
            >
              <History className="w-[18px] h-[18px]" />
              <span>Activity</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenFamilyTab('security')}
              className="h-9 px-3.5 rounded-full border border-black/15 dark:border-white/20 text-[13px] font-medium inline-flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 transition"
            >
              <ShieldCheck className="w-[18px] h-[18px]" />
              <span>Security</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-[26px]">
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-extrabold tracking-[-0.3px]">
            Recent Activity
          </h2>
          <button
            type="button"
            onClick={() => onOpenFamilyTab('activity')}
            className="text-[13px] font-semibold text-[#D9821E] dark:text-[#F3A64A] px-2 py-1 rounded-lg hover:bg-[#F3A64A]/10 transition"
          >
            View all
          </button>
        </div>

        <div className="mt-3 rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 overflow-hidden">
          {visibleActivities.length === 0 ? (
            <div className="px-4 py-3.5 flex items-center gap-3.5">
              <History className="w-5 h-5 text-[#D9821E] dark:text-[#F3A64A] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium">
                  No activity recorded yet
                </div>
                <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                  Toggle a device, run an automation, or use a voice command to
                  record account-attributed activity.
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenFamilyTab('activity')}
                className="text-[13px] font-semibold text-[#D9821E] dark:text-[#F3A64A] shrink-0"
              >
                History
              </button>
            </div>
          ) : (
            visibleActivities.map((item, idx) => {
              const Icon =
                item.category === 'device'
                  ? Lightbulb
                  : item.category === 'door'
                    ? DoorClosed
                    : item.category === 'automation'
                      ? Sparkles
                      : item.category === 'voice'
                        ? Mic
                        : item.category === 'family'
                          ? Users
                          : ShieldCheck;
              return (
                <div key={item.logId}>
                  {idx > 0 && (
                    <div className="h-px bg-black/8 dark:bg-white/8 ml-16" />
                  )}
                  <div className="px-4 py-2.5 flex items-center gap-4">
                    <Icon className="w-5 h-5 text-[#D9821E] dark:text-[#F3A64A] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] truncate">
                        {item.actionTitle}
                      </div>
                      <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] truncate">
                        {item.actorName} ({item.actorRole}) · {item.source} ·{' '}
                        {formatActivityTime(item.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer Disclaimer */}
      <p className="mt-[18px] text-center text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
        Demo dashboard · No home devices are connected. Device states are
        simulated; family &amp; activity data tracks signed-in account actions.
      </p>

      {/* Door Details Bottom Sheet / Modal matching showDoorDetails() */}
      {doorDetailsOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setDoorDetailsOpen(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] bg-white dark:bg-[#1C1E22] p-5 pb-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-full bg-neutral-400/40 mx-auto sm:hidden" />
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
