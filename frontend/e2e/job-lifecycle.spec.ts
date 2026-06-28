import { test, expect } from '@playwright/test';
import { USERS } from './fixtures/users';
import { login } from './helpers/login';

// Shared across all serial tests in this file
let jobId = '';

test.describe.serial('Job Lifecycle — Critical Path', () => {
  // ─── Step 1: Client submits a job ─────────────────────────────────────────

  test('CLIENT: submits a new job and lands on the job detail page', async ({ page }) => {
    await login(page, USERS.client);
    await page.goto('/jobs/new');

    await page.locator('#job-title').fill('E2E Test Job — Playwright');
    await page.locator('#job-description').fill(
      'This job is created by the Playwright E2E test suite to verify the full job lifecycle.',
    );
    await page.locator('#job-priority').selectOption('HIGH');

    // Wait for streams to populate, then select the first real option (index 0 is placeholder)
    await page.locator('#job-stream').waitFor({ state: 'attached' });
    const streamOptions = await page.locator('#job-stream option').count();
    if (streamOptions > 1) {
      await page.locator('#job-stream').selectOption({ index: 1 });
    }

    await page.locator('#job-deadline').fill('2027-12-31T17:00');

    await page.locator('#submit-job').click();

    // Successful submission redirects to /jobs/:id
    await page.waitForURL(/\/jobs\/[a-z0-9]+$/, { timeout: 15_000 });

    // Capture job ID for subsequent tests
    const url = page.url();
    jobId = url.split('/jobs/')[1];
    expect(jobId).toBeTruthy();

    // Confirm status badge shows Submitted
    await expect(page.locator('.badge').filter({ hasText: 'Submitted' }).first()).toBeVisible();
  });

  // ─── Step 2: Admin moves to Under Review ──────────────────────────────────

  test('ADMIN: moves job to Under Review', async ({ page }) => {
    expect(jobId).toBeTruthy();
    await login(page, USERS.admin);
    await page.goto(`/jobs/${jobId}`);

    // Click the status transition button (text = getStatusLabel('UNDER_REVIEW') = "Under Review")
    await page.getByRole('button', { name: /under review/i }).click();

    // Wait for reload and badge update
    await expect(
      page.locator('.badge').filter({ hasText: 'Under Review' }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ─── Step 3: Admin accepts the job ────────────────────────────────────────

  test('ADMIN: accepts the job', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto(`/jobs/${jobId}`);

    await page.getByRole('button', { name: /^accepted$/i }).click();

    await expect(
      page.locator('.badge').filter({ hasText: 'Accepted' }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ─── Step 4: Admin moves to Assigned ──────────────────────────────────────

  test('ADMIN: moves job to Assigned', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto(`/jobs/${jobId}`);

    await page.getByRole('button', { name: /^assigned$/i }).click();

    await expect(
      page.locator('.badge').filter({ hasText: 'Assigned' }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ─── Step 5: Admin starts the job ─────────────────────────────────────────

  test('ADMIN: starts the job (In Progress)', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto(`/jobs/${jobId}`);

    await page.getByRole('button', { name: /in progress/i }).click();

    await expect(
      page.locator('.badge').filter({ hasText: 'In Progress' }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ─── Step 6: Admin completes the job ──────────────────────────────────────

  test('ADMIN: marks the job as Completed (terminal state)', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto(`/jobs/${jobId}`);

    await page.getByRole('button', { name: /^completed$/i }).click();

    await expect(
      page.locator('.badge').filter({ hasText: 'Completed' }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // COMPLETED is a terminal state — no more status action buttons visible
    await expect(page.getByRole('button', { name: /under review|accepted|assigned|in progress/i })).toHaveCount(0);
  });

  // ─── Step 7: Status history reflects all transitions ──────────────────────

  test('Status history records the full lifecycle', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto(`/jobs/${jobId}`);

    // All expected status transitions should appear in the history timeline
    for (const statusLabel of ['Under Review', 'Accepted', 'Assigned', 'In Progress', 'Completed']) {
      await expect(page.getByText(statusLabel).first()).toBeVisible();
    }
  });
});
