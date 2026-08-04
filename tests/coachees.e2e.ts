import { expect, test, type Page } from '@playwright/test';
import {
	mockApi,
	signIn,
	stub,
	testEnrolledUser,
	testProgram,
	testSession,
	testUser
} from './fixtures';

const nina = testEnrolledUser();
const theo = testEnrolledUser({
	enrollment_id: 'enrollment-2',
	user_id: 'coachee-2',
	user_firstname: 'Theo',
	user_lastname: 'Sloper',
	user_email: 'theo@example.com'
});

/** The list enriches every row with that coachee's sessions and programs. */
async function stubRowDetails(page: Page): Promise<void> {
	await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [] });
	await stub(page, 'GET', '/api/coach/clients/*/programs', { body: [] });
}

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	await signIn(page, testUser());
});

test('lists the enrolled coachees with their active program', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/enrollments', { body: [nina, theo] });
	await stubRowDetails(page);
	await stub(page, 'GET', '/api/coach/clients/coachee-1/programs', { body: [testProgram()] });
	await stub(page, 'GET', '/api/coach/clients/coachee-1/sessions', { body: [testSession()] });

	await page.goto('/coachees');

	await expect(page.getByText('Nina Crimp')).toBeVisible();
	await expect(page.getByText('nina@example.com')).toBeVisible();
	await expect(page.getByText('Spring strength block')).toBeVisible();
	await expect(page.getByText('Theo Sloper')).toBeVisible();
	await expect(page.getByText('2 of 2 coachees')).toBeVisible();
});

test('filters the list by name as the coach types', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/enrollments', { body: [nina, theo] });
	await stubRowDetails(page);

	await page.goto('/coachees');
	await page.getByPlaceholder('Search by name...').fill('theo');

	await expect(page.getByText('Theo Sloper')).toBeVisible();
	await expect(page.getByText('Nina Crimp')).toBeHidden();
	await expect(page.getByText('1 of 2 coachees')).toBeVisible();
});

test('tells the coach when a search matches nobody', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/enrollments', { body: [nina] });
	await stubRowDetails(page);

	await page.goto('/coachees');
	await page.getByPlaceholder('Search by name...').fill('nobody');

	await expect(page.getByText('No coachees match your search.')).toBeVisible();
});

test('shows the empty state when no one is enrolled', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/enrollments', { body: [] });

	await page.goto('/coachees');

	await expect(page.getByText('No coachees enrolled yet.')).toBeVisible();
	await expect(page.getByText('0 of 0 coachees')).toBeVisible();
});

test('surfaces the server error when the list cannot be loaded', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/enrollments', {
		status: 500,
		body: { error: 'Roster unavailable' }
	});

	await page.goto('/coachees');

	await expect(page.getByText('Roster unavailable')).toBeVisible();
});

test('generates an enrollment link when the invite panel is opened', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/enrollments', { body: [] });
	await stub(page, 'POST', '/api/coach/enrollment-token', {
		body: { token: 'invite-token', expires_at: '2099-01-01T00:00:00Z', link: 'ignored' }
	});

	await page.goto('/coachees');
	await page.getByRole('button', { name: 'Invite' }).click();

	await expect(page.getByText('Enrollment link')).toBeVisible();
	await expect(page.getByText('/enroll/invite-token')).toBeVisible();
});

test('copies the enrollment link to the clipboard', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await stub(page, 'GET', '/api/coach/enrollments', { body: [] });
	await stub(page, 'POST', '/api/coach/enrollment-token', {
		body: { token: 'invite-token', expires_at: '2099-01-01T00:00:00Z', link: 'ignored' }
	});

	await page.goto('/coachees');
	await page.getByRole('button', { name: 'Invite' }).click();
	await page.getByRole('button', { name: 'Copy' }).click();

	await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
	const clipboard = await page.evaluate(() => navigator.clipboard.readText());
	expect(clipboard).toBe('http://localhost:4173/enroll/invite-token');
});

test('reports the failure when the enrollment link cannot be generated', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/enrollments', { body: [] });
	await stub(page, 'POST', '/api/coach/enrollment-token', {
		status: 500,
		body: { error: 'Token service down' }
	});

	await page.goto('/coachees');
	await page.getByRole('button', { name: 'Invite' }).click();

	await expect(page.getByText('Token service down')).toBeVisible();
});

test('opens the coachee detail page from a row', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/enrollments', { body: [nina] });
	await stubRowDetails(page);
	await stub(page, 'GET', '/api/coach/clients/*/assessments', { body: [] });

	await page.goto('/coachees');
	await page.getByRole('button', { name: 'NC Nina Crimp' }).click();

	await expect(page).toHaveURL('/coachees/coachee-1');
	// The name appears both in the topbar and on the profile card.
	await expect(page.getByRole('heading', { name: 'Nina Crimp' }).first()).toBeVisible();
});
