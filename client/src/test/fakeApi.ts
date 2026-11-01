import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

export type Reply = { status: number; data?: unknown } | 'network-error';
export type FakeServer = (config: InternalAxiosRequestConfig) => Reply;

/**
 * Replaces the network layer of an Axios instance with a fake server. Returns
 * the list of requests it received; change the answers with `respond`.
 */
export function fakeApi(instance: AxiosInstance, initial: FakeServer = () => ({ status: 200 })) {
  let server = initial;
  const calls: InternalAxiosRequestConfig[] = [];

  instance.defaults.adapter = async (config) => {
    calls.push(config);
    const reply = server(config);
    if (reply === 'network-error') {
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
    }
    const response = {
      data: reply.data,
      status: reply.status,
      statusText: '',
      headers: {},
      config,
    };
    if (reply.status < 400) return response;
    throw new AxiosError(
      'Request failed',
      AxiosError.ERR_BAD_RESPONSE,
      config,
      undefined,
      response,
    );
  };

  return {
    calls,
    respond(next: FakeServer) {
      server = next;
    },
  };
}

export const apiError = (status: number, code: string, message = code) => ({
  status,
  data: { error: { code, message } },
});
