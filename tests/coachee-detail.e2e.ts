import { expect, test, type Page } from '@playwright/test';
import {
	BUILTIN_MAX_FORCE,
	capture,
	mockApi,
	signIn,
	stub,
	testAssessmentRecord,
	testEnrolledUser,
	testPrescription,
	testProgram,
	testRepData,
	testSession,
	testSessionDetail,
	testSessionItemResult,
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
		await expect(page.getByText('No assessment records yet.')).toBeVisible();

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
		duration: 900
	});

	const crimpyReps = [
		testRepData({ id: 'rep-1', index: 0, average_weight: 31, target_weight: 30, hand: 'right' }),
		testRepData({
			id: 'rep-2',
			index: 1,
			average_weight: 29,
			target_weight: 30,
			hand: 'left'
		}),
		testRepData({ id: 'rep-3', index: 2, average_weight: 22, target_weight: 30, hand: 'right' }),
		testRepData({ id: 'rep-4', index: 3, average_weight: 28, target_weight: 30, hand: 'left' })
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
		// None of these reps names the block it came from, so the card pools them
		// into its flat list rather than heading anything.
		await expect(dialog.getByText('Repetitions', { exact: true })).toBeVisible();
		await expect(dialog.getByText('Blocks', { exact: true })).toBeHidden();
		// Two right hangs and two left ones, each row naming the hand it was
		// pulled with.
		await expect(dialog.getByText('R', { exact: true })).toHaveCount(2);
		await expect(dialog.getByText('L', { exact: true })).toHaveCount(2);
	});

	test('grades a session the sensor dropped in on the reps it measured', async ({ page }) => {
		// The sensor answered for the first two hangs and went quiet for the last
		// two, which the app records as reps carrying no target and saying why.
		// Counted in the ratio they would read as misses the athlete never made.
		const droppedReps = [
			testRepData({ id: 'rep-1', index: 0, average_weight: 31, target_weight: 30 }),
			testRepData({ id: 'rep-2', index: 1, average_weight: 29, target_weight: 30 }),
			testRepData({
				id: 'rep-3',
				index: 2,
				average_weight: 0,
				target_weight: 0,
				target_unmeasured: true
			}),
			testRepData({
				id: 'rep-4',
				index: 3,
				average_weight: 0,
				target_weight: 0,
				target_unmeasured: true
			})
		];
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(crimpySession, droppedReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('2/2 on target (2 unmeasured)')).toBeVisible();
		await expect(dialog.getByText('2/4 on target')).toBeHidden();
		// The run was four reps long whatever the sensor caught of it, so the stat
		// that counts the whole run is checked on its value, not on its label.
		await expect(dialog.getByText('Work reps', { exact: true }).locator('..')).toContainText('4');
		// The mean is over the two reps the sensor weighed, so it agrees with the
		// ratio beside it. Averaging the two it missed in would read 15.0 kg, a
		// load the athlete never pulled.
		await expect(dialog.getByText('Avg load', { exact: true }).locator('..')).toContainText(
			'30.0 kg'
		);
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
		await expect(dialog.getByText('85% Max Force (load)')).toBeVisible();
		await expect(dialog.getByText('33.1 kg')).toBeVisible();
		await expect(dialog.getByText('R 34.0 kg')).toBeHidden();
		await expect(dialog.getByText('L 32.3 kg')).toBeHidden();
		// The measurements stay on their own card rather than being paired rep by rep.
		await expect(dialog.getByText('3/4 on target')).toBeVisible();
	});

	test('shows what the athlete managed on the items that were left open', async ({ page }) => {
		// An AMRAP and an emom the athlete dropped out of: neither count exists
		// until the run happens, and neither passes through the sensor, so the
		// prescription tree is the only place they can be read against.
		const openBlocks = testPrescription({
			items: [
				{
					id: 'emom-1',
					type: 'emom',
					cycles: 10,
					interval_seconds: 60,
					items: [
						{
							id: 'pullup-1',
							type: 'exercise',
							exercise_name: 'Pull up',
							reps_is_max: true
						}
					]
				}
			]
		});
		const prescribed = testSession({ ...crimpySession, prescription: openBlocks });

		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(
				prescribed,
				[],
				[],
				[
					testSessionItemResult({ training_item_id: 'pullup-1', field: 'reps', value: 23 }),
					testSessionItemResult({
						id: 'item-result-2',
						training_item_id: 'pullup-1',
						occurrence: 1,
						field: 'reps',
						value: 18
					}),
					testSessionItemResult({
						id: 'item-result-3',
						training_item_id: 'emom-1',
						field: 'cycles',
						value: 7
					})
				]
			)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('heading', { name: 'Prescribed' })).toBeVisible();
		// The emom asked for ten rounds and the athlete made seven of them.
		await expect(dialog.getByTestId('achieved-badge').first()).toContainText('7/10 rounds');
		// The AMRAP asked for no number at all, so only what was done is shown,
		// once per pass through the block.
		await expect(dialog.getByText('AMRAP').first()).toBeVisible();
		await expect(dialog.getByTestId('achieved-badge').nth(1)).toContainText('23, 18 reps');
	});

	// A ten round emom records ten counts. Listed in full they overflow the header
	// of a card nested two levels deep in the modal, so the badge shows the first
	// few and counts the rest.
	test('caps the counts shown on a block played many times', async ({ page }) => {
		const openBlocks = testPrescription({
			items: [
				{
					id: 'emom-1',
					type: 'emom',
					cycles: 10,
					interval_seconds: 60,
					items: [{ id: 'pullup-1', type: 'exercise', exercise_name: 'Pull up', reps_is_max: true }]
				}
			]
		});
		const prescribed = testSession({ ...crimpySession, prescription: openBlocks });
		const counts = [23, 18, 15, 12, 11, 10, 9, 8, 7, 6];

		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(
				prescribed,
				[],
				[],
				counts.map((value, occurrence) =>
					testSessionItemResult({
						id: `item-result-${occurrence}`,
						training_item_id: 'pullup-1',
						occurrence,
						field: 'reps',
						value
					})
				)
			)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const badge = page.getByRole('dialog').getByTestId('achieved-badge').last();
		await expect(badge).toContainText('23, 18, 15, 12');
		await expect(badge).toContainText('+6');
		await expect(badge).toHaveAttribute('title', counts.join(', '));
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
						loads: [
							{
								value: 85,
								unit: 'percent_assessment',
								assessment_id: BUILTIN_MAX_FORCE,
								fallback: 30
							}
						],
						left_loads: [
							{
								value: 80,
								unit: 'percent_assessment',
								assessment_id: BUILTIN_MAX_FORCE,
								fallback: 30
							}
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
		await expect(dialog.getByText('85% Max Force (load)')).toBeVisible();
		await expect(dialog.getByText('R 34.0 kg')).toBeVisible();
		await expect(dialog.getByText('80% Max Force (load)')).toBeVisible();
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
			loads: [
				{
					value: 85,
					unit: 'percent_assessment' as const,
					assessment_id: BUILTIN_MAX_FORCE,
					fallback: 30
				}
			]
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

	test('states a block load over the reps its sensor weighed', async ({ page }) => {
		// The same drop as above, but the reps name the block they were played
		// from, so the card reads the block line rather than the flat list.
		const block = {
			id: 'item-20mm',
			type: 'hangboard_rep' as const,
			reps: 4,
			worktime_seconds: 7,
			rest_seconds: 60,
			hand: 'right' as const,
			granularity: 'uniform' as const,
			edge_sizes_mm: [20],
			loads: [{ value: 30, unit: 'kg' as const }]
		};
		const prescribed = testSession({
			...crimpySession,
			prescription: testPrescription({ items: [block] })
		});
		const blockReps = [
			testRepData({
				id: 'rep-1',
				index: 0,
				average_weight: 31,
				target_weight: 30,
				training_item_id: 'item-20mm'
			}),
			testRepData({
				id: 'rep-2',
				index: 1,
				average_weight: 29,
				target_weight: 30,
				training_item_id: 'item-20mm'
			}),
			...[2, 3].map((index) =>
				testRepData({
					id: `rep-${index + 1}`,
					index,
					average_weight: 0,
					target_weight: 0,
					target_unmeasured: true,
					training_item_id: 'item-20mm'
				})
			)
		];
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(prescribed, blockReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		// The mean and the ratio on the one line count the same two reps. Averaging
		// the two the sensor missed would read 15.0 kg, a load never pulled.
		await expect(
			dialog.getByText('avg 30.0 / 30.0 kg - 2/2 on target (2 unmeasured)')
		).toBeVisible();
		await expect(dialog.getByText('avg 15.0')).toBeHidden();
		// An unmeasured rep is stored with no target, which would otherwise read as
		// a block whose prescribed load varied and drop the target half of the line.
		await expect(dialog.getByText('avg 30.0 kg -')).toBeHidden();
	});

	test('says a block went unmeasured rather than stating its zeros', async ({ page }) => {
		// The sensor never answered at all, so there is no load to state: a mean
		// over its zeros would read 0.0 kg, which the athlete never pulled.
		const block = {
			id: 'item-20mm',
			type: 'hangboard_rep' as const,
			reps: 2,
			worktime_seconds: 7,
			rest_seconds: 60,
			hand: 'right' as const,
			granularity: 'uniform' as const,
			edge_sizes_mm: [20],
			loads: [{ value: 30, unit: 'kg' as const }]
		};
		const prescribed = testSession({
			...crimpySession,
			prescription: testPrescription({ items: [block] })
		});
		const blockReps = [0, 1].map((index) =>
			testRepData({
				id: `rep-${index + 1}`,
				index,
				average_weight: 0,
				target_weight: 0,
				target_unmeasured: true,
				training_item_id: 'item-20mm'
			})
		);
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(prescribed, blockReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		// The block line and the two rep rows under it, each saying the same thing
		// about the run rather than the rows contradicting the line above them.
		await expect(dialog.getByText('not measured')).toHaveCount(3);
		await expect(dialog.getByText('avg 0.0 kg')).toBeHidden();
		// Nothing was graded either, so the header states no mean load at all.
		await expect(dialog.getByText('Avg load')).toBeHidden();
		// Nor a peak: the max over the zeros the sensor stored would read 0.0 kg,
		// the one cell left able to state a load the athlete never pulled.
		await expect(dialog.getByText('Peak load')).toBeHidden();
		// No cell of the card states a load, the rep rows included: the zeros the
		// sensor stored are the absence of a reading rather than a load pulled.
		await expect(dialog.getByText('0.0 kg')).toBeHidden();
		const stats = dialog.getByText('Work time', { exact: true }).locator('../..');
		await expect(stats).not.toContainText('kg');
		// The run itself is still counted, so the header keeps the two stats that
		// hold whatever the sensor caught.
		await expect(stats).toContainText('Work reps');
		await expect(dialog.getByText('Work reps', { exact: true }).locator('..')).toContainText('2');
	});

	test('keeps the zero a working sensor read against a target', async ({ page }) => {
		// The athlete came off the board on both reps, which the sensor did read.
		// A row saying nothing was measured there would hide a real miss.
		const heldNothing = [0, 1].map((index) =>
			testRepData({
				id: `rep-${index + 1}`,
				index,
				average_weight: 0,
				target_weight: 30
			})
		);
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(crimpySession, heldNothing)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('not measured')).toHaveCount(0);
		await expect(dialog.getByText('0.0 / 30.0 kg')).toHaveCount(2);
	});

	test('counts the mean over the reps the rows state a load for', async ({ page }) => {
		// A run with no prescribed load that the sensor dropped out of halfway. The
		// rep it missed carries no target, so it is not flagged unmeasured, and
		// averaging its zero in states 15.0 kg over one row reading 30.0 kg and one
		// reading that nothing measured it.
		const droppedHalfway = [
			testRepData({ id: 'rep-1', index: 0, average_weight: 30, target_weight: 0 }),
			testRepData({ id: 'rep-2', index: 1, average_weight: 0, target_weight: 0 })
		];
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(crimpySession, droppedHalfway)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Avg load', { exact: true }).locator('..')).toContainText(
			'30.0 kg'
		);
		await expect(dialog.getByText('15.0 kg')).toBeHidden();
		await expect(dialog.getByText('not measured')).toHaveCount(1);
	});

	test('states a run read below zero that prescribed no load', async ({ page }) => {
		// A sensor tared under load reads a whole run below zero. That is a reading,
		// so the rows state it rather than claiming nothing measured them, which
		// would leave a run the sensor did answer for reading as one it never did.
		const belowZero = [0, 1].map((index) =>
			testRepData({ id: `rep-${index + 1}`, index, average_weight: -0.4, target_weight: 0 })
		);
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(crimpySession, belowZero)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('not measured')).toHaveCount(0);
		await expect(dialog.getByText('-0.4 kg')).toHaveCount(4);
	});

	test('states a run read below zero as it was read', async ({ page }) => {
		// A sensor tared under load reads a whole run below zero. Flooring the peak
		// at 0.0 kg there states the same load no rep pulled that this stat exists
		// to stop stating, and the app's max carries no floor either.
		const belowZero = [0, 1].map((index) =>
			testRepData({
				id: `rep-${index + 1}`,
				index,
				average_weight: -0.4,
				target_weight: 20
			})
		);
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(crimpySession, belowZero)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Peak load', { exact: true }).locator('..')).toContainText(
			'-0.4 kg'
		);
		// The mean already read the run this way, so the two agree.
		await expect(dialog.getByText('Avg load', { exact: true }).locator('..')).toContainText(
			'-0.4 kg'
		);
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
		await expect(dialog.getByText('Hang rep 20mm', { exact: true })).toBeVisible();
		await expect(dialog.getByText('Hang rep 14mm', { exact: true })).toBeVisible();
		// Each block is graded on its own target rather than through one pooled ratio.
		await expect(dialog.getByText('avg 30.0 / 30.0 kg - 2/2 on target')).toBeVisible();
		await expect(dialog.getByText('avg 21.0 / 20.0 kg - 1/1 on target')).toBeVisible();
		// The edge is on the rep row now, so a block is readable on its own.
		await expect(dialog.getByText('14mm', { exact: true })).toBeVisible();
		// A hangboard rep is one hang, not a repeater, so its block carries no set
		// breakdown under the heading.
		await expect(dialog.getByText('Set 1 - Right')).toBeHidden();
		// The header states nothing it would have to pool across the two blocks.
		// Averaging 30.0 kg hangs with a 21.0 kg hang names a load neither block
		// asked for, and 3/3 hides which target each rep was graded against.
		await expect(dialog.getByText('Avg load')).toBeHidden();
		await expect(dialog.getByText('3/3 on target')).toBeHidden();
		// What still aggregates over the whole session stays in the header.
		await expect(dialog.getByText('Peak load')).toBeVisible();
		await expect(dialog.getByText('Work reps')).toBeVisible();
	});

	test('keeps the set breakdown inside a repeater block', async ({ page }) => {
		// A repeater is one item, so grouping by item alone would collapse every
		// set into a single pooled list - the symptom blocks were meant to cure.
		const prescribed = testSession({
			...crimpySession,
			prescription: testPrescription({
				items: [
					{
						id: 'item-repeater',
						type: 'repeater' as const,
						cycles: 2,
						reps: 2,
						worktime_seconds: 7,
						rest_seconds: 3,
						cycle_rest_seconds: 60,
						hand: 'right' as const,
						granularity: 'uniform' as const,
						edge_sizes_mm: [20],
						loads: [{ value: 30, unit: 'kg' as const }]
					}
				]
			})
		});
		const repeaterReps = [0, 1, 2, 3].map((i) =>
			testRepData({
				id: `rep-${i + 1}`,
				index: i,
				average_weight: 30,
				target_weight: 30,
				edge_size_mm: 20,
				training_item_id: 'item-repeater'
			})
		);
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(prescribed, repeaterReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		// The block names the item, and the sets inside it survive.
		await expect(dialog.getByText('Hangboard 20mm', { exact: true })).toBeVisible();
		await expect(dialog.getByText('Set 1 - Right')).toBeVisible();
		await expect(dialog.getByText('Set 2 - Right')).toBeVisible();
		// One block pools nothing, so the header reads exactly as it always has.
		await expect(dialog.getByText('Avg load')).toBeVisible();
		await expect(dialog.getByText('30.0 kg').first()).toBeVisible();
		await expect(dialog.getByText('4/4 on target', { exact: true })).toBeVisible();
	});

	test('counts a set by the hands the block actually hangs', async ({ page }) => {
		// An alternate repeater hangs each rep twice, once per hand, so a set of
		// two reps holds four. Measuring a one-handed block the same way would
		// swallow the second set.
		const prescribed = testSession({
			...crimpySession,
			prescription: testPrescription({
				items: [
					{
						id: 'item-alt',
						type: 'repeater' as const,
						cycles: 2,
						reps: 1,
						worktime_seconds: 7,
						rest_seconds: 3,
						cycle_rest_seconds: 60,
						hand: 'alternate' as const,
						granularity: 'uniform' as const,
						edge_sizes_mm: [20],
						loads: [{ value: 30, unit: 'kg' as const }]
					}
				]
			})
		});
		const altReps = [0, 1, 2, 3].map((i) =>
			testRepData({
				id: `rep-${i + 1}`,
				index: i,
				average_weight: 30,
				target_weight: 30,
				edge_size_mm: 20,
				hand: i % 2 === 0 ? 'right' : 'left',
				training_item_id: 'item-alt'
			})
		);
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(prescribed, altReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Set 1 - Right')).toBeVisible();
		await expect(dialog.getByText('Set 1 - Left')).toBeVisible();
		await expect(dialog.getByText('Set 2 - Right')).toBeVisible();
	});

	test('names a two-handed set without a hand', async ({ page }) => {
		// 'both' puts two hands on the board for a single rep, so there is no right
		// or left half to cut the set into and nothing to name one after.
		const prescribed = testSession({
			...crimpySession,
			prescription: testPrescription({
				items: [
					{
						id: 'item-both',
						type: 'repeater' as const,
						cycles: 2,
						reps: 2,
						worktime_seconds: 7,
						rest_seconds: 3,
						cycle_rest_seconds: 60,
						hand: 'both' as const,
						granularity: 'uniform' as const,
						edge_sizes_mm: [20],
						loads: [{ value: 30, unit: 'kg' as const }]
					}
				]
			})
		});
		const bothReps = [0, 1, 2, 3].map((i) =>
			testRepData({
				id: `rep-${i + 1}`,
				index: i,
				average_weight: 30,
				target_weight: 30,
				edge_size_mm: 20,
				hand: 'both',
				training_item_id: 'item-both'
			})
		);
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(prescribed, bothReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Set 1', { exact: true })).toBeVisible();
		await expect(dialog.getByText('Set 2', { exact: true })).toBeVisible();
		await expect(dialog.getByText('Set 1 - Left')).toBeHidden();
		// Every row names the two handed hang as such, rather than claiming the
		// left hand the boolean this replaced would have answered.
		await expect(dialog.getByText('B', { exact: true })).toHaveCount(4);
		await expect(dialog.getByText('L', { exact: true })).toHaveCount(0);
	});

	test('gives reps naming no block one of their own', async ({ page }) => {
		// A run the athlete started before the coach removed a block: some reps
		// name an item the frozen prescription still holds, some name none.
		const prescribed = testSession({
			...crimpySession,
			prescription: testPrescription({
				items: [
					{
						id: 'item-20mm',
						type: 'hangboard_rep' as const,
						reps: 1,
						worktime_seconds: 7,
						rest_seconds: 60,
						hand: 'right' as const,
						granularity: 'uniform' as const,
						edge_sizes_mm: [20],
						loads: [{ value: 30, unit: 'kg' as const }]
					}
				]
			})
		});
		const mixedReps = [
			testRepData({
				id: 'rep-1',
				index: 0,
				average_weight: 30,
				target_weight: 30,
				edge_size_mm: 20,
				training_item_id: 'item-20mm'
			}),
			testRepData({
				id: 'rep-2',
				index: 1,
				average_weight: 25,
				target_weight: 25,
				edge_size_mm: 14
			})
		];
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(prescribed, mixedReps)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Hang rep 20mm', { exact: true })).toBeVisible();
		// The unlinked rep is still shown, under a block the snapshot cannot name.
		await expect(dialog.getByText('Unnamed block', { exact: true })).toBeVisible();
		await expect(dialog.getByText('25.0 / 25.0 kg', { exact: true })).toBeVisible();
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
		await expect(dialog.getByText('Repetitions', { exact: true })).toBeVisible();
		await expect(dialog.getByText('Blocks', { exact: true })).toBeHidden();
		// Every rep is still shown, graded against its own target.
		await expect(dialog.getByText('31.0 / 30.0 kg', { exact: true })).toBeVisible();
		await expect(dialog.getByText('28.0 / 30.0 kg', { exact: true })).toBeVisible();
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

test.describe('assessment results', () => {
	// A pull up count is one number. Labelling it "right hand" would be a lie the
	// legend then repeats, so the card shows a single value.
	test('shows a single value for an assessment not measured per hand', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/assessments', {
			body: [
				testAssessmentRecord({
					id: 'record-1',
					assessment_id: 'assessment-9',
					label: 'Pull up pyramid',
					unit: 'repetitions',
					per_hand: false,
					training_id: 'training-8',
					grip_position: null,
					right_value: 14,
					left_value: null
				})
			]
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Assessments/ }).click();

		const results = page.getByRole('list', { name: 'Assessment results' });
		await expect(results.getByText('Pull up pyramid')).toBeVisible();
		await expect(results.getByText('LATEST')).toBeVisible();
		await expect(results.getByText('14', { exact: true })).toBeVisible();
		// No hand labels, and no grip: neither means anything for a pull up count.
		await expect(results.getByText('LEFT', { exact: true })).toBeHidden();
		await expect(results.getByText('RIGHT', { exact: true })).toBeHidden();
		await expect(results.getByText('Half crimp')).toBeHidden();
	});

	test('keeps the hands apart for an assessment measured per hand', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/assessments', {
			body: [
				testAssessmentRecord({
					id: 'record-1',
					assessment_id: 'assessment-9',
					label: 'One arm lock off',
					unit: 'seconds',
					per_hand: true,
					training_id: 'training-8',
					grip_position: null,
					right_value: 3,
					left_value: 6
				})
			]
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Assessments/ }).click();

		const results = page.getByRole('list', { name: 'Assessment results' });
		await expect(results.getByText('One arm lock off')).toBeVisible();
		await expect(results.getByText('LEFT', { exact: true })).toBeVisible();
		await expect(results.getByText('RIGHT', { exact: true })).toBeVisible();
		await expect(results.getByText('6', { exact: true })).toBeVisible();
		await expect(results.getByText('3', { exact: true })).toBeVisible();
	});

	// The section list follows what was measured rather than a fixed set of
	// assessments, so a coach's own appears beside the ones Crimpy ships.
	test('lists a builtin and a custom assessment together', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/assessments', {
			body: [
				testAssessmentRecord({ id: 'record-1' }),
				testAssessmentRecord({
					id: 'record-2',
					assessment_id: 'assessment-9',
					label: 'Pull up pyramid',
					unit: 'repetitions',
					per_hand: false,
					training_id: 'training-8',
					grip_position: null,
					right_value: 14,
					left_value: null
				})
			]
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Assessments/ }).click();

		await expect(page.getByText('2 records')).toBeVisible();
		const results = page.getByRole('list', { name: 'Assessment results' });
		await expect(results.getByText('Max Force')).toBeVisible();
		await expect(results.getByText('Pull up pyramid')).toBeVisible();
	});
});
