import { create } from 'zustand';
import type { SessionUser } from '@/app/session';
import { setAccessToken } from '@/lib/accessToken';

type SessionStatus =
  /** Checking the refresh cookie on start-up. */
  'loading' | 'authenticated' | 'anonymous';

type SessionState = {
  status: SessionStatus;
  user: SessionUser | null;
  signIn: (accessToken: string, user: SessionUser) => void;
  /** Update fields of the signed-in user (e.g. saved preferences). */
  patchUser: (changes: Partial<SessionUser>) => void;
  signOut: () => void;
};

// The current user. The access token itself stays outside React state (lib/accessToken).
export const useSessionStore = create<SessionState>()((set) => ({
  status: 'loading',
  user: null,
  signIn: (accessToken, user) => {
    setAccessToken(accessToken);
    set({ status: 'authenticated', user });
  },
  patchUser: (changes) =>
    set((state) => (state.user ? { user: { ...state.user, ...changes } } : {})),
  signOut: () => {
    setAccessToken(null);
    set({ status: 'anonymous', user: null });
  },
}));
