import express from "express";

import { getProfile, updateProfile } from "../../services/profileService";
import { getFriends, setFriends } from "../../services/friendsService";

function requireAuth(req: express.Request, res: express.Response) {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ code: "auth_denied", message: "Missing auth" });
    return null;
  }
  return auth;
}

function normalizeNickname(input: unknown) {
  if (input === undefined) {
    return undefined;
  }
  const nickname = String(input).trim();
  return nickname.length === 0 ? null : nickname;
}

function normalizeAvatarUrl(input: unknown) {
  if (input === undefined) {
    return undefined;
  }
  if (input === null) {
    return null;
  }
  const avatarUrl = String(input).trim();
  return avatarUrl.length === 0 ? null : avatarUrl;
}

function normalizeDefaultNickname(primary: string | undefined, fallback: string) {
  const primaryTrimmed = primary?.trim() ?? "";
  const fallbackTrimmed = fallback.trim();
  let candidate = primaryTrimmed.length >= 2 ? primaryTrimmed : fallbackTrimmed;
  if (candidate.length < 2) {
    candidate = "Player";
  }
  return candidate.length > 20 ? candidate.slice(0, 20) : candidate;
}

export function createProfileRouter() {
  const router = express.Router();

  router.get("/api/me", (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) {
      return;
    }
    const nickname = normalizeDefaultNickname(
      auth.claims?.preferred_username as string | undefined,
      auth.userId,
    );
    const avatarUrl = (auth.claims?.picture as string | undefined) ?? null;
    res.status(200).json(getProfile(auth.userId, { nickname, avatarUrl }));
  });

  router.post("/api/profile", (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) {
      return;
    }

    const nickname = normalizeNickname(req.body?.nickname);
    if (nickname === null) {
      return res.status(400).json({ code: "invalid_nickname", message: "nickname required" });
    }
    if (nickname !== undefined && (nickname.length < 2 || nickname.length > 20)) {
      return res
        .status(400)
        .json({ code: "invalid_nickname", message: "nickname must be 2-20 chars" });
    }

    const avatarUrl = normalizeAvatarUrl(req.body?.avatarUrl);

    const defaults = {
      nickname: normalizeDefaultNickname(
        auth.claims?.preferred_username as string | undefined,
        auth.userId,
      ),
      avatarUrl: (auth.claims?.picture as string | undefined) ?? null,
    };

    res.status(200).json(updateProfile(auth.userId, { nickname, avatarUrl }, defaults));
  });

  router.get("/api/friends", (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) {
      return;
    }
    res.status(200).json({ friends: getFriends(auth.userId) });
  });

  router.put("/api/friends", (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) {
      return;
    }

    const friends = req.body?.friends;
    if (!Array.isArray(friends)) {
      return res.status(400).json({ code: "invalid_friends", message: "friends must be an array" });
    }
    if (!friends.every((entry) => typeof entry === "string")) {
      return res.status(400).json({ code: "invalid_friends", message: "friends must be strings" });
    }

    const cleaned = friends.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
    res.status(200).json({ friends: setFriends(auth.userId, cleaned) });
  });

  return router;
}
