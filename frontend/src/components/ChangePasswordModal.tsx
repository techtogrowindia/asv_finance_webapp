import { useState } from 'react';
import { changePassword } from '../api/auth';

/** Self-service "change my own password" — available to any signed-in role
 *  (FDO/BM/HO), opened from the topbar next to Sign out in both portals. */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return; }
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className="modal-title">Change password</h3>
        {success ? (
          <>
            <p className="modal-message">Your password has been changed.</p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose} autoFocus>Done</button>
            </div>
          </>
        ) : (
          <>
            {error && <div className="alert-error">{error}</div>}
            <div className="field">
              <label>Current password</label>
              <input
                className="input"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label>New password</label>
              <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={busy || !currentPassword || !newPassword || !confirmPassword}
                onClick={save}
              >
                {busy ? <span className="spinner" /> : 'Change password'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
