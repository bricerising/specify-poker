import { describe, expect, it, beforeEach } from 'vitest';

import { setToken, getToken, clearToken, isAuthenticated } from '../../src/services/auth';

function ensureStorage(name: 'localStorage' | 'sessionStorage') {
  const existing = (globalThis as Record<string, unknown>)[name] as
    | { getItem?: unknown }
    | undefined;
  if (existing && typeof existing.getItem === 'function') {
    return;
  }
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, name, { value: storage, configurable: true });
}

beforeEach(() => {
  ensureStorage('localStorage');
  ensureStorage('sessionStorage');
  localStorage.clear();
  sessionStorage.clear();
});

describe('auth token management', () => {
  beforeEach(() => {
    clearToken();
  });

  describe('setToken', () => {
    it('stores token in memory', () => {
      setToken('test-token');
      expect(getToken()).toBe('test-token');
    });

    it('stores token in sessionStorage', () => {
      setToken('test-token');
      expect(sessionStorage.getItem('poker.auth.token')).toBe('test-token');
    });
  });

  describe('getToken', () => {
    it('returns null when no token set', () => {
      expect(getToken()).toBeNull();
    });

    it('returns stored token', () => {
      setToken('my-token');
      expect(getToken()).toBe('my-token');
    });

    it('hydrates token from sessionStorage', () => {
      sessionStorage.setItem('poker.auth.token', 'cached-token');
      expect(getToken()).toBe('cached-token');
    });
  });

  describe('clearToken', () => {
    it('removes stored token', () => {
      setToken('test-token');
      clearToken();
      expect(getToken()).toBeNull();
    });

    it('clears sessionStorage token', () => {
      setToken('test-token');
      clearToken();
      expect(sessionStorage.getItem('poker.auth.token')).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when no token', () => {
      expect(isAuthenticated()).toBe(false);
    });

    it('returns true when token exists', () => {
      setToken('test-token');
      expect(isAuthenticated()).toBe(true);
    });

    it('returns false after token cleared', () => {
      setToken('test-token');
      clearToken();
      expect(isAuthenticated()).toBe(false);
    });
  });
});

describe('auth security', () => {
  it('does not store tokens in localStorage', () => {
    setToken('secret-token');
    expect(localStorage.getItem('poker.auth.token')).toBeNull();
  });

  it('tokens are not persisted to localStorage even when cached', () => {
    sessionStorage.setItem('poker.auth.token', 'session-only-token');
    expect(localStorage.getItem('poker.auth.token')).toBeNull();
  });
});
