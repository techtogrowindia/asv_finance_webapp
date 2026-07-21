import { api } from '../lib/api';

export const changePassword = (currentPassword: string, newPassword: string) =>
  api<{ changed: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
