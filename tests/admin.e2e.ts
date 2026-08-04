import { expect, test } from '@playwright/test';
import { capture, mockApi, signIn, stub, stubSequence, testCoach, testUser } from './fixtures';

const admin = testUser({ is_admin: true, is_coach: false });

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	await signIn(page, admin);
});

test('lists every coach awaiting approval', async ({ page }) => {
	await stub(page, 'GET', '/api/admin/coaches/pending', {
		body: [
			testCoach(),
			testCoach({
				id: 'coach-2',
				firstname: 'Sam',
				lastname: 'Jug',
				email: 'sam@example.com',
				email_verified: false
			})
		]
	});

	await page.goto('/admin');

	await expect(page.getByRole('heading', { name: 'PENDING COACH APPROVALS' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Robin Slab' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Sam Jug' })).toBeVisible();
	await expect(page.getByText('Email: pending@example.com (Verified)')).toBeVisible();
	await expect(page.getByText('Email: sam@example.com (Not Verified)')).toBeVisible();
});

test('approving a coach sends the validation and drops them from the list', async ({ page }) => {
	await stubSequence(page, 'GET', '/api/admin/coaches/pending', [[testCoach()], []]);
	await stub(page, 'PUT', '/api/admin/coaches/*/validate', { body: { message: 'validated' } });
	const validations = capture(page, 'PUT', '/api/admin/coaches/*/validate');

	await page.goto('/admin');
	await page.getByRole('button', { name: 'APPROVE' }).click();

	await expect(page.getByText('No pending coach approvals')).toBeVisible();
	expect(validations).toHaveLength(1);
	expect(validations[0].url).toContain('/api/admin/coaches/coach-1/validate');
});

test('rejecting a coach sends the rejection and drops them from the list', async ({ page }) => {
	await stubSequence(page, 'GET', '/api/admin/coaches/pending', [[testCoach()], []]);
	await stub(page, 'PUT', '/api/admin/coaches/*/reject', { body: { message: 'rejected' } });
	const rejections = capture(page, 'PUT', '/api/admin/coaches/*/reject');

	await page.goto('/admin');
	await page.getByRole('button', { name: 'REJECT' }).click();

	await expect(page.getByText('No pending coach approvals')).toBeVisible();
	expect(rejections).toHaveLength(1);
	expect(rejections[0].url).toContain('/api/admin/coaches/coach-1/reject');
});

test('keeps the coach listed and surfaces the reason when approval fails', async ({ page }) => {
	await stub(page, 'GET', '/api/admin/coaches/pending', { body: [testCoach()] });
	await stub(page, 'PUT', '/api/admin/coaches/*/validate', {
		status: 500,
		body: { error: 'Validation service unavailable' }
	});

	await page.goto('/admin');
	await page.getByRole('button', { name: 'APPROVE' }).click();

	await expect(page.getByText('Validation service unavailable')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Robin Slab' })).toBeVisible();
});

test('shows the server error when the pending list cannot be loaded', async ({ page }) => {
	await stub(page, 'GET', '/api/admin/coaches/pending', {
		status: 503,
		body: { error: 'Directory is down' }
	});

	await page.goto('/admin');

	await expect(page.getByText('Directory is down')).toBeVisible();
});

test('shows the empty state when nothing is awaiting approval', async ({ page }) => {
	await stub(page, 'GET', '/api/admin/coaches/pending', { body: [] });

	await page.goto('/admin');

	await expect(page.getByText('No pending coach approvals')).toBeVisible();
});
