import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DoorClosed,
  Fan,
  Info,
  Lightbulb,
  Play,
  ShieldCheck,
  SkipForward,
  XCircle,
} from 'lucide-react';
import { planRoutineActions } from '../lib/routineExecutor';
import {
  AutomationRoutine,
  DeviceState,
  ROUTINE_META,
  RoutineExecutionReport,
  StepCompletionStatus,
} from '../types/smartHome';

export function getOverallStatusLabel(report: RoutineExecutionReport): string {
  const hasFailures = report.steps.some((s) => s.status === 'failed');
  const hasSkipped = report.steps.some((s) => s.status === 'skipped');
  if (hasFailures) return 'Completed with errors';
  if (hasSkipped) return 'Completed with skipped steps';
  return 'All completed';
}

interface RoutineExecutionModalProps {
  routine: AutomationRoutine;
  deviceState: DeviceState;
  onExecute: (
    routine: AutomationRoutine,
    doorSafetyConfirmed: boolean,
  ) => Promise<RoutineExecutionReport>;
  onClose: (report?: RoutineExecutionReport) => void;
}

export const RoutineExecutionModal: React.FC<RoutineExecutionModalProps> = ({
  routine,
  deviceState,
  onExecute,
  onClose,
}) => {
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [report, setReport] = useState<RoutineExecutionReport | null>(null);

  const meta = ROUTINE_META[routine.id];
  const plannedActions = planRoutineActions(routine, deviceState);
  const needsConfirmation = plannedActions.some((p) => p.needsConfirmation);
  const hasBlockedDoor = plannedActions.some((p) => p.isSafetyBlocked);

  const handleExecute = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setExecError(null);
    try {
      const result = await onExecute(routine, safetyConfirmed);
      setReport(result);
    } catch (err) {
      setExecError(
        err instanceof Error
          ? err.message
          : 'Routine execution failed. Please try again.',
      );
    } finally {
      setIsExecuting(false);
    }
  };

  if (report) {
    const hasFailures = report.steps.some((s) => s.status === 'failed');
    const hasSkipped = report.steps.some((s) => s.status === 'skipped');
    const overallColor = hasFailures
      ? 'text-rose-500'
      : hasSkipped
        ? 'text-amber-500'
        : 'text-emerald-500';
    const overallBg = hasFailures
      ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
      : hasSkipped
        ? 'bg-amber-500/12 text-amber-600 dark:text-amber-400'
        : 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400';

    const stepBadge = (status: StepCompletionStatus) => {
      if (status === 'completed') {
        return {
          label: 'Completed',
          text: 'text-emerald-600 dark:text-emerald-400',
          bg: 'bg-emerald-500/14',
          border: 'border-emerald-500/35',
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
        };
      }
      if (status === 'verified') {
        return {
          label: 'Verified',
          text: 'text-[#D9821E] dark:text-[#F3A64A]',
          bg: 'bg-[#F3A64A]/14',
          border: 'border-[#F3A64A]/35',
          icon: (
            <ShieldCheck className="w-5 h-5 text-[#D9821E] dark:text-[#F3A64A] shrink-0" />
          ),
        };
      }
      if (status === 'skipped') {
        return {
          label: 'Skipped',
          text: 'text-amber-600 dark:text-amber-400',
          bg: 'bg-amber-500/14',
          border: 'border-amber-500/35',
          icon: <SkipForward className="w-5 h-5 text-amber-500 shrink-0" />,
        };
      }
      return {
        label: 'Failed',
        text: 'text-rose-600 dark:text-rose-400',
        bg: 'bg-rose-500/14',
        border: 'border-rose-500/35',
        icon: <XCircle className="w-5 h-5 text-rose-500 shrink-0" />,
      };
    };

    return (
      <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="max-w-[480px] w-full rounded-[24px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-white/10 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center gap-2.5">
            {hasFailures ? (
              <XCircle className={`w-6 h-6 shrink-0 ${overallColor}`} />
            ) : hasSkipped ? (
              <Info className={`w-6 h-6 shrink-0 ${overallColor}`} />
            ) : (
              <CheckCircle2 className={`w-6 h-6 shrink-0 ${overallColor}`} />
            )}
            <h2 className="text-[20px] font-semibold">
              {report.routineTitle} Status
            </h2>
          </div>

          <div
            className={`w-full px-3 py-2.5 rounded-[12px] text-[13px] font-bold ${overallBg}`}
          >
            Overall status: {getOverallStatusLabel(report)}
          </div>

          <div className="space-y-2.5">
            {report.steps.map((step) => {
              const b = stepBadge(step.status);
              return (
                <div
                  key={step.deviceLabel}
                  className={`p-3 rounded-[12px] bg-black/5 dark:bg-white/5 border ${b.border} flex items-start gap-2.5`}
                >
                  {b.icon}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-bold">
                        {step.deviceLabel}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-[8px] text-[11px] font-bold ${b.bg} ${b.text}`}
                      >
                        {b.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-neutral-600 dark:text-[#C4C6CF]">
                      {step.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => onClose(report)}
              className="h-10 px-5 rounded-full bg-[#F3A64A] text-[#101113] text-[14px] font-semibold hover:brightness-105 transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="max-w-[480px] w-full rounded-[24px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-white/10 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-[20px] font-semibold">Preview {meta.title}</h2>
        <p className="text-[14px] text-neutral-600 dark:text-[#C4C6CF]">
          Review the actions below before execution:
        </p>

        <div className="space-y-2.5">
          {plannedActions.map((plan) => {
            const Icon = plan.deviceLabel.toLowerCase().includes('light')
              ? Lightbulb
              : plan.deviceLabel.toLowerCase().includes('fan')
                ? Fan
                : DoorClosed;
            return (
              <div
                key={plan.deviceLabel}
                className={`p-3 rounded-[12px] border flex items-start gap-2.5 ${
                  plan.isSafetyBlocked
                    ? 'bg-rose-500/10 border-rose-500/45'
                    : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/15'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    plan.isSafetyBlocked
                      ? 'text-rose-500'
                      : 'text-[#D9821E] dark:text-[#F3A64A]'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-[14px] font-bold">
                    {plan.deviceLabel}: {plan.actionLabel}
                  </div>
                  <div className="text-[12px] text-neutral-600 dark:text-[#C4C6CF] mt-0.5">
                    {plan.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {hasBlockedDoor && (
          <div className="p-3 rounded-[12px] bg-rose-500/15 border border-rose-500/35 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-[12px] text-rose-700 dark:text-rose-200 leading-relaxed">
              Door sensor reports the front door is OPEN. For safety, the door
              lock step will be skipped unless the door is closed first.
            </p>
          </div>
        )}

        {needsConfirmation && (
          <label className="flex items-start gap-3 p-3 rounded-[12px] bg-black/5 dark:bg-white/5 border border-black/15 dark:border-white/15 cursor-pointer">
            <input
              type="checkbox"
              checked={safetyConfirmed}
              disabled={isExecuting}
              onChange={(e) => setSafetyConfirmed(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[#F3A64A]"
            />
            <div>
              <div className="text-[14px] font-semibold">
                Confirm safety check before locking door
              </div>
              <div className="text-[12px] text-neutral-600 dark:text-[#C4C6CF] mt-0.5">
                I confirm the front door area is clear and it is safe to lock
                the door. (If unchecked, door locking is skipped.)
              </div>
            </div>
          </label>
        )}

        {execError && (
          <div
            role="alert"
            className="p-3 rounded-[12px] bg-rose-500/15 border border-rose-500/35 flex items-start gap-2"
          >
            <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-[12px] text-rose-700 dark:text-rose-200 leading-relaxed">
              {execError}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={isExecuting}
            onClick={() => onClose()}
            className="h-10 px-4 rounded-full text-[14px] font-medium hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isExecuting}
            onClick={handleExecute}
            className="h-10 px-5 rounded-full bg-[#F3A64A] text-[#101113] text-[14px] font-semibold inline-flex items-center gap-1.5 hover:brightness-105 disabled:opacity-40 transition"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{isExecuting ? 'Running…' : 'Execute Routine'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
