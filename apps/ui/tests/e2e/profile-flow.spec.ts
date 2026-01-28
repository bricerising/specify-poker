import { expect, test } from '@playwright/test';

test('profile flow updates avatar url', async ({ page }) => {
  let profile = {
    userId: 'user-1',
    username: 'Ace',
    avatarUrl: null as string | null,
    stats: { handsPlayed: 1, wins: 0 },
    friends: [],
  };

  await page.route('**/api/me', async (route, request) => {
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(profile),
      });
      return;
    }

    if (request.method() === 'PUT') {
      const payload = JSON.parse(request.postData() ?? '{}') as {
        avatarUrl?: string | null;
      };
      profile = {
        ...profile,
        avatarUrl: payload.avatarUrl ?? profile.avatarUrl,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(profile),
      });
      return;
    }

    await route.continue();
  });

  await page.addInitScript(() => {
    window.sessionStorage.setItem('poker.auth.token', 'test-token');
  });

  await page.goto('/');
  await page.getByTestId('nav-profile').click();

  const avatarUrl = 'https://example.com/avatar.png';
  await page.getByTestId('profile-avatar-url').fill(avatarUrl);
  await page.getByTestId('profile-save').click();

  await expect(page.locator('.profile-summary img[alt="Ace avatar"]')).toHaveAttribute(
    'src',
    avatarUrl,
  );
});
