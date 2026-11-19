import { User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  ActivityCategory,
  ActivitySource,
  AutomationRoutine,
  DEFAULT_DEVICE_STATE,
  DeviceState,
  FamilyActivityEntry,
  FamilyInvite,
  FamilyMember,
  FamilyPermissions,
  FamilyRole,
  RoutineId,
  SceneMode,
  defaultPermissionsForRole,
  defaultRoutineFor,
} from '../types/smartHome';
import { OperationType, db, handleFirestoreError } from './firebase';

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned.slice(0, 110) || 'user';
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

export function deriveDisplayName(user: User): string {
  const raw = user.displayName?.trim() ?? '';
  if (raw) return raw.slice(0, 100);
  const prefix = (user.email ?? '').split('@')[0]?.trim() ?? '';
  return (prefix || 'Home Member').slice(0, 100);
}

export async function ensureUserProfile(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const ref = doc(db, 'users', user.uid);
  const path = `users/${user.uid}`;
  try {
    const snap = await getDoc(ref);
    const displayName = deriveDisplayName(user);
    const email = (user.email ?? 'member@home.local').toLowerCase().slice(0, 254);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName,
        email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName,
        email,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function ensureHomeState(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const ref = doc(db, 'users', user.uid, 'homeState', 'default');
  const path = `users/${user.uid}/homeState/default`;
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: user.uid,
        selectedMode: 'Home',
        lightOn: DEFAULT_DEVICE_STATE.lightOn,
        fanOn: DEFAULT_DEVICE_STATE.fanOn,
        fanSpeed: DEFAULT_DEVICE_STATE.fanSpeed,
        doorLocked: DEFAULT_DEVICE_STATE.doorLocked,
        doorOpen: DEFAULT_DEVICE_STATE.doorOpen,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveHomeState(
  user: User,
  selectedMode: SceneMode,
  state: DeviceState,
): Promise<void> {
  if (!user.emailVerified) return;
  const ref = doc(db, 'users', user.uid, 'homeState', 'default');
  const path = `users/${user.uid}/homeState/default`;
  const clampedFanSpeed = Math.max(1, Math.min(5, Math.round(state.fanSpeed)));
  try {
    await setDoc(ref, {
      ownerId: user.uid,
      selectedMode,
      lightOn: Boolean(state.lightOn),
      fanOn: Boolean(state.fanOn),
      fanSpeed: clampedFanSpeed,
      doorLocked: Boolean(state.doorLocked),
      doorOpen: Boolean(state.doorOpen),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeHomeState(
  uid: string,
  onUpdate: (data: { selectedMode: SceneMode; state: DeviceState }) => void,
): () => void {
  const path = `users/${uid}/homeState/default`;
  const ref = doc(db, 'users', uid, 'homeState', 'default');
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data();
      if (!data) return;
      const modeRaw = String(data.selectedMode ?? 'Home');
      const selectedMode: SceneMode = (
        ['Home', 'Away', 'Sleep', 'Morning'] as const
      ).includes(modeRaw as SceneMode)
        ? (modeRaw as SceneMode)
        : 'Home';
      const fanSpeed =
        typeof data.fanSpeed === 'number'
          ? Math.max(1, Math.min(5, Math.round(data.fanSpeed)))
          : 2;
      onUpdate({
        selectedMode,
        state: {
          lightOn: Boolean(data.lightOn),
          fanOn: Boolean(data.fanOn),
          fanSpeed,
          doorLocked:
            typeof data.doorLocked === 'boolean' ? data.doorLocked : true,
          doorOpen: Boolean(data.doorOpen),
        },
      });
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    },
  );
}

export function subscribeRoutines(
  uid: string,
  onRoutine: (routine: AutomationRoutine) => void,
): () => void {
  const ids: RoutineId[] = ['sleep', 'morning', 'away'];
  const unsubs = ids.map((id) => {
    const path = `users/${uid}/routines/${id}`;
    const ref = doc(db, 'users', uid, 'routines', id);
    return onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        if (!data) {
          onRoutine(defaultRoutineFor(id));
          return;
        }
        onRoutine({
          id,
          lightAction:
            data.lightAction === 'turn_on' ||
            data.lightAction === 'turn_off' ||
            data.lightAction === 'unchanged'
              ? data.lightAction
              : defaultRoutineFor(id).lightAction,
          fanAction:
            data.fanAction === 'turn_on' ||
            data.fanAction === 'turn_off' ||
            data.fanAction === 'unchanged'
              ? data.fanAction
              : defaultRoutineFor(id).fanAction,
          fanSpeed:
            typeof data.fanSpeed === 'number'
              ? Math.max(1, Math.min(5, Math.round(data.fanSpeed)))
              : 2,
          doorAction:
            data.doorAction === 'lock_with_safety_check' ||
            data.doorAction === 'keep_locked' ||
            data.doorAction === 'unchanged'
              ? data.doorAction
              : defaultRoutineFor(id).doorAction,
          requireSafetyConfirmation:
            typeof data.requireSafetyConfirmation === 'boolean'
              ? data.requireSafetyConfirmation
              : true,
        });
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, path);
      },
    );
  });
  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function saveRoutine(
  user: User,
  routine: AutomationRoutine,
): Promise<void> {
  if (!user.emailVerified) return;
  const path = `users/${user.uid}/routines/${routine.id}`;
  const ref = doc(db, 'users', user.uid, 'routines', routine.id);
  try {
    await setDoc(ref, {
      ownerId: user.uid,
      routineId: routine.id,
      lightAction: routine.lightAction,
      fanAction: routine.fanAction,
      fanSpeed: Math.max(1, Math.min(5, Math.round(routine.fanSpeed))),
      doorAction: routine.doorAction,
      requireSafetyConfirmation: Boolean(routine.requireSafetyConfirmation),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export interface HouseholdContext {
  homeId: string;
  homeName: string;
  homeOwnerId: string;
  memberUids: string[];
}

export async function bootstrapHousehold(user: User): Promise<HouseholdContext> {
  const linkPath = `users/${user.uid}/membership/current`;
  const linkRef = doc(db, 'users', user.uid, 'membership', 'current');
  let targetHomeId = '';

  try {
    const linkSnap = await getDoc(linkRef);
    if (linkSnap.exists()) {
      const linkHomeId = linkSnap.data()?.homeId;
      if (typeof linkHomeId === 'string' && linkHomeId.trim()) {
        targetHomeId = linkHomeId.trim();
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, linkPath);
  }

  const personalHomeId = `home_${sanitizeId(user.uid)}`;
  if (!targetHomeId) {
    targetHomeId = personalHomeId;
  }

  const homePath = `homes/${targetHomeId}`;
  const homeRef = doc(db, 'homes', targetHomeId);
  let homeSnap;
  try {
    homeSnap = await getDoc(homeRef);
  } catch {
    homeSnap = null;
  }

  if (homeSnap && homeSnap.exists()) {
    const data = homeSnap.data();
    return {
      homeId: targetHomeId,
      homeName: String(data.name ?? 'My Smart Home'),
      homeOwnerId: String(data.ownerId ?? user.uid),
      memberUids: Array.isArray(data.memberUids)
        ? data.memberUids.filter((u): u is string => typeof u === 'string')
        : [user.uid],
    };
  }

  const createHomeId = personalHomeId;
  const displayName = deriveDisplayName(user);
  const email = (user.email ?? 'member@home.local').toLowerCase().slice(0, 254);

  const batch = writeBatch(db);
  batch.set(doc(db, 'homes', createHomeId), {
    homeId: createHomeId,
    name: 'My Smart Home',
    ownerId: user.uid,
    memberUids: [user.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'homes', createHomeId, 'members', user.uid), {
    memberId: user.uid,
    homeId: createHomeId,
    homeOwnerId: user.uid,
    uid: user.uid,
    displayName,
    email,
    role: 'owner',
    status: 'active',
    canControlDevices: true,
    canRunAutomations: true,
    canUseVoiceCommands: true,
    canUnlockDoor: true,
    canManageFamily: true,
    inviteCode: '',
    addedByUid: user.uid,
    viewerUids: [user.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(linkRef, {
    uid: user.uid,
    homeId: createHomeId,
    role: 'owner',
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, homePath);
  }

  return {
    homeId: createHomeId,
    homeName: 'My Smart Home',
    homeOwnerId: user.uid,
    memberUids: [user.uid],
  };
}

export function subscribeHouseholdData(
  homeId: string,
  user: User,
  callbacks: {
    onHome: (ctx: HouseholdContext) => void;
    onMembers: (members: FamilyMember[]) => void;
    onOutgoingInvites: (invites: FamilyInvite[]) => void;
    onIncomingInvites: (invites: FamilyInvite[]) => void;
    onActivities: (entries: FamilyActivityEntry[]) => void;
  },
): () => void {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    onSnapshot(
      doc(db, 'homes', homeId),
      (snap) => {
        const d = snap.data();
        if (!d) return;
        callbacks.onHome({
          homeId,
          homeName: String(d.name ?? 'My Smart Home'),
          homeOwnerId: String(d.ownerId ?? user.uid),
          memberUids: Array.isArray(d.memberUids)
            ? d.memberUids.filter((u): u is string => typeof u === 'string')
            : [user.uid],
        });
      },
      (err) => handleFirestoreError(err, OperationType.GET, `homes/${homeId}`),
    ),
  );

  const membersQuery = query(
    collection(db, 'homes', homeId, 'members'),
    where('viewerUids', 'array-contains', user.uid),
  );
  unsubs.push(
    onSnapshot(
      membersQuery,
      (snap) => {
        const list: FamilyMember[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          const role: FamilyRole =
            d.role === 'owner' || d.role === 'adult' || d.role === 'guest'
              ? d.role
              : 'guest';
          return {
            memberId: String(d.memberId ?? docSnap.id),
            homeId: String(d.homeId ?? homeId),
            homeOwnerId: String(d.homeOwnerId ?? user.uid),
            uid: String(d.uid ?? ''),
            displayName: String(d.displayName ?? 'Member'),
            email: String(d.email ?? ''),
            role,
            status: d.status === 'invited' ? 'invited' : 'active',
            permissions: {
              canControlDevices: Boolean(d.canControlDevices),
              canRunAutomations: Boolean(d.canRunAutomations),
              canUseVoiceCommands: Boolean(d.canUseVoiceCommands),
              canUnlockDoor: Boolean(d.canUnlockDoor),
              canManageFamily: Boolean(d.canManageFamily),
            },
            inviteCode: String(d.inviteCode ?? ''),
            addedByUid: String(d.addedByUid ?? ''),
            viewerUids: Array.isArray(d.viewerUids)
              ? d.viewerUids.filter((u): u is string => typeof u === 'string')
              : [user.uid],
            createdAt: toDate(d.createdAt),
            updatedAt: toDate(d.updatedAt),
          };
        });
        callbacks.onMembers(list);
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `homes/${homeId}/members`),
    ),
  );

  const outgoingQuery = query(
    collection(db, 'homeInvites'),
    where('homeId', '==', homeId),
    where('invitedByUid', '==', user.uid),
  );
  unsubs.push(
    onSnapshot(
      outgoingQuery,
      (snap) => {
        callbacks.onOutgoingInvites(snap.docs.map((s) => mapInvite(s.id, s.data())));
      },
      () => {
        // Non-admin members may not have outgoing invites; ignore safely
        callbacks.onOutgoingInvites([]);
      },
    ),
  );

  if (user.email) {
    const incomingQuery = query(
      collection(db, 'homeInvites'),
      where('invitedEmail', '==', user.email.toLowerCase()),
    );
    unsubs.push(
      onSnapshot(
        incomingQuery,
        (snap) => {
          callbacks.onIncomingInvites(
            snap.docs
              .map((s) => mapInvite(s.id, s.data()))
              .filter((inv) => inv.status === 'pending'),
          );
        },
        () => callbacks.onIncomingInvites([]),
      ),
    );
  }

  const activityQuery = query(
    collection(db, 'homes', homeId, 'activityLogs'),
    where('viewerUids', 'array-contains', user.uid),
    orderBy('createdAt', 'desc'),
    limit(40),
  );
  unsubs.push(
    onSnapshot(
      activityQuery,
      (snap) => {
        const items: FamilyActivityEntry[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            logId: String(d.logId ?? docSnap.id),
            homeId: String(d.homeId ?? homeId),
            actorUid: String(d.actorUid ?? ''),
            actorName: String(d.actorName ?? 'Member'),
            actorEmail: String(d.actorEmail ?? ''),
            actorRole:
              d.actorRole === 'owner' ||
              d.actorRole === 'adult' ||
              d.actorRole === 'guest'
                ? d.actorRole
                : 'owner',
            actionTitle: String(d.actionTitle ?? ''),
            detail: String(d.detail ?? ''),
            category: (d.category as ActivityCategory) ?? 'device',
            source: (d.source as ActivitySource) ?? 'dashboard',
            viewerUids: Array.isArray(d.viewerUids)
              ? d.viewerUids.filter((u): u is string => typeof u === 'string')
              : [user.uid],
            createdAt: toDate(d.createdAt),
          };
        });
        callbacks.onActivities(items);
      },
      () => {
        // Fallback without composite index if needed
        const fallbackQ = query(
          collection(db, 'homes', homeId, 'activityLogs'),
          where('viewerUids', 'array-contains', user.uid),
          limit(40),
        );
        void getDocs(fallbackQ).then((snap) => {
          const items: FamilyActivityEntry[] = snap.docs
            .map((docSnap) => {
              const d = docSnap.data();
              return {
                logId: String(d.logId ?? docSnap.id),
                homeId: String(d.homeId ?? homeId),
                actorUid: String(d.actorUid ?? ''),
                actorName: String(d.actorName ?? 'Member'),
                actorEmail: String(d.actorEmail ?? ''),
                actorRole:
                  d.actorRole === 'owner' ||
                  d.actorRole === 'adult' ||
                  d.actorRole === 'guest'
                    ? d.actorRole
                    : 'owner',
                actionTitle: String(d.actionTitle ?? ''),
                detail: String(d.detail ?? ''),
                category: (d.category as ActivityCategory) ?? 'device',
                source: (d.source as ActivitySource) ?? 'dashboard',
                viewerUids: Array.isArray(d.viewerUids)
                  ? d.viewerUids.filter((u): u is string => typeof u === 'string')
                  : [user.uid],
                createdAt: toDate(d.createdAt),
              };
            })
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          callbacks.onActivities(items);
        });
      },
    ),
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

function mapInvite(id: string, d: Record<string, unknown>): FamilyInvite {
  const role: FamilyRole =
    d.role === 'owner' || d.role === 'adult' || d.role === 'guest'
      ? d.role
      : 'guest';
  return {
    inviteCode: String(d.inviteCode ?? id),
    homeId: String(d.homeId ?? ''),
    homeName: String(d.homeName ?? 'My Smart Home'),
    homeOwnerId: String(d.homeOwnerId ?? ''),
    invitedEmail: String(d.invitedEmail ?? ''),
    displayName: String(d.displayName ?? ''),
    role,
    permissions: {
      canControlDevices: Boolean(d.canControlDevices),
      canRunAutomations: Boolean(d.canRunAutomations),
      canUseVoiceCommands: Boolean(d.canUseVoiceCommands),
      canUnlockDoor: Boolean(d.canUnlockDoor),
      canManageFamily: Boolean(d.canManageFamily),
    },
    status:
      d.status === 'accepted' || d.status === 'revoked' ? d.status : 'pending',
    invitedByUid: String(d.invitedByUid ?? ''),
    invitedByName: String(d.invitedByName ?? ''),
    acceptedByUid: String(d.acceptedByUid ?? ''),
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

export async function createHouseholdInvite(params: {
  user: User;
  household: HouseholdContext;
  displayName: string;
  invitedEmail: string;
  role: 'adult' | 'guest';
  permissions: FamilyPermissions;
}): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  const inviteCode = `HB${suffix}`;
  const path = `homeInvites/${inviteCode}`;

  try {
    await setDoc(doc(db, 'homeInvites', inviteCode), {
      inviteCode,
      homeId: params.household.homeId,
      homeName: params.household.homeName.slice(0, 80),
      homeOwnerId: params.household.homeOwnerId,
      invitedEmail: params.invitedEmail.trim().toLowerCase().slice(0, 254),
      displayName: params.displayName.trim().slice(0, 100),
      role: params.role,
      canControlDevices: params.permissions.canControlDevices,
      canRunAutomations: params.permissions.canRunAutomations,
      canUseVoiceCommands: params.permissions.canUseVoiceCommands,
      canUnlockDoor: params.permissions.canUnlockDoor,
      canManageFamily: params.permissions.canManageFamily,
      status: 'pending',
      invitedByUid: params.user.uid,
      invitedByName: deriveDisplayName(params.user),
      acceptedByUid: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return inviteCode;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function revokeHouseholdInvite(inviteCode: string): Promise<void> {
  const path = `homeInvites/${inviteCode}`;
  try {
    await updateDoc(doc(db, 'homeInvites', inviteCode), {
      status: 'revoked',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function acceptHouseholdInvite(
  user: User,
  inviteCodeRaw: string,
): Promise<void> {
  const inviteCode = inviteCodeRaw.trim().toUpperCase();
  const invitePath = `homeInvites/${inviteCode}`;
  const inviteRef = doc(db, 'homeInvites', inviteCode);
  let inviteSnap;
  try {
    inviteSnap = await getDoc(inviteRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, invitePath);
  }
  if (!inviteSnap.exists()) {
    throw new Error(`Invite code "${inviteCode}" was not found.`);
  }
  const invite = mapInvite(inviteCode, inviteSnap.data());
  if (invite.status !== 'pending') {
    throw new Error(`Invite "${inviteCode}" is already ${invite.status}.`);
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'homes', invite.homeId, 'members', user.uid), {
    memberId: user.uid,
    homeId: invite.homeId,
    homeOwnerId: invite.homeOwnerId,
    uid: user.uid,
    displayName: deriveDisplayName(user),
    email: (user.email ?? invite.invitedEmail).toLowerCase().slice(0, 254),
    role: invite.role,
    status: 'active',
    canControlDevices: invite.permissions.canControlDevices,
    canRunAutomations: invite.permissions.canRunAutomations,
    canUseVoiceCommands: invite.permissions.canUseVoiceCommands,
    canUnlockDoor: invite.permissions.canUnlockDoor,
    canManageFamily: invite.permissions.canManageFamily,
    inviteCode,
    addedByUid: invite.invitedByUid,
    viewerUids: Array.from(new Set([invite.homeOwnerId, user.uid])).slice(0, 20),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(inviteRef, {
    status: 'accepted',
    acceptedByUid: user.uid,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', user.uid, 'membership', 'current'), {
    uid: user.uid,
    homeId: invite.homeId,
    role: invite.role,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, invitePath);
  }
}

export async function updateMemberPermissions(params: {
  homeId: string;
  member: FamilyMember;
  role: FamilyRole;
  permissions: FamilyPermissions;
}): Promise<void> {
  const path = `homes/${params.homeId}/members/${params.member.memberId}`;
  try {
    await updateDoc(doc(db, 'homes', params.homeId, 'members', params.member.memberId), {
      role: params.role,
      canControlDevices: params.permissions.canControlDevices,
      canRunAutomations: params.permissions.canRunAutomations,
      canUseVoiceCommands: params.permissions.canUseVoiceCommands,
      canUnlockDoor: params.permissions.canUnlockDoor,
      canManageFamily: params.permissions.canManageFamily,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function removeHouseholdMember(
  homeId: string,
  memberId: string,
): Promise<void> {
  const path = `homes/${homeId}/members/${memberId}`;
  try {
    await deleteDoc(doc(db, 'homes', homeId, 'members', memberId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function recordHouseholdActivity(params: {
  user: User;
  household: HouseholdContext;
  actorRole: FamilyRole;
  actionTitle: string;
  detail: string;
  category: ActivityCategory;
  source: ActivitySource;
}): Promise<void> {
  if (!params.user.emailVerified) return;
  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `homes/${params.household.homeId}/activityLogs/${logId}`;
  const viewerUids = Array.from(
    new Set([params.household.homeOwnerId, ...params.household.memberUids, params.user.uid]),
  ).slice(0, 20);

  try {
    await setDoc(doc(db, 'homes', params.household.homeId, 'activityLogs', logId), {
      logId,
      homeId: params.household.homeId,
      actorUid: params.user.uid,
      actorName: deriveDisplayName(params.user),
      actorEmail: (params.user.email ?? 'member@home.local').toLowerCase().slice(0, 254),
      actorRole: params.actorRole,
      actionTitle: params.actionTitle.slice(0, 160),
      detail: params.detail.slice(0, 320),
      category: params.category,
      source: params.source,
      viewerUids,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Do not crash device actions if activity logging is rejected while offline/unverified
  }
}

export function getPermissionsFallback(role: FamilyRole): FamilyPermissions {
  return defaultPermissionsForRole(role);
}
