import { apiRequest } from '@/lib/api';
import { apiSession } from '../../lib/api/api-session';
import type { AuthUser, LoginInput } from './auth.types';

export const authService = {
  me(signal?: AbortSignal) {
    return apiRequest<AuthUser>('/auth/me', { signal });
  },

  login(input: LoginInput) {
    return apiSession.change(() =>
      apiRequest<AuthUser>('/auth/login', {
        method: 'POST', body: input, auth: false,
      }),
    );
  },

  logout() {
    return apiSession.change(() =>
      apiRequest<void>('/auth/logout', {
        method: 'POST', auth: false,
      }),
    );
  },
};
