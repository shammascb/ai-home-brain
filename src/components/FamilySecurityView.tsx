import React, { useMemo, useState } from 'react';
import {
  AudioLines,
  Ban,
  CheckCircle2,
  ChevronLeft,
  Copy,
  DoorClosed,
  History,
  Home,
  KeyRound,
  Lightbulb,
  Mail,
  MailCheck,
  Mic,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  UserX,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  ActivityCategory,
  FamilyActivityEntry,
  FamilyInvite,
  FamilyMember,
  FamilyPermissions,
  FamilyRole,
  defaultPermissionsForRole,
} from '../types/smartHome';

export type FamilySectionTab = 'members' | 'activity' | 'security';

interface FamilySecurityViewProps {
  homeName: string;
  currentUid: string;
  currentName: string;
  currentEmail: string;
  currentProviderIds: string[];
  currentEmailVerified: boolean;
  currentRole: FamilyRole;
  currentPermissions: FamilyPermissions;
  canManageFamily: boolean;
  initialTab?: FamilySectionTab;
  members: FamilyMember[];
  outgoingInvites: FamilyInvite[];
  incomingInvites: FamilyInvite[];
  activities: FamilyActivityEntry[];
  onBack: () => void;
  onShowNotice: (msg: string) => void;
  onInviteMember: (params: {
    displayName: string;
    email: string;
    role: 'adult' | 'guest';
    permissions: FamilyPermissions;
  }) => Promise<string>;
  onRevokeInvite: (inviteCode: string) => Promise<void>;
  onAcceptInvite: (inviteCode: string) => Promise<void>;
  onUpdateMemberPermissions: (
    member: FamilyMember,
    role: FamilyRole,
    permissions: FamilyPermissions,
  ) => Promise<void>;
  onRemoveMember: (member: FamilyMember) => Promise<void>;
  onResendVerification: () => Promise<void>;
  onRefreshVerification: () => Promise<void>;
  onSendPasswordReset: () => Promise<void>;
}

function formatRoleLabel(role: FamilyRole): string {
  if (role === 'owner') return 'Owner';
  if (role === 'adult') return 'Adult';
  return 'Guest';
}

function activePermissionLabels(p: FamilyPermissions): string[] {
  const labels: string[] = [];
  if (p.canControlDevices) labels.push('Lights & fan');
  if (p.canRunAutomations) labels.push('Automations');
  if (p.canUseVoiceCommands) labels.push('Voice');
  if (p.canUnlockDoor) labels.push('Door unlock');
  if (p.canManageFamily) labels.push('Family admin');
  return labels;
}

