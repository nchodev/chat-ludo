'use client';

import { useState, type ReactNode } from 'react';
import { MAX_GROUP_MEMBERS, MAX_GROUP_NAME, type GroupView } from '@ludo/engine';
import {
  addGroupMembers,
  createGroup,
  leaveGroup,
  makeGroupAdmin,
  removeGroupMember,
  renameGroup,
  type SocialState,
} from '@/lib/social';
import { Icon } from '../Icons';
import { Sheet } from '../Sheet';
import { Avatar } from './Avatar';

function FriendPicker({
  friends,
  picked,
  max,
  onChange,
}: {
  friends: string[];
  picked: string[];
  max: number;
  onChange: (picked: string[]) => void;
}) {
  if (friends.length === 0) return <p className="py-6 text-center text-[14px] text-[#8696a0]">Tous tes amis sont déjà dans le groupe.</p>;
  return (
    <ul className="-mx-2">
      {friends.map((name) => {
        const checked = picked.includes(name);
        return (
          <li key={name}>
            <button
              type="button"
              onClick={() => onChange(checked ? picked.filter((n) => n !== name) : picked.length < max ? [...picked, name] : picked)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-white/5"
              aria-pressed={checked}
            >
              <Avatar name={name} size={42} />
              <span className="min-w-0 flex-1 truncate text-[15.5px] text-[#e9edef]">{name}</span>
              <span
                className={`grid size-6 place-items-center rounded-full border-2 ${checked ? 'border-[#00a884] bg-[#00a884] text-[#0b141a]' : 'border-[#8696a0]'}`}
              >
                {checked && <Icon.Check size={16} />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PrimaryButton({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function errorText(err: unknown) {
  return err instanceof Error ? err.message : 'Action impossible.';
}

/** Pick friends, then name the group. */
export function NewGroupSheet({
  open,
  friends,
  onClose,
  onCreated,
}: {
  open: boolean;
  friends: string[];
  onClose: () => void;
  onCreated: (group: GroupView, social: SocialState) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [step, setStep] = useState<'members' | 'name'>('members');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPicked([]);
    setStep('members');
    setName('');
    setError(null);
    onClose();
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await createGroup(name.trim(), picked);
      onCreated(res.group, res);
      close();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title={step === 'members' ? 'Nouveau groupe' : 'Nom du groupe'} onClose={close}>
      {step === 'members' ? (
        <div className="flex flex-col pb-1">
          <p className="pb-2 text-[13px] text-[#8696a0]">
            Choisis les amis à ajouter{picked.length ? ` · ${picked.length} sélectionné${picked.length > 1 ? 's' : ''}` : ''}.
          </p>
          {friends.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-[#8696a0]">Ajoute d’abord des amis pour créer un groupe.</p>
          ) : (
            <FriendPicker friends={friends} picked={picked} max={MAX_GROUP_MEMBERS - 1} onChange={setPicked} />
          )}
          <PrimaryButton disabled={picked.length === 0} onClick={() => setStep('name')}>
            Suivant
            <Icon.ChevronRight size={20} />
          </PrimaryButton>
        </div>
      ) : (
        <form
          className="flex flex-col pb-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && !busy) void create();
          }}
        >
          <div className="flex items-center gap-3 py-2">
            <Avatar name={name || 'groupe'} group size={52} />
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_GROUP_NAME}
              placeholder="Nom du groupe"
              className="min-w-0 flex-1 border-b-2 border-[#00a884] bg-transparent py-2 text-[16px] text-[#e9edef] outline-none placeholder:text-[#8696a0]"
            />
          </div>
          <p className="pt-2 text-[13px] text-[#8696a0]">Membres : toi, {picked.join(', ')}</p>
          {error && <p className="pt-2 text-[13px] text-[#f15c6d]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep('members')}
              className="mt-3 flex h-12 flex-1 items-center justify-center rounded-full border border-[#2a3942] text-[15px] font-semibold text-[#00a884]"
            >
              Retour
            </button>
            <button
              type="submit"
              disabled={!name.trim() || busy}
              className="mt-3 flex h-12 flex-[2] items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] disabled:opacity-40"
            >
              <Icon.Check size={20} />
              Créer le groupe
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

/** Members, and for admins: add, remove, promote, rename. Anyone can leave. */
export function GroupInfoSheet({
  open,
  group,
  me,
  friends,
  online,
  onClose,
  onSocial,
  onLeft,
  onMessage,
}: {
  open: boolean;
  group: GroupView;
  me: string;
  friends: string[];
  online: Set<string>;
  onClose: () => void;
  onSocial: (social: SocialState) => void;
  onLeft: () => void;
  onMessage: (text: string) => void;
}) {
  const [view, setView] = useState<'info' | 'add' | 'rename' | 'leave'>('info');
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState(group.name);
  const [member, setMember] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amAdmin = group.members.some((m) => m.username === me && m.admin);
  const outside = friends.filter((f) => !group.members.some((m) => m.username === f));
  const members = [...group.members].sort((a, b) => (a.username === me ? -1 : b.username === me ? 1 : Number(b.admin) - Number(a.admin)));

  const close = () => {
    setView('info');
    setPicked([]);
    setMember(null);
    onClose();
  };

  const run = async (action: () => Promise<SocialState | void>, done?: string) => {
    setBusy(true);
    try {
      const social = await action();
      if (social) onSocial(social);
      if (done) onMessage(done);
      setView('info');
      setPicked([]);
      setMember(null);
    } catch (err) {
      onMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const title = view === 'add' ? 'Ajouter des membres' : view === 'rename' ? 'Renommer le groupe' : view === 'leave' ? 'Quitter le groupe ?' : 'Infos du groupe';

  return (
    <Sheet open={open} title={title} onClose={close}>
      {view === 'add' ? (
        <div className="flex flex-col pb-1">
          <FriendPicker friends={outside} picked={picked} max={MAX_GROUP_MEMBERS - group.members.length} onChange={setPicked} />
          <PrimaryButton
            disabled={picked.length === 0 || busy}
            onClick={() => void run(() => addGroupMembers(group.key, picked), picked.length > 1 ? `${picked.length} amis ajoutés` : `${picked[0]} ajouté`)}
          >
            <Icon.PersonAdd size={20} />
            {picked.length ? `Ajouter (${picked.length})` : 'Choisis des amis'}
          </PrimaryButton>
        </div>
      ) : view === 'rename' ? (
        <form
          className="flex flex-col pb-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && !busy) void run(() => renameGroup(group.key, name.trim()), 'Groupe renommé');
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_GROUP_NAME}
            className="border-b-2 border-[#00a884] bg-transparent py-2 text-[16px] text-[#e9edef] outline-none"
          />
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="mt-4 flex h-12 items-center justify-center rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] disabled:opacity-40"
          >
            Enregistrer
          </button>
        </form>
      ) : view === 'leave' ? (
        <div className="flex flex-col gap-1 pb-1">
          <p className="pb-2 text-[14px] leading-relaxed text-[#8696a0]">
            Tu ne recevras plus les messages de « {group.name} ». Les membres verront que tu es parti.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const social = await leaveGroup(group.key);
                onSocial(social);
                onLeft();
              }, 'Tu as quitté le groupe')
            }
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#f15c6d] text-[15px] font-semibold text-[#0b141a] disabled:opacity-40"
          >
            Quitter
          </button>
          <button type="button" onClick={() => setView('info')} className="flex h-12 items-center justify-center text-[15px] font-medium text-[#00a884]">
            Annuler
          </button>
        </div>
      ) : (
        <div className="flex flex-col pb-1">
          <div className="flex flex-col items-center gap-2 pt-1 pb-4">
            <Avatar name={group.name} group size={80} />
            <p className="flex items-center gap-2 text-[20px] font-medium">
              {group.name}
              {amAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setName(group.name);
                    setView('rename');
                  }}
                  className="grid size-8 place-items-center rounded-full text-[#8696a0] active:bg-white/10"
                  aria-label="Renommer le groupe"
                >
                  <Icon.Edit size={18} />
                </button>
              )}
            </p>
            <p className="text-[13.5px] text-[#8696a0]">
              Groupe · {group.members.length} membre{group.members.length > 1 ? 's' : ''}
            </p>
          </div>

          {amAdmin && group.members.length < MAX_GROUP_MEMBERS && (
            <button type="button" onClick={() => setView('add')} className="flex items-center gap-3 rounded-xl py-2 text-left active:bg-white/5">
              <span className="grid size-[42px] place-items-center rounded-full bg-[#00a884] text-[#0b141a]">
                <Icon.PersonAdd size={22} />
              </span>
              <span className="text-[15.5px] text-[#e9edef]">Ajouter des membres</span>
            </button>
          )}

          <ul className="-mx-2">
            {members.map((m) => {
              const isMe = m.username === me;
              const canManage = amAdmin && !isMe;
              const expanded = member === m.username;
              return (
                <li key={m.username}>
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => setMember(expanded ? null : m.username)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left enabled:active:bg-white/5"
                  >
                    <Avatar name={m.username} size={42} online={!isMe && online.has(m.username)} />
                    <span className="min-w-0 flex-1 truncate text-[15.5px] text-[#e9edef]">{isMe ? 'Toi' : m.username}</span>
                    {m.admin && <span className="rounded-md bg-[#00a884]/15 px-2 py-0.5 text-[11.5px] font-medium text-[#00a884]">Admin</span>}
                  </button>
                  {expanded && (
                    <div className="flex gap-2 px-2 pb-2">
                      {!m.admin && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(() => makeGroupAdmin(group.key, m.username), `${m.username} est admin`)}
                          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-white/5 text-[13.5px] font-medium text-[#00a884]"
                        >
                          <Icon.Shield size={17} />
                          Nommer admin
                        </button>
                      )}
                      {m.username !== group.createdBy && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(() => removeGroupMember(group.key, m.username), `${m.username} retiré`)}
                          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-white/5 text-[13.5px] font-medium text-[#f15c6d]"
                        >
                          <Icon.PersonRemove size={17} />
                          Retirer
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => setView('leave')}
            className="mt-3 flex h-12 items-center gap-3 rounded-xl px-1 text-[15px] font-medium text-[#f15c6d] active:bg-white/5"
          >
            <Icon.Back size={22} />
            Quitter le groupe
          </button>
        </div>
      )}
    </Sheet>
  );
}
