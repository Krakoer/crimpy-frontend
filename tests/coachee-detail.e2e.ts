import { expect, test, type Page } from '@playwright/test';
import {
	capture,
	mockApi,
	signIn,
	stub,
	testEnrolledUser,
	testProgram,
	testRepData,
	testPrescription,
	testSession,
	testSessionDetail,
	testUser
} from './fixtures';

const nina = testEnrolledUser();

/** The detail page loads the roster, the sessions and the assessments together. */
async function stubCoacheeDetail(page: Page): Promise<void> {
	await stub(page, 'GET', '/api/coach/enrollments', { body: [nina] });
	await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [] });
	await stub(page, 'GET', '/api/coach/clients/*/assessments', { body: [] });
	await stub(page, 'GET', '/api/coach/clients/*/programs', { body: [] });
}

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	await signIn(page, testUser());
});

test.describe('coachee detail', () => {
	test('shows the coachee and their session count', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', {
			body: [testSession(), testSession({ id: 'session-2', name: 'Hangboard' })]
		});

		await page.goto('/coachees/coachee-1');

		await expect(page.getByRole('heading', { name: 'Nina Crimp' }).first()).toBeVisible();
		await expect(page.getByText('Board session')).toBeVisible();
		await expect(page.getByText('Hangboard')).toBeVisible();
		// The count appears both in the stat strip and above the session list.
		await expect(page.getByText('2 sessions').first()).toBeVisible();
	});

	test('shows the empty state when no session has been recorded', async ({ page }) => {
		await stubCoacheeDetail(page);

		await page.goto('/coachees/coachee-1');

		await expect(page.getByText('No sessions recorded yet.')).toBeVisible();
	});

	test('surfaces the server error when the coachee cannot be loaded', async ({ page }) => {
		await stub(page, 'GET', '/api/coach/enrollments', {
			status: 500,
			body: { error: 'Roster unavailable' }
		});

		await page.goto('/coachees/coachee-1');

		await expect(page.getByText('Roster unavailable')).toBeVisible();
	});

	test('moves between the tabs', async ({ page }) => {
		await stubCoacheeDetail(page);

		await page.goto('/coachees/coachee-1');

		await page.getByRole('button', { name: /^Assessments/ }).click();
		await expect(
			page.getByText(
				'No assessment records yet. Assessments are recorded through the Crimpy mobile app.'
			)
		).toBeVisible();

		await page.getByRole('button', { name: /^Notes/ }).click();
		await expect(page.getByText('Notes coming soon')).toBeVisible();

		await page.getByRole('button', { name: /^Sessions/ }).click();
		await expect(page.getByText('No sessions recorded yet.')).toBeVisible();
	});
});

test.describe('session details', () => {
	const crimpySession = testSession({
		id: 'session-crimpy',
		name: 'Repeaters 20mm',
		activity: 0,
		origin: 'played',
		duration: 900,
		repeater_sets: 1,
		repeater_reps: 2,
		repeater_work_time: 7,
		repeater_rest_time: 3,
		repeater_set_rest: 120,
		repeater_split_hand: false
	});

	const crimpyReps = [
		testRepData({ id: 'rep-1', index: 0, average_weight: 31, target_weight: 30, right_hand: true }),
		testRepData({
			id: 'rep-2',
			index: 1,
			average_weight: 29,
			target_weight: 30,
			right_hand: false
		}),
		testRepData({ id: 'rep-3', index: 2, average_weight: 22, target_weight: 30, right_hand: true }),
		testRepData({ id: 'rep-4', index: 3, average_weight: 28, target_weight: 30, right_hand: false })
	];

	test('opens a logged session on the duration layout, without sensor data', async ({ page }) => {
		const climbing = testSession({ notes: 'Sent the project', duration: 5400 });
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [climbing] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(climbing)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Board session' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Climbing', { exact: true })).toBeVisible();
		await expect(dialog.getByText('1h 30m')).toBeVisible();
		await expect(dialog.getByText('Sent the project')).toBeVisible();
		await expect(dialog.getByText('Performance')).toBeHidden();
	});

	test('opens a hangboard session on the performance layout', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(crimpySession, crimpyReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Hangboard')).toBeVisible();
		await expect(dialog.getByText('Performance')).toBeVisible();
		// One of the four reps falls under 90% of its 30 kg target.
		await expect(dialog.getByText('3/4 on target')).toBeVisible();
		await expect(dialog.getByText('Peak load')).toBeVisible();
		await expect(dialog.getByText('31.0 kg')).toBeVisible();
		// The repeater configuration splits the reps into per-hand sets.
		await expect(dialog.getByText('Set 1 - Right')).toBeVisible();
		await expect(dialog.getByText('Set 1 - Left')).toBeVisible();
	});

	test('shows what was prescribed against the measured reps', async ({ page }) => {
		const prescribed = testSession({
			...crimpySession,
			prescription: testPrescription()
		});
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(prescribed, crimpyReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('heading', { name: 'Prescribed' })).toBeVisible();
		await expect(dialog.getByText('From the program')).toBeVisible();
		await expect(dialog.getByText('Stop the set if you drop below the target.')).toBeVisible();
		// 85% of the max force frozen with the session, per hand: 40 kg and 38 kg.
		await expect(dialog.getByText('85% Max force (load)')).toBeVisible();
		await expect(dialog.getByText('R 34.0 kg')).toBeVisible();
		await expect(dialog.getByText('L 32.3 kg')).toBeVisible();
		// The measurements stay on their own card rather than being paired rep by rep.
		await expect(dialog.getByText('3/4 on target')).toBeVisible();
	});

	test('says so when a played session had nothing prescribed', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(crimpySession, crimpyReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Played from the athlete')).toBeVisible();
		await expect(dialog.getByRole('heading', { name: 'Prescribed' })).toBeHidden();
	});

	test('closes the details view', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [testSession()] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', { body: testSessionDetail() });

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Board session' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		await page.getByRole('button', { name: 'Close' }).click();

		await expect(page.getByRole('dialog')).toBeHidden();
	});

	test('surfaces the server error when the details cannot be loaded', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			status: 500,
			body: { error: 'Session storage unreachable' }
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		await expect(page.getByText('Session storage unreachable')).toBeVisible();
		// The summary from the listing still stands in for the detail.
		await expect(page.getByRole('dialog').getByText('Repeaters 20mm')).toBeVisible();
	});
});

