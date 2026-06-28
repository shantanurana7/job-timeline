import { Page } from '@playwright/test';

interface Credentials {
  email: string;
  password: string;
}

export async function login(page: Page, creds: Credentials): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(creds.email);
  await page.locator('#password').fill(creds.password);
  await page.locator('#login-submit').click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}
