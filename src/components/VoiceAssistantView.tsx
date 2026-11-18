import React, { useEffect, useRef, useState } from 'react';
import {
  Bed,
  DoorOpen,
  Keyboard,
  Mic,
  MicOff,
  Send,
  ShieldCheck,
  Sofa,
  Square,
  X,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { VOICE_ACTION_DETAILS, VoiceAction } from '../types/smartHome';

interface VoiceAssistantViewProps {
  accountName: string;
  roleLabel: string;
  voiceEnabled: boolean;
  onExecuteAction: (action: VoiceAction, transcript: string) => Promise<string>;
  onOpenRooms: () => void;
  onOpenLivingRoom: () => void;
  onOpenBedroom: () => void;
  onOpenFamilySecurity: () => void;
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

export const VoiceAssistantView: React.FC<VoiceAssistantViewProps> = ({
  accountName,
  roleLabel,
  voiceEnabled,
  onExecuteAction,
  onOpenRooms,
  onOpenLivingRoom,
  onOpenBedroom,
  onOpenFamilySecurity,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [recognizedSpeech, setRecognizedSpeech] = useState('');
  const [interpretedAction, setInterpretedAction] = useState<VoiceAction | null>(
    null,
  );
  const [requiresDoorConfirm, setRequiresDoorConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [typedTranscript, setTypedTranscript] = useState('');

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

  const accountText = !accountName.trim()
    ? 'Signed-in account'
    : !roleLabel.trim()
      ? accountName
      : `${accountName} (${roleLabel})`;

  const statusText = !voiceEnabled
    ? 'Voice commands disabled for this account'
    : isListening
      ? 'Listening…'
      : isInterpreting
        ? 'Understanding your request…'
        : isExecuting
          ? 'Working on it…'
          : 'Tap the microphone to speak';

  const runInterpretation = async (rawText: string) => {
    const clean = rawText.trim();
    if (!clean) return;
    if (!voiceEnabled) {
      setError(
        `Voice commands are disabled for your account (${roleLabel}). Ask a household admin to enable voice access.`,
      );
      return;
    }

    setRecognizedSpeech(clean);
    setError(null);
    setActionResult(null);
    setInterpretedAction(null);
    setRequiresDoorConfirm(false);
    setIsInterpreting(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError('Sign in to use the voice assistant.');
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
        setError(data.error || `Could not interpret voice request (HTTP ${res.status}).`);
        return;
      }

      const action = data.action ?? 'unsupported';
      setInterpretedAction(action);
      const details = VOICE_ACTION_DETAILS[action];

      if (action === 'open_living_room') {
        onOpenLivingRoom();
        return;
      }
      if (action === 'open_bedroom') {
        onOpenBedroom();
        return;
      }
      if (action === 'unlock_door') {
        setError(details.description);
        return;
      }
      if (!details.isExecutable) {
        setError(details.description);
        return;
      }
      if (details.requiresConfirmation) {
        setRequiresDoorConfirm(true);
        return;
      }

      setIsExecuting(true);
      const summary = await onExecuteAction(action, clean);
      setActionResult(summary);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'AI assistant failed to process request.',
      );
    } finally {
      setIsInterpreting(false);
      setIsExecuting(false);
    }
  };

  const handleConfirmDoorLock = async () => {
    if (!interpretedAction) return;
    setIsExecuting(true);
    setError(null);
    try {
      const summary = await onExecuteAction(
        interpretedAction,
        recognizedSpeech,
      );
      setRequiresDoorConfirm(false);
      setActionResult(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleListenToggle = () => {
    if (!voiceEnabled) {
      setError(
        `Voice commands are disabled for your account (${roleLabel}). Ask a household admin to enable voice access.`,
      );
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
      setShowTextInput(true);
      setError(
        'Speech recognition is unavailable in this browser. Type a command below to test Gemini voice.',
      );
      return;
    }

    try {
      const recognition = new RecognitionCtor();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (ev) => {
        const text = ev.results[0]?.[0]?.transcript ?? '';
        setIsListening(false);
        if (text.trim()) {
          void runInterpretation(text);
        }
      };
      recognition.onerror = (ev) => {
        setIsListening(false);
        setShowTextInput(true);
        setError(
          ev.error === 'not-allowed'
            ? 'Microphone permission denied. Type a command below instead.'
            : `Speech recognition error (${ev.error ?? 'unknown'}). You can type a command below.`,
        );
      };
      recognition.onend = () => {
        setIsListening(false);
      };
      recognitionRef.current = recognition;
      setError(null);
      setIsListening(true);
      recognition.start();
    } catch {
      setIsListening(false);
      setShowTextInput(true);
      setError('Could not start speech recognition. Type a command below.');
    }
  };

  const handleClear = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    setIsInterpreting(false);
    setRecognizedSpeech('');
    setInterpretedAction(null);
    setRequiresDoorConfirm(false);
    setError(null);
    setActionResult(null);
  };

  const orbActive = isListening || isInterpreting;

  return (
    <div
      className="min-h-[calc(100vh-76px)] w-full text-white flex flex-col justify-between"
      style={{
        background:
          'linear-gradient(180deg, #0B1715 0%, #07100F 55%, #050807 100%)',
      }}
    >
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-3 max-w-[600px] w-full mx-auto flex flex-col items-center">
        <h1 className="text-[16px] font-semibold text-white">Voice assistant</h1>

        {/* Account Banner */}
        <div
          className="mt-2 w-full rounded-[14px] px-3 py-2.5 border"
          style={{
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderColor: voiceEnabled
              ? 'rgba(255,255,255,0.12)'
              : 'rgba(255,138,128,0.45)',
          }}
        >
          <div className="flex items-center gap-2">
            {voiceEnabled ? (
              <ShieldCheck className="w-4 h-4 text-[#73E6C7] shrink-0" />
            ) : (
              <MicOff className="w-4 h-4 text-[#FF8A80] shrink-0" />
            )}
            <span className="flex-1 text-[12px] font-semibold text-white truncate">
              Account: {accountText}
            </span>
            <button
              type="button"
              onClick={onOpenFamilySecurity}
              className="text-[12px] font-semibold text-[#73E6C7] px-2 py-0.5 hover:underline shrink-0"
            >
              Security
            </button>
          </div>
          <p className="mt-1 text-[11.5px] leading-[1.35] text-white/70">
            {voiceEnabled
              ? 'Commands are logged under your signed-in account. Speaker/voice-print identity verification is NOT implemented; door unlock via voice is disabled.'
              : 'A household admin disabled voice commands for this account. You can still review permissions in Security.'}
          </p>
        </div>

        {/* Teal Concentric Animated Voice Orb matching _VoiceOrb & _VoiceOrbPainter */}
        <div className="my-4 relative w-[230px] h-[230px] flex items-center justify-center">
          {[0, 1, 2, 3, 4].map((index) => {
            const diameter = 112 + index * 25;
            const opacity = Math.max(0.08, 0.32 - index * 0.045);
            return (
              <span
                key={index}
                className={`absolute rounded-full pointer-events-none transition-all duration-700 ${
                  orbActive ? 'animate-pulse' : ''
                }`}
                style={{
                  width: `${diameter}px`,
                  height: `${diameter}px`,
                  border: `${index === 0 ? 1.4 : 0.8}px solid ${
                    orbActive ? '#69F0CB' : '#36B99A'
                  }`,
                  opacity,
                }}
              />
            );
          })}

          <div
            className="relative w-[112px] h-[112px] rounded-full flex items-center justify-center border border-white/12 transition-transform duration-500"
            style={{
              background: 'radial-gradient(circle, #1E806D 0%, #0D302A 100%)',
              boxShadow: `0 0 38px 8px rgba(80, 214, 182, ${
                orbActive ? 0.42 : 0.22
              })`,
              transform: orbActive ? 'scale(1.04)' : 'scale(1)',
            }}
          >
            {/* Graphic EQ icon matching Icons.graphic_eq_rounded */}
            <svg
              viewBox="0 0 24 24"
              className="w-[54px] h-[54px] text-[#9CF7DF]"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="3" y="10" width="2" height="4" rx="1" />
              <rect x="7" y="6" width="2" height="12" rx="1" />
              <rect x="11" y="3" width="2" height="18" rx="1" />
              <rect x="15" y="6" width="2" height="12" rx="1" />
              <rect x="19" y="10" width="2" height="4" rx="1" />
            </svg>
          </div>
        </div>

        {/* Status Text */}
        <p className="text-[16px] font-medium text-white text-center">
          {statusText}
        </p>
        <p className="mt-2 text-[12px] text-white/60 text-center">
          Say “Open living room” or “Open bedroom”, or choose a room below.
        </p>

        {/* Living Room & Bedroom Buttons */}
        <div className="mt-2.5 w-full grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onOpenLivingRoom}
            className="h-10 rounded-full border border-white/30 text-white text-[13px] font-medium inline-flex items-center justify-center gap-2 hover:bg-white/10 transition"
          >
            <Sofa className="w-[18px] h-[18px]" />
            <span>Living Room</span>
          </button>
          <button
            type="button"
            onClick={onOpenBedroom}
            className="h-10 rounded-full border border-white/30 text-white text-[13px] font-medium inline-flex items-center justify-center gap-2 hover:bg-white/10 transition"
          >
            <Bed className="w-[18px] h-[18px]" />
            <span>Bedroom</span>
          </button>
        </div>

        {/* Assistant Responses / Messages */}
        {(recognizedSpeech || interpretedAction || error || actionResult) && (
          <div className="mt-3.5 w-full space-y-2.5">
            {recognizedSpeech && (
              <div
                className="w-full p-3.5 rounded-[16px] border"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.07)',
                  borderColor: 'rgba(255,255,255,0.1)',
                }}
              >
                <div className="text-[12px] font-bold text-[#73E6C7]">
                  I heard
                </div>
                <div className="mt-1 text-sm text-white">
                  “{recognizedSpeech}”
                </div>
              </div>
            )}

            {interpretedAction && (
              <div
                className="w-full p-3.5 rounded-[16px] border"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.07)',
                  borderColor: 'rgba(255,255,255,0.1)',
                }}
              >
                <div className="text-[12px] font-bold text-[#73E6C7]">
                  Requested action
                </div>
                <div className="mt-1 text-sm text-white">
                  {VOICE_ACTION_DETAILS[interpretedAction].description}
                </div>
              </div>
            )}

            {error && (
              <div
                className="w-full p-3.5 rounded-[16px] border"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.07)',
                  borderColor: 'rgba(255, 119, 119, 0.4)',
                }}
              >
                <div className="text-[12px] font-bold text-[#73E6C7]">
                  Could not complete
                </div>
                <div className="mt-1 text-sm text-[#FFA0A0]">{error}</div>
              </div>
            )}

            {actionResult && (
              <div
                className="w-full p-3.5 rounded-[16px] border"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.07)',
                  borderColor: 'rgba(255,255,255,0.1)',
                }}
              >
                <div className="text-[12px] font-bold text-[#73E6C7]">
                  Status
                </div>
                <div className="mt-1 text-sm text-white">{actionResult}</div>
              </div>
            )}

            {requiresDoorConfirm && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isExecuting}
                    onClick={handleConfirmDoorLock}
                    className="flex-1 h-10 rounded-full bg-[#73E6C7] text-[#06201A] font-semibold text-sm hover:brightness-105 disabled:opacity-50"
                  >
                    {isExecuting ? 'Working…' : 'Confirm and lock'}
                  </button>
                  <button
                    type="button"
                    disabled={isExecuting}
                    onClick={() => setRequiresDoorConfirm(false)}
                    className="h-10 px-4 rounded-full border border-white/30 text-white text-sm"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-[11px] text-white/60">
                  Voice commands cannot unlock the door.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Rooms Outlined Button */}
        <div className="mt-3">
          <button
            type="button"
            onClick={onOpenRooms}
            className="h-10 px-5 rounded-full border border-white/30 text-white text-[13px] font-medium inline-flex items-center gap-2 hover:bg-white/10 transition"
          >
            <DoorOpen className="w-[18px] h-[18px]" />
            <span>Rooms</span>
          </button>
        </div>

        {/* Optional Web Text-Command Fallback */}
        {showTextInput && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runInterpretation(typedTranscript);
              setTypedTranscript('');
            }}
            className="mt-3 w-full flex items-center gap-2"
          >
            <input
              type="text"
              value={typedTranscript}
              onChange={(e) => setTypedTranscript(e.target.value)}
              placeholder='Type voice command (e.g. "Turn on light")'
              className="flex-1 h-10 px-3.5 rounded-full bg-white/10 border border-white/20 text-xs text-white placeholder:text-white/45 focus:outline-none focus:border-[#73E6C7]"
            />
            <button
              type="submit"
              disabled={!typedTranscript.trim() || isInterpreting || isExecuting}
              className="h-10 px-4 rounded-full bg-[#73E6C7] text-[#06201A] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        )}
      </div>

      {/* Bottom Mic + Clear Row */}
      <div className="px-5 pt-1 pb-4 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => setShowTextInput((v) => !v)}
          title="Type a voice command"
          aria-label="Toggle keyboard input"
          className="w-10 h-10 rounded-full border border-white/15 text-white/50 hover:text-white hover:border-white/30 flex items-center justify-center transition"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        <button
          type="button"
          disabled={isExecuting || !voiceEnabled}
          onClick={handleListenToggle}
          title={
            !voiceEnabled
              ? 'Voice commands disabled for this account'
              : isListening
                ? 'Stop listening'
                : 'Start listening'
          }
          className="w-16 h-16 rounded-full bg-[#73E6C7] text-[#06201A] disabled:bg-white/12 disabled:text-white/38 flex items-center justify-center hover:brightness-105 active:scale-95 transition"
        >
          {!voiceEnabled ? (
            <MicOff className="w-7 h-7" />
          ) : isListening ? (
            <Square className="w-6 h-6 fill-current" />
          ) : (
            <Mic className="w-7 h-7" />
          )}
        </button>

        <button
          type="button"
          disabled={isExecuting}
          onClick={handleClear}
          title="Clear voice response"
          className="w-[52px] h-[52px] rounded-full border border-white/24 text-white/70 hover:text-white hover:border-white/40 flex items-center justify-center transition disabled:opacity-40"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
