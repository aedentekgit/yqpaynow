import { test, expect } from '@playwright/test';

test('login page loads correctly', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');

    // Verify page title
    await expect(page).toHaveTitle(/Login/);

    // Verify Welcome message
    await expect(page.getByText('Welcome Back')).toBeVisible();

    // Verify inputs are present
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();

    // Verify submit button is present
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText(/Sign In/);
});
