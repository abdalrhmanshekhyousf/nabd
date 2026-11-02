import { vi } from 'vitest';

type Handler = (...args: unknown[]) => void;
type AuthOption = (send: (data: object) => void) => void;

/**
 * Stands in for a socket.io-client connection in tests (registered for every
 * test in setup.ts), so pages never open real connections. Tests play the
 * server with `fromServer`.
 */
export class FakeSocket {
  connected = false;
  connectCalls = 0;
  private handlers = new Map<string, Handler[]>();

  readonly url: string;
  readonly options: { auth: AuthOption };

  constructor(url: string, options: { auth: AuthOption }) {
    this.url = url;
    this.options = options;
  }

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  removeAllListeners() {
    this.handlers.clear();
    return this;
  }

  connect() {
    this.connectCalls += 1;
    this.connected = true;
    return this;
  }

  disconnect() {
    this.connected = false;
    return this;
  }

  /** The token this socket would send right now. */
  token() {
    let sent: { token?: string } = {};
    this.options.auth((data) => (sent = data));
    return sent.token;
  }

  /** Delivers an event as if the server sent it. */
  fromServer(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

export const fakeSockets: FakeSocket[] = [];

/** The connection opened most recently. */
export const lastSocket = () => fakeSockets[fakeSockets.length - 1];

vi.mock('socket.io-client', () => ({
  io: (url: string, options: FakeSocket['options']) => {
    const socket = new FakeSocket(url, options);
    fakeSockets.push(socket);
    return socket;
  },
}));
