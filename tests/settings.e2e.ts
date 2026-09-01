import { expect, test } from '@playwright/test';
import { capture, mockApi, signIn, stub, testUser } from './fixtures';

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	await signIn(page, testUser());
});

test('offers the availability reminder, off, before a coach has set one', async ({ page }) => {
	// The API answers 404 until the coach configures one, which is a state rather
	// than a failure and must not surface as an error.
	await stub(page, 'GET', '/api/coach/availability-reminder', { status: 404, body: {} });

	await page.goto('/settings');

	await expect(page.getByRole('heading', { name: 'Availability reminder' })).toBeVisible();
	await expect(page.getByLabel('Send the reminder')).not.toBeChecked();
	await expect(page.getByLabel('Day')).toBeDisabled();
});

test('reads back the reminder the coach already set', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/availability-reminder', {
		body: { enabled: true, day_of_week: 4, hour: 21, minute: 30 }
	});

	await page.goto('/settings');

	await expect(page.getByLabel('Send the reminder')).toBeChecked();
	await expect(page.getByLabel('Day')).toHaveValue('4');
	await expect(page.getByLabel('Time')).toHaveValue('21:30');
});

test('saves the day and hour the coach picked', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/availability-reminder', { status: 404, body: {} });
	await stub(page, 'PUT', '/api/coach/availability-reminder', {
		body: { enabled: true, day_of_week: 5, hour: 9, minute: 0 }
	});
	const writes = capture(page, 'PUT', '/api/coach/availability-reminder');

	await page.goto('/settings');
	await page.getByLabel('Send the reminder').check();
	await page.getByLabel('Day').selectOption('5');
	await page.getByLabel('Time').fill('09:00');
	await page.getByRole('button', { name: 'Save reminder' }).click();

	await expect(page.getByText('Reminder saved')).toBeVisible();
	expect(writes).toHaveLength(1);
	expect(writes[0].body).toEqual({ enabled: true, day_of_week: 5, hour: 9, minute: 0 });
});

test('says so when the reminder could not be saved', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/availability-reminder', { status: 404, body: {} });
	await stub(page, 'PUT', '/api/coach/availability-reminder', {
		status: 500,
		body: { error: 'Failed to save reminder' }
	});

	await page.goto('/settings');
	await page.getByRole('button', { name: 'Save reminder' }).click();

	await expect(page.getByText('Failed to save reminder')).toBeVisible();
});
