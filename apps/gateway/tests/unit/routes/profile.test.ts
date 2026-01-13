import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import profileRouter from "../../../src/http/routes/profile";
import { dispatchToRouter } from "../helpers/express";

// Mock the gRPC client
vi.mock("../../../src/grpc/clients", () => ({
  playerClient: {
    GetProfile: vi.fn(),
    UpdateProfile: vi.fn(),
    DeleteProfile: vi.fn(),
    GetStatistics: vi.fn(),
    GetFriends: vi.fn(),
    AddFriend: vi.fn(),
    RemoveFriend: vi.fn(),
    GetNicknames: vi.fn(),
  },
}));

// Mock logger
vi.mock("../../../src/observability/logger", () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { playerClient } from "../../../src/grpc/clients";

describe("Profile Routes", () => {
  const auth = { userId: "user-123", claims: {} };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for GetStatistics to prevent timeouts
    vi.mocked(playerClient.GetStatistics).mockImplementation(
      (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
        callback(null, { statistics: { handsPlayed: 0, wins: 0 } });
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/me", () => {
    it("should return current user profile", async () => {
      const mockProfile = {
        user_id: "user-123",
        nickname: "TestUser",
        avatar_url: "https://example.com/avatar.png",
      };

      vi.mocked(playerClient.GetProfile).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { profile: mockProfile });
        }
      );

      const response = await dispatchToRouter(profileRouter, {
        method: "GET",
        url: "/me",
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual({
        ...mockProfile,
        stats: { handsPlayed: 0, wins: 0 },
      });
    });

    it("should handle errors", async () => {
      vi.mocked(playerClient.GetProfile).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(new Error("Database error"), null);
        }
      );

      const response = await dispatchToRouter(profileRouter, {
        method: "GET",
        url: "/me",
        auth,
      });

      expect(response.statusCode).toBe(500);
      expect(response.body).toEqual(expect.objectContaining({ error: "Failed to get profile" }));
    });
  });

  describe("PUT /api/me", () => {
    it("should update current user profile", async () => {
      const updatedProfile = {
        user_id: "user-123",
        nickname: "NewNickname",
        avatar_url: "https://example.com/new-avatar.png",
      };

      vi.mocked(playerClient.UpdateProfile).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { profile: updatedProfile });
        }
      );

      const response = await dispatchToRouter(profileRouter, {
        method: "PUT",
        url: "/me",
        auth,
        body: { nickname: "NewNickname", avatarUrl: "https://example.com/new-avatar.png" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual({
        ...updatedProfile,
        stats: { handsPlayed: 0, wins: 0 },
      });
    });
  });

  describe("DELETE /api/me", () => {
    it("should delete current user profile (GDPR)", async () => {
      vi.mocked(playerClient.DeleteProfile).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { success: true });
        }
      );

      const response = await dispatchToRouter(profileRouter, {
        method: "DELETE",
        url: "/me",
        auth,
      });

      expect(response.statusCode).toBe(204);
    });

    it("should handle deletion failure", async () => {
      vi.mocked(playerClient.DeleteProfile).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { success: false });
        }
      );

      const response = await dispatchToRouter(profileRouter, {
        method: "DELETE",
        url: "/me",
        auth,
      });

      expect(response.statusCode).toBe(500);
      expect(response.body).toEqual(expect.objectContaining({ error: "Failed to delete profile" }));
    });
  });

  describe("GET /api/me/statistics", () => {
    it("should return user statistics", async () => {
      const mockStats = {
        user_id: "user-123",
        hands_played: 100,
        wins: 25,
        vpip: 28.5,
        pfr: 18.2,
      };

      vi.mocked(playerClient.GetStatistics).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { statistics: mockStats });
        }
      );

      const response = await dispatchToRouter(profileRouter, {
        method: "GET",
        url: "/me/statistics",
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(mockStats);
    });
  });

  describe("GET /api/friends", () => {
    it("should return friends list", async () => {
      const mockFriends = [
        { user_id: "friend-1", nickname: "Friend1" },
        { user_id: "friend-2", nickname: "Friend2" },
      ];

      vi.mocked(playerClient.GetFriends).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { friends: mockFriends });
        }
      );

      const response = await dispatchToRouter(profileRouter, {
        method: "GET",
        url: "/friends",
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({ friends: mockFriends }));
    });
  });

  describe("POST /api/friends", () => {
    it("should add a friend", async () => {
      vi.mocked(playerClient.AddFriend).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, {});
        }
      );

      const response = await dispatchToRouter(profileRouter, {
        method: "POST",
        url: "/friends",
        auth,
        body: { friendId: "friend-123" },
      });

      expect(response.statusCode).toBe(201);
      expect(response.body).toEqual(expect.objectContaining({ ok: true }));
    });

    it("should return error when friendId is missing", async () => {
      const response = await dispatchToRouter(profileRouter, {
        method: "POST",
        url: "/friends",
        auth,
        body: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual(expect.objectContaining({ error: "friendId is required" }));
    });
  });

  describe("DELETE /api/friends/:friendId", () => {
    it("should remove a friend", async () => {
      vi.mocked(playerClient.RemoveFriend).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, {});
        }
      );

      const response = await dispatchToRouter(profileRouter, {
        method: "DELETE",
        url: "/friends/friend-123",
        auth,
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe("POST /api/nicknames", () => {
    it("should batch lookup nicknames", async () => {
      const mockNicknames = [
        { user_id: "user-1", nickname: "User1" },
        { user_id: "user-2", nickname: "User2" },
      ];

      vi.mocked(playerClient.GetNicknames).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { nicknames: mockNicknames });
        }
      );

      const response = await dispatchToRouter(profileRouter, {
        method: "POST",
        url: "/nicknames",
        auth,
        body: { userIds: ["user-1", "user-2"] },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({ nicknames: mockNicknames }));
    });

    it("should return error when userIds is missing", async () => {
      const response = await dispatchToRouter(profileRouter, {
        method: "POST",
        url: "/nicknames",
        auth,
        body: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual(expect.objectContaining({ error: "userIds array is required" }));
    });
  });
});
