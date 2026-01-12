import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import profileRouter from "../../../src/http/routes/profile";

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
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    // Add mock auth middleware
    app.use((req, _res, next) => {
      (req as any).auth = { userId: "user-123", claims: {} };
      next();
    });
    app.use("/api", profileRouter);
    vi.clearAllMocks();
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

      const response = await request(app).get("/api/me");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockProfile);
    });

    it("should handle errors", async () => {
      vi.mocked(playerClient.GetProfile).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(new Error("Database error"), null);
        }
      );

      const response = await request(app).get("/api/me");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to get profile");
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

      const response = await request(app)
        .put("/api/me")
        .send({ nickname: "NewNickname", avatarUrl: "https://example.com/new-avatar.png" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedProfile);
    });
  });

  describe("DELETE /api/me", () => {
    it("should delete current user profile (GDPR)", async () => {
      vi.mocked(playerClient.DeleteProfile).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { success: true });
        }
      );

      const response = await request(app).delete("/api/me");

      expect(response.status).toBe(204);
    });

    it("should handle deletion failure", async () => {
      vi.mocked(playerClient.DeleteProfile).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { success: false });
        }
      );

      const response = await request(app).delete("/api/me");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to delete profile");
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

      const response = await request(app).get("/api/me/statistics");

      expect(response.status).toBe(200);
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

      const response = await request(app).get("/api/friends");

      expect(response.status).toBe(200);
      expect(response.body.friends).toEqual(mockFriends);
    });
  });

  describe("POST /api/friends", () => {
    it("should add a friend", async () => {
      vi.mocked(playerClient.AddFriend).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, {});
        }
      );

      const response = await request(app)
        .post("/api/friends")
        .send({ friendId: "friend-123" });

      expect(response.status).toBe(201);
      expect(response.body.ok).toBe(true);
    });

    it("should return error when friendId is missing", async () => {
      const response = await request(app)
        .post("/api/friends")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("friendId is required");
    });
  });

  describe("DELETE /api/friends/:friendId", () => {
    it("should remove a friend", async () => {
      vi.mocked(playerClient.RemoveFriend).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, {});
        }
      );

      const response = await request(app).delete("/api/friends/friend-123");

      expect(response.status).toBe(204);
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

      const response = await request(app)
        .post("/api/nicknames")
        .send({ userIds: ["user-1", "user-2"] });

      expect(response.status).toBe(200);
      expect(response.body.nicknames).toEqual(mockNicknames);
    });

    it("should return error when userIds is missing", async () => {
      const response = await request(app)
        .post("/api/nicknames")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("userIds array is required");
    });
  });
});
