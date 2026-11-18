import {
  AutomationRoutine,
  DeviceState,
  PlannedRoutineAction,
  ROUTINE_META,
  RoutineExecutionReport,
  RoutineStepResult,
} from '../types/smartHome';

export function planRoutineActions(
  routine: AutomationRoutine,
  state: DeviceState,
): PlannedRoutineAction[] {
  const actions: PlannedRoutineAction[] = [];

  if (routine.lightAction === 'turn_on') {
    actions.push({
      deviceLabel: 'Living Room Light',
      actionLabel: 'Turn ON',
      detail: state.lightOn ? 'Already ON (will verify)' : 'Will switch ON',
    });
  } else if (routine.lightAction === 'turn_off') {
    actions.push({
      deviceLabel: 'Living Room Light',
      actionLabel: 'Turn OFF',
      detail: state.lightOn ? 'Will switch OFF' : 'Already OFF (will verify)',
    });
  } else {
    actions.push({
      deviceLabel: 'Living Room Light',
      actionLabel: 'Unchanged',
      detail: `Stays ${state.lightOn ? 'ON' : 'OFF'}`,
    });
  }

  if (routine.fanAction === 'turn_on') {
    actions.push({
      deviceLabel: 'Bedroom Fan',
      actionLabel: `Turn ON (Speed ${routine.fanSpeed}/5)`,
      detail: `Set speed to ${routine.fanSpeed} of 5`,
    });
  } else if (routine.fanAction === 'turn_off') {
    actions.push({
      deviceLabel: 'Bedroom Fan',
      actionLabel: 'Turn OFF',
      detail: state.fanOn ? 'Will switch OFF' : 'Already OFF',
    });
  } else {
    actions.push({
      deviceLabel: 'Bedroom Fan',
      actionLabel: 'Unchanged',
      detail: `Stays ${state.fanOn ? `ON · Speed ${state.fanSpeed}` : 'OFF'}`,
    });
  }

  if (routine.doorAction === 'unchanged') {
    actions.push({
      deviceLabel: 'Front Entry Door',
      actionLabel: 'Unchanged',
      detail: `Remains ${state.doorLocked ? 'Locked' : 'Unlocked'}`,
    });
  } else if (state.doorOpen) {
    actions.push({
      deviceLabel: 'Front Entry Door',
      actionLabel: 'Safety Block',
      detail: 'Door sensor is OPEN — cannot lock automatically until closed.',
      isSafetyBlocked: true,
    });
  } else if (state.doorLocked) {
    actions.push({
      deviceLabel: 'Front Entry Door',
      actionLabel: 'Verify Locked',
      detail: 'Door is closed and already locked.',
    });
  } else {
    actions.push({
      deviceLabel: 'Front Entry Door',
      actionLabel: 'Lock Door',
      detail: routine.requireSafetyConfirmation
        ? 'Requires safety confirmation before locking.'
        : 'Will lock front door.',
      needsConfirmation: routine.requireSafetyConfirmation,
    });
  }

  return actions;
}

export interface RoutineDeviceController {
  getState: () => DeviceState;
  setLight: (isOn: boolean) => Promise<void>;
  setFan: (isOn: boolean) => Promise<void>;
  setFanSpeed: (speed: number) => Promise<void>;
  setDoorLocked: (isLocked: boolean) => Promise<void>;
}

