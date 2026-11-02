import { REALTIME_EVENTS, type NotificationItem, type RefreshPayload } from '@nabd/shared';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './accessToken';
import { api, refreshSession } from './api';

export type RealtimeHandlers = {
  onNotification: (item: NotificationItem) => void;
  onRefresh: (payload: RefreshPayload) => void;
};

/** After this many refused reconnects in a row we stop (the account can't sign in). */
const MAX_AUTH_RETRIES = 3;

/** The API's origin: Socket.io runs on the same server, outside /api. */
function serverOrigin() {
  return new URL(api.defaults.baseURL ?? '/', window.location.href).origin;
}

/**
 * Opens the live connection for the signed-in user (task 2.3) and returns a
 * function that closes it. The server closes it when the access token runs
 * out (or the account is suspended); we renew the token and reconnect, and
 * give up only if the session can't be renewed.
 */
export function startRealtime({ onNotification, onRefresh }: RealtimeHandlers) {
  let stopped = false;
  let authRetries = 0;

  const socket: Socket = io(serverOrigin(), {
    // A function, so every (re)connect sends the current token.
    auth: (send) => send({ token: getAccessToken() }),
    transports: ['websocket'],
    autoConnect: false,
  });

  async function renewAndReconnect() {
    if (stopped || authRetries >= MAX_AUTH_RETRIES) return;
    authRetries += 1;
    const renewed = await refreshSession();
    if (renewed && !stopped) socket.connect();
  }

  socket.on('ready', () => {
    authRetries = 0;
  });
  // Refused at the door: the token expired or is no longer valid.
  socket.on('connect_error', (error) => {
    if (error.message === 'UNAUTHENTICATED') void renewAndReconnect();
  });
  // The server hung up (token ran out): Socket.io won't retry this by itself.
  // Network drops ("transport close") are retried automatically.
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') void renewAndReconnect();
  });
  socket.on(REALTIME_EVENTS.notification, onNotification);
  socket.on(REALTIME_EVENTS.refresh, onRefresh);

  socket.connect();
  return () => {
    stopped = true;
    socket.removeAllListeners();
    socket.disconnect();
  };
}
