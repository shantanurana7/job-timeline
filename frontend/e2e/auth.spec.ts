import { test, expect } from '@playwright/test';
import { USERS } from './fixtures/users';
import { login } from './helpers/login';

test.describe('Authentication', () => {
  test('valid credentials redirect to dashboard', async ({ page }) => {
    await login(page, USERS.admin);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('wrong password shows inline error, stays on login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(USERS.admin.email);
    await page.locator('#password').fill('NotTheRightPassword1!');
    await page.locator('#login-submit').click();

    await expect(page.locator('.form-error')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('unknown email shows inline error', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('nobody@nowhere.example');
    await page.locator('#password').fill('AnyPassword1!');
    await page.locator('#login-submit').click();

    await expect(page.locator('.form-error')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated access to protected route redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('sign out clears session and redirects to login', async ({ page }) => {
    await login(page, USERS.admin);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);

    // Confirm session is cleared — protected route redirects again
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });

  test('each role can log in successfully', async ({ page }) => {
    for (const user of [USERS.workflowAdmin, USERS.designer, USERS.client]) {
      await login(page, user);
      await expect(page).toHaveURL(/\/dashboard/);
      // Navigate back to login for next iteration
      await page.goto('/login');
      await page.waitForURL(/\/login/);
    }
  });
});
