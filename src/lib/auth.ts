import { apiRequest, saveTokensToStorage, clearTokensFromStorage, loadTokensFromStorage, getAuthTokens } from './api';

export { loadTokensFromStorage };

export interface User {
  id: string;
  email: string;
  username: string | null;
  avatarUrl: string | null;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export async function signIn(email: string, password: string): Promise<AuthResponse> {
  const data = await apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  saveTokensToStorage(data);
  return data;
}

export async function signUp(email: string, password: string, username?: string): Promise<AuthResponse> {
  const data = await apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, username }),
  });
  saveTokensToStorage(data);
  return data;
}

export async function signOut(): Promise<void> {
  const tokens = getAuthTokens();
  if (tokens?.refreshToken) {
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    } catch (e) {
      console.error('Logout error:', e);
    }
  }
  clearTokensFromStorage();
}

export function getCurrentUser(): User | null {
  loadTokensFromStorage();
  const tokens = getAuthTokens();
  if (!tokens) return null;
  
  try {
    const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]));
    return {
      id: payload.userId,
      email: payload.email || '',
      username: payload.username || null,
      avatarUrl: payload.avatarUrl || null,
    };
  } catch {
    return null;
  }
}

/**
 * Auto-create or login a backend account derived from IPTV credentials.
 * This enables cross-device sync of favorites and watch history.
 */
export async function autoSyncLogin(iptvUsername: string, iptvPassword: string, dnsBase: string): Promise<User | null> {
  // Derive deterministic email and password from IPTV credentials
  const cleanUser = iptvUsername.trim();
  const host = dnsBase.replace(/^https?:\/\//, '').replace(/[/:]/g, '_');
  const email = `${cleanUser}_${host}@iptv.sync`;
  // Use a simple hash of credentials as the backend password
  const rawKey = `${cleanUser}:${iptvPassword}:${dnsBase}`;
  let hash = 0;
  for (let i = 0; i < rawKey.length; i++) {
    hash = ((hash << 5) - hash + rawKey.charCodeAt(i)) | 0;
  }
  const syncPassword = `sync_${Math.abs(hash).toString(36)}_${rawKey.length}`;

  try {
    // Try to register first
    const data = await signUp(email, syncPassword, cleanUser);
    return data.user;
  } catch (e: any) {
    if (e.message === 'User is blocked') throw e;
    try {
      // If registration fails (user exists), try login
      const data = await signIn(email, syncPassword);
      return data.user;
    } catch (err: any) {
      if (err.message === 'User is blocked') throw err;
      // If both fail, sync is not available but app still works
      console.warn('Auto-sync login failed, using local storage');
      return null;
    }
  }
}
