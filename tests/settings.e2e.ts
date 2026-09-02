import { expect, test } from '@playwright/test';
import { capture, mockApi, signIn, stub, testCoachTodoSettings, testUser } from './fixtures';

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	await signIn(page, testUser());
	await stub(page, 'GET', '/api/coach/todo-settings', { body: testCoachTodoSettings() });
});

test('offers the availability reminder, off, before a coach has set one', async ({ page }) => {
	// The API answers 404 until the coach configures one, which is a state rather
	// than a failure and must not surface as an error.
	await stub(page, 'GET', '/api/coach/availability-reminder', { status: 404, body: {} });

	await page.goto('/settings');

	await expect(page.getByRole('heading', { name: 'Availability reminder' })).toBeVisible();
	await expect(page.getByLabel('Send the reminder')).not.toBeChecked();
	await expect(page.getByLabel('Day', { exact: true })).toBeDisabled();
});

test('reads back the reminder the coach already set', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/availability-reminder', {
		body: { enabled: true, day_of_week: 4, hour: 21, minute: 30 }
	});

	await page.goto('/settings');

	await expect(page.getByLabel('Send the reminder')).toBeChecked();
	await expect(page.getByLabel('Day', { exact: true })).toHaveValue('4');
	await expect(page.getByLabel('Time', { exact: true })).toHaveValue('21:30');
});

test('saves the day and hour the coach picked', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/availability-reminder', { status: 404, body: {} });
	await stub(page, 'PUT', '/api/coach/availability-reminder', {
		body: { enabled: true, day_of_week: 5, hour: 9, minute: 0 }
	});
	const writes = capture(page, 'PUT', '/api/coach/availability-reminder');

	await page.goto('/settings');
	await page.getByLabel('Send the reminder').check();
	await page.getByLabel('Day', { exact: true }).selectOption('5');
	await page.getByLabel('Time', { exact: true }).fill('09:00');
	await page.getByRole('button', { name: 'Save reminder' }).click();

	await expect(page.getByText('Reminder saved')).toBeVisible();
	expect(writes).toHaveLength(1);
	expect(writes[0].body).toEqual({ enabled: true, day_of_week: 5, hour: 9, minute: 0 });
});

test('refuses to show the defaults when the reminder could not be read', async ({ page }) => {
	// Rendering the off-by-default form here would let a coach save Friday 21:00
	// over a reminder the page never managed to read.
	await stub(page, 'GET', '/api/coach/availability-reminder', {
		status: 500,
		body: { error: 'Failed to retrieve reminder' }
	});

	await page.goto('/settings');

	await expect(page.getByText('could not be read')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save reminder' })).toHaveCount(0);
});

test('refuses to save a reminder with the time cleared', async ({ page }) => {
	// An empty time field parses to hour 0 and no minute at all, which the API
	// binds to midnight. Saving it would nudge every athlete at 00:00.
	await stub(page, 'GET', '/api/coach/availability-reminder', { status: 404, body: {} });
	const writes = capture(page, 'PUT', '/api/coach/availability-reminder');

	await page.goto('/settings');
	await page.getByLabel('Send the reminder').check();
	await page.getByLabel('Time', { exact: true }).fill('');
	await page.getByRole('button', { name: 'Save reminder' }).click();

	await expect(page.getByText('Pick a time for the reminder')).toBeVisible();
	expect(writes).toHaveLength(0);
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

test('reads back when the empty week check is due', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/availability-reminder', { status: 404, body: {} });
	await stub(page, 'GET', '/api/coach/todo-settings', {
		body: testCoachTodoSettings({
			empty_week_day_of_week: 2,
			empty_week_hour: 8,
			empty_week_minute: 30
		})
	});

	await page.goto('/settings');

	await expect(page.getByRole('heading', { name: 'Unprogrammed week check' })).toBeVisible();
	await expect(page.getByLabel('Check day')).toHaveValue('2');
	await expect(page.getByLabel('Check time')).toHaveValue('08:30');
});

test('saves the moment the empty weeks are due', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/availability-reminder', { status: 404, body: {} });
	await stub(page, 'PUT', '/api/coach/todo-settings', {
		body: testCoachTodoSettings({
			empty_week_day_of_week: 6,
			empty_week_hour: 18,
			empty_week_minute: 0
		})
	});
	const writes = capture(page, 'PUT', '/api/coach/todo-settings');

	await page.goto('/settings');
	await page.getByLabel('Check day').selectOption('6');
	await page.getByLabel('Check time').fill('18:00');
	await page.getByRole('button', { name: 'Save check' }).click();

	await expect(page.getByText('Check saved')).toBeVisible();
	expect(writes).toHaveLength(1);
	expect(writes[0].body).toEqual({
		empty_week_day_of_week: 6,
		empty_week_hour: 18,
		empty_week_minute: 0
	});
});

test('refuses to show a default check when it could not be read', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/availability-reminder', { status: 404, body: {} });
	await stub(page, 'GET', '/api/coach/todo-settings', {
		status: 500,
		body: { error: 'Failed to retrieve TODO settings' }
	});

	await page.goto('/settings');

	await expect(page.getByRole('button', { name: 'Save check' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Save reminder' })).toBeVisible();
});
