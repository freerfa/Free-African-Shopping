import React, { useCallback, useEffect, useState } from 'react';
import type { Permission, StaffMember, User } from '../../types';
import { ALL_PERMISSIONS, PERMISSION_LABELS, ROLE_PRESETS } from '../../types';
import { api, ApiError } from '../../lib/api';
import { inputClass, labelClass } from '../ui';

interface StaffPanelProps {
  /** The signed-in admin. Only their `grantablePermissions` may be handed out,
   *  which is what stops a staff manager granting rights they lack. */
  user: User;
  onNotice: (ok: boolean, text: string) => void;
}

const checkbox =
  'h-4 w-4 rounded border-gray-300 text-brand-gold-ink dark:text-brand-gold dark:focus:ring-brand-gold';

/** Per-right checkbox list, with the unavailable ones greyed out and explained
 *  rather than silently hidden — the owner sees the full catalogue even when a
 *  staff manager cannot grant part of it. */
const PermissionPicker: React.FC<{
  selected: Permission[];
  onToggle: (permission: Permission) => void;
  grantable: Permission[];
}> = ({ selected, onToggle, grantable }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
    {ALL_PERMISSIONS.map((permission) => {
      const allowed = grantable.includes(permission);
      return (
        <label
          key={permission}
          className={`flex items-start gap-2 text-sm p-2 rounded-md border border-gray-200 dark:border-dark-border ${
            allowed
              ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg/40'
              : 'opacity-50 cursor-not-allowed'
          }`}
        >
          <input
            type="checkbox"
            checked={selected.includes(permission)}
            disabled={!allowed}
            onChange={() => onToggle(permission)}
            className={checkbox}
          />
          <span>
            <span className="block font-medium text-gray-700 dark:text-gray-300">
              {PERMISSION_LABELS[permission]}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              <code>{permission}</code>
              {!allowed && ' — you cannot grant this'}
            </span>
          </span>
        </label>
      );
    })}
  </div>
);

/**
 * Admin → Staff: the owner (and anyone with `staff.manage`) creates admin
 * accounts and picks exactly which rights each one holds.
 *
 * Rights are enforced on the server for every route, so hiding a checkbox here
 * is a convenience — the API is the real boundary. Removing someone, or
 * shrinking their rights, signs their live sessions out so the change applies
 * immediately.
 */
