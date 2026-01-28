import { expect, test } from '@playwright/test';
import crypto from 'crypto';
import { generateToken, loginAs } from './helpers/auth';
import { authHeaders } from './helpers/http';
import { urls } from './helpers/urls';

test.describe('Player Service (via Gateway)', () => {
  test.describe('Profile API', () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'API-only checks run once.');
    test.setTimeout(30_000);

    test('auto-provisions a default profile and supports GDPR delete', async ({ request }) => {
      const userId = `user-prof-${crypto.randomUUID().slice(0, 10)}`;
      const username = 'ProfileUser';
      const token = generateToken(userId, username);

      const me = await request.get(`${urls.gateway}/api/me`, { headers: authHeaders(token) });
      expect(me.ok()).toBeTruthy();
      const mePayload = (await me.json()) as {
        userId?: string;
        username?: string;
        avatarUrl?: string | null;
      };
      expect(mePayload.userId).toBe(userId);
      expect(mePayload.username).toBe(username);

      const deleteRes = await request.delete(`${urls.gateway}/api/me`, {
        headers: authHeaders(token),
      });
      expect(deleteRes.status()).toBe(204);

      const deleted = await request.get(`${urls.gateway}/api/profile/${userId}`, {
        headers: authHeaders(token),
      });
      expect(deleted.ok()).toBeTruthy();
      const deletedPayload = (await deleted.json()) as { userId?: string; username?: string };
      expect(deletedPayload.userId).toBe(userId);
      expect(deletedPayload.username).toBe('Deleted User');
    });
  });

  test.describe('UI Profile + Friends Flows', () => {
    test.setTimeout(60_000);

    test('updates avatar url with url validation', async ({ page }) => {
      const runId = crypto.randomUUID().slice(0, 8);
      const userId = `user-ui-${runId}`;
      const username = `Player${runId}`;
      await loginAs(page, userId, username);

      await page.getByTestId('nav-profile').click();
      await expect(page.getByRole('heading', { name: 'Profile & Stats' })).toBeVisible();

      await expect(page.locator('.profile-summary .table-name')).toHaveText(username);

      const avatarInput = page.getByTestId('profile-avatar-url');
      await avatarInput.fill('not-a-url');
      await expect(page.getByTestId('profile-save')).toBeDisabled();

      const avatarUrl = `https://example.com/${runId}.png`;
      await avatarInput.fill(avatarUrl);
      await expect(page.getByTestId('profile-save')).toBeEnabled();
      await page.getByTestId('profile-save').click();
      await expect(page.locator(`.profile-summary img[alt="${username} avatar"]`)).toHaveAttribute(
        'src',
        avatarUrl,
      );
    });

    test('adds and removes friends', async ({ page }) => {
      const runId = crypto.randomUUID().slice(0, 8);
      const userId = `user-friends-${runId}`;
      await loginAs(page, userId, `Player${runId}`);

      await page.getByTestId('nav-friends').click();
      await expect(page.getByRole('heading', { name: 'Friends' })).toBeVisible();

      const friendId = `friend-${crypto.randomUUID().slice(0, 6)}`;
      await page.getByTestId('friends-add-input').fill(friendId);
      await page.getByTestId('friends-add').click();
      await expect(page.getByText(friendId)).toBeVisible();

      await page.locator(`[data-testid="friends-remove"][data-friend="${friendId}"]`).click();
      await expect(page.getByText(friendId)).toBeHidden();
    });
  });
});
