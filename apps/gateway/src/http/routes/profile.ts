import type { Request, Response } from 'express';
import { Router } from 'express';
import { normalizeUsernameFromClaims } from '../../auth/claims';
import { safeAuthedRoute } from '../utils/safeAuthedRoute';
import { safeRoute } from '../utils/safeRoute';
import { createProfileFacade } from './profile/facade';

const router = Router();

const profileFacade = createProfileFacade();

// GET /api/me - Get current user's profile
router.get(
  '/me',
  safeAuthedRoute(
    async (req: Request, res: Response, userId: string) => {
      const username = normalizeUsernameFromClaims(req.auth?.claims ?? undefined);

      const profile = await profileFacade.getMe({ userId, username });
      res.json(profile);
    },
    { logMessage: 'Failed to get profile' },
  ),
);

// PUT /api/me - Update current user's profile
router.put(
  '/me',
  safeAuthedRoute(
    async (req: Request, res: Response, userId: string) => {
      const username = normalizeUsernameFromClaims(req.auth?.claims ?? undefined);
      const profile = await profileFacade.updateMe({ userId, username, body: req.body });
      res.json(profile);
    },
    { logMessage: 'Failed to update profile' },
  ),
);

// POST /api/profile - Update nickname and avatar (OpenAPI alias)
router.post(
  '/profile',
  safeAuthedRoute(
    async (req: Request, res: Response, userId: string) => {
      const username = normalizeUsernameFromClaims(req.auth?.claims ?? undefined);
      const profile = await profileFacade.updateMe({ userId, username, body: req.body });
      res.json(profile);
    },
    { logMessage: 'Failed to update profile' },
  ),
);

// DELETE /api/me - Delete current user's profile (GDPR)
router.delete(
  '/me',
  safeAuthedRoute(
    async (_req: Request, res: Response, userId: string) => {
      const response = await profileFacade.deleteMe({ userId });
      if (!response.success) {
        res.status(500).json({ error: 'Failed to delete profile' });
        return;
      }
      res.status(204).send();
    },
    { logMessage: 'Failed to delete profile' },
  ),
);

// GET /api/me/statistics - Get current user's statistics
router.get(
  '/me/statistics',
  safeAuthedRoute(
    async (_req: Request, res: Response, userId: string) => {
      const statistics = await profileFacade.getStatistics({ userId });
      res.json(statistics);
    },
    { logMessage: 'Failed to get statistics' },
  ),
);

// GET /api/profile/:userId - Get another user's profile
router.get(
  '/profile/:userId',
  safeRoute(
    async (req: Request, res: Response) => {
      const { userId } = req.params;
      const profile = await profileFacade.getProfile({ userId });
      res.json(profile);
    },
    {
      logMessage: 'Failed to get profile',
      status: 404,
      errorMessage: 'Profile not found',
      getLogContext: (req) => ({ userId: req.params.userId }),
    },
  ),
);

// GET /api/friends - Get current user's friends list
router.get(
  '/friends',
  safeAuthedRoute(
    async (_req: Request, res: Response, userId: string) => {
      const friends = await profileFacade.getFriendIds({ userId });
      res.json({ friends });
    },
    { logMessage: 'Failed to get friends' },
  ),
);

// PUT /api/friends - Replace current user's friends list
router.put(
  '/friends',
  safeAuthedRoute(
    async (req: Request, res: Response, userId: string) => {
      const desired = (req.body as { friends?: unknown } | undefined)?.friends;
      if (!Array.isArray(desired)) {
        res.status(400).json({ error: 'friends array is required' });
        return;
      }

      const friends = await profileFacade.syncFriends({ userId, desiredFriendIds: desired });
      res.json({ friends });
    },
    { logMessage: 'Failed to update friends' },
  ),
);

// POST /api/friends - Add a friend
router.post(
  '/friends',
  safeAuthedRoute(
    async (req: Request, res: Response, userId: string) => {
      const rawFriendId = (req.body as { friendId?: unknown } | undefined)?.friendId;
      const friendId = typeof rawFriendId === 'string' ? rawFriendId.trim() : '';
      if (friendId.length === 0) {
        res.status(400).json({ error: 'friendId is required' });
        return;
      }

      await profileFacade.addFriend({ userId, friendId });
      res.status(201).json({ ok: true });
    },
    { logMessage: 'Failed to add friend' },
  ),
);

// DELETE /api/friends/:friendId - Remove a friend
router.delete(
  '/friends/:friendId',
  safeAuthedRoute(
    async (req: Request, res: Response, userId: string) => {
      const { friendId } = req.params;
      await profileFacade.removeFriend({ userId, friendId });
      res.status(204).send();
    },
    { logMessage: 'Failed to remove friend' },
  ),
);

// POST /api/nicknames - Batch lookup nicknames
router.post(
  '/nicknames',
  safeRoute(
    async (req: Request, res: Response) => {
      const userIds = (req.body as { userIds?: unknown } | undefined)?.userIds;
      if (!userIds || !Array.isArray(userIds)) {
        res.status(400).json({ error: 'userIds array is required' });
        return;
      }

      const nicknames = await profileFacade.getNicknames({ userIds });
      res.json({ nicknames });
    },
    { logMessage: 'Failed to get nicknames' },
  ),
);

export default router;
