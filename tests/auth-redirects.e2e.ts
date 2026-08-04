import { expect, test, type Page } from '@playwright/test';
import { mockApi, signIn, stub, stubLogin, testUser } from './fixtures';

async function submitLogin(page: Page): Promise<void> {
	await page.getByLabel('Email').fill('coach@example.com');
	await page.getByLabel('Password').fill('correct horse');
	await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
}

test.beforeEach(async ({ page }) => {
	await mockApi(page);
});

test.describe('sign-in routing', () => {
	test('sends a user with an unverified email to the verification page', async ({ page }) => {
		await stubLogin(page, testUser({ email_verified: false }));

		await page.goto('/');
		await submitLogin(page);

		await expect(page).toHaveURL('/verify-email');
		await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
	});

	test('sends an admin to the admin page', async ({ page }) => {
		await stubLogin(page, testUser({ is_admin: true, is_coach: false }));
		await stub(page, 'GET', '/api/admin/coaches/pending', { body: [] });

		await page.goto('/');
		await submitLogin(page);

		await expect(page).toHaveURL('/admin');
		await expect(page.getByText('No pending coach approvals')).toBeVisible();
	});

	test('sends a coach awaiting validation to the pending page', async ({ page }) => {
		await stubLogin(page, testUser({ coach_validated: false }));

		await page.goto('/');
		await submitLogin(page);

		await expect(page).toHaveURL('/pending-validation');
		await expect(page.getByRole('heading', { name: 'Pending validation' })).toBeVisible();
	});

	test('sends a validated coach to the dashboard', async ({ page }) => {
		await stubLogin(page, testUser());
		await stub(page, 'GET', '/api/coach/enrollments', { body: [] });
		await stub(page, 'GET', '/api/trainings', { body: [] });

		await page.goto('/');
		await submitLogin(page);

		await expect(page).toHaveURL('/dashboard');
		await expect(page.getByRole('heading', { name: 'Welcome back, Alex' })).toBeVisible();
	});

	test('honours the return url captured before sign-in', async ({ page }) => {
		await stubLogin(page, testUser());
		await stub(page, 'GET', '/api/coach/enrollments', { body: [] });

		await page.goto('/?return=/coachees');
		await submitLogin(page);

		await expect(page).toHaveURL('/coachees');
	});

	test('keeps the user on the form and shows the server error when sign-in fails', async ({
		page
	}) => {
		await stub(page, 'POST', '/auth/login', {
			status: 401,
			body: { error: 'Invalid email or password' }
		});

		await page.goto('/');
		await submitLogin(page);

		await expect(page.getByText('Invalid email or password')).toBeVisible();
		await expect(page).toHaveURL('/');
	});
});

test.describe('route guards', () => {
	test('redirects an anonymous visitor away from the dashboard', async ({ page }) => {
		await page.goto('/dashboard');

		await expect(page).toHaveURL('/');
		await expect(page.locator('form').getByRole('button', { name: 'Sign in' })).toBeVisible();
	});

	test('redirects a non-admin away from the admin page', async ({ page }) => {
		await signIn(page, testUser());
		await stub(page, 'GET', '/api/coach/enrollments', { body: [] });
		await stub(page, 'GET', '/api/trainings', { body: [] });

		await page.goto('/admin');

		await expect(page).toHaveURL('/dashboard');
	});

	test('redirects a coach still awaiting validation away from the coachee list', async ({
		page
	}) => {
		await signIn(page, testUser({ coach_validated: false }));

		await page.goto('/coachees');

		// The guard sends them to /dashboard, which immediately forwards an
		// unvalidated coach on, so only the final destination is stable.
		await expect(page).toHaveURL('/pending-validation');
	});

	test('clears the session and returns to sign-in when the stored token is rejected', async ({
		page
	}) => {
		await signIn(page, testUser());
		await stub(page, 'GET', '/api/user', { status: 401, body: { error: 'token expired' } });
		await stub(page, 'POST', '/auth/refresh', { status: 401, body: { error: 'token expired' } });

		await page.goto('/dashboard');

		await expect(page).toHaveURL('/');
		expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
	});
});
