import { Router, Request, Response } from "express";
import { playerClient } from "../../grpc/clients";
import logger from "../../observability/logger";

const router = Router();

// Helper to convert gRPC callback to promise
function grpcCall<T>(method: string, request: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    (playerClient as any)[method](request, (err: Error | null, response: T) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// GET /api/me - Get current user's profile
router.get("/me", async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const response = await grpcCall<{ profile: unknown }>("GetProfile", {
      user_id: userId,
    });
    return res.json(response.profile);
  } catch (err) {
    logger.error({ err }, "Failed to get profile");
    return res.status(500).json({ error: "Failed to get profile" });
  }
});

// PUT /api/me - Update current user's profile
router.put("/me", async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { nickname, avatarUrl, preferences } = req.body;
    const response = await grpcCall<{ profile: unknown }>("UpdateProfile", {
      user_id: userId,
      nickname,
      avatar_url: avatarUrl,
      preferences: preferences
        ? {
            sound_enabled: preferences.soundEnabled,
            chat_enabled: preferences.chatEnabled,
            show_hand_strength: preferences.showHandStrength,
            theme: preferences.theme,
          }
        : undefined,
    });
    return res.json(response.profile);
  } catch (err) {
    logger.error({ err }, "Failed to update profile");
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// DELETE /api/me - Delete current user's profile (GDPR)
router.delete("/me", async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const response = await grpcCall<{ success: boolean }>("DeleteProfile", {
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
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const response = await grpcCall<{ statistics: unknown }>("GetStatistics", {
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
    const response = await grpcCall<{ profile: unknown }>("GetProfile", {
      user_id: userId,
    });
    return res.json(response.profile);
  } catch (err) {
    logger.error({ err, userId: req.params.userId }, "Failed to get profile");
    return res.status(404).json({ error: "Profile not found" });
  }
});

// GET /api/friends - Get current user's friends list
router.get("/friends", async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const response = await grpcCall<{ friends: unknown[] }>("GetFriends", {
      user_id: userId,
    });
    return res.json({ friends: response.friends || [] });
  } catch (err) {
    logger.error({ err }, "Failed to get friends");
    return res.status(500).json({ error: "Failed to get friends" });
  }
});

// POST /api/friends - Add a friend
router.post("/friends", async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { friendId } = req.body;
    if (!friendId) {
      return res.status(400).json({ error: "friendId is required" });
    }

    await grpcCall<void>("AddFriend", {
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
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { friendId } = req.params;
    await grpcCall<void>("RemoveFriend", {
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

    const response = await grpcCall<{ nicknames: unknown[] }>("GetNicknames", {
      user_ids: userIds,
    });
    return res.json({ nicknames: response.nicknames || [] });
  } catch (err) {
    logger.error({ err }, "Failed to get nicknames");
    return res.status(500).json({ error: "Failed to get nicknames" });
  }
});

export default router;
