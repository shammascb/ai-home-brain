import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Fan,
  Footprints,
  Info,
  LayoutGrid,
  Lightbulb,
  Lock,
  Moon,
  Play,
  Plus,
  RotateCcw,
  Shield,
  SkipForward,
  SlidersHorizontal,
  Sun,
  Wind,
  X,
  XCircle,
} from 'lucide-react';
import {
  AutomationRoutine,
  BinaryDeviceAction,
  DeviceState,
  DoorRoutineAction,
  ROUTINE_META,
  RoutineExecutionReport,
  RoutineId,
  SceneMode,
  defaultRoutineFor,
} from '../types/smartHome';
import { getOverallStatusLabel } from './RoutineExecutionModal';

interface AutomationsViewProps {
  routines: Record<RoutineId, AutomationRoutine>;
  activeModeLabel: SceneMode;
  deviceState: DeviceState;
  canRunAutomations: boolean;
  lastReport: RoutineExecutionReport | null;
  onBackToHome: () => void;
  onPreviewAndRun: (routine: AutomationRoutine) => void;
  onRoutineDenied: (routine: AutomationRoutine) => void;
  onSaveRoutine: (routine: AutomationRoutine) => Promise<void>;
  onResetRoutine: (id: RoutineId) => Promise<void>;
  onSubScreenChange?: (inSubScreen: boolean) => void;
}

function formatLightSummary(action: BinaryDeviceAction): string {
  if (action === 'turn_on') return 'Turn light ON';
  if (action === 'turn_off') return 'Turn light OFF';
  return 'Light unchanged';
}

function formatFanSummary(action: BinaryDeviceAction, speed: number): string {
  if (action === 'turn_on') return `Turn fan ON (${speed})`;
  if (action === 'turn_off') return 'Turn fan OFF';
  return 'Fan unchanged';
}

function formatDoorSummary(action: DoorRoutineAction): string {
  if (action === 'lock_with_safety_check') return 'Lock (safety check)';
  if (action === 'keep_locked') return 'Keep locked';
  return 'Door unchanged';
}

function routineSummaryText(r: AutomationRoutine): string {
  const parts = [
    ...(r.lightAction !== 'unchanged' ? [formatLightSummary(r.lightAction)] : []),
    ...(r.fanAction !== 'unchanged'
      ? [formatFanSummary(r.fanAction, r.fanSpeed)]
      : []),
    ...(r.doorAction !== 'unchanged' ? [formatDoorSummary(r.doorAction)] : []),
  ];
  return parts.length > 0 ? parts.join(', ') : 'Tap to add connected devices';
}

