const TTL_MS = 10 * 60 * 1000;

interface PendingDeviceCode {
  createdAt: number;
  sessionId?: string;
  username?: string;
}

interface PendingOAuthState {
  createdAt: number;
  deviceCode?: string;
}

const deviceCodes = new Map<string, PendingDeviceCode>();
const oauthStates = new Map<string, PendingOAuthState>();

function isExpired(entry: { createdAt: number }): boolean {
  return Date.now() - entry.createdAt > TTL_MS;
}

export function createDeviceCode(): string {
  const code = crypto.randomUUID();
  deviceCodes.set(code, { createdAt: Date.now() });
  return code;
}

export function hasDeviceCode(code: string): boolean {
  const entry = deviceCodes.get(code);
  if (!entry) return false;
  if (isExpired(entry)) {
    deviceCodes.delete(code);
    return false;
  }
  return true;
}

export function completeDeviceCode(
  code: string,
  sessionId: string,
  username: string
): void {
  const entry = deviceCodes.get(code);
  if (!entry || isExpired(entry)) return;
  entry.sessionId = sessionId;
  entry.username = username;
}

export function consumeDeviceCode(
  code: string
): { sessionId: string; username: string } | null {
  const entry = deviceCodes.get(code);
  if (!entry || isExpired(entry)) {
    deviceCodes.delete(code);
    return null;
  }
  if (!entry.sessionId || !entry.username) return null;
  deviceCodes.delete(code);
  return { sessionId: entry.sessionId, username: entry.username };
}

export function storeOAuthState(
  state: string,
  deviceCode?: string
): void {
  oauthStates.set(state, { createdAt: Date.now(), deviceCode });
}

export function consumeOAuthState(
  state: string
): { deviceCode?: string } | null {
  const entry = oauthStates.get(state);
  oauthStates.delete(state);
  if (!entry || isExpired(entry)) return null;
  return { deviceCode: entry.deviceCode };
}
