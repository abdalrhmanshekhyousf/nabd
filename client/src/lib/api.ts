import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import i18n, { currentLanguage } from '@/i18n';
import { getAccessToken, setAccessToken } from './accessToken';
import { notify } from './notify';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Don't show the error toast (forms that show errors next to the fields). */
    skipErrorToast?: boolean;
    /** Don't try to refresh the session on 401 (the auth endpoints themselves). */
    skipAuthRefresh?: boolean;
    /** Internal: this request was already retried after a refresh. */
    _retried?: boolean;
  }
}

/** Shape of every error body from the Nabd API. */
export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown; debug?: string };
};

export type AuthResponse = {
  accessToken: string;
  expiresIn: number;
  user: unknown;
};

// One shared client for the whole app.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
  // Sends the httpOnly refresh cookie to /auth routes.
  withCredentials: true,
  timeout: 20_000,
});

// Every request carries the session token and the interface language, so the
// server answers (and words its errors) in the same language.
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  config.headers.set('Accept-Language', currentLanguage());
  return config;
});

// --- Session refresh -------------------------------------------------------

const sessionExpiredListeners = new Set<() => void>();

/** Called when the session can't be renewed; the login page (1.19) redirects here. */
export function onSessionExpired(listener: () => void) {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

let refreshing: Promise<string | null> | null = null;

/**
 * Gets a new access token from the refresh cookie. Requests that fail at the same
 * moment share one refresh instead of each starting their own (which would also
 * trip the server's token-reuse protection).
 */
export function refreshSession() {
  refreshing ??= api
    .post<AuthResponse>('/auth/refresh', undefined, {
      skipAuthRefresh: true,
      skipErrorToast: true,
    })
    .then(({ data }) => {
      setAccessToken(data.accessToken);
      return data.accessToken;
    })
    .catch(() => {
      setAccessToken(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// --- Responses: refresh-and-retry, then one place for error toasts ----------

function isApiError(error: unknown): error is AxiosError<ApiErrorBody> {
  return axios.isAxiosError(error);
}

/** The server's error code and translated message, or a network message. */
export function describeApiError(error: unknown) {
  if (isApiError(error) && error.response?.data?.error) {
    const { code, message, details } = error.response.data.error;
    return { status: error.response.status, code, message, details };
  }
  if (isApiError(error) && !error.response) {
    return { status: 0, code: 'NETWORK_ERROR', message: i18n.t('apiErrors.network') };
  }
  return { status: 500, code: 'UNKNOWN', message: i18n.t('apiErrors.unknown') };
}

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!isApiError(error)) throw error;
  const config = error.config as AxiosRequestConfig | undefined;

  if (error.response?.status === 401 && config && !config.skipAuthRefresh && !config._retried) {
    const token = await refreshSession();
    if (token) {
      config._retried = true;
      return api.request(config);
    }
    sessionExpiredListeners.forEach((listener) => listener());
    if (!config.skipErrorToast) notify.error(i18n.t('apiErrors.sessionExpired'));
    throw error;
  }

  if (!config?.skipErrorToast) notify.error(describeApiError(error).message);
  throw error;
});
