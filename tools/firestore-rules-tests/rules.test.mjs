import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const projectId = 'demo-ai-home-brain';
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

let testEnvironment;

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules,
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
});

after(async () => {
  await testEnvironment?.cleanup();
});

function signedInDb(uid, { emailVerified = true } = {}) {
  return testEnvironment
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      email_verified: emailVerified,
    })
    .firestore();
}

function profile(uid, overrides = {}) {
  return {
    uid,
    displayName: 'Home member',
    email: `${uid}@example.com`,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

async function seed(dataByPath) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [path, data] of Object.entries(dataByPath)) {
      await setDoc(doc(db, path), data);
    }
  });
}

test('denies unauthenticated, cross-user, and collection-wide profile reads', async () => {
  const anonymousDb = testEnvironment.unauthenticatedContext().firestore();
  const aliceDb = signedInDb('alice');

  await assertFails(getDoc(doc(anonymousDb, 'users/alice')));
  await assertFails(getDoc(doc(aliceDb, 'users/bob')));
  await assertFails(getDocs(collection(aliceDb, 'users')));
});

test('requires a verified account and an exact self-owned user profile', async () => {
  const unverifiedDb = signedInDb('alice', { emailVerified: false });
  await assertFails(setDoc(doc(unverifiedDb, 'users/alice'), profile('alice')));

  const aliceDb = signedInDb('alice');
  await assertSucceeds(setDoc(doc(aliceDb, 'users/alice'), profile('alice')));
  await assertFails(
    setDoc(doc(aliceDb, 'users/alice'), profile('alice', { isAdmin: true })),
  );
});

test('validates home-state bounds and rejects an unsafe fan speed', async () => {
  await seed({ 'users/alice': profile('alice') });
  const aliceDb = signedInDb('alice');
  const stateRef = doc(aliceDb, 'users/alice/homeState/default');
  const validState = {
    ownerId: 'alice',
    selectedMode: 'Home',
    lightOn: false,
    fanOn: false,
    fanSpeed: 2,
    doorLocked: true,
    doorOpen: false,
    updatedAt: serverTimestamp(),
  };

  await assertSucceeds(setDoc(stateRef, validState));
  await assertFails(
    setDoc(stateRef, { ...validState, fanSpeed: 99, updatedAt: serverTimestamp() }),
  );
});

test('does not let a guest promote their own family permissions', async () => {
  const now = new Date();
  await seed({
    'homes/home_1': {
      homeId: 'home_1',
      ownerId: 'owner',
      memberUids: ['owner', 'guest'],
    },
    'homes/home_1/members/guest': {
      memberId: 'guest',
      homeId: 'home_1',
      homeOwnerId: 'owner',
      uid: 'guest',
      displayName: 'Guest',
      email: 'guest@example.com',
      role: 'guest',
      status: 'active',
      canControlDevices: true,
      canRunAutomations: false,
      canUseVoiceCommands: true,
      canUnlockDoor: false,
      canManageFamily: false,
      inviteCode: 'INVITE1',
      addedByUid: 'owner',
      viewerUids: ['owner', 'guest'],
      createdAt: now,
      updatedAt: now,
    },
  });

  const guestDb = signedInDb('guest');
  await assertFails(
    updateDoc(doc(guestDb, 'homes/home_1/members/guest'), {
      canManageFamily: true,
      canUnlockDoor: true,
      updatedAt: serverTimestamp(),
    }),
  );
});

test('keeps household activity logs append-only and actor-attributed', async () => {
  await seed({
    'homes/home_1': {
      homeId: 'home_1',
      ownerId: 'alice',
      memberUids: ['alice'],
    },
  });

  const aliceDb = signedInDb('alice');
  const logRef = doc(aliceDb, 'homes/home_1/activityLogs/log_1');
  const log = {
    logId: 'log_1',
    homeId: 'home_1',
    actorUid: 'alice',
    actorName: 'Alice',
    actorEmail: 'alice@example.com',
    actorRole: 'owner',
    actionTitle: 'Light turned on (simulated)',
    detail: 'Updated from the dashboard',
    category: 'device',
    source: 'dashboard',
    viewerUids: ['alice'],
    createdAt: serverTimestamp(),
  };

  await assertSucceeds(setDoc(logRef, log));
  await assertFails(updateDoc(logRef, { actionTitle: 'Edited history' }));
  await assertFails(deleteDoc(logRef));
  await assertFails(
    setDoc(doc(aliceDb, 'homes/home_1/activityLogs/log_2'), {
      ...log,
      logId: 'log_2',
      actorUid: 'bob',
    }),
  );
});
