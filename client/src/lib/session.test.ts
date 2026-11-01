import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/app/session';
import { apiError, fakeApi } from '@/test/fakeApi';

const USER: SessionUser = {
  id: 'u1',
  email: 'admin@nabd.demo',
  fullName: 'مدير المستشفى',
  role: 'ADMIN',
  language: 'EN',
  theme: 'DARK',
  hospital: { id: 'h1', name: 'مستشفى نبض التجريبي', logoUrl: null },
};

// initSession wires listeners once per app start, so each test loads a fresh
// copy of the modules (stores included) as if the app had just opened.
async function freshApp() {
  vi.resetModules();
  const [session, api, sessionStore, themeStore, i18n, accessToken, queryClient] =
    await Promise.all([
      import('./session'),
      import('./api'),
      import('@/stores/sessionStore'),
      import('@/stores/themeStore'),
      import('@/i18n'),
      import('./accessToken'),
      import('@/app/queryClient'),
    ]);
  const fake = fakeApi(api.api);
  return {
    ...session,
    fake,
    store: sessionStore.useSessionStore,
    themeStore: themeStore.useThemeStore,
    i18n: i18n.default,
    getAccessToken: accessToken.getAccessToken,
    queryClient: queryClient.queryClient,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const patches = (calls: { url?: string; method?: string; data?: unknown }[]) =>
  calls
    .filter((c) => c.url === '/me/preferences' && c.method === 'patch')
    .map((c) => JSON.parse(c.data as string));

describe('session start-up', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('restores the previous session from the refresh cookie', async () => {
    const app = await freshApp();
    app.fake.respond((config) =>
      config.url === '/auth/refresh'
        ? { status: 200, data: { accessToken: 'tok', expiresIn: 900, user: USER } }
        : { status: 200 },
    );

    await app.initSession();

    expect(app.store.getState()).toMatchObject({ status: 'authenticated', user: USER });
    expect(app.getAccessToken()).toBe('tok');
  });

  it('applies the account language and theme, without sending them back', async () => {
    const app = await freshApp();
    app.fake.respond(() => ({
      status: 200,
      data: { accessToken: 'tok', expiresIn: 900, user: USER },
    }));

    await app.initSession();

    expect(app.themeStore.getState().theme).toBe('dark');
    expect(app.i18n.language).toBe('en');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(patches(app.fake.calls)).toEqual([]);
  });

  it('is anonymous when there is no session to restore', async () => {
    const app = await freshApp();
    app.fake.respond(() => apiError(401, 'INVALID_REFRESH_TOKEN'));

    await app.initSession();

    expect(app.store.getState()).toMatchObject({ status: 'anonymous', user: null });
  });
});

describe('signed in', () => {
  async function signedIn() {
    const app = await freshApp();
    app.fake.respond(() => ({
      status: 200,
      data: {
        accessToken: 'tok',
        expiresIn: 900,
        user: { ...USER, language: 'AR', theme: 'SYSTEM' },
      },
    }));
    await app.initSession();
    app.fake.calls.length = 0;
    return app;
  }

  it('saves theme and language changes to the account', async () => {
    const app = await signedIn();

    app.themeStore.getState().setTheme('light');
    await app.i18n.changeLanguage('en');
    await flush();

    expect(patches(app.fake.calls)).toEqual([{ theme: 'LIGHT' }, { language: 'EN' }]);
    expect(app.store.getState().user).toMatchObject({ theme: 'LIGHT', language: 'EN' });
  });

  it('logs out on the server and clears local state and cached data', async () => {
    const app = await signedIn();
    app.queryClient.setQueryData(['secret'], 'patient data');

    await app.logout();

    expect(app.fake.calls.map((c) => c.url)).toContain('/auth/logout');
    expect(app.store.getState()).toMatchObject({ status: 'anonymous', user: null });
    expect(app.getAccessToken()).toBeNull();
    expect(app.queryClient.getQueryData(['secret'])).toBeUndefined();
  });

  it('still signs out locally when the server cannot be reached', async () => {
    const app = await signedIn();
    app.fake.respond(() => 'network-error');

    await app.logout();

    expect(app.store.getState().status).toBe('anonymous');
  });

  it('ends the session when the server says it expired', async () => {
    const app = await signedIn();
    app.fake.respond(() => apiError(401, 'UNAUTHENTICATED'));
    const { api } = await import('./api');

    await api.get('/me', { skipErrorToast: true }).catch(() => undefined);

    expect(app.store.getState().status).toBe('anonymous');
  });
});
