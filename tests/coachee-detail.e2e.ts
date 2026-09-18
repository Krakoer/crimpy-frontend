import { expect, test, type Page } from '@playwright/test';
import {
	API_URL,
	BUILTIN_MAX_FORCE,
	capture,
	isoDaysAgo,
	mockApi,
	signIn,
	stub,
	testAssessmentRecord,
	testAssessmentSnapshot,
	testSnapshotResult,
	type TestAssessmentSnapshotResult,
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
	await stub(page, 'GET', '/api/coach/clients/*/assessments/at', {
		body: testAssessmentSnapshot('2026-03-02')
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs', { body: [] });
	await stub(page, 'GET', '/api/coach/clients/*/bodyweights', { body: [] });
}

/**
 * The comparison asks for one snapshot per date, and the two answers are what
 * it puts side by side, so the stub has to answer per date rather than serve
 * one body to both calls the way stub() does.
 */
async function stubSnapshotsByDay(
	page: Page,
	byDay: Record<string, ReturnType<typeof testAssessmentSnapshot>>
): Promise<void> {
	await page.route(`${API_URL}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const isSnapshot = /^\/api\/coach\/clients\/[^/]+\/assessments\/at$/.test(url.pathname);
		if (request.method() !== 'GET' || !isSnapshot) return route.fallback();
		const day = url.searchParams.get('date') ?? '';
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(byDay[day] ?? testAssessmentSnapshot(day))
		});
	});
}

/** A result recorded on one day, which is also a day the comparison offers. */
function recordOn(day: string, overrides: Record<string, unknown> = {}) {
	return testAssessmentRecord({
		id: `record-${day}`,
		session_id: `session-${day}`,
		session_date: `${day}T10:00:00Z`,
		updated_at: `${day}T10:00:00Z`,
		...overrides
	});
}

/** A measurement [daysAgo] days old, as the series returns it. */
function testBodyweight(daysAgo: number, weightKg: number) {
	const measured = isoDaysAgo(daysAgo);
	return {
		id: `bw-${daysAgo}`,
		user_id: nina.user_id,
		weight_kg: weightKg,
		measured_at: measured,
		created_at: measured
	};
}

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	await signIn(page, testUser());
});

// The whole point of the series: a coach reads a strength number as a ratio to
// the bodyweight of the day, so the weight and which day it is from both have
// to be on the page.
test.describe('bodyweight', () => {
	test('shows the weight in effect and how it has moved', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/bodyweights', {
			body: [testBodyweight(2, 71.2), testBodyweight(40, 69.4)]
		});

		await page.goto('/coachees/coachee-1');

		// The card carries its unit in the corner, like the assessment cards it
		// sits with, so the number itself is bare.
		await expect(page.getByText('71.2', { exact: true })).toBeVisible();
		await expect(page.getByText('+1.8', { exact: true })).toBeVisible();
	});

	// Nothing old enough to compare against is not a plateau, and must not be
	// drawn as one.
	test('says nothing about a trend it cannot draw', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/bodyweights', {
			body: [testBodyweight(2, 71.2), testBodyweight(5, 71)]
		});

		await page.goto('/coachees/coachee-1');

		await expect(page.getByText('71.2', { exact: true })).toBeVisible();
		await expect(page.getByText('nothing older to compare')).toBeVisible();
		await expect(page.getByText(/^\+0\.0$/)).toHaveCount(0);
	});

	// A missing denominator is said out loud: without it a percent_bw load
	// cannot be read at all, and a coach has to know that rather than wonder.
	test('says when the athlete has never recorded one', async ({ page }) => {
		await stubCoacheeDetail(page);

		await page.goto('/coachees/coachee-1');

		await expect(page.getByText(/Not recorded yet/)).toBeVisible();
	});

	// One card on a page about sessions, programs and assessments. A series that
	// cannot be read costs the coach that card, not the page.
	test('keeps the page when the series cannot be read', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/bodyweights', {
			status: 500,
			body: { error: 'the database is having a moment' }
		});

		await page.goto('/coachees/coachee-1');

		await expect(page.getByRole('heading', { name: 'Nina Crimp' }).first()).toBeVisible();
		// And it says so, rather than reading as an athlete who never weighed
		// themselves.
		await expect(page.getByText(/Could not be loaded/)).toBeVisible();
		await expect(page.getByText(/Not recorded yet/)).toHaveCount(0);
	});

	// Nothing old enough to compare is one thing; a comparison point far outside
	// the window is another, and naming the window there would be a date the
	// data does not support.
	test('names the date it compared against, not the window', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/bodyweights', {
			body: [testBodyweight(1, 71), testBodyweight(400, 71.02)]
		});

		await page.goto('/coachees/coachee-1');

		await expect(page.getByText(/unchanged since/)).toBeVisible();
		await expect(page.getByText(/unchanged over 30 days/)).toHaveCount(0);
	});

	// The same claim the card refuses to make: a series nobody could read says
	// nothing about whether the athlete ever weighed themselves.
	test('does not call a failed read an athlete who never weighed', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/bodyweights', {
			status: 500,
			body: { error: 'the database is having a moment' }
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Assessments' }).first().click();

		await expect(page.getByText('Bodyweight could not be loaded')).toBeVisible();
		await expect(page.getByText('No bodyweight recorded')).toHaveCount(0);
	});

	// The trend can only compare against what it was given, so the page has to
	// ask for a series that spans the window rather than taking the API default.
	test('asks for a series long enough to hold a comparison', async ({ page }) => {
		await stubCoacheeDetail(page);
		const reads = capture(page, 'GET', '/api/coach/clients/*/bodyweights');

		await page.goto('/coachees/coachee-1');
		await expect(page.getByText(/Not recorded yet/)).toBeVisible();

		expect(reads[0].url).toContain('limit=365');
	});

	test('names the denominator beside the assessment records', async ({ page }) => {
		await stubCoacheeDetail(page);
		// With a record present, so this says what its name says: the denominator
		// sits beside the numbers read against it.
		await stub(page, 'GET', '/api/coach/clients/*/assessments', {
			body: [testAssessmentRecord({ assessment_id: BUILTIN_MAX_FORCE, right_value: 52 })]
		});
		await stub(page, 'GET', '/api/coach/clients/*/bodyweights', {
			body: [testBodyweight(2, 71.2)]
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Assessments' }).first().click();

		// "Latest", because the rows below it were measured against earlier
		// weights and the line must not read as their denominator.
		await expect(page.getByText(/Latest bodyweight/)).toBeVisible();
		await expect(page.getByText('71.2 kg')).toBeVisible();
		await expect(page.getByText('Assessment history')).toBeVisible();
	});
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
					testSessionItemResult({
						training_item_id: 'pullup-1',
						reps: 23,
						note: 'hard on the shoulders'
					}),
					testSessionItemResult({
						id: 'item-result-2',
						training_item_id: 'pullup-1',
						occurrence: 1,
						reps: 18
					}),
					testSessionItemResult({
						id: 'item-result-3',
						training_item_id: 'emom-1',
						cycles: 7
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
		// once per pass through the block, under the word that stands in for the
		// count the coach did not give.
		await expect(dialog.getByText('AMRAP').first()).toBeVisible();
		await expect(dialog.getByText('did 23, 18', { exact: true })).toBeVisible();
		// Expanded, the card states the count once: the header badge is the
		// collapsed summary and would otherwise repeat what is already there.
		await expect(dialog.getByTestId('achieved-badge')).toHaveCount(1);
		// The line the athlete wrote is what the coach came for, so it reads in
		// full on the card of the step it was written against.
		await expect(dialog.getByTestId('achieved-notes')).toContainText('hard on the shoulders');
	});

	// The issue this shape came from: an ordinary exercise, nothing a sensor ever
	// sees, reporting what the athlete actually did and what they wrote about it.
	test('shows the load, the reps and the note reported on an ordinary exercise', async ({
		page
	}) => {
		const plainExercise = testPrescription({
			items: [
				{
					id: 'dip-1',
					type: 'exercise',
					exercise_name: 'Weighted dip',
					reps: 8,
					loads: [{ unit: 'kg', value: 10 }]
				}
			]
		});
		const prescribed = testSession({ ...crimpySession, prescription: plainExercise });

		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(
				prescribed,
				[],
				[],
				[
					testSessionItemResult({
						training_item_id: 'dip-1',
						reps: 6,
						load_kg: 17.5,
						note: 'failed at 6, shoulder was fine though'
					})
				]
			)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		// Asked for eight reps at 10 kg, did six at 17.5, each one under the
		// number it answers.
		await expect(dialog.getByText('8', { exact: true })).toBeVisible();
		await expect(dialog.getByText('did 6', { exact: true })).toBeVisible();
		await expect(dialog.getByText('10 kg', { exact: true })).toBeVisible();
		await expect(dialog.getByText('did 17.5 kg', { exact: true })).toBeVisible();
		await expect(dialog.getByTestId('achieved-notes')).toContainText(
			'failed at 6, shoulder was fine though'
		);
	});

	// The load column now renders on a condition it never had before: a load the
	// athlete reported where the coach prescribed none. A dip taken with a belt
	// is exactly what a coach wants to see, and it is the path the prescription
	// tree cannot show any other way.
	test('shows a load the athlete reported where none was prescribed', async ({ page }) => {
		const unloaded = testPrescription({
			items: [{ id: 'swing-1', type: 'exercise', exercise_name: 'Kettlebell swing', reps: 12 }]
		});
		const prescribed = testSession({ ...crimpySession, prescription: unloaded });

		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(
				prescribed,
				[],
				[],
				[testSessionItemResult({ training_item_id: 'swing-1', reps: 12, load_kg: 24 })]
			)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('LOAD', { exact: true })).toBeVisible();
		await expect(dialog.getByText('none', { exact: true })).toBeVisible();
		await expect(dialog.getByText('did 24 kg', { exact: true })).toBeVisible();
	});

	// A coach reading "did 8, 7" off sets 1 and 4 would take it for sets 1 and 2,
	// so a gap in the reported passes names them.
	test('names the pass when the athlete skipped some of them', async ({ page }) => {
		const fourSets = testPrescription({
			items: [
				{
					id: 'circuit-1',
					type: 'circuit',
					cycles: 4,
					items: [{ id: 'pullup-1', type: 'exercise', exercise_name: 'Pull up', reps: 8 }]
				}
			]
		});
		const prescribed = testSession({ ...crimpySession, prescription: fourSets });

		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(
				prescribed,
				[],
				[],
				[
					testSessionItemResult({ training_item_id: 'pullup-1', occurrence: 0, reps: 8 }),
					testSessionItemResult({
						id: 'item-result-2',
						training_item_id: 'pullup-1',
						occurrence: 3,
						reps: 7,
						note: 'last set was a grind'
					})
				]
			)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('did #1 8, #4 7', { exact: true })).toBeVisible();
		await expect(dialog.getByTestId('achieved-notes')).toContainText('#4');
	});

	// The header stat counted every non-rest rep row, and the run leaves one
	// behind per finished step, so a strength session read a placeholder count
	// that had nothing to do with the reps the cards below it stated. It is the
	// first number a coach's eye lands on, and it was the one that was wrong.
	test('counts the reps the athlete reported in the header stat', async ({ page }) => {
		const strength = testPrescription({
			items: [
				{ id: 'pullup-1', type: 'exercise', exercise_name: 'Pull up', reps_is_max: true },
				{ id: 'dip-1', type: 'exercise', exercise_name: 'Dip', reps: 8 }
			]
		});
		const prescribed = testSession({ ...crimpySession, prescription: strength });

		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(
				prescribed,
				// What a played strength session actually uploads: the run records a
				// row for every step it finishes, so each counted exercise leaves one
				// behind carrying no load and no time. Counting those beside the
				// reported totals is how the stat came to claim more reps than were
				// done, so the fixture carries them or it blesses the bug.
				[
					testRepData({ id: 'rep-1', index: 0, duration: 0, average_weight: 0, target_weight: 0 }),
					testRepData({ id: 'rep-2', index: 1, duration: 0, average_weight: 0, target_weight: 0 })
				],
				[],
				[
					testSessionItemResult({ training_item_id: 'pullup-1', reps: 28 }),
					testSessionItemResult({ id: 'item-result-2', training_item_id: 'dip-1', reps: 8 })
				]
			)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		// 28 + 8, and not 38: the two placeholder rows are the steps themselves,
		// not two more repetitions. Matched whole, so the assertion cannot pass
		// on a figure that merely contains it.
		await expect(page.getByRole('dialog').getByTestId('session-stat-reps')).toContainText(/\b36\b/);
	});

	// The other half of the same rule: a hangboard session is counted by its
	// timed hangs, and a hang is never reported by a count.
	test('counts a timed hang in the header stat', async ({ page }) => {
		const hangs = testPrescription({
			items: [
				{
					id: 'hangrep-1',
					type: 'hangboard_rep',
					worktime_seconds: 7,
					hand: 'both',
					granularity: 'uniform',
					loads: [{ unit: 'kg', value: 30 }],
					edge_sizes_mm: [20]
				}
			]
		});
		const prescribed = testSession({ ...crimpySession, prescription: hangs });

		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(
				prescribed,
				[
					testRepData({ id: 'rep-1', index: 0, duration: 7 }),
					testRepData({ id: 'rep-2', index: 1, duration: 7 }),
					testRepData({ id: 'rep-3', index: 2, duration: 30, is_rest: true })
				],
				[],
				[]
			)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		// Two hangs, and the rest between them is not one of them.
		await expect(page.getByRole('dialog').getByTestId('session-stat-reps')).toContainText(/\b2\b/);
	});

	// A repeater is a hang: the app asks it for the seconds held and the load
	// worked at, never for reps. Both have to surface, or a block reported at a
	// heavier load for a shorter hang reaches the coach only if the athlete also
	// wrote a sentence about it.
	test('shows the seconds and the load reported on a hangboard block', async ({ page }) => {
		const hangs = testPrescription({
			items: [
				{
					id: 'repeater-1',
					type: 'repeater',
					cycles: 4,
					reps: 6,
					worktime_seconds: 7,
					rest_seconds: 3,
					hand: 'both',
					granularity: 'uniform',
					loads: [{ unit: 'kg', value: 20 }],
					edge_sizes_mm: [20]
				},
				{
					id: 'hangrep-1',
					type: 'hangboard_rep',
					worktime_seconds: 10,
					rest_seconds: 60,
					hand: 'both',
					granularity: 'uniform',
					loads: [{ unit: 'kg', value: 30 }],
					edge_sizes_mm: [20]
				}
			]
		});
		const prescribed = testSession({ ...crimpySession, prescription: hangs });

		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(
				prescribed,
				[],
				[],
				[
					testSessionItemResult({
						training_item_id: 'repeater-1',
						duration_seconds: 5,
						load_kg: 25,
						note: 'dropped early on the last set'
					}),
					testSessionItemResult({
						id: 'item-result-2',
						training_item_id: 'hangrep-1',
						duration_seconds: 12,
						load_kg: 28
					})
				]
			)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		// The repeater asked for 7s at 20 kg and got 5s at 25 kg.
		await expect(dialog.getByText('did 5s', { exact: true })).toBeVisible();
		await expect(dialog.getByText('did 25 kg', { exact: true })).toBeVisible();
		await expect(dialog.getByTestId('achieved-notes')).toContainText(
			'dropped early on the last set'
		);
		// The single hang rep carries its own pair, which is the view the
		// repeater was missing.
		await expect(dialog.getByText('did 12s', { exact: true })).toBeVisible();
		await expect(dialog.getByText('did 28 kg', { exact: true })).toBeVisible();
	});

	// A block that hangs one hand at a time prescribes a load per hand but is
	// reported with one number, so the reported load sits beside the pair rather
	// than inside either hand, which would claim the athlete weighed that arm.
	test('states one reported load beside a hand-by-hand prescription', async ({ page }) => {
		const split = testPrescription({
			items: [
				{
					id: 'repeater-1',
					type: 'repeater',
					cycles: 4,
					reps: 6,
					worktime_seconds: 7,
					rest_seconds: 3,
					hand: 'split',
					granularity: 'uniform',
					loads: [{ unit: 'kg', value: 20 }],
					left_loads: [{ unit: 'kg', value: 18 }],
					edge_sizes_mm: [20]
				}
			]
		});
		const prescribed = testSession({ ...crimpySession, prescription: split });

		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(
				prescribed,
				[],
				[],
				[testSessionItemResult({ training_item_id: 'repeater-1', load_kg: 22 })]
			)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Worked at', { exact: true })).toBeVisible();
		await expect(dialog.getByText('did 22 kg', { exact: true })).toBeVisible();
	});

	// A circuit is a block, so the app collects its rounds exactly as it does an
	// emom's, and the badge has to compare them in the word the card beside it
	// uses for the same number.
	test('shows the sets a circuit was carried through', async ({ page }) => {
		const circuit = testPrescription({
			items: [
				{
					id: 'circuit-1',
					type: 'circuit',
					cycles: 4,
					cycle_rest_seconds: 60,
					items: [{ id: 'pushup-1', type: 'exercise', exercise_name: 'Push up', reps: 10 }]
				}
			]
		});
		const prescribed = testSession({ ...crimpySession, prescription: circuit });

		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [crimpySession] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(
				prescribed,
				[],
				[],
				[testSessionItemResult({ training_item_id: 'circuit-1', cycles: 3 })]
			)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const badge = page.getByRole('dialog').getByTestId('achieved-badge').first();
		await expect(badge).toContainText('3');
		await expect(badge).toContainText('/4');
		await expect(badge).toContainText('sets');
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
						reps: value
					})
				)
			)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Repeaters 20mm' }).click();

		const dialog = page.getByRole('dialog');
		// The badge is the collapsed summary, so the card is collapsed to read it.
		await dialog.getByRole('button', { name: 'Pull up' }).click();

		const badge = dialog.getByTestId('achieved-badge').last();
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

test.describe('assessment comparison', () => {
	const march = '2026-03-02';
	const june = '2026-06-02';

	// Two dated columns with a progression between them is what a coach and an
	// athlete actually review at the end of a block.
	test('puts the two dates side by side with the progression', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/assessments', {
			body: [
				recordOn(march, { per_hand: false, right_value: 13, left_value: null }),
				recordOn(june, { per_hand: false, right_value: 17, left_value: null })
			]
		});
		await stubSnapshotsByDay(page, {
			[march]: testAssessmentSnapshot(march, [
				testSnapshotResult({ right_value: 13, right_measured_at: `${march}T10:00:00Z` })
			]),
			[june]: testAssessmentSnapshot(june, [
				testSnapshotResult({ right_value: 17, right_measured_at: `${june}T10:00:00Z` })
			])
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Assessments/ }).click();

		const comparison = page.getByRole('region', { name: 'Assessment comparison' });
		await expect(comparison.getByText('Compare two dates')).toBeVisible();
		// The newer date is where the comparison lands, against the one before it.
		await expect(page.getByLabel('From')).toHaveValue(march);
		await expect(page.getByLabel('To')).toHaveValue(june);
		await expect(comparison.getByText('13.0', { exact: true })).toBeVisible();
		await expect(comparison.getByText('17.0', { exact: true })).toBeVisible();
		await expect(comparison.getByText('+30.8 %')).toBeVisible();
	});

	// The whole point of the flag: kilograms alone are not comparable across a
	// season, the ratio to the weight they were pulled at is.
	test('reads a bodyweight relative result as a ratio, raw kilograms beside it', async ({
		page
	}) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/assessments', {
			body: [
				recordOn(march, { per_hand: false, right_value: 25, left_value: null }),
				recordOn(june, { per_hand: false, right_value: 28, left_value: null })
			]
		});
		await stubSnapshotsByDay(page, {
			[march]: testAssessmentSnapshot(
				march,
				[
					testSnapshotResult({
						label: 'Weighted hang 20mm',
						bodyweight_relative: true,
						right_value: 25,
						right_measured_at: `${march}T10:00:00Z`
					})
				],
				71
			),
			[june]: testAssessmentSnapshot(
				june,
				[
					testSnapshotResult({
						label: 'Weighted hang 20mm',
						bodyweight_relative: true,
						right_value: 28,
						right_measured_at: `${june}T10:00:00Z`
					})
				],
				71
			)
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Assessments/ }).click();

		const comparison = page.getByRole('region', { name: 'Assessment comparison' });
		await expect(comparison.getByText('1.35', { exact: true })).toBeVisible();
		await expect(comparison.getByText('1.39', { exact: true })).toBeVisible();
		// The raw measurement and the weight it was read against stay on screen,
		// since the ratio is a display of them and not a replacement.
		await expect(comparison.getByText('25.0 kg at 71.0 kg')).toBeVisible();
		await expect(comparison.getByText('28.0 kg at 71.0 kg')).toBeVisible();
	});

	// A test the athlete did not do on the earlier date has not fallen to zero,
	// and drawing it as a loss would be a lie the coach acts on.
	test('says a test was measured on only one of the two dates', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/assessments', {
			body: [
				recordOn(march, { per_hand: false, right_value: 13, left_value: null }),
				recordOn(june, { per_hand: false, right_value: 17, left_value: null })
			]
		});
		await stubSnapshotsByDay(page, {
			[march]: testAssessmentSnapshot(march, []),
			[june]: testAssessmentSnapshot(june, [
				testSnapshotResult({ right_value: 17, right_measured_at: `${june}T10:00:00Z` })
			])
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Assessments/ }).click();

		const comparison = page.getByRole('region', { name: 'Assessment comparison' });
		await expect(comparison.getByText('not measured')).toBeVisible();
		await expect(comparison.getByText('first measured')).toBeVisible();
		await expect(comparison.getByText('%')).toHaveCount(0);
	});

	// A snapshot carries the last value forward, so a test nobody ran again
	// answers both dates with the same measurement. Zero percent would read as a
	// test held steady, which is a different statement.
	test('does not call a test nobody retested stable', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/assessments', {
			body: [
				recordOn(march, { per_hand: false, right_value: 13, left_value: null }),
				recordOn(june, { per_hand: false, right_value: 17, left_value: null })
			]
		});
		const carried: TestAssessmentSnapshotResult = testSnapshotResult({
			right_value: 13,
			right_measured_at: `${march}T10:00:00Z`
		});
		await stubSnapshotsByDay(page, {
			[march]: testAssessmentSnapshot(march, [carried]),
			[june]: testAssessmentSnapshot(june, [carried])
		});

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Assessments/ }).click();

		const comparison = page.getByRole('region', { name: 'Assessment comparison' });
		await expect(comparison.getByText('not retested')).toBeVisible();
		await expect(comparison.getByText('measured 2 Mar 2026')).toBeVisible();
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

test.describe('session feedback', () => {
	const withNotes = testSession({
		id: 'session-feedback',
		name: 'Board session',
		notes: 'Felt heavy today, forearms were done by the third set.'
	});

	async function openFeedback(page: Page, session = withNotes): Promise<void> {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [session] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
			body: testSessionDetail(session)
		});
		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: 'Open Board session' }).click();
	}

	test('marks a session whose feedback has no reply yet', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/clients/*/sessions', {
			body: [
				withNotes,
				testSession({
					id: 'session-answered',
					name: 'Answered session',
					notes: 'Good day',
					coach_reply: 'Nice work',
					coach_reply_at: new Date().toISOString(),
					coach_reply_read: true
				})
			]
		});

		await page.goto('/coachees/coachee-1');

		const awaiting = page.getByRole('button', { name: 'Open Board session' });
		await expect(awaiting.getByText('Reply', { exact: true })).toBeVisible();
		const answered = page.getByRole('button', { name: 'Open Answered session' });
		await expect(answered.getByText('Reply', { exact: true })).toBeHidden();
	});

	test('sends a reply to the athlete feedback', async ({ page }) => {
		const sent = capture(page, 'PUT', '/api/coach/clients/*/sessions/*/reply');
		await openFeedback(page);
		await stub(page, 'PUT', '/api/coach/clients/*/sessions/*/reply', {
			body: {
				...withNotes,
				coach_reply: 'Noted, I added a rest day next week.',
				coach_reply_at: new Date().toISOString(),
				coach_reply_read: false
			}
		});

		const dialog = page.getByRole('dialog');
		await expect(
			dialog.getByText('Felt heavy today, forearms were done by the third set.')
		).toBeVisible();

		await dialog
			.getByRole('textbox', { name: 'Reply to the athlete' })
			.fill('Noted, I added a rest day next week.');
		await dialog.getByRole('button', { name: 'Send reply' }).click();

		await expect(dialog.getByText('Not read yet')).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Edit' })).toBeVisible();
		expect(sent).toHaveLength(1);
		expect(sent[0].body).toEqual({ reply: 'Noted, I added a rest day next week.' });
	});

	test('gives the row its Reply pill back when the answer is taken away', async ({ page }) => {
		const answered = testSession({
			id: 'session-feedback',
			name: 'Board session',
			notes: 'Felt heavy',
			coach_reply: 'Keep the same loads',
			coach_reply_at: new Date().toISOString(),
			coach_reply_read: true
		});
		await openFeedback(page, answered);
		// The server drops the reply fields entirely once an answer is cleared,
		// which is what the list merge has to cope with.
		await stub(page, 'PUT', '/api/coach/clients/*/sessions/*/reply', {
			body: {
				...answered,
				coach_reply: undefined,
				coach_reply_at: undefined,
				coach_reply_read: false
			}
		});

		const dialog = page.getByRole('dialog');
		await dialog.getByRole('button', { name: 'Edit' }).click();
		await dialog.getByRole('textbox', { name: 'Reply to the athlete' }).fill('');
		await dialog.getByRole('button', { name: 'Update reply' }).click();

		await expect(dialog.getByText('Read by the athlete')).toBeHidden();
		await expect(dialog.getByRole('textbox', { name: 'Reply to the athlete' })).toBeVisible();
		const row = page.getByRole('button', { name: 'Open Board session' });
		await expect(row.getByText('Reply', { exact: true })).toBeVisible();
	});

	test('shows an existing reply and its read receipt', async ({ page }) => {
		await openFeedback(
			page,
			testSession({
				id: 'session-feedback',
				name: 'Board session',
				notes: 'Felt strong',
				coach_reply: 'Great, keep the same loads.',
				coach_reply_at: new Date().toISOString(),
				coach_reply_read: true
			})
		);

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Great, keep the same loads.')).toBeVisible();
		await expect(dialog.getByText('Read by the athlete')).toBeVisible();
		await expect(dialog.getByRole('textbox', { name: 'Reply to the athlete' })).toBeHidden();
	});
});