export const AutomationsView: React.FC<AutomationsViewProps> = ({
  routines,
  activeModeLabel,
  deviceState,
  canRunAutomations,
  lastReport,
  onBackToHome,
  onPreviewAndRun,
  onRoutineDenied,
  onSaveRoutine,
  onResetRoutine,
  onSubScreenChange,
}) => {
  const [subScreen, setSubScreen] = useState<'hero' | 'detail' | 'add_devices'>(
    'hero',
  );
  const [detailRoutineId, setDetailRoutineId] = useState<RoutineId>('sleep');
  const [quickPickerOpen, setQuickPickerOpen] = useState(false);
  const [latestReportOpen, setLatestReportOpen] = useState(false);

  // Sub-modals inside RoutineDetailScreen
  const [fanSheetOpen, setFanSheetOpen] = useState(false);
  const [draftFanAction, setDraftFanAction] =
    useState<BinaryDeviceAction>('turn_off');
  const [draftFanSpeed, setDraftFanSpeed] = useState(2);

  const [doorSheetOpen, setDoorSheetOpen] = useState(false);
  const [draftDoorAction, setDraftDoorAction] = useState<DoorRoutineAction>(
    'lock_with_safety_check',
  );
  const [draftRequireConfirm, setDraftRequireConfirm] = useState(true);

  // AddDevicesScreen state
  const [category, setCategory] = useState<
    'all' | 'lighting' | 'climate' | 'security'
  >('all');
  const [includeLight, setIncludeLight] = useState(true);
  const [includeFan, setIncludeFan] = useState(true);
  const [includeDoor, setIncludeDoor] = useState(true);
  const [savingDevices, setSavingDevices] = useState(false);

  useEffect(() => {
    onSubScreenChange?.(subScreen !== 'hero');
  }, [subScreen, onSubScreenChange]);

  useEffect(() => {
    return () => {
      onSubScreenChange?.(false);
    };
  }, [onSubScreenChange]);

  const routineIds: RoutineId[] = ['sleep', 'morning', 'away'];
  const detailRoutine = routines[detailRoutineId];

  const handleToggleSwitch = (routine: AutomationRoutine) => {
    if (!canRunAutomations) {
      onRoutineDenied(routine);
      return;
    }
    onPreviewAndRun(routine);
  };

  const openRoutineDetail = (id: RoutineId) => {
    setDetailRoutineId(id);
    setSubScreen('detail');
  };

  const openAddDevices = (routine: AutomationRoutine) => {
    setIncludeLight(routine.lightAction !== 'unchanged');
    setIncludeFan(routine.fanAction !== 'unchanged');
    setIncludeDoor(routine.doorAction !== 'unchanged');
    setCategory('all');
    setSubScreen('add_devices');
  };

  const handleSaveConnectedDevices = async () => {
    if (savingDevices) return;
    setSavingDevices(true);
    try {
      const defaults = defaultRoutineFor(detailRoutine.id);
      const nextLight: BinaryDeviceAction = includeLight
        ? detailRoutine.lightAction === 'unchanged'
          ? defaults.lightAction === 'unchanged'
            ? 'turn_off'
            : defaults.lightAction
          : detailRoutine.lightAction
        : 'unchanged';

      const nextFan: BinaryDeviceAction = includeFan
        ? detailRoutine.fanAction === 'unchanged'
          ? defaults.fanAction === 'unchanged'
            ? 'turn_off'
            : defaults.fanAction
          : detailRoutine.fanAction
        : 'unchanged';

      const nextDoor: DoorRoutineAction = includeDoor
        ? detailRoutine.doorAction === 'unchanged'
          ? defaults.doorAction === 'unchanged'
            ? 'lock_with_safety_check'
            : defaults.doorAction
          : detailRoutine.doorAction
        : 'unchanged';

      await onSaveRoutine({
        ...detailRoutine,
        lightAction: nextLight,
        fanAction: nextFan,
        doorAction: nextDoor,
      });
      setSubScreen('detail');
    } catch {
      // Error notice is handled by parent onSaveRoutine
    } finally {
      setSavingDevices(false);
    }
  };

  // ==================== ADD DEVICES SCREEN ====================
  if (subScreen === 'add_devices') {
    const catalog = [
      {
        type: 'light' as const,
        category: 'lighting' as const,
        title: 'Smart Light',
        subtitle: 'Living room · LED control',
        imageAsset: '/src/assets/images/welcome_living_room.jpg',
        selected: includeLight,
        toggle: () => setIncludeLight((v) => !v),
        icon: Lightbulb,
      },
      {
        type: 'fan' as const,
        category: 'climate' as const,
        title: 'Bedroom Fan',
        subtitle: 'Bedroom · Power & Speed 1–5',
        imageAsset: '/src/assets/images/bedroom.jpg',
        selected: includeFan,
        toggle: () => setIncludeFan((v) => !v),
        icon: Fan,
      },
      {
        type: 'door' as const,
        category: 'security' as const,
        title: 'Front Door Lock',
        subtitle: 'Front entry · Safety checked',
        imageAsset: null,
        selected: includeDoor,
        toggle: () => setIncludeDoor((v) => !v),
        icon: Lock,
      },
    ];

    const visible =
      category === 'all'
        ? catalog
        : catalog.filter((item) => item.category === category);
    const selectedCount = [includeLight, includeFan, includeDoor].filter(
      Boolean,
    ).length;

    const categoryTiles = [
      { id: 'all' as const, label: 'All devices', icon: LayoutGrid },
      { id: 'lighting' as const, label: 'Lighting', icon: Lightbulb },
      { id: 'climate' as const, label: 'Climate', icon: Wind },
      { id: 'security' as const, label: 'Security', icon: Shield },
    ];

    return (
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#101113] text-[#111315] dark:text-[#F4F5F6] flex flex-col">
        <div className="max-w-[920px] w-full mx-auto flex-1 flex flex-col">
          <div className="px-5 pt-3 pb-2">
            <button
              type="button"
              disabled={savingDevices}
              onClick={() => setSubScreen('detail')}
              title="Back"
              className="w-11 h-11 rounded-full bg-black/8 dark:bg-white/10 flex items-center justify-center hover:bg-black/14 dark:hover:bg-white/15 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <h1 className="mt-[18px] text-[28px] font-bold tracking-[-0.6px]">
              Add your devices
            </h1>
            <p className="mt-1 text-[14px] text-neutral-500 dark:text-[#C4C6CF]">
              Select which smart devices participate in{' '}
              {ROUTINE_META[detailRoutine.id].title}.
            </p>

            {/* Category filter tiles */}
            <div className="mt-[18px] flex gap-2.5 overflow-x-auto pb-1">
              {categoryTiles.map((tile) => {
                const Icon = tile.icon;
                const active = category === tile.id;
                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => setCategory(tile.id)}
                    className={`min-w-[88px] min-h-[72px] px-3.5 py-2.5 rounded-[14px] flex flex-col items-center justify-center gap-1.5 shrink-0 transition ${
                      active
                        ? 'bg-[#FF5A00] text-white'
                        : 'bg-[#F1F2F4] dark:bg-[#1C1E22] text-neutral-600 dark:text-[#C4C6CF]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] font-semibold">
                      {tile.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Device catalog grid */}
          <div className="flex-1 px-5 pt-3 pb-6 grid grid-cols-2 md:grid-cols-3 gap-3.5 content-start">
            {visible.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={item.toggle}
                  className={`rounded-[20px] p-3.5 bg-[#F1F2F4] dark:bg-[#1C1E22] text-left flex flex-col justify-between min-h-[210px] transition border ${
                    item.selected
                      ? 'border-[1.5px] border-[#FF5A00]'
                      : 'border-black/10 dark:border-white/10'
                  }`}
                >
                  <div className="flex justify-end w-full">
                    <span
                      className={`w-6 h-6 rounded-[7px] flex items-center justify-center border transition ${
                        item.selected
                          ? 'bg-[#FF5A00] border-[#FF5A00] text-white'
                          : 'bg-white dark:bg-[#101113] border-black/20 dark:border-white/25'
                      }`}
                    >
                      {item.selected && <Check className="w-4 h-4 stroke-[2.5]" />}
                    </span>
                  </div>

                  <div className="flex items-center justify-center py-3">
                    {item.imageAsset ? (
                      <div className="relative w-[84px] h-[84px] rounded-[14px] overflow-hidden flex items-center justify-center">
                        <img
                          src={item.imageAsset}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/28" />
                        <Icon className="relative w-8 h-8 text-white" />
                      </div>
                    ) : (
                      <div className="w-[72px] h-[72px] rounded-full bg-white dark:bg-[#101113] flex items-center justify-center">
                        <Icon
                          className={`w-8 h-8 ${
                            item.selected
                              ? 'text-[#FF5A00]'
                              : 'text-neutral-500 dark:text-[#C4C6CF]'
                          }`}
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[14px] font-bold truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5 truncate">
                      {item.subtitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bottom Save Button */}
          <div className="px-5 pt-3 pb-5 border-t border-black/10 dark:border-white/10">
            <button
              type="button"
              disabled={savingDevices}
              onClick={handleSaveConnectedDevices}
              className="w-full h-[50px] rounded-[14px] bg-[#FF5A00] text-white text-[15px] font-bold hover:brightness-105 disabled:opacity-50 transition"
            >
              {savingDevices
                ? 'Saving devices…'
                : `Save Connected Devices (${selectedCount})`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== ROUTINE DETAIL SCREEN ====================
  if (subScreen === 'detail') {
    const meta = ROUTINE_META[detailRoutine.id];
    const matchingReport =
      lastReport?.routineId === detailRoutine.id ? lastReport : null;
    const hasLight = detailRoutine.lightAction !== 'unchanged';
    const hasFan = detailRoutine.fanAction !== 'unchanged';
    const hasDoor = detailRoutine.doorAction !== 'unchanged';
    const noDevices = !hasLight && !hasFan && !hasDoor;

    return (
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#101113] text-[#111315] dark:text-[#F4F5F6] flex flex-col">
        <div className="max-w-[920px] w-full mx-auto flex-1 flex flex-col">
          <div className="flex-1 px-5 pt-3 pb-6">
            {/* Top row */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSubScreen('hero')}
                title="Back"
                className="w-11 h-11 rounded-full bg-black/8 dark:bg-white/10 flex items-center justify-center hover:bg-black/14 dark:hover:bg-white/15 transition"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => void onResetRoutine(detailRoutine.id)}
                className="h-9 px-3 rounded-full text-[13px] font-semibold text-[#D9821E] dark:text-[#F3A64A] inline-flex items-center gap-1.5 hover:bg-[#F3A64A]/10 transition"
              >
                <RotateCcw className="w-[18px] h-[18px]" />
                <span>Reset default</span>
              </button>
            </div>

            <h1 className="mt-[18px] text-[28px] font-bold tracking-[-0.6px]">
              {meta.title}
            </h1>
            <p className="mt-1 text-[14px] text-neutral-500 dark:text-[#C4C6CF]">
              {meta.subtitle}
            </p>

            {/* Connected devices header + orange + button */}
            <div className="mt-[22px] flex items-center justify-between">
              <h2 className="text-[16px] font-semibold">Connected devices</h2>
              <button
                type="button"
                title="Add your devices"
                onClick={() => openAddDevices(detailRoutine)}
                className="w-11 h-11 rounded-full bg-[#FF5A00] text-white flex items-center justify-center hover:brightness-105 transition"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Connected device tiles or empty state */}
            <div className="mt-3.5">
              {noDevices ? (
                <div className="rounded-[18px] bg-[#F1F2F4] dark:bg-[#1C1E22] p-5 flex flex-col items-center text-center gap-2.5">
                  <Cpu className="w-8 h-8 text-neutral-500 dark:text-[#C4C6CF]" />
                  <p className="text-[14px] font-semibold">
                    No devices selected for this routine yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => openAddDevices(detailRoutine)}
                    className="h-10 px-4 rounded-full bg-[#FF5A00] text-white text-[13px] font-semibold inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add devices</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {hasLight && (
                    <div
                      onClick={() =>
                        void onSaveRoutine({
                          ...detailRoutine,
                          lightAction:
                            detailRoutine.lightAction === 'turn_on'
                              ? 'turn_off'
                              : 'turn_on',
                        })
                      }
                      className="rounded-[20px] bg-[#F1F2F4] dark:bg-[#1C1E22] p-3.5 cursor-pointer hover:ring-1 hover:ring-[#FF5A00]/40 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-full bg-white dark:bg-[#2A2D33] flex items-center justify-center">
                          <Lightbulb className="w-5 h-5" />
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={detailRoutine.lightAction === 'turn_on'}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onSaveRoutine({
                              ...detailRoutine,
                              lightAction:
                                detailRoutine.lightAction === 'turn_on'
                                  ? 'turn_off'
                                  : 'turn_on',
                            });
                          }}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            detailRoutine.lightAction === 'turn_on'
                              ? 'bg-black dark:bg-[#F3A64A]'
                              : 'bg-neutral-300 dark:bg-white/15'
                          }`}
                        >
                          <span
                            className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              detailRoutine.lightAction === 'turn_on'
                                ? 'translate-x-6'
                                : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                      <div className="mt-4 text-[14px] font-bold truncate">
                        Smart Light
                      </div>
                      <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5 truncate">
                        {detailRoutine.lightAction === 'turn_on'
                          ? 'Living room · Turn ON'
                          : 'Living room · Turn OFF'}
                      </div>
                    </div>
                  )}

                  {hasFan && (
                    <div
                      onClick={() => {
                        setDraftFanAction(detailRoutine.fanAction);
                        setDraftFanSpeed(detailRoutine.fanSpeed);
                        setFanSheetOpen(true);
                      }}
                      className="rounded-[20px] bg-[#F1F2F4] dark:bg-[#1C1E22] p-3.5 cursor-pointer hover:ring-1 hover:ring-[#FF5A00]/40 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-full bg-white dark:bg-[#2A2D33] flex items-center justify-center">
                          <Fan className="w-5 h-5" />
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={detailRoutine.fanAction === 'turn_on'}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onSaveRoutine({
                              ...detailRoutine,
                              fanAction:
                                detailRoutine.fanAction === 'turn_on'
                                  ? 'turn_off'
                                  : 'turn_on',
                            });
                          }}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            detailRoutine.fanAction === 'turn_on'
                              ? 'bg-black dark:bg-[#F3A64A]'
                              : 'bg-neutral-300 dark:bg-white/15'
                          }`}
                        >
                          <span
                            className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              detailRoutine.fanAction === 'turn_on'
                                ? 'translate-x-6'
                                : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                      <div className="mt-4 text-[14px] font-bold truncate">
                        Bedroom Fan
                      </div>
                      <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5 truncate">
                        {detailRoutine.fanAction === 'turn_on'
                          ? `Bedroom · ON (Speed ${detailRoutine.fanSpeed})`
                          : 'Bedroom · Turn OFF'}
                      </div>
                    </div>
                  )}

                  {hasDoor && (
                    <div
                      onClick={() => {
                        setDraftDoorAction(detailRoutine.doorAction);
                        setDraftRequireConfirm(
                          detailRoutine.requireSafetyConfirmation,
                        );
                        setDoorSheetOpen(true);
                      }}
                      className="rounded-[20px] bg-[#F1F2F4] dark:bg-[#1C1E22] p-3.5 cursor-pointer hover:ring-1 hover:ring-[#FF5A00]/40 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-full bg-white dark:bg-[#2A2D33] flex items-center justify-center">
                          <Lock className="w-5 h-5" />
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={true}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDraftDoorAction(detailRoutine.doorAction);
                            setDraftRequireConfirm(
                              detailRoutine.requireSafetyConfirmation,
                            );
                            setDoorSheetOpen(true);
                          }}
                          className="relative w-11 h-6 rounded-full bg-black dark:bg-[#F3A64A] transition-colors"
                        >
                          <span className="block w-4 h-4 rounded-full bg-white shadow translate-x-6" />
                        </button>
                      </div>
                      <div className="mt-4 text-[14px] font-bold truncate">
                        Front Door Lock
                      </div>
                      <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5 truncate">
                        {detailRoutine.doorAction === 'keep_locked'
                          ? 'Front entry · Keep locked'
                          : 'Front entry · Safety lock'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {matchingReport && (
              <div className="mt-6 space-y-2.5">
                <h3 className="text-[14px] font-bold">Last Execution Status</h3>
                <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-white/10 p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-[13px] font-bold text-[#D9821E] dark:text-[#F3A64A]">
                    <CheckCircle2 className="w-[18px] h-[18px]" />
                    <span>Status: {getOverallStatusLabel(matchingReport)}</span>
                  </div>
                  {matchingReport.steps.map((step) => (
                    <p
                      key={step.deviceLabel}
                      className="text-[12px] text-neutral-600 dark:text-[#C4C6CF]"
                    >
                      {step.deviceLabel} · {step.message}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sticky Bottom Button */}
          <div className="px-5 pt-3 pb-5 border-t border-black/10 dark:border-white/10">
            <button
              type="button"
              onClick={() => handleToggleSwitch(detailRoutine)}
              className="w-full h-[50px] rounded-[14px] bg-[#FF5A00] text-white text-[15px] font-bold inline-flex items-center justify-center gap-2 hover:brightness-105 transition"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Preview &amp; Execute Routine</span>
            </button>
          </div>
        </div>

        {/* Bedroom Fan Configuration Sheet */}
        {fanSheetOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setFanSheetOpen(false)}
          >
            <div
              className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] bg-white dark:bg-[#1C1E22] p-5 pb-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-9 h-1 rounded-full bg-neutral-400/40 mx-auto sm:hidden" />
              <h3 className="text-[20px] font-bold">
                Bedroom Fan Configuration
              </h3>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[15px] font-medium">
                    Turn fan ON during routine
                  </div>
                  <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                    {draftFanAction === 'turn_on'
                      ? `Turns fan ON at speed ${draftFanSpeed}`
                      : 'Turns fan OFF'}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draftFanAction === 'turn_on'}
                  onClick={() =>
                    setDraftFanAction(
                      draftFanAction === 'turn_on' ? 'turn_off' : 'turn_on',
                    )
                  }
                  className={`relative w-12 h-7 rounded-full transition-colors ${
                    draftFanAction === 'turn_on'
                      ? 'bg-[#FF5A00]'
                      : 'bg-neutral-300 dark:bg-white/15'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      draftFanAction === 'turn_on'
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {draftFanAction === 'turn_on' && (
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-semibold shrink-0 tabular-nums">
                    Target speed: {draftFanSpeed} of 5
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={draftFanSpeed}
                    onChange={(e) => setDraftFanSpeed(Number(e.target.value))}
                    className="flex-1 accent-[#FF5A00]"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={async () => {
                  try {
                    await onSaveRoutine({
                      ...detailRoutine,
                      fanAction: draftFanAction,
                      fanSpeed: draftFanSpeed,
                    });
                    setFanSheetOpen(false);
                  } catch {
                    // Error notice is handled by parent onSaveRoutine
                  }
                }}
                className="w-full h-[46px] rounded-full bg-[#F3A64A] text-[#101113] text-[14px] font-bold"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {/* Front Door Safety Settings Sheet */}
        {doorSheetOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setDoorSheetOpen(false)}
          >
            <div
              className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] bg-white dark:bg-[#1C1E22] p-5 pb-6 space-y-3.5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-9 h-1 rounded-full bg-neutral-400/40 mx-auto sm:hidden" />
              <h3 className="text-[20px] font-bold">
                Front Door Safety Settings
              </h3>
              <p className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                Routines never unlock the front door.
              </p>

              <div className="space-y-2">
                <label className="flex items-start gap-3 py-1 cursor-pointer">
                  <input
                    type="radio"
                    name="doorPolicy"
                    checked={draftDoorAction === 'lock_with_safety_check'}
                    onChange={() =>
                      setDraftDoorAction('lock_with_safety_check')
                    }
                    className="mt-1 accent-[#FF5A00]"
                  />
                  <div>
                    <div className="text-[14px] font-medium">
                      Lock after safety checks
                    </div>
                    <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                      Verifies sensor closed before locking
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 py-1 cursor-pointer">
                  <input
                    type="radio"
                    name="doorPolicy"
                    checked={draftDoorAction === 'keep_locked'}
                    onChange={() => setDraftDoorAction('keep_locked')}
                    className="mt-1 accent-[#FF5A00]"
                  />
                  <div>
                    <div className="text-[14px] font-medium">
                      Keep the door locked
                    </div>
                    <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                      Verifies door remains locked safely
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-[14px]">
                  Require safety confirmation prompt
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draftRequireConfirm}
                  onClick={() => setDraftRequireConfirm((v) => !v)}
                  className={`relative w-12 h-7 rounded-full transition-colors ${
                    draftRequireConfirm
                      ? 'bg-[#FF5A00]'
                      : 'bg-neutral-300 dark:bg-white/15'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      draftRequireConfirm ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <button
                type="button"
                onClick={async () => {
                  try {
                    await onSaveRoutine({
                      ...detailRoutine,
                      doorAction: draftDoorAction,
                      requireSafetyConfirmation: draftRequireConfirm,
                    });
                    setDoorSheetOpen(false);
                  } catch {
                    // Error notice is handled by parent onSaveRoutine
                  }
                }}
                className="w-full h-[46px] rounded-full bg-[#F3A64A] text-[#101113] text-[14px] font-bold"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== MAIN HERO AUTOMATIONS SCREEN ====================
  return (
    <div className="relative min-h-[calc(100vh-80px)] w-full overflow-hidden flex flex-col">
      {/* Background image + 3-stop gradient overlay */}
      <img
        src="/src/assets/images/welcome_living_room.jpg"
        alt="Smart living space"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.52) 50%, rgba(0,0,0,0.88) 100%)',
        }}
      />

      <div className="relative z-10 max-w-[960px] w-full mx-auto flex-1 px-5 sm:px-8 pt-3.5 pb-5 flex flex-col justify-between">
        {/* Top Row: Back to Home + Latest Execution Report */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            title="Back to Home"
            onClick={onBackToHome}
            className="w-11 h-11 rounded-full bg-white text-black/85 flex items-center justify-center shadow hover:bg-neutral-100 transition shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {lastReport && (
            <button
              type="button"
              onClick={() => setLatestReportOpen(true)}
              className="min-w-0 px-3.5 py-2.5 rounded-[22px] bg-white/16 text-white text-[13px] font-semibold inline-flex items-center gap-2 hover:bg-white/24 transition"
            >
              <Info className="w-[18px] h-[18px] shrink-0" />
              <span className="truncate max-w-[200px] sm:max-w-none">
                {lastReport.routineTitle}: {getOverallStatusLabel(lastReport)}
              </span>
            </button>
          )}
        </div>

        {/* Center Hero Copy */}
        <div className="my-auto py-5">
          <div className="text-[14px] font-medium text-white/80">
            Smart Routines
          </div>
          <h1 className="mt-2 text-[32px] sm:text-[36px] font-semibold text-white leading-[1.12] tracking-[-0.8px]">
            Control your home
            <br />
            comfortably
          </h1>
          <p className="mt-3 max-w-[460px] text-[14px] text-white/80 leading-[1.45]">
            Tap a routine card to customize connected devices, or toggle the
            switch to preview actions and run safely.
          </p>
          <p className="mt-3 text-[12px] font-medium text-white/72 tabular-nums">
            Light {deviceState.lightOn ? 'ON' : 'OFF'} · Fan{' '}
            {deviceState.fanOn ? `ON (Speed ${deviceState.fanSpeed})` : 'OFF'} ·
            Door {deviceState.doorLocked ? 'Locked' : 'Unlocked'} (
            {deviceState.doorOpen ? 'Open' : 'Closed'})
          </p>
        </div>

        {/* Bottom Translucent Routine Cards + Dashed '+' Tile */}
        <div className="flex gap-3 overflow-x-auto pb-1">
          {routineIds.map((id) => {
            const routine = routines[id];
            const meta = ROUTINE_META[id];
            const isActive = activeModeLabel === meta.modeLabel;
            return (
              <div
                key={id}
                onClick={() => openRoutineDetail(id)}
                className={`w-[212px] md:flex-1 h-[162px] shrink-0 rounded-[22px] p-3.5 backdrop-blur-md flex flex-col justify-between cursor-pointer transition ${
                  isActive
                    ? 'bg-white/92 hover:bg-white/95'
                    : 'bg-white/78 hover:bg-white/88'
                }`}
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleSwitch(routine);
                    }}
                    className={`relative w-12 h-7 rounded-full transition-colors ${
                      isActive ? 'bg-[#FF5A00]' : 'bg-black/85'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        isActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <SlidersHorizontal className="w-[18px] h-[18px] text-black/55" />
                </div>

                <div>
                  <div className="text-[16px] font-bold text-black/88 truncate">
                    {meta.title}
                  </div>
                  <div className="mt-1 text-[12px] text-black/65 leading-[1.3] line-clamp-2">
                    {routineSummaryText(routine)}
                  </div>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setQuickPickerOpen(true)}
            title="Customize routine devices"
            className="w-[92px] md:w-[96px] h-[162px] shrink-0 rounded-[22px] border-[1.4px] border-dashed border-white/42 bg-white/8 hover:bg-white/15 flex items-center justify-center text-white transition"
          >
            <Plus className="w-7 h-7" />
          </button>
        </div>
      </div>

      {/* Customize a Routine Picker Sheet */}
      {quickPickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setQuickPickerOpen(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] bg-white dark:bg-[#1C1E22] p-5 pb-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-full bg-neutral-400/40 mx-auto sm:hidden" />
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-bold">Customize a Routine</h3>
              <button
                type="button"
                onClick={() => setQuickPickerOpen(false)}
                className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
              Choose which routine to configure or add devices to.
            </p>

            <div className="space-y-1 pt-1">
              {routineIds.map((id) => {
                const routine = routines[id];
                const meta = ROUTINE_META[id];
                const Icon =
                  id === 'sleep' ? Moon : id === 'morning' ? Sun : Footprints;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setQuickPickerOpen(false);
                      openRoutineDetail(id);
                    }}
                    className="w-full py-2.5 flex items-center gap-3 text-left rounded-xl hover:bg-black/5 dark:hover:bg-white/5 px-1 transition"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#FF5A00]/14 text-[#FF5A00] flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-bold">{meta.title}</div>
                      <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] truncate">
                        {formatLightSummary(routine.lightAction)} ·{' '}
                        {formatFanSummary(routine.fanAction, routine.fanSpeed)}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-neutral-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Latest Execution Status Sheet */}
      {latestReportOpen && lastReport && (
        <div
          className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setLatestReportOpen(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] bg-white dark:bg-[#1C1E22] p-5 pb-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[20px] font-bold">Latest Execution Status</h3>
              <span className="text-[12px] font-bold text-[#D9821E] dark:text-[#F3A64A]">
                {getOverallStatusLabel(lastReport)}
              </span>
            </div>
            <p className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
              {lastReport.routineTitle}
            </p>
            <div className="space-y-2.5 pt-1">
              {lastReport.steps.map((step) => {
                const Icon =
                  step.status === 'completed'
                    ? CheckCircle2
                    : step.status === 'verified'
                      ? CheckCircle2
                      : step.status === 'skipped'
                        ? SkipForward
                        : XCircle;
                return (
                  <div
                    key={step.deviceLabel}
                    className="flex items-start gap-2.5 text-[14px]"
                  >
                    <Icon className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>
                      {step.deviceLabel}: {step.message}
                    </span>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setLatestReportOpen(false)}
              className="w-full h-11 rounded-full bg-[#F3A64A] text-[#101113] text-[14px] font-bold mt-2"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
