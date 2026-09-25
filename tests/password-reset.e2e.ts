import { expect, test } from '@playwright/test';
import { capture, mockApi, signIn, stub, testCoachTodoSettings, testUser } from './fixtures';

test.beforeEach(async ({ page }) => {
	await mockApi(page);
});

test.describe('forgot password', () => {
	test('is reached from the sign-in form, carrying the typed email', async ({ page }) => {
		await page.goto('/');
		await page.getByLabel('Email').fill('coach@example.com');
		await page.getByRole('link', { name: 'Forgot password?' }).click();

		await expect(page).toHaveURL('/forgot-password?email=coach%40example.com');
		await expect(page).toHaveTitle('Forgot password - Crimpy');
		await expect(page.getByLabel('Email')).toHaveValue('coach@example.com');
	});

	test('asks for a reset link and says where it went', async ({ page }) => {
		await stub(page, 'POST', '/auth/forgot-password', { body: { message: 'sent' } });
		const posted = capture(page, 'POST', '/auth/forgot-password');

		await page.goto('/forgot-password');
		await page.getByLabel('Email').fill('coach@example.com');
		await page.getByRole('button', { name: 'Send reset link' }).click();

		await expect(
			page.getByText('If an account exists for coach@example.com, a reset link is on its way.')
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Send reset link' })).toBeHidden();
		expect(posted).toHaveLength(1);
		expect(posted[0].body).toEqual({ email: 'coach@example.com' });
	});

	test('shows why the request failed', async ({ page }) => {
		await stub(page, 'POST', '/auth/forgot-password', {
			status: 500,
			body: { error: 'Failed to send password reset email' }
		});

		await page.goto('/forgot-password');
		await page.getByLabel('Email').fill('coach@example.com');
		await page.getByRole('button', { name: 'Send reset link' }).click();

		await expect(page.getByText('Failed to send password reset email')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
	});
});

test.describe('reset password', () => {
	test('sets the new password with the token from the link', async ({ page }) => {
		await stub(page, 'POST', '/auth/reset-password', {
			body: { message: 'Password reset', is_coach: true }
		});
		const posted = capture(page, 'POST', '/auth/reset-password');

		await page.goto('/reset-password?token=abc123');
		await expect(page).toHaveTitle('Reset password - Crimpy');
		await page.getByLabel('New password', { exact: true }).fill('new secret');
		await page.getByLabel('Confirm new password').fill('new secret');
		await page.getByRole('button', { name: 'Set new password' }).click();

		await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Go to sign in' })).toBeVisible();
		expect(posted[0].body).toEqual({ token: 'abc123', new_password: 'new secret' });
	});

	test('sends an athlete back to the app', async ({ page }) => {
		await stub(page, 'POST', '/auth/reset-password', {
			body: { message: 'Password reset', is_coach: false }
		});

		await page.goto('/reset-password?token=abc123');
		await page.getByLabel('New password', { exact: true }).fill('new secret');
		await page.getByLabel('Confirm new password').fill('new secret');
		await page.getByRole('button', { name: 'Set new password' }).click();

		await expect(
			page.getByText('Go back to the Crimpy app to sign in with your new password.')
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'Go to sign in' })).toBeHidden();
	});

	test('drops the session this browser held', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => {
			localStorage.setItem('auth_token', 'stale-token');
			localStorage.setItem('refresh_token', 'stale-refresh');
		});
		await stub(page, 'POST', '/auth/reset-password', {
			body: { message: 'Password reset', is_coach: true }
		});

		await page.goto('/reset-password?token=abc123');
		await page.getByLabel('New password', { exact: true }).fill('new secret');
		await page.getByLabel('Confirm new password').fill('new secret');
		await page.getByRole('button', { name: 'Set new password' }).click();

		await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
		expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
		expect(await page.evaluate(() => localStorage.getItem('refresh_token'))).toBeNull();
	});

	test('refuses two passwords that differ without calling the API', async ({ page }) => {
		const posted = capture(page, 'POST', '/auth/reset-password');

		await page.goto('/reset-password?token=abc123');
		await page.getByLabel('New password', { exact: true }).fill('new secret');
		await page.getByLabel('Confirm new password').fill('other secret');
		await page.getByRole('button', { name: 'Set new password' }).click();

		await expect(page.getByText('The two passwords do not match.')).toBeVisible();
		expect(posted).toHaveLength(0);
	});

	test('shows an expired link and offers a new one', async ({ page }) => {
		await stub(page, 'POST', '/auth/reset-password', {
			status: 404,
			body: { error: 'This reset link is invalid or has expired. Please request a new one.' }
		});

		await page.goto('/reset-password?token=old');
		await page.getByLabel('New password', { exact: true }).fill('new secret');
		await page.getByLabel('Confirm new password').fill('new secret');
		await page.getByRole('button', { name: 'Set new password' }).click();

		await expect(page.getByText('This reset link is invalid or has expired.')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
			'href',
			'/forgot-password'
		);
	});

	test('explains a link with no token', async ({ page }) => {
		await page.goto('/reset-password');

		await expect(page.getByText('This link is missing its reset token.')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Set new password' })).toBeHidden();
	});
});

test.describe('settings', () => {
	test('emails the signed-in coach a reset link', async ({ page }) => {
		await signIn(page, testUser());
		await stub(page, 'GET', '/api/coach/availability-reminder', { status: 404, body: {} });
		await stub(page, 'GET', '/api/coach/todo-settings', { body: testCoachTodoSettings() });
		await stub(page, 'POST', '/auth/forgot-password', { body: { message: 'sent' } });
		const posted = capture(page, 'POST', '/auth/forgot-password');

		await page.goto('/settings');
		await expect(page.getByRole('heading', { name: 'Password' })).toBeVisible();
		await page.getByRole('button', { name: 'Send reset link' }).click();

		await expect(page.getByText('Reset link sent to coach@example.com')).toBeVisible();
		expect(posted[0].body).toEqual({ email: 'coach@example.com' });
	});
});
