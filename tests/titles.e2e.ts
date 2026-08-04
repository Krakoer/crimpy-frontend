import { expect, test } from '@playwright/test';
import { mockApi, signIn, stub, testUser } from './fixtures';

test.beforeEach(async ({ page }) => {
	await mockApi(page);
});

test('the sign-in page titles follow the active tab', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle('Sign in - Crimpy');

	await page.getByRole('button', { name: 'Register as coach' }).click();
	await expect(page).toHaveTitle('Register as coach - Crimpy');
});

test('the standalone verification page is titled', async ({ page }) => {
	await stub(page, 'POST', '/auth/verify', { body: { message: 'Verified', is_coach: true } });

	await page.goto('/verify?token=abc');

	await expect(page).toHaveTitle('Email verification - Crimpy');
});

test('portal pages take their title from the app shell', async ({ page }) => {
	await signIn(page, testUser());
	await stub(page, 'GET', '/api/coach/enrollments', { body: [] });
	await stub(page, 'GET', '/api/trainings', { body: [] });

	await page.goto('/dashboard');
	await expect(page).toHaveTitle('Dashboard - Crimpy');

	await page.goto('/coachees');
	await expect(page).toHaveTitle('Coachees - Crimpy');
});

test('a navigation replaces the previous title instead of stacking one', async ({ page }) => {
	await signIn(page, testUser());
	await stub(page, 'GET', '/api/coach/enrollments', { body: [] });
	await stub(page, 'GET', '/api/trainings', { body: [] });

	await page.goto('/dashboard');
	await page.getByRole('button', { name: 'Coachees', exact: true }).click();

	await expect(page).toHaveTitle('Coachees - Crimpy');
	expect(await page.locator('head title').count()).toBe(1);
});
