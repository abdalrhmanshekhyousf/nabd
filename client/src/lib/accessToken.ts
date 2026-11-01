// The access token lives only in memory (never localStorage), so an injected
// script can't steal it from storage. After a reload it is recovered through the
// httpOnly refresh cookie. The session store (task 1.18) builds on this.
let accessToken: string | null = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}
