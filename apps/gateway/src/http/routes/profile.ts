import { Router, Request, Response } from "express";
import { playerClient } from "../../grpc/clients";
import logger from "../../observability/logger";

const router = Router();

type UnknownRecord = Record<string, unknown>;

function requireUserId(req: Request, res: Response) {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId;
}

// Helper to convert gRPC callback to promise
function grpcCall<TRequest, TResponse>(
  method: (request: TRequest, callback: (err: Error | null, response: TResponse) => void) => void,
  request: TRequest
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    method(request, (err: Error | null, response: TResponse) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

function toString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUsernameFromClaims(claims: Record<string, unknown> | undefined): string | null {
  const candidates = [
    claims?.preferred_username,
    claims?.username,
    claims?.nickname,
    claims?.email,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

function normalizeProfile(profile: UnknownRecord, fallbackUserId: string) {
  const userId = toString(profile.userId ?? profile.user_id) || fallbackUserId;
  const username = toString(profile.username);
  const nickname = toString(profile.nickname) || "Unknown";
  const avatarRaw = toString(profile.avatarUrl ?? profile.avatar_url);
  const avatarUrl = avatarRaw.length > 0 ? avatarRaw : null;
  return { userId, username, nickname, avatarUrl };
}

function normalizeStats(stats: UnknownRecord | undefined) {
  return {
    handsPlayed: toNumber(stats?.handsPlayed ?? stats?.hands_played, 0),
    wins: toNumber(stats?.wins, 0),
  };
}

function normalizeFriendIds(friends: unknown): string[] {
  if (!Array.isArray(friends)) {
    return [];
  }
  return friends
    .map((friend) => {
      if (!friend || typeof friend !== "object") return "";
      const record = friend as UnknownRecord;
      return toString(record.userId ?? record.user_id);
    })
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

// GET /api/me - Get current user's profile
router.get("/me", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const username = normalizeUsernameFromClaims(req.auth?.claims ?? undefined);

    const [profileResponse, statsResponse, friendsResponse] = await Promise.all([
      grpcCall(playerClient.GetProfile.bind(playerClient), { user_id: userId, ...(username ? { username } : {}) }),
      grpcCall(playerClient.GetStatistics.bind(playerClient), { user_id: userId }),
      grpcCall(playerClient.GetFriends.bind(playerClient), { user_id: userId }),
    ]);

    const profile = normalizeProfile((profileResponse.profile || {}) as UnknownRecord, userId);
    const hydratedProfile = username && !profile.username ? { ...profile, username } : profile;
    const stats = normalizeStats(statsResponse.statistics as UnknownRecord | undefined);
    const friends = normalizeFriendIds((friendsResponse as UnknownRecord).friends);

    return res.json({ ...hydratedProfile, stats, friends });
  } catch (err) {
    logger.error({ err }, "Failed to get profile");
    return res.status(500).json({ error: "Failed to get profile" });
  }
});

// PUT /api/me - Update current user's profile
router.put("/me", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const username = normalizeUsernameFromClaims(req.auth?.claims ?? undefined);
    const body = req.body as UnknownRecord;
    const nickname = body.nickname;
    const avatarUrl = body.avatarUrl;
    const preferences = body.preferences;

    const updateRequest: {
      user_id: string;
      nickname?: string;
      avatar_url?: string;
      preferences?: {
        sound_enabled?: boolean;
        chat_enabled?: boolean;
        show_hand_strength?: boolean;
        theme?: string;
      };
    } = { user_id: userId };

    if (typeof nickname === "string") {
      updateRequest.nickname = nickname;
    }

    if (avatarUrl === null) {
      updateRequest.avatar_url = "";
    } else if (typeof avatarUrl === "string") {
      updateRequest.avatar_url = avatarUrl;
    }

    if (preferences && typeof preferences === "object") {
      const pref = preferences as UnknownRecord;
      updateRequest.preferences = {
        ...(typeof pref.soundEnabled === "boolean" ? { sound_enabled: pref.soundEnabled } : {}),
        ...(typeof pref.chatEnabled === "boolean" ? { chat_enabled: pref.chatEnabled } : {}),
        ...(typeof pref.showHandStrength === "boolean" ? { show_hand_strength: pref.showHandStrength } : {}),
        ...(typeof pref.theme === "string" ? { theme: pref.theme } : {}),
      };
    }

    const updateResponse = await grpcCall(playerClient.UpdateProfile.bind(playerClient), updateRequest);

    const [statsResponse, friendsResponse] = await Promise.all([
      grpcCall(playerClient.GetStatistics.bind(playerClient), { user_id: userId }),
      grpcCall(playerClient.GetFriends.bind(playerClient), { user_id: userId }),
    ]);

    const profile = normalizeProfile((updateResponse.profile || {}) as UnknownRecord, userId);
    const hydratedProfile = username && !profile.username ? { ...profile, username } : profile;
    const stats = normalizeStats(statsResponse.statistics as UnknownRecord | undefined);
    const friends = normalizeFriendIds((friendsResponse as UnknownRecord).friends);

    return res.json({ ...hydratedProfile, stats, friends });
  } catch (err) {
    logger.error({ err }, "Failed to update profile");
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// POST /api/profile - Update nickname and avatar (OpenAPI alias)
router.post("/profile", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const username = normalizeUsernameFromClaims(req.auth?.claims ?? undefined);
    const body = req.body as UnknownRecord;
    const nickname = body.nickname;
    const avatarUrl = body.avatarUrl;

    const updateRequest: { user_id: string; nickname?: string; avatar_url?: string } = { user_id: userId };
    if (typeof nickname === "string") {
      updateRequest.nickname = nickname;
    }
    if (avatarUrl === null) {
      updateRequest.avatar_url = "";
    } else if (typeof avatarUrl === "string") {
      updateRequest.avatar_url = avatarUrl;
    }

    const updateResponse = await grpcCall(playerClient.UpdateProfile.bind(playerClient), updateRequest);

    const [statsResponse, friendsResponse] = await Promise.all([
      grpcCall(playerClient.GetStatistics.bind(playerClient), { user_id: userId }),
      grpcCall(playerClient.GetFriends.bind(playerClient), { user_id: userId }),
    ]);

    const profile = normalizeProfile((updateResponse.profile || {}) as UnknownRecord, userId);
    const hydratedProfile = username && !profile.username ? { ...profile, username } : profile;
    const stats = normalizeStats(statsResponse.statistics as UnknownRecord | undefined);
    const friends = normalizeFriendIds((friendsResponse as UnknownRecord).friends);

    return res.json({ ...hydratedProfile, stats, friends });
  } catch (err) {
    logger.error({ err }, "Failed to update profile");
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// DELETE /api/me - Delete current user's profile (GDPR)
router.delete("/me", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const response = await grpcCall(playerClient.DeleteProfile.bind(playerClient), {
      user_id: userId,
    });
    if (!response.success) {
      return res.status(500).json({ error: "Failed to delete profile" });
    }
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Failed to delete profile");
    return res.status(500).json({ error: "Failed to delete profile" });
  }
});

// GET /api/me/statistics - Get current user's statistics
router.get("/me/statistics", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const response = await grpcCall(playerClient.GetStatistics.bind(playerClient), {
      user_id: userId,
    });
    return res.json(response.statistics);
  } catch (err) {
    logger.error({ err }, "Failed to get statistics");
    return res.status(500).json({ error: "Failed to get statistics" });
  }
});

// GET /api/profile/:userId - Get another user's profile
router.get("/profile/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const response = await grpcCall(playerClient.GetProfile.bind(playerClient), {
      user_id: userId,
    });
    const profile = normalizeProfile((response.profile || {}) as UnknownRecord, userId);
    return res.json(profile);
  } catch (err) {
    logger.error({ err, userId: req.params.userId }, "Failed to get profile");
    return res.status(404).json({ error: "Profile not found" });
  }
});

