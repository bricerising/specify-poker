import { describe, expect, it, beforeEach } from "vitest";

import { setToken, getToken, clearToken, isAuthenticated } from "../../src/services/auth";

describe("auth token management", () => {
  beforeEach(() => {
    clearToken();
  });

  describe("setToken", () => {
    it("stores token in memory", () => {
      setToken("test-token");
      expect(getToken()).toBe("test-token");
    });
  });

  describe("getToken", () => {
    it("returns null when no token set", () => {
      expect(getToken()).toBeNull();
    });

    it("returns stored token", () => {
      setToken("my-token");
      expect(getToken()).toBe("my-token");
    });
  });

  describe("clearToken", () => {
    it("removes stored token", () => {
      setToken("test-token");
      clearToken();
      expect(getToken()).toBeNull();
    });
  });

  describe("isAuthenticated", () => {
    it("returns false when no token", () => {
      expect(isAuthenticated()).toBe(false);
    });

    it("returns true when token exists", () => {
      setToken("test-token");
      expect(isAuthenticated()).toBe(true);
    });

    it("returns false after token cleared", () => {
      setToken("test-token");
      clearToken();
      expect(isAuthenticated()).toBe(false);
    });
  });
});

describe("auth security", () => {
  it("does not store tokens in localStorage", () => {
    setToken("secret-token");
    expect(localStorage.getItem("poker.auth.token")).toBeNull();
  });

  it("tokens are stored in memory only", () => {
    setToken("memory-only-token");
    expect(getToken()).toBe("memory-only-token");
  });
});
