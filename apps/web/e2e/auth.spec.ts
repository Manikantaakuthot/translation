import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/login/);
    await expect(page.getByRole('heading', { name: /MSG/i })).toBeVisible();
    await expect(page.getByPlaceholder(/phone/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
  });

  test('should navigate to register', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /register/i }).click();
    await expect(page).toHaveURL(/register/);
    await expect(page.getByPlaceholder(/name/i)).toBeVisible();
  });

  test('should register and redirect to chat', async ({ page }) => {
    await page.goto('/register');
    const timestamp = Date.now();
    await page.getByPlaceholder(/name/i).first().fill(`Test User ${timestamp}`);
    await page.getByPlaceholder(/phone/i).fill(`555${timestamp.toString().slice(-7)}`);
    await page.getByPlaceholder(/password/i).fill('Test1234');
    await page.getByRole('button', { name: /register/i }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByText(/select a chat|no conversations|new chat/i)).toBeVisible({ timeout: 10000 });
  });
});