// GET /api/friends - Get current user's friends list
router.get("/friends", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const response = await grpcCall(playerClient.GetFriends.bind(playerClient), {
      user_id: userId,
    });
    const friends = normalizeFriendIds((response as UnknownRecord).friends);
    return res.json({ friends });
  } catch (err) {
    logger.error({ err }, "Failed to get friends");
    return res.status(500).json({ error: "Failed to get friends" });
  }
});

// PUT /api/friends - Replace current user's friends list
router.put("/friends", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const body = req.body as UnknownRecord;
    const desired = body.friends;
    if (!Array.isArray(desired)) {
      return res.status(400).json({ error: "friends array is required" });
    }

    const desiredIds = desired
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0 && entry !== userId);

    const currentResponse = await grpcCall(playerClient.GetFriends.bind(playerClient), { user_id: userId });
    const currentIds = new Set(normalizeFriendIds((currentResponse as UnknownRecord).friends));
    const desiredSet = new Set(desiredIds);

    for (const friendId of desiredSet) {
      if (currentIds.has(friendId)) {
        continue;
      }
      await grpcCall(playerClient.AddFriend.bind(playerClient), { user_id: userId, friend_id: friendId });
    }

    for (const friendId of currentIds) {
      if (desiredSet.has(friendId)) {
        continue;
      }
      await grpcCall(playerClient.RemoveFriend.bind(playerClient), { user_id: userId, friend_id: friendId });
    }

    return res.json({ friends: Array.from(desiredSet.values()) });
  } catch (err) {
    logger.error({ err }, "Failed to update friends");
    return res.status(500).json({ error: "Failed to update friends" });
  }
});

// POST /api/friends - Add a friend
router.post("/friends", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { friendId } = req.body;
    if (!friendId) {
      return res.status(400).json({ error: "friendId is required" });
    }

    await grpcCall(playerClient.AddFriend.bind(playerClient), {
      user_id: userId,
      friend_id: friendId,
    });
    return res.status(201).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to add friend");
    return res.status(500).json({ error: "Failed to add friend" });
  }
});

// DELETE /api/friends/:friendId - Remove a friend
router.delete("/friends/:friendId", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { friendId } = req.params;
    await grpcCall(playerClient.RemoveFriend.bind(playerClient), {
      user_id: userId,
      friend_id: friendId,
    });
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Failed to remove friend");
    return res.status(500).json({ error: "Failed to remove friend" });
  }
});

// POST /api/nicknames - Batch lookup nicknames
router.post("/nicknames", async (req: Request, res: Response) => {
  try {
    const { userIds } = req.body;
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ error: "userIds array is required" });
    }

    const response = await grpcCall(playerClient.GetNicknames.bind(playerClient), {
      user_ids: userIds,
    });
    return res.json({ nicknames: response.nicknames || [] });
  } catch (err) {
    logger.error({ err }, "Failed to get nicknames");
    return res.status(500).json({ error: "Failed to get nicknames" });
  }
});

export default router;
