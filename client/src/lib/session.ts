import type { AuthResponse, SessionUser } from '@/app/session';
import { queryClient } from '@/app/queryClient';
import i18n, { isLanguage, setLanguage } from '@/i18n';
import { useSessionStore } from '@/stores/sessionStore';
import { useThemeStore, type ThemeChoice } from '@/stores/themeStore';
import { api, onSessionExpired, onSessionRefreshed, refreshSession } from './api';
import { applyTheme } from './theme';

// --- Preferences: the account is the source of truth once signed in ---------

const THEME_FROM_ACCOUNT: Record<SessionUser['theme'], ThemeChoice> = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
};
const THEME_TO_ACCOUNT: Record<ThemeChoice, SessionUser['theme']> = {
  light: 'LIGHT',
  dark: 'DARK',
  system: 'SYSTEM',
};

// True while we copy the account's preferences into the app, so that change is
// not sent straight back to the server.
let applyingFromAccount = false;

async function applyAccountPreferences(user: SessionUser) {
  applyingFromAccount = true;
  try {
    const theme = THEME_FROM_ACCOUNT[user.theme];
    useThemeStore.getState().setTheme(theme);
    applyTheme(theme);
    await setLanguage(user.language === 'EN' ? 'en' : 'ar');
  } finally {
    applyingFromAccount = false;
  }
}

function savePreference(changes: Partial<Pick<SessionUser, 'language' | 'theme'>>) {
  const { status, user, patchUser } = useSessionStore.getState();
  if (applyingFromAccount || status !== 'authenticated' || !user) return;
  if (Object.entries(changes).every(([key, value]) => user[key as keyof SessionUser] === value)) {
    return;
  }
  patchUser(changes);
  // A failed save is not worth interrupting anyone; the device keeps the choice.
  void api.patch('/me/preferences', changes, { skipErrorToast: true }).catch(() => undefined);
}

// --- Session lifecycle --------------------------------------------------------

export async function startSession({ accessToken, user }: AuthResponse) {
  useSessionStore.getState().signIn(accessToken, user);
  await applyAccountPreferences(user);
}

function endSession() {
  useSessionStore.getState().signOut();
  // Never show one user's cached data to the next.
  queryClient.clear();
}

/** Signs out on the server too. Works offline: the local session always ends. */
export async function logout() {
  await api
    .post('/auth/logout', undefined, { skipAuthRefresh: true, skipErrorToast: true })
    .catch(() => undefined);
  endSession();
}

let started = false;

/**
 * Runs once on app start: wires the session to the API client and the
 * preference stores, then tries to restore the previous session from the
 * httpOnly refresh cookie (so a reload keeps you signed in).
 */
export async function initSession() {
  if (started) return;
  started = true;

  onSessionExpired(endSession);
  onSessionRefreshed(({ user }) => useSessionStore.getState().patchUser(user));
  useThemeStore.subscribe((state, previous) => {
    if (state.theme !== previous.theme) savePreference({ theme: THEME_TO_ACCOUNT[state.theme] });
  });
  i18n.on('languageChanged', (language) => {
    if (isLanguage(language)) savePreference({ language: language === 'en' ? 'EN' : 'AR' });
  });

  const restored = await refreshSession();
  if (restored) await startSession(restored);
  else useSessionStore.getState().signOut();
}