test.describe('programs tab', () => {
	test('lists the programs of the coachee', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/programs', { body: [testProgram()] });

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Programs/ }).click();

		await expect(page.getByText('Spring strength block')).toBeVisible();
		await expect(page.getByText('Raise max finger strength')).toBeVisible();
		await expect(page.getByText('1 program', { exact: false })).toBeVisible();
	});

	test('shows the empty state when the coachee has no program', async ({ page }) => {
		await stubCoacheeDetail(page);

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Programs/ }).click();

		await expect(page.getByText('No programs yet.')).toBeVisible();
	});

	test('refuses to create a program without a name and a start date', async ({ page }) => {
		await stubCoacheeDetail(page);

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Programs/ }).click();
		await page.getByRole('button', { name: 'Create first program' }).click();
		await page.getByRole('button', { name: 'Create program' }).click();

		await expect(page.getByText('Name and start date are required.')).toBeVisible();
	});

	test('creates a program and opens it', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'POST', '/api/coach/clients/*/programs', { body: testProgram() });
		await stub(page, 'GET', '/api/coach/clients/*/programs/*', { body: testProgram() });
		await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', { body: [] });
		await stub(page, 'GET', '/api/trainings', { body: [] });
		const posted = capture(page, 'POST', '/api/coach/clients/*/programs');

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Programs/ }).click();
		await page.getByRole('button', { name: 'Create first program' }).click();
		await page.getByLabel('Program name *').fill('Spring strength block');
		await page.getByLabel('Objective').fill('Raise max finger strength');
		await page.getByLabel('Start date *').fill('2026-09-02');
		await page.getByRole('button', { name: 'Create program' }).click();

		await expect(page).toHaveURL('/coachees/coachee-1/programs/program-1');
		expect(posted).toHaveLength(1);
		expect(posted[0].body).toMatchObject({
			name: 'Spring strength block',
			objective: 'Raise max finger strength'
		});
	});

	test('normalises the start date to the monday of that week', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'POST', '/api/coach/clients/*/programs', { body: testProgram() });
		await stub(page, 'GET', '/api/coach/clients/*/programs/*', { body: testProgram() });
		await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', { body: [] });
		await stub(page, 'GET', '/api/trainings', { body: [] });
		const posted = capture(page, 'POST', '/api/coach/clients/*/programs');

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Programs/ }).click();
		await page.getByRole('button', { name: 'Create first program' }).click();
		await page.getByLabel('Program name *').fill('Autumn block');
		// 2026-09-04 is a Friday.
		await page.getByLabel('Start date *').fill('2026-09-04');
		await page.getByRole('button', { name: 'Create program' }).click();

		await expect.poll(() => posted.length).toBe(1);
		expect((posted[0].body as { start_date: string }).start_date).toContain('2026-08-31');
	});

	test('reports the server error when a program cannot be created', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'POST', '/api/coach/clients/*/programs', {
			status: 500,
			body: { error: 'Program storage is full' }
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Programs/ }).click();
		await page.getByRole('button', { name: 'Create first program' }).click();
		await page.getByLabel('Program name *').fill('Autumn block');
		await page.getByLabel('Start date *').fill('2026-09-02');
		await page.getByRole('button', { name: 'Create program' }).click();

		await expect(page.getByText('Program storage is full')).toBeVisible();
		await expect(page).toHaveURL('/coachees/coachee-1');
	});

	test('deletes a program only after the confirmation step', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/programs', { body: [testProgram()] });
		await stub(page, 'DELETE', '/api/coach/clients/*/programs/*', { body: { message: 'gone' } });
		const deletes = capture(page, 'DELETE', '/api/coach/clients/*/programs/*');

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Programs/ }).click();
		await page.getByRole('button', { name: 'Delete program' }).click();

		expect(deletes).toHaveLength(0);

		await page.getByRole('button', { name: 'Confirm', exact: true }).click();

		await expect(page.getByText('Program deleted')).toBeVisible();
		await expect(page.getByText('No programs yet.')).toBeVisible();
		expect(deletes).toHaveLength(1);
	});
});