const StaffPanel: React.FC<StaffPanelProps> = ({ user, onNotice }) => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selected, setSelected] = useState<Permission[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editSelected, setEditSelected] = useState<Permission[]>([]);
  const [editPassword, setEditPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const grantable = user.grantablePermissions ?? [];

  const load = useCallback(async () => {
    try {
      const result = await api.getStaff();
      setStaff(result.staff);
    } catch (error) {
      onNotice(false, error instanceof ApiError ? error.message : 'Could not load the staff list.');
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (list: Permission[], permission: Permission): Permission[] =>
    list.includes(permission) ? list.filter((p) => p !== permission) : [...list, permission];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.createStaff({ email: email.trim(), password, permissions: selected });
      onNotice(true, `Created an account for ${email.trim()}.`);
      setEmail('');
      setPassword('');
      setSelected([]);
      await load();
    } catch (error) {
      onNotice(false, error instanceof ApiError ? error.message : 'Could not create that account.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (member: StaffMember) => {
    setSaving(true);
    try {
      await api.updateStaff(member.email, {
        permissions: editSelected,
        // Blank means "keep the current password", so an admin can change
        // someone's rights without knowing their password.
        ...(editPassword !== '' ? { password: editPassword } : {}),
      });
      onNotice(true, `Updated the rights for ${member.email}.`);
      setEditing(null);
      setEditPassword('');
      await load();
    } catch (error) {
      onNotice(false, error instanceof ApiError ? error.message : 'Could not save those rights.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (member: StaffMember) => {
    if (!window.confirm(`Remove the account for ${member.email}? They will be signed out immediately.`)) return;
    try {
      await api.deleteStaff(member.email);
      onNotice(true, `Removed ${member.email}.`);
      await load();
    } catch (error) {
      onNotice(false, error instanceof ApiError ? error.message : 'Could not remove that account.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <StaffCreateForm
        grantable={grantable}
        saving={saving}
        email={email}
        password={password}
        selected={selected}
        onEmail={setEmail}
        onPassword={setPassword}
        onToggle={(p) => setSelected((prev) => toggle(prev, p))}
        onPreset={(p) => setSelected(p)}
        onSubmit={handleCreate}
      />
      <StaffList
        staff={staff}
        loading={loading}
        grantable={grantable}
        editing={editing}
        editSelected={editSelected}
        editPassword={editPassword}
        saving={saving}
        onEditPassword={setEditPassword}
        onToggle={(p) => setEditSelected((prev) => toggle(prev, p))}
        onStartEdit={(member) => {
          setEditing(member.email);
          setEditSelected(member.permissions);
          setEditPassword('');
        }}
        onCancelEdit={() => { setEditing(null); setEditPassword(''); }}
        onSaveEdit={handleSaveEdit}
        onDelete={handleDelete}
        ownerEmail={user.email}
      />
    </div>
  );
};

/** The "add someone" card: credentials plus the role presets and checkboxes. */
const StaffCreateForm: React.FC<{
  grantable: Permission[];
  saving: boolean;
  email: string;
  password: string;
  selected: Permission[];
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onToggle: (permission: Permission) => void;
  onPreset: (permissions: Permission[]) => void;
  onSubmit: (e: React.FormEvent) => void;
}> = ({ grantable, saving, email, password, selected, onEmail, onPassword, onToggle, onPreset, onSubmit }) => (
  <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6">
    <h3 className="font-bold text-brand-dark dark:text-dark-text">Add someone</h3>
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">
      They sign in with the same form as you, and see only what you tick here.
    </p>
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="staff-email">Email</label>
          <input id="staff-email" type="email" value={email} required
            onChange={(e) => onEmail(e.target.value)} className={inputClass}
            placeholder="name@shop.com" />
        </div>
        <div>
          <label className={labelClass} htmlFor="staff-pass">Password</label>
          <input id="staff-pass" type="password" value={password} required minLength={8}
            onChange={(e) => onPassword(e.target.value)} className={inputClass}
            placeholder="At least 8 characters" autoComplete="new-password" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Start from a role</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {ROLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              onClick={() => onPreset(preset.permissions.filter((p) => grantable.includes(p)))}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-300 dark:border-dark-border hover:border-brand-gold-ink hover:text-brand-gold-ink dark:hover:border-brand-gold dark:hover:text-brand-gold transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelClass}>Rights</label>
        <div className="mt-2">
          <PermissionPicker selected={selected} onToggle={onToggle} grantable={grantable} />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving || selected.length === 0}
        className="px-6 py-2.5 rounded-full text-sm font-semibold text-white bg-brand-dark hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? 'Creating…' : 'Create account'}
      </button>
      {selected.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Pick at least one right — an account with none could not do anything.
        </p>
      )}
    </form>
  </div>
);

/** The existing accounts, each expandable to change its rights or password. */
const StaffList: React.FC<{
  staff: StaffMember[];
  loading: boolean;
  grantable: Permission[];
  editing: string | null;
  editSelected: Permission[];
  editPassword: string;
  saving: boolean;
  ownerEmail: string;
  onEditPassword: (value: string) => void;
  onToggle: (permission: Permission) => void;
  onStartEdit: (member: StaffMember) => void;
  onCancelEdit: () => void;
  onSaveEdit: (member: StaffMember) => void;
  onDelete: (member: StaffMember) => void;
}> = ({
  staff, loading, grantable, editing, editSelected, editPassword, saving, ownerEmail,
  onEditPassword, onToggle, onStartEdit, onCancelEdit, onSaveEdit, onDelete,
}) => (
  <>
    {/* Owner, shown so it is obvious this account is different and untouchable. */}
    <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6">
      <h3 className="font-bold text-brand-dark dark:text-dark-text">Store owner</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
        {ownerEmail} — holds every right, manages staff, and cannot be removed or reduced here.
      </p>
    </div>

    <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6">
      <h3 className="font-bold text-brand-dark dark:text-dark-text mb-4">
        Staff accounts ({staff.length})
      </h3>
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No staff accounts yet. Anyone you add can sign in and will only see what you allow.
        </p>
      ) : (
        <ul className="space-y-4">
          {staff.map((member) => (
            <li key={member.email} className="border-b dark:border-dark-border pb-4 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold dark:text-dark-text truncate">{member.email}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {member.permissions.length} right(s):{' '}
                    {member.permissions.map((p) => PERMISSION_LABELS[p]).join(' · ')}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {editing === member.email ? (
                    <>
                      <button
                        onClick={() => onSaveEdit(member)}
                        disabled={saving || editSelected.length === 0}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold bg-brand-gold text-brand-dark disabled:opacity-40"
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={onCancelEdit}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-300 dark:border-dark-border"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => onStartEdit(member)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-300 dark:border-dark-border hover:border-brand-gold-ink hover:text-brand-gold-ink dark:hover:border-brand-gold dark:hover:text-brand-gold transition-colors"
                      >
                        Edit rights
                      </button>
                      <button
                        onClick={() => onDelete(member)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editing === member.email && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className={labelClass} htmlFor={`staff-pass-${member.email}`}>
                      New password (optional)
                    </label>
                    <input
                      id={`staff-pass-${member.email}`}
                      type="password"
                      value={editPassword}
                      minLength={8}
                      onChange={(e) => onEditPassword(e.target.value)}
                      className={inputClass}
                      placeholder="Leave blank to keep the current one"
                      autoComplete="new-password"
                    />
                  </div>
                  <PermissionPicker selected={editSelected} onToggle={onToggle} grantable={grantable} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  </>
);

export default StaffPanel;