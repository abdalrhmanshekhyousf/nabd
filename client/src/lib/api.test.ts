import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '@/i18n';
import { getAccessToken, setAccessToken } from './accessToken';
import { api, describeApiError, onSessionExpired } from './api';
import { notify } from './notify';

// A fake server: each test decides how the API answers.
type Reply = { status: number; data?: unknown } | 'network-error';
let server: (config: InternalAxiosRequestConfig) => Reply;
let calls: InternalAxiosRequestConfig[];

api.defaults.adapter = async (config) => {
  calls.push(config);
  const reply = server(config);
  if (reply === 'network-error') {
    throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
  }
  const response: AxiosResponse = {
    data: reply.data,
    status: reply.status,
    statusText: '',
    headers: {},
    config,
  };
  if (reply.status < 400) return response;
  throw new AxiosError('Request failed', AxiosError.ERR_BAD_RESPONSE, config, undefined, response);
};

const apiError = (status: number, code: string, message: string) => ({
  status,
  data: { error: { code, message } },
});

let toastError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  calls = [];
  setAccessToken(null);
  toastError = vi.spyOn(notify, 'error').mockReturnValue('id');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('requests', () => {
  it('send the access token and the interface language', async () => {
    server = () => ({ status: 200, data: { ok: true } });
    setAccessToken('token-1');

    await api.get('/me');
    await setLanguage('en');
    await api.get('/me');

    expect(calls[0].headers.Authorization).toBe('Bearer token-1');
    expect(calls[0].headers['Accept-Language']).toBe('ar');
    expect(calls[1].headers['Accept-Language']).toBe('en');
    expect(calls[0].withCredentials).toBe(true);
  });

  it('send no Authorization header when signed out', async () => {
    server = () => ({ status: 200 });
    await api.get('/health');
    expect(calls[0].headers.Authorization).toBeUndefined();
  });
});

describe('expired access token', () => {
  it('refreshes once and retries the request with the new token', async () => {
    setAccessToken('old');
    server = (config) => {
      if (config.url === '/auth/refresh') return { status: 200, data: { accessToken: 'new' } };
      return config.headers.Authorization === 'Bearer new'
        ? { status: 200, data: { user: 'me' } }
        : apiError(401, 'UNAUTHENTICATED', 'expired');
    };

    const res = await api.get('/me');

    expect(res.data).toEqual({ user: 'me' });
    expect(getAccessToken()).toBe('new');
    expect(calls.map((c) => c.url)).toEqual(['/me', '/auth/refresh', '/me']);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('shares one refresh between requests that fail together', async () => {
    setAccessToken('old');
    server = (config) => {
      if (config.url === '/auth/refresh') return { status: 200, data: { accessToken: 'new' } };
      return config.headers.Authorization === 'Bearer new'
        ? { status: 200 }
        : apiError(401, 'UNAUTHENTICATED', 'expired');
    };

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);

    expect(calls.filter((c) => c.url === '/auth/refresh')).toHaveLength(1);
  });

  it('ends the session when the refresh fails', async () => {
    setAccessToken('old');
    const expired = vi.fn();
    const stop = onSessionExpired(expired);
    server = (config) =>
      config.url === '/auth/refresh'
        ? apiError(401, 'INVALID_REFRESH_TOKEN', 'x')
        : apiError(401, 'UNAUTHENTICATED', 'x');

    await expect(api.get('/me')).rejects.toBeInstanceOf(AxiosError);

    expect(expired).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBeNull();
    expect(toastError).toHaveBeenCalledWith('انتهت الجلسة، سجّل دخولك من جديد');
    stop();
  });

  it('does not loop on the auth endpoints themselves', async () => {
    server = () => apiError(401, 'INVALID_CREDENTIALS', 'الإيميل أو كلمة السر غير صحيحة');

    await expect(
      api.post('/auth/login', {}, { skipAuthRefresh: true, skipErrorToast: true }),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(calls).toHaveLength(1);
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('errors', () => {
  it('toast the server message, already in the user language', async () => {
    server = () => apiError(403, 'FORBIDDEN', 'ما عندك صلاحية لهالشي');

    await expect(api.get('/admin')).rejects.toBeInstanceOf(AxiosError);

    expect(toastError).toHaveBeenCalledWith('ما عندك صلاحية لهالشي');
  });

  it('stay quiet when the caller shows errors itself', async () => {
    server = () => apiError(400, 'VALIDATION_ERROR', 'x');

    await expect(api.post('/x', {}, { skipErrorToast: true })).rejects.toBeInstanceOf(AxiosError);

    expect(toastError).not.toHaveBeenCalled();
  });

  it('explain a lost connection in the user language', async () => {
    server = () => 'network-error';

    const error = await api.get('/me').catch((e: unknown) => e);

    expect(toastError).toHaveBeenCalledWith(
      'ما قدرنا نوصل للسيرفر، تأكد من الاتصال وجرّب مرة تانية',
    );
    expect(describeApiError(error)).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('expose the code and details for forms', async () => {
    server = () => ({
      status: 409,
      data: { error: { code: 'HOSPITAL_REQUIRED', message: 'm', details: { hospitals: [1] } } },
    });

    const error = await api.post('/auth/login', {}, { skipErrorToast: true }).catch((e) => e);

    expect(describeApiError(error)).toEqual({
      status: 409,
      code: 'HOSPITAL_REQUIRED',
      message: 'm',
      details: { hospitals: [1] },
    });
  });
});