function formatTimestamp(dt: Date): string {
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

export const FamilySecurityView: React.FC<FamilySecurityViewProps> = ({
  homeName,
  currentUid,
  currentName,
  currentEmail,
  currentProviderIds,
  currentEmailVerified,
  currentRole,
  currentPermissions,
  canManageFamily,
  initialTab = 'members',
  members,
  outgoingInvites,
  incomingInvites,
  activities,
  onBack,
  onShowNotice,
  onInviteMember,
  onRevokeInvite,
  onAcceptInvite,
  onUpdateMemberPermissions,
  onRemoveMember,
  onResendVerification,
  onRefreshVerification,
  onSendPasswordReset,
}) => {
  const [selectedTab, setSelectedTab] = useState<FamilySectionTab>(initialTab);
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] =
    useState<ActivityCategory | null>(null);
  const [sendingSecurityEmail, setSendingSecurityEmail] = useState(false);

  // Dialog states
  const [memberFormMode, setMemberFormMode] = useState<
    'invite' | 'direct' | null
  >(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [removingMember, setRemovingMember] = useState<FamilyMember | null>(
    null,
  );

  // Member form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<'adult' | 'guest'>('adult');
  const [formPerms, setFormPerms] = useState<FamilyPermissions>(
    defaultPermissionsForRole('adult'),
  );
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Join dialog state
  const [joinCode, setJoinCode] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Edit permissions state
  const [editRole, setEditRole] = useState<'adult' | 'guest'>('adult');
  const [editPerms, setEditPerms] = useState<FamilyPermissions>(
    defaultPermissionsForRole('adult'),
  );
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const pendingOutgoing = outgoingInvites.filter(
    (inv) => inv.status === 'pending',
  );

  const actors = useMemo(() => {
    const map = new Map<string, string>();
    activities.forEach((a) => {
      if (a.actorUid) map.set(a.actorUid, a.actorName);
    });
    members.forEach((m) => {
      if (m.uid && !map.has(m.uid)) map.set(m.uid, m.displayName);
    });
    return Array.from(map.entries());
  }, [activities, members]);

  const filteredActivities = useMemo(() => {
    return activities.filter((entry) => {
      if (actorFilter !== 'all' && entry.actorUid !== actorFilter) return false;
      if (categoryFilter && entry.category !== categoryFilter) return false;
      return true;
    });
  }, [activities, actorFilter, categoryFilter]);

  const openMemberDialog = (mode: 'invite' | 'direct') => {
    setFormName('');
    setFormEmail('');
    setFormRole('adult');
    setFormPerms(defaultPermissionsForRole('adult'));
    setFormError(null);
    setMemberFormMode(mode);
  };

  const handleSubmitMemberForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim() || formBusy) return;
    setFormBusy(true);
    setFormError(null);
    try {
      const code = await onInviteMember({
        displayName: formName.trim(),
        email: formEmail.trim(),
        role: formRole,
        permissions: formPerms,
      });
      setMemberFormMode(null);
      onShowNotice(
        `Invitation created for ${formName.trim()} · Share code ${code}`,
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to create member invite.',
      );
    } finally {
      setFormBusy(false);
    }
  };

  const handleSubmitJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || joinBusy) return;
    setJoinBusy(true);
    setJoinError(null);
    try {
      await onAcceptInvite(joinCode.trim());
      setJoinOpen(false);
      setJoinCode('');
      onShowNotice('Joined household successfully.');
    } catch (err) {
      setJoinError(
        err instanceof Error ? err.message : 'Could not join household.',
      );
    } finally {
      setJoinBusy(false);
    }
  };

  const handleSaveEditPerms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || editBusy) return;
    setEditBusy(true);
    setEditError(null);
    try {
      await onUpdateMemberPermissions(editingMember, editRole, editPerms);
      setEditingMember(null);
      onShowNotice(`Updated permissions for ${editingMember.displayName}.`);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Could not update permissions.',
      );
    } finally {
      setEditBusy(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      onShowNotice(`Copied invite code ${code}`);
    } catch {
      onShowNotice(`Invite code: ${code}`);
    }
  };

  const usesPassword = currentProviderIds.includes('password');

  const categories: Array<{ id: ActivityCategory; label: string }> = [
    { id: 'device', label: 'Devices' },
    { id: 'door', label: 'Door' },
    { id: 'automation', label: 'Automations' },
    { id: 'voice', label: 'Voice' },
    { id: 'family', label: 'Family' },
    { id: 'security', label: 'Security' },
  ];

  return (
    <div className="min-h-screen bg-[#F4F7F5] dark:bg-[#101113] text-[#111315] dark:text-[#F4F5F6]">
      {/* AppBar matching FamilyManagementScreen */}
      <header className="h-14 px-2 flex items-center gap-2 max-w-[920px] mx-auto">
        <button
          type="button"
          onClick={onBack}
          title="Back"
          className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-[20px] font-medium">Family &amp; Security</h1>
      </header>

      <div className="max-w-[920px] mx-auto px-[18px] sm:px-8 pt-3 pb-10 space-y-4">
        {/* SegmentedButton: Members | Activity | Security */}
        <div className="grid grid-cols-3 rounded-full border border-black/20 dark:border-white/25 overflow-hidden">
          <button
            type="button"
            onClick={() => setSelectedTab('members')}
            className={`h-10 px-2 sm:px-3 text-[12px] sm:text-[13px] font-medium inline-flex items-center justify-center gap-1.5 border-r border-black/20 dark:border-white/25 transition ${
              selectedTab === 'members'
                ? 'bg-[#F3A64A]/25 text-[#111315] dark:text-[#FFDDB7] font-semibold'
                : 'hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
            <span className="truncate">Members</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab('activity')}
            className={`h-10 px-2 sm:px-3 text-[12px] sm:text-[13px] font-medium inline-flex items-center justify-center gap-1.5 border-r border-black/20 dark:border-white/25 transition ${
              selectedTab === 'activity'
                ? 'bg-[#F3A64A]/25 text-[#111315] dark:text-[#FFDDB7] font-semibold'
                : 'hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <History className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
            <span className="truncate">Activity</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab('security')}
            className={`h-10 px-2 sm:px-3 text-[12px] sm:text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition ${
              selectedTab === 'security'
                ? 'bg-[#F3A64A]/25 text-[#111315] dark:text-[#FFDDB7] font-semibold'
                : 'hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <ShieldCheck className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
            <span className="truncate">Security</span>
          </button>
        </div>

        {/* ==================== MEMBERS TAB ==================== */}
        {selectedTab === 'members' && (
          <div className="space-y-5">
            {/* Home Summary Card */}
            <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[18px] space-y-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F3A64A]/14 text-[#D9821E] dark:text-[#F3A64A] flex items-center justify-center shrink-0">
                  <Home className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[16px] font-bold truncate">
                    {homeName}
                  </div>
                  <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5">
                    {members.length} authorized · {pendingOutgoing.length}{' '}
                    pending invite{pendingOutgoing.length === 1 ? '' : 's'} ·
                    Your role: {formatRoleLabel(currentRole)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {canManageFamily && (
                  <>
                    <button
                      type="button"
                      onClick={() => openMemberDialog('invite')}
                      className="h-10 px-4 rounded-full bg-[#F3A64A] text-[#101113] text-[13px] font-semibold inline-flex items-center gap-1.5 hover:brightness-105 transition"
                    >
                      <Mail className="w-[18px] h-[18px]" />
                      <span>Invite family member</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openMemberDialog('direct')}
                      className="h-10 px-4 rounded-full bg-[#F3A64A]/20 text-[#D9821E] dark:text-[#FFDDB7] text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-[#F3A64A]/30 transition"
                    >
                      <UserPlus className="w-[18px] h-[18px]" />
                      <span>Add authorized user</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setJoinCode('');
                    setJoinError(null);
                    setJoinOpen(true);
                  }}
                  className="h-10 px-4 rounded-full border border-black/15 dark:border-white/20 text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition"
                >
                  <KeyRound className="w-[18px] h-[18px]" />
                  <span>Join with invite code</span>
                </button>
              </div>

              {!canManageFamily && (
                <p className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                  Only household owners or admins with family management
                  permission can add, edit, or remove members.
                </p>
              )}
            </div>

            {/* Incoming invitations */}
            {incomingInvites.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-[16px] font-bold">
                  Invitations for your account
                </h2>
                {incomingInvites.map((invite) => (
                  <div
                    key={invite.inviteCode}
                    className="rounded-[18px] bg-[#FFDDB7]/45 dark:bg-[#5E3A00]/45 border border-[#F3A64A]/40 p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MailCheck className="w-5 h-5 text-[#D9821E] dark:text-[#F3A64A] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold truncate">
                          Join {invite.homeName} as{' '}
                          {formatRoleLabel(invite.role)}
                        </div>
                        <div className="text-[12px] text-neutral-600 dark:text-[#C4C6CF] truncate">
                          Invited by {invite.invitedByName} · Code{' '}
                          {invite.inviteCode}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await onAcceptInvite(invite.inviteCode);
                          onShowNotice(`Joined ${invite.homeName}.`);
                        } catch (err) {
                          onShowNotice(
                            err instanceof Error
                              ? err.message
                              : 'Could not accept invitation.',
                          );
                        }
                      }}
                      className="h-9 px-4 rounded-full bg-[#F3A64A] text-[#101113] text-[13px] font-semibold shrink-0"
                    >
                      Accept
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Authorized users */}
            <div className="space-y-2.5">
              <h2 className="text-[16px] font-bold">Authorized users</h2>
              {members.map((m) => {
                const isMe = m.uid === currentUid || m.memberId === currentUid;
                const isPrimaryOwner = m.role === 'owner';
                const canManage = canManageFamily && !isPrimaryOwner;
                const initial =
                  m.displayName.trim().charAt(0).toUpperCase() || '?';
                const permsList = activePermissionLabels(m.permissions);
                return (
                  <div
                    key={m.memberId}
                    className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#F3A64A]/14 text-[#D9821E] dark:text-[#F3A64A] flex items-center justify-center font-bold shrink-0">
                        {initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-bold truncate">
                          {isMe ? `${m.displayName} (You)` : m.displayName}
                        </div>
                        <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] truncate">
                          {m.email}
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-[8px] bg-[#F3A64A]/12 text-[#D9821E] dark:text-[#F3A64A] text-[11px] font-bold shrink-0">
                        {formatRoleLabel(m.role)}
                      </span>
                    </div>

                    <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                      Status:{' '}
                      {m.status === 'active'
                        ? 'Active account'
                        : 'Authorized · Awaiting sign-in'}
                      {m.inviteCode && m.status === 'invited'
                        ? ` (Code: ${m.inviteCode})`
                        : ''}
                    </div>
                    <div className="text-[12px]">
                      Permissions:{' '}
                      {permsList.length === 0
                        ? 'Read-only'
                        : permsList.join(' · ')}
                    </div>

                    {canManage && (
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMember(m);
                            setEditRole(
                              m.role === 'owner' ? 'adult' : m.role,
                            );
                            setEditPerms({ ...m.permissions });
                            setEditError(null);
                          }}
                          className="h-9 px-3.5 rounded-full border border-black/15 dark:border-white/20 text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition"
                        >
                          <SlidersHorizontal className="w-4 h-4" />
                          <span>Permissions</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemovingMember(m)}
                          className="h-9 px-3 rounded-full text-[13px] font-medium text-rose-500 inline-flex items-center gap-1.5 hover:bg-rose-500/10 transition"
                        >
                          <UserX className="w-4 h-4" />
                          <span>Remove</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pending invitations */}
            <div className="space-y-2.5">
              <h2 className="text-[16px] font-bold">Pending invitations</h2>
              {pendingOutgoing.length === 0 ? (
                <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-4 text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                  No pending invitations. Invite a family member so they can
                  sign in from their own account and use voice commands with
                  assigned permissions.
                </div>
              ) : (
                pendingOutgoing.map((inv) => (
                  <div
                    key={inv.inviteCode}
                    className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[14px] font-bold truncate">
                          {inv.displayName} · {formatRoleLabel(inv.role)}
                        </div>
                        <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] truncate mt-0.5">
                          {inv.invitedEmail}
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-[8px] bg-[#F3A64A]/12 text-[#D9821E] dark:text-[#F3A64A] text-[12px] font-bold font-mono shrink-0">
                        {inv.inviteCode}
                      </span>
                    </div>
                    <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                      Permissions:{' '}
                      {activePermissionLabels(inv.permissions).join(', ')}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopyCode(inv.inviteCode)}
                        className="h-9 px-3.5 rounded-full border border-black/15 dark:border-white/20 text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition"
                      >
                        <Copy className="w-4 h-4" />
                        <span>Copy code</span>
                      </button>
                      {canManageFamily && (
                        <button
                          type="button"
                          onClick={() => void onRevokeInvite(inv.inviteCode)}
                          className="h-9 px-3 rounded-full text-[13px] font-medium text-rose-500 inline-flex items-center gap-1.5 hover:bg-rose-500/10 transition"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Revoke</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ==================== ACTIVITY TAB ==================== */}
        {selectedTab === 'activity' && (
          <div className="space-y-3">
            <div>
              <h2 className="text-[16px] font-bold">User activity history</h2>
              <p className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] mt-1">
                Actions performed from authenticated family accounts across
                devices, automations, voice commands, and member management.
              </p>
            </div>

            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-neutral-500 dark:text-[#C4C6CF]">
                Filter by family member
              </span>
              <select
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                className="w-full h-11 px-3 rounded-[10px] bg-transparent border border-black/25 dark:border-white/25 text-[14px]"
              >
                <option value="all" className="bg-white dark:bg-[#1C1E22]">
                  All members
                </option>
                {actors.map(([uid, name]) => (
                  <option
                    key={uid}
                    value={uid}
                    className="bg-white dark:bg-[#1C1E22]"
                  >
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className={`h-8 px-3 rounded-[10px] text-[12px] font-medium border transition ${
                  categoryFilter === null
                    ? 'bg-[#F3A64A]/20 border-[#F3A64A]'
                    : 'bg-white dark:bg-[#1C1E22] border-black/15 dark:border-white/15'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() =>
                    setCategoryFilter(
                      categoryFilter === cat.id ? null : cat.id,
                    )
                  }
                  className={`h-8 px-3 rounded-[10px] text-[12px] font-medium border transition ${
                    categoryFilter === cat.id
                      ? 'bg-[#F3A64A]/20 border-[#F3A64A]'
                      : 'bg-white dark:bg-[#1C1E22] border-black/15 dark:border-white/15'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {filteredActivities.length === 0 ? (
              <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[18px] text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
                No activity entries recorded yet for this filter. Toggle a
                device, run a routine, issue a voice command, or update family
                access to log user-attributed history.
              </div>
            ) : (
              <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 overflow-hidden">
                {filteredActivities.map((entry, idx) => {
                  const Icon =
                    entry.category === 'device'
                      ? Lightbulb
                      : entry.category === 'door'
                        ? DoorClosed
                        : entry.category === 'automation'
                          ? Sparkles
                          : entry.category === 'voice'
                            ? Mic
                            : entry.category === 'family'
                              ? Users
                              : ShieldCheck;
                  return (
                    <div key={entry.logId}>
                      {idx > 0 && (
                        <div className="h-px bg-black/8 dark:bg-white/8 ml-16" />
                      )}
                      <div className="px-4 py-3 flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#F3A64A]/12 text-[#D9821E] dark:text-[#F3A64A] flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-semibold">
                            {entry.actionTitle}
                          </div>
                          {entry.detail && (
                            <div className="text-[12px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5">
                              {entry.detail}
                            </div>
                          )}
                          <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF] mt-0.5 tabular-nums">
                            {entry.actorName} ({formatRoleLabel(entry.actorRole)})
                            · {entry.source} · {formatTimestamp(entry.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== SECURITY TAB ==================== */}
        {selectedTab === 'security' && (
          <div className="space-y-3.5">
            {/* Account Security Card */}
            <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[18px] space-y-3.5">
              <div className="flex items-center gap-2.5">
                {currentEmailVerified ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
                )}
                <h2 className="flex-1 text-[16px] font-bold">
                  Account security
                </h2>
                <span
                  className={`px-2.5 py-1 rounded-[8px] text-[11px] font-bold ${
                    currentEmailVerified
                      ? 'bg-emerald-500/14 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/14 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {currentEmailVerified ? 'Verified' : 'Unverified'}
                </span>
              </div>

              <div className="space-y-1.5 text-[12px]">
                <div className="flex">
                  <span className="w-[120px] shrink-0 text-neutral-500 dark:text-[#C4C6CF]">
                    Signed-in user
                  </span>
                  <span className="font-semibold">{currentName}</span>
                </div>
                <div className="flex">
                  <span className="w-[120px] shrink-0 text-neutral-500 dark:text-[#C4C6CF]">
                    Email
                  </span>
                  <span className="font-semibold break-all">
                    {currentEmail}
                  </span>
                </div>
                <div className="flex">
                  <span className="w-[120px] shrink-0 text-neutral-500 dark:text-[#C4C6CF]">
                    Sign-in method
                  </span>
                  <span className="font-semibold">
                    {currentProviderIds.length === 0
                      ? 'Firebase Auth'
                      : currentProviderIds.join(', ')}
                  </span>
                </div>
                <div className="flex">
                  <span className="w-[120px] shrink-0 text-neutral-500 dark:text-[#C4C6CF]">
                    Household role
                  </span>
                  <span className="font-semibold">
                    {formatRoleLabel(currentRole)} · {homeName}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-0.5">
                {!currentEmailVerified && (
                  <button
                    type="button"
                    disabled={sendingSecurityEmail}
                    onClick={async () => {
                      setSendingSecurityEmail(true);
                      try {
                        await onResendVerification();
                      } finally {
                        setSendingSecurityEmail(false);
                      }
                    }}
                    className="h-9 px-4 rounded-full bg-[#F3A64A] text-[#101113] text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <MailCheck className="w-[18px] h-[18px]" />
                    <span>Send verification email</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void onRefreshVerification()}
                  className="h-9 px-4 rounded-full border border-black/15 dark:border-white/20 text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition"
                >
                  <RefreshCw className="w-[18px] h-[18px]" />
                  <span>Refresh status</span>
                </button>
                {usesPassword && (
                  <button
                    type="button"
                    disabled={sendingSecurityEmail}
                    onClick={async () => {
                      setSendingSecurityEmail(true);
                      try {
                        await onSendPasswordReset();
                      } finally {
                        setSendingSecurityEmail(false);
                      }
                    }}
                    className="h-9 px-4 rounded-full border border-black/15 dark:border-white/20 text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition disabled:opacity-50"
                  >
                    <RotateCcw className="w-[18px] h-[18px]" />
                    <span>Send password reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* Assigned Permissions Card */}
            <div className="rounded-[18px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[18px] space-y-2.5">
              <h2 className="text-[16px] font-bold">
                Your assigned permissions
              </h2>
              {(
                [
                  [
                    'Control lights and fan',
                    currentPermissions.canControlDevices,
                  ],
                  [
                    'Run automation routines',
                    currentPermissions.canRunAutomations,
                  ],
                  [
                    'Voice commands (from your authenticated account)',
                    currentPermissions.canUseVoiceCommands,
                  ],
                  [
                    'Manual door unlock (with device confirmation)',
                    currentPermissions.canUnlockDoor,
                  ],
                  [
                    'Manage family members & invites',
                    currentPermissions.canManageFamily,
                  ],
                ] as const
              ).map(([label, allowed]) => (
                <div key={label} className="flex items-center gap-2.5 py-0.5">
                  {allowed ? (
                    <CheckCircle2 className="w-[18px] h-[18px] text-emerald-500 shrink-0" />
                  ) : (
                    <Ban className="w-[18px] h-[18px] text-neutral-400 shrink-0" />
                  )}
                  <span
                    className={`text-[12px] ${
                      allowed
                        ? ''
                        : 'text-neutral-500 dark:text-[#C4C6CF]'
                    }`}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* Voice command identity & limitations */}
            <div className="rounded-[18px] bg-black/5 dark:bg-[#1C1E22] border border-black/10 dark:border-[#44474F]/25 p-[18px] flex items-start gap-3">
              <AudioLines className="w-5 h-5 text-[#D9821E] dark:text-[#F3A64A] shrink-0 mt-0.5" />
              <div>
                <h3 className="text-[14px] font-bold">
                  Voice command identity &amp; limitations
                </h3>
                <p className="mt-1.5 text-[12px] text-neutral-600 dark:text-[#C4C6CF] leading-[1.45]">
                  Family members can issue voice commands when signed into their
                  own authenticated accounts, and actions are logged under that
                  account. However, speaker or voice-print identity verification
                  is NOT implemented—this app cannot verify who spoke into the
                  microphone. Keep your device locked when unattended; door
                  unlocking remains disabled for all voice commands.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== INVITE / ADD MEMBER DIALOG ==================== */}
      {memberFormMode && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitMemberForm}
            className="max-w-[460px] w-full rounded-[24px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-white/10 p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] font-semibold">
                {memberFormMode === 'direct'
                  ? 'Add authorized user'
                  : 'Invite family member'}
              </h2>
              <button
                type="button"
                onClick={() => setMemberFormMode(null)}
                className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
              {memberFormMode === 'direct'
                ? 'Authorize a family member and choose what they can control from their signed-in account.'
                : 'Create an invitation tied to their email address and assigned permissions.'}
            </p>

            <label className="block space-y-1">
              <span className="text-[12px] font-medium">Full name</span>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full h-11 px-3 rounded-[10px] bg-transparent border border-black/25 dark:border-white/25 text-sm"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[12px] font-medium">Email address</span>
              <input
                type="email"
                required
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="w-full h-11 px-3 rounded-[10px] bg-transparent border border-black/25 dark:border-white/25 text-sm"
              />
            </label>

            <div className="space-y-1.5">
              <div className="text-[13px] font-bold">Role preset</div>
              <div className="grid grid-cols-2 rounded-full border border-black/20 dark:border-white/25 overflow-hidden">
                {(['adult', 'guest'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setFormRole(r);
                      setFormPerms(defaultPermissionsForRole(r));
                    }}
                    className={`h-9 text-[13px] font-medium capitalize transition ${
                      formRole === r
                        ? 'bg-[#F3A64A]/25 font-semibold'
                        : 'hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <PermissionSwitchGroup
              permissions={formPerms}
              allowAdminToggle={formRole === 'adult'}
              onChange={setFormPerms}
            />

            {formError && (
              <p className="text-[12px] text-rose-500">{formError}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={formBusy}
                onClick={() => setMemberFormMode(null)}
                className="px-4 py-2 text-[14px] font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formBusy}
                className="px-5 py-2 rounded-full bg-[#F3A64A] text-[#101113] text-[14px] font-semibold"
              >
                {formBusy
                  ? 'Saving…'
                  : memberFormMode === 'direct'
                    ? 'Add user'
                    : 'Create invite'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== JOIN HOUSEHOLD DIALOG ==================== */}
      {joinOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitJoin}
            className="max-w-[420px] w-full rounded-[24px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-white/10 p-6 space-y-4"
          >
            <h2 className="text-[20px] font-semibold">
              Join household with code
            </h2>
            <p className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
              Enter the invite code sent to {currentEmail} to link your
              authenticated account.
            </p>
            <input
              type="text"
              required
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Invite code (e.g. HB7K9M2P)"
              className="w-full h-11 px-3 rounded-[10px] bg-transparent border border-black/25 dark:border-white/25 text-sm font-mono uppercase"
            />
            {joinError && (
              <p className="text-[12px] text-rose-500">{joinError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={joinBusy}
                onClick={() => setJoinOpen(false)}
                className="px-4 py-2 text-[14px] font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={joinBusy}
                className="px-5 py-2 rounded-full bg-[#F3A64A] text-[#101113] text-[14px] font-semibold"
              >
                {joinBusy ? 'Joining…' : 'Join household'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== EDIT PERMISSIONS DIALOG ==================== */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditPerms}
            className="max-w-[460px] w-full rounded-[24px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-white/10 p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-[20px] font-semibold">
              Permissions · {editingMember.displayName}
            </h2>
            <p className="text-[12px] text-neutral-500 dark:text-[#C4C6CF]">
              {editingMember.email}
            </p>

            <div className="grid grid-cols-2 rounded-full border border-black/20 dark:border-white/25 overflow-hidden">
              {(['adult', 'guest'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setEditRole(r);
                    setEditPerms(defaultPermissionsForRole(r));
                  }}
                  className={`h-9 text-[13px] font-medium capitalize transition ${
                    editRole === r
                      ? 'bg-[#F3A64A]/25 font-semibold'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <PermissionSwitchGroup
              permissions={editPerms}
              allowAdminToggle={editRole === 'adult'}
              onChange={setEditPerms}
            />

            {editError && (
              <p className="text-[12px] text-rose-500">{editError}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={editBusy}
                onClick={() => setEditingMember(null)}
                className="px-4 py-2 text-[14px] font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editBusy}
                className="px-5 py-2 rounded-full bg-[#F3A64A] text-[#101113] text-[14px] font-semibold"
              >
                {editBusy ? 'Saving…' : 'Save permissions'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== REMOVE MEMBER CONFIRM ==================== */}
      {removingMember && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
          <div className="max-w-[400px] w-full rounded-[24px] bg-white dark:bg-[#1C1E22] border border-black/10 dark:border-white/10 p-6 space-y-4">
            <h2 className="text-[20px] font-semibold">
              Remove authorized user
            </h2>
            <p className="text-[14px] text-neutral-600 dark:text-[#C4C6CF]">
              Remove {removingMember.displayName} ({removingMember.email}) from{' '}
              {homeName}? They will immediately lose access to household
              controls and voice actions.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemovingMember(null)}
                className="px-4 py-2 text-[14px] font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = removingMember;
                  setRemovingMember(null);
                  try {
                    await onRemoveMember(target);
                    onShowNotice(`Removed ${target.displayName}.`);
                  } catch (err) {
                    onShowNotice(
                      err instanceof Error
                        ? err.message
                        : 'Failed to remove member.',
                    );
                  }
                }}
                className="px-5 py-2 rounded-full bg-rose-600 text-white text-[14px] font-semibold"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PermissionSwitchGroup: React.FC<{
  permissions: FamilyPermissions;
  allowAdminToggle: boolean;
  onChange: (next: FamilyPermissions) => void;
}> = ({ permissions, allowAdminToggle, onChange }) => {
  const rows: Array<{
    key: keyof FamilyPermissions;
    title: string;
    subtitle?: string;
    disabled?: boolean;
  }> = [
    { key: 'canControlDevices', title: 'Control lights & fan' },
    { key: 'canRunAutomations', title: 'Run automation routines' },
    {
      key: 'canUseVoiceCommands',
      title: 'Use voice commands (own account)',
      subtitle:
        'Runs under their signed-in account; no speaker identity verification.',
    },
    {
      key: 'canUnlockDoor',
      title: 'Manual door unlock',
      subtitle: 'Requires device confirmation; voice unlock stays blocked.',
    },
    {
      key: 'canManageFamily',
      title: 'Manage family & invites',
      disabled: !allowAdminToggle,
    },
  ];

  return (
    <div className="space-y-2.5 pt-1">
      {rows.map((r) => {
        const checked =
          r.key === 'canManageFamily' && !allowAdminToggle
            ? false
            : permissions[r.key];
        return (
          <div key={r.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[14px] font-medium">{r.title}</div>
              {r.subtitle && (
                <div className="text-[11px] text-neutral-500 dark:text-[#C4C6CF]">
                  {r.subtitle}
                </div>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={checked}
              disabled={r.disabled}
              onClick={() =>
                onChange({ ...permissions, [r.key]: !permissions[r.key] })
              }
              className={`relative w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-40 ${
                checked ? 'bg-[#F3A64A]' : 'bg-neutral-300 dark:bg-white/15'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  checked ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
};
