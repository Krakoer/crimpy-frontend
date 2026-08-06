import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	capture,
	mockApi,
	signIn,
	stub,
	testEnrolledUser,
	testProgram,
	testTraining,
	testUser
} from './fixtures';

const PROGRAM_URL = '/coachees/coachee-1/programs/program-1';

/** The week editor loads the program, its weeks and the training library. */
async function stubProgram(page: Page, program = testProgram()): Promise<void> {
	await stub(page, 'GET', '/api/coach/enrollments', { body: [testEnrolledUser()] });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*', { body: program });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', { body: [] });
	await stub(page, 'GET', '/api/trainings', { body: [testTraining()] });
}

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	await signIn(page, testUser());
});

test('shows the program with a row per week', async ({ page }) => {
	await stubProgram(page);

	await page.goto(PROGRAM_URL);

	await expect(page.getByRole('heading', { name: 'Spring strength block' })).toBeVisible();
	await expect(page.getByText('Raise max finger strength')).toBeVisible();
	await expect(page.getByRole('button', { name: /Wk 1/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /Wk 4/ })).toBeVisible();
	await expect(page).toHaveTitle('Spring strength block - Crimpy');
});

test('breadcrumbs back to the coachee', async ({ page }) => {
	await stubProgram(page);
	await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [] });
	await stub(page, 'GET', '/api/coach/clients/*/assessments', { body: [] });
	await stub(page, 'GET', '/api/coach/clients/*/programs', { body: [testProgram()] });

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Back to coachee' }).click();

	await expect(page).toHaveURL('/coachees/coachee-1');
});

test('surfaces the server error when the program cannot be loaded', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/enrollments', { body: [testEnrolledUser()] });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*', {
		status: 404,
		body: { error: 'Program not found' }
	});

	await page.goto(PROGRAM_URL);

	await expect(page.getByText('Program not found')).toBeVisible();
});

test('opens the week editor only in edit mode', async ({ page }) => {
	await stubProgram(page);

	await page.goto(PROGRAM_URL);

	await expect(page.getByRole('button', { name: 'Save program' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Edit' }).click();

	await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Edit details' })).toBeVisible();
});

test('saves an edit to the program details', async ({ page }) => {
	await stubProgram(page);
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*', {
		body: testProgram({ name: 'Summer power block' })
	});
	const updates = capture(page, 'PUT', '/api/coach/clients/*/programs/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: 'Edit details' }).click();
	await page.getByLabel('Name').fill('Summer power block');
	await page.getByLabel('Weeks').fill('6');
	await page.getByRole('button', { name: 'Done' }).click();

	await expect(page.getByText('Program saved')).toBeVisible();
	expect(updates).toHaveLength(1);
	expect(updates[0].body).toMatchObject({ name: 'Summer power block', duration_weeks: 6 });
});

test('reports the server error when a details edit fails', async ({ page }) => {
	await stubProgram(page);
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*', {
		status: 500,
		body: { error: 'Could not save the program' }
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: 'Edit details' }).click();
	await page.getByLabel('Name').fill('Summer power block');
	await page.getByRole('button', { name: 'Done' }).click();

	await expect(page.getByText('Could not save the program')).toBeVisible();
});

test('deletes the program only after the confirmation step', async ({ page }) => {
	await stubProgram(page);
	await stub(page, 'DELETE', '/api/coach/clients/*/programs/*', { body: { message: 'gone' } });
	await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [] });
	await stub(page, 'GET', '/api/coach/clients/*/assessments', { body: [] });
	await stub(page, 'GET', '/api/coach/clients/*/programs', { body: [] });
	const deletes = capture(page, 'DELETE', '/api/coach/clients/*/programs/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();

	expect(deletes).toHaveLength(0);

	await page.getByRole('button', { name: 'Confirm delete' }).click();

	await expect(page).toHaveURL('/coachees/coachee-1');
	expect(deletes).toHaveLength(1);
});

test('loads the sessions already planned in a week', async ({ page }) => {
	await stubProgram(page);
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: {
			id: 'week-1',
			program_id: 'program-1',
			week_number: 1,
			notes: 'Deload the second half',
			created_at: '',
			updated_at: '',
			sessions: [
				{
					id: 'ws-1',
					training_id: 'training-1',
					training_title: 'Power endurance block',
					training_type: 'workout',
					day_of_week: 1,
					is_everyday: false,
					position: 0,
					overrides: []
				}
			]
		}
	});

	await page.goto(PROGRAM_URL);

	// A collapsed row previews only the first word of each training.
	const week1 = page.getByRole('button', { name: /Wk 1/ });
	await expect(week1).toContainText('Power');

	await week1.click();

	await expect(page.getByText('Power endurance block')).toBeVisible();
	await expect(page.getByText('Deload the second half').first()).toBeVisible();
});

/** Drives the dnd-kit pointer sensor, which only activates after 8px of travel. */
async function dragOnto(page: Page, source: Locator, target: Locator): Promise<void> {
	const from = await source.boundingBox();
	const to = await target.boundingBox();
	if (!from || !to) throw new Error('Cannot drag between elements that are not laid out');

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 20, { steps: 5 });
	await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
	await page.mouse.up();
}

test('warns when a dropped training needs an assessment the coachee has not done', async ({
	page
}) => {
	await stubProgram(page);
	await stub(page, 'GET', '/api/coach/clients/*/assessments', { body: [] });
	await stub(page, 'GET', '/api/trainings/*', {
		body: testTraining({
			items: [
				{
					id: 'item-1',
					type: 'hangboard_rep',
					position: 0,
					loads: [{ value: 80, unit: 'percent_assessment', assessment_type: 1, fallback: 30 }]
				}
			]
		})
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: /Wk 1/ }).click();

	await dragOnto(
		page,
		page.getByText('Power endurance block').first(),
		page.getByTestId('cell:1:0')
	);

	await expect(page.getByText(/has not done Max force yet/)).toBeVisible();
});
