import { expect, test } from '@playwright/test';
import { capture, mockApi, signIn, stub, testEnrollmentTokenInfo, testUser } from './fixtures';

test.beforeEach(async ({ page }) => {
	await mockApi(page);
});

test.describe('registration', () => {
	test('registers a coach and sends them to the verification page', async ({ page }) => {
		const registered = testUser({ email_verified: false, coach_validated: false });
		await stub(page, 'POST', '/auth/register', {
			body: { token: 'test-token', refresh_token: 'test-refresh-token', user: registered }
		});
		const posted = capture(page, 'POST', '/auth/register');

		await page.goto('/');
		await page.getByRole('button', { name: 'Register as coach' }).click();
		await page.getByLabel('First name').fill('Alex');
		await page.getByLabel('Last name').fill('Belay');
		await page.getByLabel('Email').fill('coach@example.com');
		await page.getByLabel('Password').fill('correct horse');
		await page.locator('form').getByRole('button', { name: 'Register as coach' }).click();

		await expect(page).toHaveURL('/verify-email');
		expect(posted).toHaveLength(1);
		expect(posted[0].body).toMatchObject({
			email: 'coach@example.com',
			firstname: 'Alex',
			lastname: 'Belay',
			is_coach: true
		});
	});

	test('keeps the coach on the form when the registration is rejected', async ({ page }) => {
		await stub(page, 'POST', '/auth/register', {
			status: 409,
			body: { error: 'Email already registered' }
		});

		await page.goto('/');
		await page.getByRole('button', { name: 'Register as coach' }).click();
		await page.getByLabel('First name').fill('Alex');
		await page.getByLabel('Last name').fill('Belay');
		await page.getByLabel('Email').fill('coach@example.com');
		await page.getByLabel('Password').fill('correct horse');
		await page.locator('form').getByRole('button', { name: 'Register as coach' }).click();

		await expect(page.getByText('Email already registered')).toBeVisible();
		await expect(page).toHaveURL('/');
	});

	test('clears what was typed when switching tabs', async ({ page }) => {
		await page.goto('/');
		await page.getByLabel('Email').fill('coach@example.com');
		await page.getByRole('button', { name: 'Register as coach' }).click();

		await expect(page.getByLabel('Email')).toHaveValue('');
	});
});

test.describe('email verification prompt', () => {
	const unverified = testUser({ email_verified: false, coach_validated: false });

	test('names the address the link was sent to', async ({ page }) => {
		await signIn(page, unverified);

		await page.goto('/verify-email');

		await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
		await expect(page.getByText('coach@example.com')).toBeVisible();
		await expect(
			page.getByText('Wait for admin validation to access the coach portal')
		).toBeVisible();
	});

	test('resends the verification email and starts a cooldown', async ({ page }) => {
		await signIn(page, unverified);
		await stub(page, 'POST', '/auth/resend-verification', { body: { message: 'sent' } });
		const posted = capture(page, 'POST', '/auth/resend-verification');

		await page.goto('/verify-email');
		await page.getByRole('button', { name: 'Resend verification email' }).click();

		await expect(page.getByText('Verification email sent. Please check your inbox.')).toBeVisible();
		await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled();
		expect(posted[0].body).toEqual({ email: 'coach@example.com' });
	});

	test('translates a cooldown rejection into plain wording', async ({ page }) => {
		await signIn(page, unverified);
		await stub(page, 'POST', '/auth/resend-verification', {
			status: 429,
			body: { error: 'resend cooldown active' }
		});

		await page.goto('/verify-email');
		await page.getByRole('button', { name: 'Resend verification email' }).click();

		await expect(
			page.getByText('Please wait before requesting another verification email.')
		).toBeVisible();
	});

	test('signs the coach out', async ({ page }) => {
		await signIn(page, unverified);
		await stub(page, 'POST', '/auth/logout', { body: { message: 'bye' } });

		await page.goto('/verify-email');
		await page.getByRole('button', { name: 'Sign out' }).click();

		await expect(page).toHaveURL('/');
		expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
	});

	test('sends an already verified coach onwards', async ({ page }) => {
		await signIn(page, testUser({ coach_validated: false }));

		await page.goto('/verify-email');

		await expect(page).toHaveURL('/pending-validation');
	});
});