export async function executeAutomationRoutine(
  routine: AutomationRoutine,
  controller: RoutineDeviceController,
  doorSafetyConfirmed: boolean,
): Promise<RoutineExecutionReport> {
  const steps: RoutineStepResult[] = [];

  if (routine.lightAction === 'turn_on') {
    try {
      await controller.setLight(true);
      steps.push({
        deviceLabel: 'Living Room Light',
        plannedAction: 'Turn on light',
        status: 'completed',
        message: 'Light turned ON (simulated).',
      });
    } catch (err) {
      steps.push({
        deviceLabel: 'Living Room Light',
        plannedAction: 'Turn on light',
        status: 'failed',
        message: err instanceof Error ? err.message : 'Failed to turn on light.',
      });
    }
  } else if (routine.lightAction === 'turn_off') {
    try {
      await controller.setLight(false);
      steps.push({
        deviceLabel: 'Living Room Light',
        plannedAction: 'Turn off light',
        status: 'completed',
        message: 'Light turned OFF (simulated).',
      });
    } catch (err) {
      steps.push({
        deviceLabel: 'Living Room Light',
        plannedAction: 'Turn off light',
        status: 'failed',
        message: err instanceof Error ? err.message : 'Failed to turn off light.',
      });
    }
  } else {
    const s = controller.getState();
    steps.push({
      deviceLabel: 'Living Room Light',
      plannedAction: 'Leave light unchanged',
      status: 'skipped',
      message: `Left unchanged (${s.lightOn ? 'ON' : 'OFF'}).`,
    });
  }

  if (routine.fanAction === 'turn_on') {
    try {
      await controller.setFan(true);
      await controller.setFanSpeed(routine.fanSpeed);
      steps.push({
        deviceLabel: 'Bedroom Fan',
        plannedAction: `Turn on fan (speed ${routine.fanSpeed})`,
        status: 'completed',
        message: `Fan turned ON at speed ${routine.fanSpeed} of 5 (simulated).`,
      });
    } catch (err) {
      steps.push({
        deviceLabel: 'Bedroom Fan',
        plannedAction: `Turn on fan (speed ${routine.fanSpeed})`,
        status: 'failed',
        message: err instanceof Error ? err.message : 'Failed to turn on fan.',
      });
    }
  } else if (routine.fanAction === 'turn_off') {
    try {
      await controller.setFan(false);
      steps.push({
        deviceLabel: 'Bedroom Fan',
        plannedAction: 'Turn off fan',
        status: 'completed',
        message: 'Fan turned OFF (simulated).',
      });
    } catch (err) {
      steps.push({
        deviceLabel: 'Bedroom Fan',
        plannedAction: 'Turn off fan',
        status: 'failed',
        message: err instanceof Error ? err.message : 'Failed to turn off fan.',
      });
    }
  } else {
    const s = controller.getState();
    steps.push({
      deviceLabel: 'Bedroom Fan',
      plannedAction: 'Leave fan unchanged',
      status: 'skipped',
      message: `Left unchanged (${s.fanOn ? 'ON' : 'OFF'}).`,
    });
  }

  const state = controller.getState();
  if (routine.doorAction === 'unchanged') {
    steps.push({
      deviceLabel: 'Front Entry Door',
      plannedAction: 'Leave door unchanged',
      status: 'skipped',
      message: `Left unchanged (${state.doorLocked ? 'Locked' : 'Unlocked'}).`,
    });
  } else if (state.doorOpen) {
    steps.push({
      deviceLabel: 'Front Entry Door',
      plannedAction: 'Lock with safety check',
      status: 'skipped',
      message:
        'Safety check blocked lock: Front door sensor reports the door is open.',
    });
  } else if (state.doorLocked) {
    steps.push({
      deviceLabel: 'Front Entry Door',
      plannedAction: 'Verify door locked',
      status: 'verified',
      message: 'Verified: Front door is closed and already locked.',
    });
  } else if (routine.requireSafetyConfirmation && !doorSafetyConfirmed) {
    steps.push({
      deviceLabel: 'Front Entry Door',
      plannedAction: 'Lock with safety check',
      status: 'skipped',
      message:
        'Skipped: Safety confirmation was not checked, so the door remains unlocked.',
    });
  } else {
    try {
      await controller.setDoorLocked(true);
      steps.push({
        deviceLabel: 'Front Entry Door',
        plannedAction: 'Lock front door',
        status: 'completed',
        message: 'Safety check passed: Front door locked (simulated).',
      });
    } catch (err) {
      steps.push({
        deviceLabel: 'Front Entry Door',
        plannedAction: 'Lock front door',
        status: 'failed',
        message: err instanceof Error ? err.message : 'Failed to lock door.',
      });
    }
  }

  return {
    routineId: routine.id,
    routineTitle: ROUTINE_META[routine.id].title,
    executedAt: new Date(),
    steps,
  };
}
