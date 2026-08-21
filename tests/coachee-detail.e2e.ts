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
		// The item hangs both hands at once, which the app puts on the gauge as 85%
		// of the mean of the two results frozen with the session, 40 kg and 38 kg.
		// One number, because one number is what the athlete was asked to hold.
		await expect(dialog.getByText('85% Max force (load)')).toBeVisible();
		await expect(dialog.getByText('33.1 kg')).toBeVisible();
		await expect(dialog.getByText('R 34.0 kg')).toBeHidden();
		await expect(dialog.getByText('L 32.3 kg')).toBeHidden();
		// The measurements stay on their own card rather than being paired rep by rep.
		await expect(dialog.getByText('3/4 on target')).toBeVisible();
	});

	test('reads a hand-by-hand prescription against that hand', async ({ page }) => {
		// A split repeater hangs one hand at a time and may load them differently,
		// so each side resolves against its own result rather than against both.
		const prescribed = testSession({
			...crimpySession,
			prescription: testPrescription({
				items: [
					{
						id: 'item-1',
						type: 'repeater',
						cycles: 1,
						reps: 2,
						worktime_seconds: 7,
						rest_seconds: 3,
						cycle_rest_seconds: 120,
						hand: 'split',
						granularity: 'uniform',
						edge_sizes_mm: [20],
						loads: [{ value: 85, unit: 'percent_assessment', assessment_type: 1, fallback: 30 }],
						left_loads: [
							{ value: 80, unit: 'percent_assessment', assessment_type: 1, fallback: 30 }
						]
					}
				]
			})
		});
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(prescribed, crimpyReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		// 85% of the right hand's 40 kg, and 80% of the left hand's 38 kg. Neither
		// hand is shown the percentage the other one was asked for.
		await expect(dialog.getByText('85% Max force (load)')).toBeVisible();
		await expect(dialog.getByText('R 34.0 kg')).toBeVisible();
		await expect(dialog.getByText('80% Max force (load)')).toBeVisible();
		await expect(dialog.getByText('L 30.4 kg')).toBeVisible();
		await expect(dialog.getByText('L 32.3 kg')).toBeHidden();
		await expect(dialog.getByText('R 32.0 kg')).toBeHidden();
	});

	test('names the hands when one percentage is asked of several of them', async ({ page }) => {
		// Two items ask 85% of the same assessment but hang differently, so the
		// percentage comes out at two numbers. Neither is worth showing unlabelled.
		const repeater = {
			cycles: 1,
			reps: 2,
			worktime_seconds: 7,
			rest_seconds: 3,
			cycle_rest_seconds: 120,
			granularity: 'uniform' as const,
			edge_sizes_mm: [20],
			loads: [{ value: 85, unit: 'percent_assessment' as const, assessment_type: 1, fallback: 30 }]
		};
		const prescribed = testSession({
			...crimpySession,
			prescription: testPrescription({
				items: [
					{ id: 'item-1', type: 'repeater', hand: 'both', ...repeater },
					{ id: 'item-2', type: 'repeater', hand: 'right', ...repeater }
				]
			})
		});
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(prescribed, crimpyReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Both 33.1 kg')).toBeVisible();
		await expect(dialog.getByText('R 34.0 kg')).toBeVisible();
	});

	test('splits the reps into the blocks they were played from', async ({ page }) => {
		// Two hangboard blocks on different edges. Pooled into one list they cannot
		// be read against the prescription card, which names both.
		const block = (id: string, edge: number) => ({
			id,
			type: 'hangboard_rep' as const,
			reps: 2,
			worktime_seconds: 7,
			rest_seconds: 60,
			hand: 'right' as const,
			granularity: 'uniform' as const,
			edge_sizes_mm: [edge],
			loads: [{ value: 30, unit: 'kg' as const }]
		});
		const prescribed = testSession({
			...crimpySession,
			// The blocks come from the run itself, so the repeater shape the session
			// carries no longer decides the breakdown.
			prescription: testPrescription({
				items: [block('item-20mm', 20), block('item-14mm', 14)]
			})
		});
		const blockReps = [
			testRepData({
				id: 'rep-1',
				index: 0,
				average_weight: 31,
				target_weight: 30,
				edge_size_mm: 20,
				training_item_id: 'item-20mm'
			}),
			testRepData({
				id: 'rep-2',
				index: 1,
				average_weight: 29,
				target_weight: 30,
				edge_size_mm: 20,
				training_item_id: 'item-20mm'
			}),
			testRepData({
				id: 'rep-3',
				index: 2,
				average_weight: 21,
				target_weight: 20,
				edge_size_mm: 14,
				training_item_id: 'item-14mm'
			})
		];
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(prescribed, blockReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('1. Hang rep 20mm')).toBeVisible();
		await expect(dialog.getByText('2. Hang rep 14mm')).toBeVisible();
		// Each block is graded on its own target rather than through one pooled ratio.
		await expect(dialog.getByText('avg 30.0 / 30.0 kg - 2/2 on target')).toBeVisible();
		await expect(dialog.getByText('avg 21.0 / 20.0 kg - 1/1 on target')).toBeVisible();
		// The edge is on the rep row now, so a block is readable on its own.
		await expect(dialog.getByText('14mm', { exact: true })).toBeVisible();
		// The repeater set breakdown gives way to the blocks the run recorded.
		await expect(dialog.getByText('Set 1 - Right')).toBeHidden();
	});

	test('pools the reps when none names the block it came from', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(crimpySession, crimpyReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Set 1 - Right')).toBeVisible();
		await expect(dialog.getByText('Blocks', { exact: true })).toBeHidden();
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