test.describe('verification link', () => {
	test('confirms the address when the token is good', async ({ page }) => {
		await stub(page, 'POST', '/auth/verify', {
			body: { message: 'Email verified successfully.', is_coach: true }
		});
		const posted = capture(page, 'POST', '/auth/verify');

		await page.goto('/verify?token=good-token');

		await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
		await expect(page.getByText('An admin will validate your account soon.')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Go to sign in' })).toBeVisible();
		expect(posted[0].body).toEqual({ token: 'good-token' });
	});

	test('explains what to try when the token is rejected', async ({ page }) => {
		await stub(page, 'POST', '/auth/verify', {
			status: 400,
			body: { error: 'Token has expired' }
		});

		await page.goto('/verify?token=stale-token');

		await expect(page.getByRole('heading', { name: 'Verification failed' })).toBeVisible();
		await expect(page.getByText('Token has expired')).toBeVisible();
		await expect(
			page.getByText('Request a new verification email if the link has expired')
		).toBeVisible();
	});

	test('asks for a token when the link has none', async ({ page }) => {
		await page.goto('/verify');

		await expect(
			page.getByText('No verification token provided. Please check your email link.')
		).toBeVisible();
	});
});

test.describe('pending validation', () => {
	const pending = testUser({ coach_validated: false });

	test('shows the account waiting for an admin', async ({ page }) => {
		await signIn(page, pending);

		await page.goto('/pending-validation');

		await expect(page.getByRole('heading', { name: 'Pending validation' })).toBeVisible();
		await expect(page.getByText('Alex Belay')).toBeVisible();
		await expect(page.getByText('(verified)')).toBeVisible();
	});

	test('signs the coach out', async ({ page }) => {
		await signIn(page, pending);
		await stub(page, 'POST', '/auth/logout', { body: { message: 'bye' } });

		await page.goto('/pending-validation');
		await page.getByRole('button', { name: 'Sign out' }).click();

		await expect(page).toHaveURL('/');
	});

	test('sends a validated coach to the dashboard', async ({ page }) => {
		await signIn(page, testUser());
		await stub(page, 'GET', '/api/coach/enrollments', { body: [] });
		await stub(page, 'GET', '/api/trainings', { body: [] });

		await page.goto('/pending-validation');

		await expect(page).toHaveURL('/dashboard');
	});
});

test.describe('enrollment invitation', () => {
	const trainee = testUser({ is_coach: false, coach_validated: false });

	test('names the inviting coach and accepts the invitation', async ({ page }) => {
		await signIn(page, trainee);
		await stub(page, 'GET', '/api/enrollment/*', { body: testEnrollmentTokenInfo() });
		await stub(page, 'POST', '/api/enrollment/*/accept', { body: { message: 'enrolled' } });
		const accepts = capture(page, 'POST', '/api/enrollment/*/accept');

		await page.goto('/enroll/invite-token');

		await expect(page.getByRole('heading', { name: 'Enrollment request' })).toBeVisible();
		await expect(page.getByText('Alex Belay')).toBeVisible();

		await page.getByRole('button', { name: 'Accept' }).click();

		await expect(page.getByRole('heading', { name: 'Enrolled' })).toBeVisible();
		expect(accepts).toHaveLength(1);
		expect(accepts[0].url).toContain('/api/enrollment/invite-token/accept');
	});

	test('declines the invitation without calling the backend', async ({ page }) => {
		await signIn(page, trainee);
		await stub(page, 'GET', '/api/enrollment/*', { body: testEnrollmentTokenInfo() });
		await stub(page, 'GET', '/api/user/enrollment', { status: 404, body: { error: 'none' } });
		const accepts = capture(page, 'POST', '/api/enrollment/*/accept');

		await page.goto('/enroll/invite-token');
		await page.getByRole('button', { name: 'Decline' }).click();

		await expect(page).toHaveURL('/dashboard');
		expect(accepts).toHaveLength(0);
	});

	test('explains that a spent link cannot be used', async ({ page }) => {
		await signIn(page, trainee);
		await stub(page, 'GET', '/api/enrollment/*', { status: 404, body: { error: 'gone' } });

		await page.goto('/enroll/invite-token');

		await expect(page.getByRole('heading', { name: 'Enrollment unavailable' })).toBeVisible();
		await expect(
			page.getByText('This enrollment link is invalid, expired, or has already been used.')
		).toBeVisible();
	});

	test('reports a failure to accept', async ({ page }) => {
		await signIn(page, trainee);
		await stub(page, 'GET', '/api/enrollment/*', { body: testEnrollmentTokenInfo() });
		await stub(page, 'POST', '/api/enrollment/*/accept', {
			status: 409,
			body: { error: 'Already enrolled with another coach' }
		});

		await page.goto('/enroll/invite-token');
		await page.getByRole('button', { name: 'Accept' }).click();

		await expect(page.getByText('Already enrolled with another coach')).toBeVisible();
	});

	test('sends an anonymous visitor to sign in and back again', async ({ page }) => {
		await page.goto('/enroll/invite-token');

		await expect(page).toHaveURL('/?return=/enroll/invite-token');
	});
});

test.describe('dashboard', () => {
	test('summarises the coach workspace', async ({ page }) => {
		await signIn(page, testUser());
		await stub(page, 'GET', '/api/coach/enrollments', { body: [] });
		await stub(page, 'GET', '/api/trainings', {
			body: [{ id: 'training-1' }, { id: 'training-2' }]
		});
		await stub(page, 'GET', '/api/coach/exercises', { body: { exercises: [], total: 7 } });

		await page.goto('/dashboard');

		await expect(page.getByRole('heading', { name: 'Welcome back, Alex' })).toBeVisible();
		await expect(page.getByRole('button', { name: /Trainings built/ })).toContainText('2');
		await expect(page.getByRole('button', { name: /Exercise library/ })).toContainText('7');
		await expect(page.getByText('0 coachees enrolled')).toBeVisible();
	});

	test('opens a section from its stat card', async ({ page }) => {
		await signIn(page, testUser());
		await stub(page, 'GET', '/api/coach/enrollments', { body: [] });
		await stub(page, 'GET', '/api/trainings', { body: [] });
		await stub(page, 'GET', '/api/coach/exercises', { body: { exercises: [], total: 0 } });
		await stub(page, 'GET', '/api/coach/tags', { body: [] });

		await page.goto('/dashboard');
		await page.getByRole('button', { name: /Exercise library/ }).click();

		await expect(page).toHaveURL('/exercises');
	});

	test('shows a trainee their coach and lets them leave', async ({ page }) => {
		await signIn(page, testUser({ is_coach: false, coach_validated: false }));
		await stub(page, 'GET', '/api/user/enrollment', {
			body: {
				enrollment_id: 'enrollment-1',
				coach_id: 'user-9',
				coach_firstname: 'Robin',
				coach_lastname: 'Slab',
				coach_email: 'robin@example.com',
				enrolled_at: '2026-01-05T10:00:00Z'
			}
		});
		await stub(page, 'DELETE', '/api/user/enrollment', { body: { message: 'left' } });
		const leaves = capture(page, 'DELETE', '/api/user/enrollment');

		await page.goto('/dashboard');

		await expect(page.getByText('Robin Slab')).toBeVisible();

		await page.getByRole('button', { name: 'Leave coach' }).click();

		expect(leaves).toHaveLength(0);

		await page.getByRole('button', { name: 'Confirm leave' }).click();

		await expect(page.getByText('You are not enrolled with any coach.')).toBeVisible();
		expect(leaves).toHaveLength(1);
	});
});
