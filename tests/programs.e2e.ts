import { expect, test, type Page } from '@playwright/test';
import {
	BUILTIN_ENDURANCE_60,
	type CapturedRequest,
	BUILTIN_MAX_FORCE,
	builtinAssessmentDefinitions,
	capture,
	dragOnto,
	dragVia,
	isoDaysAgo,
	mockApi,
	mondayDaysAgo,
	signIn,
	stub,
	testAssessmentDefinition,
	testAssessmentRecord,
	testEnrolledUser,
	testProgram,
	testSession,
	testSessionDetail,
	testTraining,
	testUser,
	testWeekAvailability
} from './fixtures';

const PROGRAM_URL = '/coachees/coachee-1/programs/program-1';

/** The week editor loads the program, its weeks and the training library. */
async function stubProgram(page: Page, program = testProgram()): Promise<void> {
	await stub(page, 'GET', '/api/coach/enrollments', { body: [testEnrolledUser()] });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*', { body: program });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', { body: [] });
	await stub(page, 'GET', '/api/trainings', { body: [testTraining()] });
	// The editor reads what the athlete played beside the program. A test that
	// cares about those rows registers its own stub on top of this one.
	await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [] });
	// The editor also reads when the athlete said they can train. A test that
	// cares about that row registers its own stub on top of this one.
	await stub(page, 'GET', '/api/coach/clients/*/availability', { body: [] });
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

test('lays the week grid out on one row, with the columns the day header names', async ({
	page
}) => {
	const program = testProgram();
	await stubProgram(page, program);
	// The availability row is one of the grids checked below, and a week that is
	// over only carries it once the athlete has declared something.
	await stub(page, 'GET', '/api/coach/clients/*/availability', {
		body: [testWeekAvailability(program.start_date, { 1: { is_available: true } })]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithTwoSessionsOnMonday()
	});

	await page.goto(PROGRAM_URL);

	// The session count used to be an eleventh child of a ten column grid, so it
	// wrapped onto an implicit second row and landed under the week label.
	const weekRow = page.getByRole('button', { name: /Wk 1/ });
	await expect(weekRow).toBeVisible();
	expect(await weekRow.evaluate((row) => row.children.length)).toBe(10);
	expect(
		await weekRow.evaluate((row) => getComputedStyle(row).gridTemplateRows.split(' ').length)
	).toBe(1);

	// The sticky day header sits outside the week card while the grids it labels
	// sit inside it, so a label only lands over its own column while the four
	// grids resolve to the same tracks at the same offset.
	await weekRow.click();
	const [dayHeader, ...labelledGrids] = await page.evaluate(() => {
		const gridOf = (element: Element | null) =>
			element?.closest<HTMLElement>('[style*="grid-template-columns"]') ?? null;
		const grids = [
			gridOf(document.querySelector('[title*="Flexible"]')),
			document.querySelector<HTMLElement>('[data-testid="performed:1"]'),
			document.querySelector<HTMLElement>('[data-testid="availability:1"]'),
			gridOf(document.querySelector('[data-testid="cell:1:1"]'))
		];
		return grids.map((grid) => {
			if (!grid) return [];
			const style = getComputedStyle(grid);
			let edge =
				grid.getBoundingClientRect().left +
				parseFloat(style.paddingLeft) +
				parseFloat(style.borderLeftWidth);
			return style.gridTemplateColumns.split(' ').map((track) => (edge += parseFloat(track)));
		});
	});

	expect(dayHeader).toHaveLength(10);
	for (const grid of labelledGrids) {
		expect(grid).toHaveLength(dayHeader.length);
		// Not exact: the performed row spans nine columns with one cell when the week
		// was not played, and the browser hands that grid its rounding remainder a
		// couple of hundredths of a pixel differently. The defect this guards against
		// was a whole pixel, from the header being two pixels wider than the card.
		grid.forEach((edge, column) => expect(Math.abs(edge - dayHeader[column])).toBeLessThan(0.1));
	}
});

test('shows what the athlete said they can train, under the days it is about', async ({ page }) => {
	const program = testProgram();
	await stubProgram(page, program);
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithTwoSessionsOnMonday()
	});
	// Week 1 of a program runs from its start date, which is always a Monday.
	await stub(page, 'GET', '/api/coach/clients/*/availability', {
		body: [
			testWeekAvailability(program.start_date, {
				1: { is_available: true, duration_minutes: 90, note: 'gym after work' },
				4: { is_available: true }
			})
		]
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: /Wk 1/ }).click();

	await expect(page.getByTestId('availability:1')).toContainText('2 days');
	await expect(page.getByTestId('availability:1:1')).toContainText('1h 30m');
	await expect(page.getByTestId('availability:1:1')).toContainText('gym after work');
	// A day with no duration is still available, and says so without a number.
	await expect(page.getByTestId('availability:1:4')).toContainText('Free');
	await expect(page.getByTestId('availability:1:0')).not.toContainText('Free');
});

test('a week the athlete never declared says so, and a failed read says something else', async ({
	page
}) => {
	// Week 1 has to be a week the athlete could still declare, since one that is
	// over drops the row rather than saying "has not said" forever. It is then
	// the NOW week, which the editor opens by itself, so nothing is clicked here.
	await stubProgram(page, testProgram({ start_date: mondayDaysAgo(0) }));
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithTwoSessionsOnMonday()
	});

	await page.goto(PROGRAM_URL);
	await expect(page.getByTestId('availability:1')).toContainText(
		'has not said when they can train'
	);

	// A read that failed is not a coachee who declared nothing: a coach about to
	// build the week on that silence has to be told which one it is.
	await stub(page, 'GET', '/api/coach/clients/*/availability', { status: 500, body: {} });
	await page.reload();
	await expect(page.getByTestId('availability:1')).toContainText('could not be loaded');
});

test('drops the availability row on a week that is over and was never declared', async ({
	page
}) => {
	// An athlete only ever declares the week ahead, so a program's whole
	// scroll-back would otherwise carry "has not said when they can train".
	await stubProgram(page, testProgram({ start_date: mondayDaysAgo(14) }));
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithTwoSessionsOnMonday()
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: /Wk 1/ }).click();

	await expect(page.getByTestId('performed:1')).toBeVisible();
	await expect(page.getByTestId('availability:1')).toHaveCount(0);
});

test('breadcrumbs back to the coachee', async ({ page }) => {
	await stubProgram(page);
	await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [] });
	await stub(page, 'GET', '/api/coach/clients/*/assessments', { body: [] });
	await stub(page, 'GET', '/api/assessment-definitions', {
		body: builtinAssessmentDefinitions()
	});
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
	await stub(page, 'GET', '/api/assessment-definitions', {
		body: builtinAssessmentDefinitions()
	});
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

test('previews the frequency sessions of a collapsed week beside the count', async ({ page }) => {
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
			notes: '',
			created_at: '',
			updated_at: '',
			sessions: [
				{
					id: 'ws-1',
					training_id: 'training-1',
					training_title: 'Power endurance block',
					training_type: 'workout',
					times_per_week: 2,
					is_everyday: false,
					position: 0,
					overrides: []
				}
			]
		}
	});

	await page.goto(PROGRAM_URL);

	// The count pill reads 2, so the row has to show where those two come from
	// without being expanded.
	const week1 = page.getByRole('button', { name: /Wk 1/ });
	await expect(week1).toContainText('2x Power');
	// The preview replaced an empty cell: the row still owes the grid ten children.
	expect(await week1.evaluate((row) => row.children.length)).toBe(10);
});

test('colours the everyday preview pill by training type, like the day columns', async ({
	page
}) => {
	await stubProgram(page);
	await stub(page, 'GET', '/api/trainings', {
		body: [testTraining({ training_type: 'climbing' })]
	});
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
			notes: '',
			created_at: '',
			updated_at: '',
			sessions: [
				{
					id: 'ws-1',
					training_id: 'training-1',
					training_title: 'Power endurance block',
					training_type: 'climbing',
					day_of_week: 0,
					is_everyday: false,
					position: 0,
					overrides: []
				},
				{
					id: 'ws-2',
					training_id: 'training-1',
					training_title: 'Power endurance block',
					training_type: 'climbing',
					is_everyday: true,
					position: 1,
					overrides: []
				}
			]
		}
	});

	await page.goto(PROGRAM_URL);

	const week1 = page.getByRole('button', { name: /Wk 1/ });
	await expect(week1).toContainText('Power');

	// The everyday pill used to hardcode a plum it shared with nothing, so one
	// training read gold in a day column of the collapsed row and plum in the
	// everyday column beside it.
	const [dayPill, everydayPill] = await week1.evaluate((row) => {
		const pillOf = (index: number) => {
			const pill = row.children[index].firstElementChild as HTMLElement;
			const style = getComputedStyle(pill);
			return { background: style.backgroundColor, color: style.color };
		};
		return [pillOf(1), pillOf(9)];
	});
	expect(everydayPill).toEqual(dayPill);
	// Climbing is gold, not the workout plum the hardcoded pill drew.
	expect(everydayPill.color).toBe('rgb(212, 161, 94)');
});

test('sends existing sessions back with their id so the server keeps the row', async ({ page }) => {
	const weekDetail = {
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
	};

	await stubProgram(page);
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', { body: weekDetail });
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*', { body: weekDetail });
	const saves = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: /Wk 1/ }).click();
	await page.getByPlaceholder('Week notes...').first().fill('Typo fixed');
	await page.getByRole('button', { name: 'Save program' }).click();

	await expect(page.getByText('Program saved')).toBeVisible();
	expect(saves).toHaveLength(1);
	expect(saves[0].body).toMatchObject({
		notes: 'Typo fixed',
		sessions: [{ id: 'ws-1', training_id: 'training-1', day_of_week: 1 }]
	});
});

/**
 * A dropped session is re-rendered into its new cell, and dnd-kit needs a beat
 * before that fresh element answers a new drag. Only needed between two drags of
 * the same session.
 */
async function settleAfterDrop(page: Page): Promise<void> {
	await page.waitForTimeout(600);
}

test('warns when a dropped training needs an assessment the coachee has not done', async ({
	page
}) => {
	await stubProgram(page);
	await stub(page, 'GET', '/api/coach/clients/*/assessments', { body: [] });
	await stub(page, 'GET', '/api/assessment-definitions', {
		body: builtinAssessmentDefinitions()
	});
	await stub(page, 'GET', '/api/trainings/*', {
		body: testTraining({
			items: [
				{
					id: 'item-1',
					type: 'hangboard_rep',
					position: 0,
					loads: [
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

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: /Wk 1/ }).click();

	await dragOnto(
		page,
		page.getByText('Power endurance block').first(),
		page.getByTestId('cell:1:0')
	);

	await expect(page.getByText(/has not done Max Force yet/)).toBeVisible();
});

/** A week whose only session is the row a played session would point at. */
function weekOneWithSession() {
	return {
		id: 'week-1',
		program_id: 'program-1',
		week_number: 1,
		notes: '',
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
				is_locked: false,
				overrides: []
			}
		]
	};
}

/** Two sessions on the same day, so their order inside it is what changes. */
function weekOneWithTwoSessionsOnMonday() {
	return {
		id: 'week-1',
		program_id: 'program-1',
		week_number: 1,
		notes: '',
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
				is_locked: false,
				overrides: []
			},
			{
				id: 'ws-2',
				training_id: 'training-2',
				training_title: 'Finger strength block',
				training_type: 'workout',
				day_of_week: 1,
				is_everyday: false,
				position: 1,
				is_locked: false,
				overrides: []
			}
		]
	};
}

test('shows the sessions of a day in the order the server stored them', async ({ page }) => {
	await stubProgram(page);
	await stub(page, 'GET', '/api/trainings', {
		body: [testTraining(), testTraining({ id: 'training-2', title: 'Finger strength block' })]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' }
		]
	});
	// Served back to front, so passing can only come from position and not from
	// the order the sessions happen to arrive in.
	const week = weekOneWithTwoSessionsOnMonday();
	week.sessions.reverse();
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', { body: week });

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: /Wk 1/ }).click();

	await expect(page.getByTestId('cell:1:1')).toContainText(
		/Power endurance block\s+Finger strength block/
	);
});

test('reorders the sessions inside a day and saves the new order', async ({ page }) => {
	await stubProgram(page);
	await stub(page, 'GET', '/api/trainings', {
		body: [testTraining(), testTraining({ id: 'training-2', title: 'Finger strength block' })]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithTwoSessionsOnMonday()
	});
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithTwoSessionsOnMonday()
	});
	const saves = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: /Wk 1/ }).click();

	const monday = page.getByTestId('cell:1:1');
	await dragOnto(
		page,
		monday.getByRole('button', { name: 'Finger strength block' }),
		monday.getByRole('button', { name: 'Power endurance block' })
	);

	await expect(monday).toContainText(/Finger strength block\s+Power endurance block/);

	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();
	expect(saves).toHaveLength(1);
	// The server reads the order off the array, so the ids arriving swapped is
	// what makes the new order stick.
	expect(saves[0].body).toMatchObject({
		sessions: [
			{ id: 'ws-2', training_id: 'training-2', day_of_week: 1 },
			{ id: 'ws-1', training_id: 'training-1', day_of_week: 1 }
		]
	});
});

test('reorders a session downwards, onto the last of the day', async ({ page }) => {
	await stubProgram(page);
	await stub(page, 'GET', '/api/trainings', {
		body: [testTraining(), testTraining({ id: 'training-2', title: 'Finger strength block' })]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithTwoSessionsOnMonday()
	});
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithTwoSessionsOnMonday()
	});
	const saves = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: /Wk 1/ }).click();

	// The mirror of the test above. Dropping onto the session below means taking
	// the slot after it, which is the only gesture that reaches the last slot.
	const monday = page.getByTestId('cell:1:1');
	await dragOnto(
		page,
		monday.getByRole('button', { name: 'Power endurance block' }),
		monday.getByRole('button', { name: 'Finger strength block' })
	);

	await expect(monday).toContainText(/Finger strength block\s+Power endurance block/);

	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();
	expect(saves).toHaveLength(1);
	expect(saves[0].body).toMatchObject({
		sessions: [
			{ id: 'ws-2', training_id: 'training-2', day_of_week: 1 },
			{ id: 'ws-1', training_id: 'training-1', day_of_week: 1 }
		]
	});
});

test('keeps the weekly count of a session dragged over a day and back', async ({ page }) => {
	const week = {
		id: 'week-1',
		program_id: 'program-1',
		week_number: 1,
		notes: '',
		created_at: '',
		updated_at: '',
		sessions: [
			{
				id: 'ws-1',
				training_id: 'training-1',
				training_title: 'Power endurance block',
				training_type: 'workout',
				times_per_week: 4,
				is_everyday: false,
				position: 0,
				is_locked: false,
				overrides: []
			}
		]
	};

	await stubProgram(page);
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', { body: week });
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*', { body: week });
	const saves = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: /Wk 1/ }).click();

	// The move runs on drag over, so merely passing over a day cell must not cost
	// the session the count the coach prescribed for it.
	await dragOnto(
		page,
		page.getByTestId('freq:1').getByRole('button', { name: /Power endurance block/ }),
		page.getByTestId('cell:1:0')
	);
	await settleAfterDrop(page);
	await dragOnto(
		page,
		page.getByTestId('cell:1:0').getByRole('button', { name: /Power endurance block/ }),
		page.getByTestId('freq:1')
	);

	await expect(page.getByTestId('freq:1').getByRole('spinbutton')).toHaveValue('4');
	// The week ends holding what it was loaded with, so there is nothing to write.
	await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

	// The count is the only thing the frequency column saves, so changing it is
	// what gives this week something to write, on the row it was loaded with.
	await page.getByTestId('freq:1').getByRole('spinbutton').fill('5');
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();
	expect(saves).toHaveLength(1);
	expect(saves[0].body).toMatchObject({
		sessions: [{ id: 'ws-1', training_id: 'training-1', times_per_week: 5 }]
	});
});

test('keeps the session id when it is dragged within its own week', async ({ page }) => {
	await stubProgram(page);
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithSession()
	});
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithSession()
	});
	const saves = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: /Wk 1/ }).click();

	await dragOnto(
		page,
		page.getByTestId('cell:1:1').getByRole('button', { name: 'Power endurance block' }),
		page.getByTestId('cell:1:3')
	);
	await page.getByRole('button', { name: 'Save program' }).click();

	await expect(page.getByText('Program saved')).toBeVisible();
	expect(saves).toHaveLength(1);
	expect(saves[0].body).toMatchObject({
		sessions: [{ id: 'ws-1', training_id: 'training-1', day_of_week: 3 }]
	});
});

/** The empty second week the cross-week drags below move a session into. */
function emptyWeekTwo(): Record<string, unknown> {
	return {
		id: 'week-2',
		program_id: 'program-1',
		week_number: 2,
		notes: '',
		created_at: '',
		updated_at: '',
		sessions: []
	};
}

/**
 * The two weeks the cross-week drags below move a session between. Both have to
 * be on screen at once for such a drag, so the program is two weeks long and the
 * viewport is tall enough to hold them.
 */
async function stubTwoWeeks(page: Page, weekTwo: Record<string, unknown>): Promise<void> {
	await page.setViewportSize({ width: 1280, height: 1400 });
	await stubProgram(page, testProgram({ duration_weeks: 2, start_date: mondayDaysAgo(0) }));
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' },
			{ id: 'week-2', program_id: 'program-1', week_number: 2, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithSession()
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/2', { body: weekTwo });
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithSession()
	});
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/2', { body: weekTwo });
}

test('keeps the session id when it is dragged to another week and back', async ({ page }) => {
	await stubTwoWeeks(page, emptyWeekTwo());
	const saves = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	// Both weeks must be open at once, and which one starts expanded depends on
	// the program's start date, so expand all rather than toggling each.
	await page.getByTitle('Expand all').click();

	// The mis-drop, then the correction. The row must survive both.
	await dragOnto(
		page,
		page.getByTestId('cell:1:1').getByRole('button', { name: 'Power endurance block' }),
		page.getByTestId('cell:2:0')
	);
	// dnd-kit animates the dropped card back into place, and dragging again while
	// that clone is still mounted picks up a stale position, so wait it out.
	await expect(page.getByTestId('cell:2:0').getByText('Power endurance block')).toHaveCount(1);
	// Onto another day of week one, so the week the row belongs to has an edit to
	// write and the save is not skipped for want of anything to save.
	await dragOnto(
		page,
		page.getByTestId('cell:2:0').getByRole('button', { name: 'Power endurance block' }),
		page.getByTestId('cell:1:3')
	);
	await expect(
		page.getByTestId('cell:1:3').getByRole('button', { name: 'Power endurance block' })
	).toBeVisible();
	await page.getByRole('button', { name: 'Save program' }).click();

	await expect(page.getByText('Program saved')).toBeVisible();

	const weekOneSave = saves.find((s) => s.url.endsWith('/weeks/1'));
	expect(weekOneSave?.body).toMatchObject({
		sessions: [{ id: 'ws-1', training_id: 'training-1', day_of_week: 3 }]
	});
});

// One drag puts the session into week two, another takes it back out. Neither
// drag can see the other, so what week two holds at the end is the only thing
// that can tell it was not edited.
test('does not save a week a session was dropped into and dragged back out of', async ({
	page
}) => {
	await stubTwoWeeks(page, emptyWeekTwo());
	const saves = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByTitle('Expand all').click();

	await dragOnto(
		page,
		page.getByTestId('cell:1:1').getByRole('button', { name: 'Power endurance block' }),
		page.getByTestId('cell:2:0')
	);
	// dnd-kit animates the dropped card back into place, and dragging again while
	// that clone is still mounted picks up a stale position, so wait it out.
	await expect(page.getByTestId('cell:2:0').getByText('Power endurance block')).toHaveCount(1);
	// Back into week one, on another day, so week one has a real edit to save and
	// the save is not skipped for want of anything to write.
	await dragOnto(
		page,
		page.getByTestId('cell:2:0').getByRole('button', { name: 'Power endurance block' }),
		page.getByTestId('cell:1:3')
	);
	await expect(page.getByTestId('cell:1:3').getByText('Power endurance block')).toHaveCount(1);

	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	expect(saves.map((s) => s.url.split('/weeks/')[1])).toEqual(['1']);
});

// The guard is what stands between the coach and losing work, so it must not
// ask about a program put back exactly as it was read.
test('leaves the program without asking once the session is dragged back', async ({ page }) => {
	await stubTwoWeeks(page, emptyWeekTwo());

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByTitle('Expand all').click();

	await dragOnto(
		page,
		page.getByTestId('cell:1:1').getByRole('button', { name: 'Power endurance block' }),
		page.getByTestId('cell:2:0')
	);
	await expect(page.getByTestId('cell:2:0').getByText('Power endurance block')).toHaveCount(1);
	await dragOnto(
		page,
		page.getByTestId('cell:2:0').getByRole('button', { name: 'Power endurance block' }),
		page.getByTestId('cell:1:1')
	);
	await expect(page.getByTestId('cell:1:1').getByText('Power endurance block')).toHaveCount(1);

	await page
		.getByRole('navigation')
		.first()
		.getByRole('button', { name: 'Trainings', exact: true })
		.click();

	await expect(page).toHaveURL('/trainings');
	await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeHidden();
});

// The move runs on drag over, so the session is really put into every week the
// pointer crosses and taken back out again on the way past. A week that ends
// holding what it started with was not edited, and saving it would rewrite rows
// nobody touched.
test('does not save a week a session was only dragged through', async ({ page }) => {
	const emptyWeek = (n: number) => ({
		id: `week-${n}`,
		program_id: 'program-1',
		week_number: n,
		notes: '',
		created_at: '',
		updated_at: '',
		sessions: []
	});

	// Three weeks on screen at once, so the drag from the first to the last has
	// to cross the middle one rather than aim straight at its target.
	await page.setViewportSize({ width: 1280, height: 1800 });
	await stubProgram(page, testProgram({ duration_weeks: 3, start_date: mondayDaysAgo(0) }));
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [1, 2, 3].map((n) => ({
			id: `week-${n}`,
			program_id: 'program-1',
			week_number: n,
			created_at: '',
			updated_at: ''
		}))
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithSession()
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/2', { body: emptyWeek(2) });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/3', { body: emptyWeek(3) });
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithSession()
	});
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/2', { body: emptyWeek(2) });
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/3', { body: emptyWeek(3) });
	const saves = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByTitle('Expand all').click();

	// One drag, stopping in week two on the way, which is what puts the session
	// into it and flags it. Two separate drags would be two edits.
	await dragVia(
		page,
		page.getByTestId('cell:1:1').getByRole('button', { name: 'Power endurance block' }),
		[page.getByTestId('cell:2:1'), page.getByTestId('cell:3:1')]
	);

	await expect(
		page.getByTestId('cell:3:1').getByRole('button', { name: 'Power endurance block' })
	).toBeVisible();
	await expect(page.getByTestId('cell:2:1').getByText('Power endurance block')).toHaveCount(0);

	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	expect(saves.map((s) => s.url.split('/weeks/')[1]).sort()).toEqual(['1', '3']);
});

/** A week whose session the coachee has already played, so the server locks it. */
function weekOneWithPlayedSession() {
	const week = weekOneWithSession();
	week.sessions[0] = { ...week.sessions[0], is_locked: true };
	return week;
}

async function stubTwoWeeksWithPlayedSession(page: Page): Promise<void> {
	await stubProgram(page, testProgram({ duration_weeks: 2, start_date: mondayDaysAgo(0) }));
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' },
			{ id: 'week-2', program_id: 'program-1', week_number: 2, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithPlayedSession()
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/2', {
		body: {
			id: 'week-2',
			program_id: 'program-1',
			week_number: 2,
			notes: '',
			created_at: '',
			updated_at: '',
			sessions: []
		}
	});
}

async function stubPlayedWeek(page: Page): Promise<void> {
	await stubProgram(page);
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithPlayedSession()
	});
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithPlayedSession()
	});
}

test('says why a played session is locked and offers no way to remove it', async ({ page }) => {
	await stubPlayedWeek(page);

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: /Wk 1/ }).click();

	await expect(page.getByText(/Sessions already played are locked/)).toBeVisible();
	await expect(page.getByTitle(/already been played/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Remove session' })).toHaveCount(0);
});

// The day a session sits on is not part of what was prescribed, so a played
// session still reschedules inside its own week.
test('reschedules a played session within its own week', async ({ page }) => {
	await stubPlayedWeek(page);
	const saves = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: /Wk 1/ }).click();

	await dragOnto(
		page,
		page.getByTestId('cell:1:1').getByRole('button', { name: 'Power endurance block' }),
		page.getByTestId('cell:1:3')
	);

	await expect(
		page.getByTestId('cell:1:3').getByRole('button', { name: 'Power endurance block' })
	).toBeVisible();
	await expect(
		page.getByTestId('cell:1:1').getByRole('button', { name: 'Power endurance block' })
	).toHaveCount(0);

	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	// The id has to survive, it is what the played session points at.
	const weekOneSave = saves.find((s) => s.url.endsWith('/weeks/1'));
	expect(weekOneSave?.body).toMatchObject({
		sessions: [{ id: 'ws-1', training_id: 'training-1', day_of_week: 3 }]
	});
});

// Leaving the week does drop the row, which is the removal the server refuses.
test('refuses to drag a played session into another week', async ({ page }) => {
	await stubTwoWeeksWithPlayedSession(page);

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByTitle('Expand all').click();

	await dragOnto(
		page,
		page.getByTestId('cell:1:1').getByRole('button', { name: 'Power endurance block' }),
		page.getByTestId('cell:2:0')
	);

	await expect(page.getByText(/can only be moved inside its own week/)).toBeVisible();
	await expect(
		page.getByTestId('cell:1:1').getByRole('button', { name: 'Power endurance block' })
	).toBeVisible();
	await expect(
		page.getByTestId('cell:2:0').getByRole('button', { name: 'Power endurance block' })
	).toHaveCount(0);
});

// The padlock is rendered before the coach enters edit mode, so its reason has
// to be reachable there too.
test('explains the lock before edit mode is entered', async ({ page }) => {
	await stubPlayedWeek(page);

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: /Wk 1/ }).click();

	await expect(page.getByTitle(/already been played/)).toBeVisible();
	// trial mode asserts the tooltip is a hit target without clicking it: the
	// wrapper drops pointer events outside edit mode and the padlock opts back in.
	await page.getByTitle(/already been played/).hover({ trial: true });
});

test('keeps a played session when the week is cleared', async ({ page }) => {
	await stubPlayedWeek(page);

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: /Wk 1/ }).click();
	await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
	await page.getByRole('button', { name: 'Confirm clear' }).click();

	await expect(page.getByText(/Sessions already played were kept/)).toBeVisible();
	await expect(page.getByTestId('cell:1:1').getByText('Power endurance block')).toBeVisible();
});

test('refuses to duplicate a week onto one holding a played session', async ({ page }) => {
	const weekTwo = {
		id: 'week-2',
		program_id: 'program-1',
		week_number: 2,
		notes: '',
		created_at: '',
		updated_at: '',
		sessions: []
	};

	await stubProgram(page, testProgram({ duration_weeks: 2, start_date: mondayDaysAgo(0) }));
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' },
			{ id: 'week-2', program_id: 'program-1', week_number: 2, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithPlayedSession()
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/2', { body: weekTwo });

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByTitle('Expand all').click();
	await page.getByRole('button', { name: 'Duplicate' }).nth(1).click();

	const targetWeekOne = page.getByRole('button', { name: '1 played' });
	await expect(targetWeekOne).toBeDisabled();
});

// The stale-week recovery drops the ids so the edits can be resaved as new rows.
// A played session must keep its id through that: sending it back without one
// reads as a removal, which the server refuses, and the week would never save.
test('keeps a played session saveable after the stale week recovery', async ({ page }) => {
	await stubProgram(page);
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', {
		body: [
			{ id: 'week-1', program_id: 'program-1', week_number: 1, created_at: '', updated_at: '' }
		]
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weekOneWithPlayedSession()
	});

	let firstSave = true;
	const saves: { body: Record<string, unknown> }[] = [];
	await page.route('**/api/coach/clients/*/programs/*/weeks/1', async (route) => {
		if (route.request().method() !== 'PUT') return route.fallback();
		saves.push({ body: route.request().postDataJSON() });
		if (firstSave) {
			firstSave = false;
			return route.fulfill({
				status: 400,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'session 0: id ws-1 does not belong to this week' })
			});
		}
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(weekOneWithPlayedSession())
		});
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: /Wk 1/ }).click();

	await dragOnto(
		page,
		page.getByTestId('cell:1:1').getByRole('button', { name: 'Power endurance block' }),
		page.getByTestId('cell:1:4')
	);

	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText(/changed somewhere else/).first()).toBeVisible();

	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	expect(saves).toHaveLength(2);
	expect(saves[1].body).toMatchObject({
		sessions: [{ id: 'ws-1', day_of_week: 4 }]
	});
});

// Copies are new rows in the target week, so nobody has played them.
test('duplicating a week holding a played session yields an unlocked copy', async ({ page }) => {
	await stubTwoWeeksWithPlayedSession(page);

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByTitle('Expand all').click();
	await page.getByRole('button', { name: 'Duplicate' }).first().click();
	await page.getByRole('button', { name: '2', exact: true }).click();

	// The copy landed in week 2 and carries no padlock, so it can still be removed.
	await expect(
		page.getByTestId('cell:2:1').getByRole('button', { name: 'Power endurance block' })
	).toBeVisible();
	await expect(page.getByTestId('cell:2:1').getByTitle(/already been played/)).toHaveCount(0);
	await expect(
		page.getByTestId('cell:2:1').getByRole('button', { name: 'Remove session', exact: true })
	).toBeVisible();
});

/**
 * A moment inside week 1 of testProgram(), on the given day of that week counted
 * from Monday. Derived from the program's own start date rather than from today,
 * so which weekday the suite runs on cannot move a run into another week.
 */
const WEEK_ONE_TUESDAY = 1;
const WEEK_ONE_WEDNESDAY = 2;

function inFirstWeek(dayOfWeek: number, hour = 9): string {
	const date = new Date(`${mondayDaysAgo(7)}T00:00:00`);
	date.setDate(date.getDate() + dayOfWeek);
	date.setHours(hour);
	return date.toISOString();
}

/**
 * What the athlete actually did, read beside the program that asked for it. The
 * played run points back at the prescribed row through program_session_id, and
 * a run started outside the program carries none.
 */
async function stubPlayedWeekWithSessions(page: Page): Promise<void> {
	await stubPlayedWeek(page);
	await stub(page, 'GET', '/api/coach/clients/*/sessions', {
		body: [
			testSession({
				id: 'played-1',
				name: 'Power endurance block',
				date: inFirstWeek(WEEK_ONE_TUESDAY),
				origin: 'played',
				program_session_id: 'ws-1',
				notes: 'Right elbow hurt on the last set.'
			}),
			testSession({
				id: 'played-2',
				name: 'Evening bouldering',
				date: inFirstWeek(WEEK_ONE_WEDNESDAY),
				origin: 'logged'
			})
		]
	});
}

test('lists what the athlete played in the week being edited', async ({ page }) => {
	await stubPlayedWeekWithSessions(page);

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: /Wk 1/ }).click();

	const performed = page.getByTestId('performed:1');
	await expect(performed).toContainText('2 sessions');
	await expect(performed.getByRole('button', { name: 'Open Evening bouldering' })).toBeVisible();
	// The card is one line, so the notes ride on its tooltip rather than being
	// printed under it.
	await expect(
		performed.getByRole('button', { name: 'Open Power endurance block' })
	).toHaveAttribute('title', /Right elbow hurt on the last set\./);
	// The run the athlete started themselves is marked as off program.
	await expect(performed.getByTitle('Played outside this program')).toBeVisible();

	// Each run sits in the column of the day it was played, under the session
	// that prescribed that day.
	await expect(page.getByTestId(`performed:1:${WEEK_ONE_TUESDAY}`)).toContainText(
		'Power endurance block'
	);
	await expect(page.getByTestId(`performed:1:${WEEK_ONE_WEDNESDAY}`)).toContainText(
		'Evening bouldering'
	);
});

test('says so when what the athlete played could not be read', async ({ page }) => {
	await stubPlayedWeek(page);
	await stub(page, 'GET', '/api/coach/clients/*/sessions', {
		status: 500,
		body: { error: 'boom' }
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: /Wk 1/ }).click();

	// An empty week and a week nothing could be read for are opposite statements
	// to a coach about to lower a load.
	const performed = page.getByTestId('performed:1');
	await expect(performed).toContainText('could not be loaded');
	await expect(performed).not.toContainText('Nothing played this week yet.');
});

test('says nothing was played in a week the athlete skipped', async ({ page }) => {
	await stubPlayedWeek(page);

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: /Wk 1/ }).click();

	await expect(page.getByTestId('performed:1')).toContainText('Nothing played this week yet.');
});

test('opens the played run from the prescribed session it belongs to', async ({ page }) => {
	await stubPlayedWeekWithSessions(page);
	await stub(page, 'GET', '/api/coach/clients/*/sessions/*', {
		body: testSessionDetail(
			testSession({
				id: 'played-1',
				name: 'Power endurance block',
				date: inFirstWeek(WEEK_ONE_TUESDAY),
				origin: 'played',
				program_session_id: 'ws-1',
				notes: 'Right elbow hurt on the last set.'
			})
		)
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: /Wk 1/ }).click();
	await page
		.getByTestId('cell:1:1')
		.getByRole('button', { name: /^Played / })
		.click();

	const modal = page.getByRole('dialog', { name: 'Session details' });
	await expect(modal.getByRole('heading', { name: 'Power endurance block' })).toBeVisible();
});

test('says so when the assessments could not be read', async ({ page }) => {
	await stubProgram(page);
	await stub(page, 'GET', '/api/coach/clients/*/assessments', {
		status: 500,
		body: { error: 'boom' }
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: /Assessments/ }).click();

	const modal = page.getByRole('dialog', { name: 'Assessment results' });
	await expect(modal).toContainText('could not be loaded');
	await expect(modal).not.toContainText('No assessment records yet');
});

test('shows the coachee assessments without leaving the program', async ({ page }) => {
	await stubProgram(page);
	await stub(page, 'GET', '/api/coach/clients/*/assessments', {
		body: [testAssessmentRecord({ right_value: 42, left_value: 40 })]
	});
	await stub(page, 'GET', '/api/assessment-definitions', {
		body: builtinAssessmentDefinitions()
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: /Assessments/ }).click();

	const modal = page.getByRole('dialog', { name: 'Assessment results' });
	await expect(modal.getByText('Max Force').first()).toBeVisible();
	await expect(modal.getByText('Assessment history')).toBeVisible();
});

test('answers the notes on a played run without leaving the program', async ({ page }) => {
	const played = testSession({
		id: 'played-1',
		name: 'Power endurance block',
		date: inFirstWeek(WEEK_ONE_TUESDAY),
		origin: 'played',
		program_session_id: 'ws-1',
		notes: 'Right elbow hurt on the last set.'
	});
	await stubPlayedWeekWithSessions(page);
	await stub(page, 'GET', '/api/coach/clients/*/sessions/*', { body: testSessionDetail(played) });
	await stub(page, 'PUT', '/api/coach/clients/*/sessions/*/reply', {
		body: { ...played, coach_reply: 'Drop to three sets next week.', coach_reply_at: isoDaysAgo(0) }
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: /Wk 1/ }).click();

	// The pill of the prescribed row leads with the unanswered notes.
	const waiting = page
		.getByTestId('cell:1:1')
		.getByRole('button', { name: /^Played .*waiting for an answer/ });
	await expect(waiting).toBeVisible();
	await page
		.getByTestId('performed:1')
		.getByRole('button', { name: 'Open Power endurance block' })
		.click();

	const modal = page.getByRole('dialog', { name: 'Session details' });
	await modal.getByRole('textbox').fill('Drop to three sets next week.');
	await modal.getByRole('button', { name: 'Send reply' }).click();

	await expect(page.getByText('Reply sent to the athlete')).toBeVisible();
	// The strip and the marker follow the answer without a reload: the note is no
	// longer flagged as waiting.
	await expect(waiting).toHaveCount(0);
	await expect(
		page.getByTestId('cell:1:1').getByRole('button', { name: /^Played / })
	).toBeVisible();
	await expect(
		page.getByTestId('performed:1').getByTitle('The athlete is waiting for an answer')
	).toHaveCount(0);
});

/**
 * A training with one circuit holding one exercise, which is enough to cover
 * both a container field and a leaf field an override may carry.
 */
function circuitTraining() {
	return testTraining({
		id: 'training-1',
		title: 'Power endurance block',
		items: [
			{
				id: 'item-circuit',
				type: 'circuit',
				position: 0,
				cycles: 3,
				cycle_rest_seconds: 120,
				items: [
					{
						id: 'item-exercise',
						type: 'exercise',
						position: 0,
						exercise_id: 'exercise-1',
						exercise_name: 'Pull up',
						reps: 8,
						rest_seconds: 60
					}
				]
			}
		]
	});
}

/**
 * The circuit after a coach retyped it in the training editor: same ids, a new
 * title and a rest the exercise no longer takes at 60 seconds. Which is the
 * shape the week refusals are about, a training that moved under a program that
 * still asks the old thing of it.
 */
function retypedCircuitTraining() {
	const training = circuitTraining();
	training.title = 'Power endurance block, retyped';
	const circuit = training.items[0] as { items: { rest_seconds: number }[] };
	circuit.items[0].rest_seconds = 90;
	return training;
}

/** The same training scheduled on the Monday of both weeks. */
function twoWeeksOfTheSameTraining(secondWeekOverrides: unknown[] = []) {
	const session = (id: string, overrides: unknown[]) => ({
		id,
		training_id: 'training-1',
		training_title: 'Power endurance block',
		training_type: 'workout',
		day_of_week: 1,
		is_everyday: false,
		position: 0,
		is_locked: false,
		overrides
	});
	return {
		summaries: [1, 2].map((week_number) => ({
			id: `week-${week_number}`,
			program_id: 'program-1',
			week_number,
			created_at: '',
			updated_at: ''
		})),
		details: [
			{
				id: 'week-1',
				program_id: 'program-1',
				week_number: 1,
				notes: '',
				created_at: '',
				updated_at: '',
				sessions: [session('ws-1', [])]
			},
			{
				id: 'week-2',
				program_id: 'program-1',
				week_number: 2,
				notes: '',
				created_at: '',
				updated_at: '',
				sessions: [session('ws-2', secondWeekOverrides)]
			}
		]
	};
}

/**
 * A training whose blocks carry the fields a week may only vary since
 * Krakoer/crimpy#51: a timed exercise, an emom clock and a rep count.
 */
function openBlocksTraining() {
	return testTraining({
		id: 'training-1',
		title: 'Power endurance block',
		items: [
			{
				id: 'item-plank',
				type: 'exercise',
				position: 0,
				exercise_id: 'exercise-1',
				exercise_name: 'Plank',
				duration: 30,
				rest_seconds: 60
			},
			{
				id: 'item-emom',
				type: 'emom',
				position: 1,
				cycles: 10,
				interval_seconds: 60,
				items: [
					{
						id: 'item-exercise',
						type: 'exercise',
						position: 0,
						exercise_id: 'exercise-1',
						exercise_name: 'Pull up',
						reps: 8
					}
				]
			},
			{
				id: 'item-hang',
				type: 'hangboard_rep',
				position: 2,
				worktime_seconds: 7,
				rest_seconds: 180,
				hand: 'both',
				granularity: 'uniform',
				load_is_max: true,
				loads: [{ value: 0, unit: 'max' }],
				edge_sizes_mm: [20],
				hand_positions: [['HC']]
			}
		]
	});
}

/**
 * The assessment a rep count can be a percentage of, and a training that
 * prescribes one that way. Only the AMRAP round trip needs them: the toggle is
 * what clears the percentage, and the week editor offers no way to put it back.
 */
const REPS_ASSESSMENT = 'assessment-max-pull-ups';

function percentTraining() {
	return testTraining({
		id: 'training-1',
		title: 'Power endurance block',
		items: [
			{
				id: 'item-exercise',
				type: 'exercise',
				position: 0,
				exercise_id: 'exercise-1',
				exercise_name: 'Pull up',
				reps: 8,
				variable_targets: {
					reps: { assessment_id: REPS_ASSESSMENT, percent: 75, fallback: 8 }
				}
			}
		]
	});
}

/**
 * A training that prescribes a duration as a percentage of an assessment, with
 * the fixed number to fall back on for an athlete who has never done it. A week
 * can mean two different things by the seconds box here, which is what the
 * percentage toggle is there to say.
 */
function durationPercentTraining() {
	return testTraining({
		id: 'training-1',
		title: 'Power endurance block',
		items: [
			{
				id: 'item-plank',
				type: 'exercise',
				position: 0,
				exercise_id: 'exercise-1',
				exercise_name: 'Plank',
				duration: 120,
				variable_targets: {
					duration: { assessment_id: BUILTIN_ENDURANCE_60, percent: 75, fallback: 120 }
				}
			}
		]
	});
}

/**
 * A training that prescribes a plain rep count, with no percentage anywhere near
 * it. Nothing about a week is meant to reach the box here: it holds the count
 * itself, the way it does in the training editor.
 */
function plainRepCountTraining() {
	return testTraining({
		id: 'training-1',
		title: 'Power endurance block',
		items: [
			{
				id: 'item-exercise',
				type: 'exercise',
				position: 0,
				exercise_id: 'exercise-1',
				exercise_name: 'Pull up',
				reps: 8
			}
		]
	});
}

/** An exercise written as an AMRAP, carrying no rep count to fall back on. */
function openRepCountTraining() {
	return testTraining({
		id: 'training-1',
		title: 'Power endurance block',
		items: [
			{
				id: 'item-exercise',
				type: 'exercise',
				position: 0,
				exercise_id: 'exercise-1',
				exercise_name: 'Pull up',
				reps_is_max: true
			}
		]
	});
}

async function stubTwoWeekProgram(
	page: Page,
	secondWeekOverrides: unknown[] = [],
	training = circuitTraining()
): Promise<void> {
	const weeks = twoWeeksOfTheSameTraining(secondWeekOverrides);
	await stubProgram(page, testProgram({ duration_weeks: 2, start_date: mondayDaysAgo(0) }));
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', { body: weeks.summaries });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/1', { body: weeks.details[0] });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/2', { body: weeks.details[1] });
	await stub(page, 'GET', '/api/trainings/*', { body: training });
	await stub(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*', {
		body: weeks.details[0]
	});
}

/**
 * The editor opens the week the program is currently in. These fixtures start
 * the program this Monday, so week 1 is open on arrival and week 2 is the one a
 * test has to expand.
 */
async function openWeek(page: Page, weekNumber: number): Promise<void> {
	if (weekNumber !== 1) {
		await page.getByRole('button', { name: new RegExp(`Wk ${weekNumber}`) }).click();
	}
	await expect(page.getByTestId(`cell:${weekNumber}:1`)).toBeVisible();
}

test('customises one week of a scheduled training and saves only what moved', async ({ page }) => {
	await stubTwoWeekProgram(page);
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 1);
	await page
		.getByTestId('cell:1:1')
		.getByRole('button', { name: 'Training parameters, week 1', exact: true })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 1 training parameters' });
	await expect(modal.getByRole('heading', { name: 'Power endurance block' })).toBeVisible();
	// The exercises and the blocks belong to the training, so nothing structural
	// is offered here.
	await expect(modal.getByRole('button', { name: 'Delete' })).toHaveCount(0);
	await expect(modal.getByRole('button', { name: 'Change exercise' })).toHaveCount(0);
	await expect(modal.getByRole('button', { name: 'Duplicate' })).toHaveCount(0);

	await modal.getByRole('spinbutton').first().fill('5');
	await expect(modal.getByText('1 block customised for this week')).toBeVisible();
	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	const week = saved.find((request) => request.url.endsWith('/weeks/1'));
	expect(week?.body).toMatchObject({
		sessions: [{ overrides: [{ item_id: 'item-circuit', overrides: { cycles: 5 } }] }]
	});
});

test('a week retimes a duration, moves an emom clock and opens a rep count', async ({ page }) => {
	await stubTwoWeekProgram(page, [], openBlocksTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 1);
	await page
		.getByTestId('cell:1:1')
		.getByRole('button', { name: 'Training parameters, week 1', exact: true })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 1 training parameters' });
	await modal.getByLabel('Duration seconds').fill('45');
	await modal.getByLabel('Interval minutes').fill('1');
	await modal.getByLabel('Interval seconds').fill('30');
	await modal.getByTestId('amrap-toggle').click();

	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	const week = saved.find((request) => request.url.endsWith('/weeks/1'));
	expect(week?.body).toMatchObject({
		sessions: [
			{
				overrides: [
					{ item_id: 'item-plank', overrides: { duration: 45 } },
					{ item_id: 'item-emom', overrides: { interval_seconds: 90 } },
					{ item_id: 'item-exercise', overrides: { reps_is_max: true } }
				]
			}
		]
	});
});

test('a week that lowers a max hang to kilograms clears the max effort marker', async ({
	page
}) => {
	// The marker is what older clients read a max effort from, so a week that
	// prescribes a number has to send it cleared or the app says MAX where the
	// plan says the number. It is derived from the load units by an effect in the
	// editor, which is the coupling this drives rather than asserts by hand.
	await stubTwoWeekProgram(page, [], openBlocksTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 1);
	await page
		.getByTestId('cell:1:1')
		.getByRole('button', { name: 'Training parameters, week 1', exact: true })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 1 training parameters' });
	await modal.getByLabel('Load unit').selectOption('kg');
	await modal.getByLabel('Load', { exact: true }).fill('25');
	await modal.getByLabel('Load', { exact: true }).blur();

	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	const week = saved.find((request) => request.url.endsWith('/weeks/1'));
	expect(week?.body).toMatchObject({
		sessions: [
			{
				overrides: [
					{
						item_id: 'item-hang',
						overrides: { loads: [{ value: 25, unit: 'kg' }], load_is_max: false }
					}
				]
			}
		]
	});
});

test('a week that turns AMRAP on and off again puts the percentage back', async ({ page }) => {
	// The toggle clears the training's rep percentage, and the % button that would
	// restore it belongs to the training and is not offered in a week. Without a
	// symmetric toggle the coach silently drops the percentage for that week, and
	// the override that says so summarises to nothing.
	await stubTwoWeekProgram(page, [], percentTraining());
	await stub(page, 'GET', '/api/assessment-definitions', {
		body: [
			...builtinAssessmentDefinitions(),
			testAssessmentDefinition({
				id: REPS_ASSESSMENT,
				label: 'Max pull ups',
				unit: 'repetitions',
				per_hand: false,
				is_builtin: false
			})
		]
	});
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 1);
	await page
		.getByTestId('cell:1:1')
		.getByRole('button', { name: 'Training parameters, week 1', exact: true })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 1 training parameters' });
	await modal.getByTestId('amrap-toggle').click();
	await expect(modal.getByText('1 block customised for this week')).toBeVisible();
	await modal.getByTestId('amrap-toggle').click();
	await expect(modal.getByText('This week runs the training as it is written')).toBeVisible();

	await modal.getByRole('button', { name: 'Apply' }).click();

	// The week is back to what the training prescribes, so the grid marks nothing
	// and there is no unsaved change to save. Before the toggle was symmetric this
	// left a customised week whose chip summarised to nothing.
	await expect(
		page
			.getByTestId('cell:1:1')
			.getByRole('button', { name: 'Training parameters, week 1', exact: true })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save program' })).toHaveCount(0);
	expect(saved).toHaveLength(0);
});

/**
 * What the saved week asks of one item, and undefined when it asks nothing of
 * it. An override that came out empty is not the same answer as no override at
 * all, and a helper returning {} for both lets a test claiming one pass on the
 * other.
 */
// Every row one week sends. What it pins that savedOverrides cannot is the rows
// that are not there: searching by item id hides a row the request should never
// have carried, and a week now adds fields, deletes fields and drops whole rows
// on its way out.
function savedOverrideRows(
	saved: CapturedRequest[],
	weekNumber = 1
): { item_id: string; overrides: Record<string, unknown> }[] | undefined {
	const week = saved.find((request) => request.url.endsWith(`/weeks/${weekNumber}`));
	const body = week?.body as {
		sessions: { overrides: { item_id: string; overrides: Record<string, unknown> }[] }[];
	};
	return body?.sessions[0].overrides;
}

function savedOverrides(
	saved: CapturedRequest[],
	itemId: string,
	weekNumber = 1
): Record<string, unknown> | undefined {
	return savedOverrideRows(saved, weekNumber)?.find((override) => override.item_id === itemId)
		?.overrides;
}

// A week that already asks for something is opened through a button of another
// name, so the name is matched on the part the two of them share.
async function openWeekParameters(page: Page, weekNumber = 1) {
	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, weekNumber);
	await page
		.getByTestId(`cell:${weekNumber}:1`)
		.getByRole('button', { name: new RegExp(`training parameters, week ${weekNumber}$`, 'i') })
		.click();
	return page.getByRole('dialog', { name: `Week ${weekNumber} training parameters` });
}

test('a week raises the fallback of a percentage without prescribing a number', async ({
	page
}) => {
	// The seconds boxes are the percentage's fallback while it stands, and the
	// two numbers cannot both travel: every client resolves the percentage first,
	// so a plain duration sent beside it would be the week silently dropping the
	// percentage it never touched. This drives the editor rather than asserting
	// the diff by hand, because which of the two the boxes write is the coupling.
	await stubTwoWeekProgram(page, [], durationPercentTraining());
	await stub(page, 'GET', '/api/assessment-definitions', { body: builtinAssessmentDefinitions() });
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page);
	// A week reads and edits the percentage rather than only destroying it.
	await expect(modal.getByText('% of')).toBeVisible();
	await expect(modal.getByTestId('variable-toggle')).toBeVisible();

	await modal.getByLabel('Duration minutes').fill('0');
	await modal.getByLabel('Duration seconds').fill('30');

	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	expect(savedOverrides(saved, 'item-plank')).toEqual({
		variable_targets: {
			duration: { assessment_id: BUILTIN_ENDURANCE_60, percent: 75, fallback: 30 }
		}
	});
});

test('a week that turns the percentage off prescribes the plain value instead', async ({
	page
}) => {
	// The toggle is how the coach says the boxes mean a number this week. The
	// percentage has to go out cleared alongside it, or the app resolves it and
	// plays something else than the week says.
	await stubTwoWeekProgram(page, [], durationPercentTraining());
	await stub(page, 'GET', '/api/assessment-definitions', { body: builtinAssessmentDefinitions() });
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page);
	await modal.getByTestId('variable-toggle').click();
	await expect(modal.getByText('% of')).toHaveCount(0);

	await modal.getByLabel('Duration minutes').fill('2');
	await modal.getByLabel('Duration seconds').fill('30');

	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	expect(savedOverrides(saved, 'item-plank')).toEqual({
		duration: 150,
		variable_targets: {}
	});
});

test('a week that turns the percentage off and on again puts it back', async ({ page }) => {
	// The way back the panel owes the coach: without it the toggle is a one way
	// door, and the only undo left resets every other field of the item too.
	await stubTwoWeekProgram(page, [], durationPercentTraining());
	await stub(page, 'GET', '/api/assessment-definitions', { body: builtinAssessmentDefinitions() });
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page);
	await modal.getByTestId('variable-toggle').click();
	await modal.getByLabel('Duration seconds').fill('30');
	await expect(modal.getByText('1 block customised for this week')).toBeVisible();

	await modal.getByTestId('variable-toggle').click();
	await expect(modal.getByText('% of')).toBeVisible();
	await expect(modal.getByText('This week runs the training as it is written')).toBeVisible();

	await modal.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByRole('button', { name: 'Save program' })).toHaveCount(0);
	expect(saved).toHaveLength(0);
});

/**
 * The week this feature writes on its first save: the plain value the coach
 * prescribed, plus the emptied targets that cleared the training's percentage.
 * Reopened, that is the state the toggles are pressed in, and neither of them
 * may lose the number the week already asks for.
 */
const weekPrescribingAPlainDuration = [
	{ id: 'override-1', item_id: 'item-plank', overrides: { duration: 150, variable_targets: {} } }
];

const weekPrescribingAPlainRepCount = [
	{ id: 'override-1', item_id: 'item-exercise', overrides: { reps: 12, variable_targets: {} } }
];

test('a week reopened on a plain duration keeps it through a percentage round trip', async ({
	page
}) => {
	// Turning the percentage on shows its fallback in the boxes, which displaces
	// the number the week prescribes. Turning it straight back off has to put that
	// number back: without it the boxes fall to the training's fallback and the
	// week silently drops to it.
	await stubTwoWeekProgram(page, weekPrescribingAPlainDuration, durationPercentTraining());
	await stub(page, 'GET', '/api/assessment-definitions', { body: builtinAssessmentDefinitions() });
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page, 2);
	await expect(modal.getByText('% of')).toHaveCount(0);
	await expect(modal.getByLabel('Duration minutes')).toHaveValue('2');
	await expect(modal.getByLabel('Duration seconds')).toHaveValue('30');

	await modal.getByTestId('variable-toggle').click();
	await expect(modal.getByText('% of')).toBeVisible();
	await expect(modal.getByLabel('Duration seconds')).toHaveValue('0');

	await modal.getByTestId('variable-toggle').click();
	await expect(modal.getByText('% of')).toHaveCount(0);
	await expect(modal.getByLabel('Duration minutes')).toHaveValue('2');
	await expect(modal.getByLabel('Duration seconds')).toHaveValue('30');
	await expect(modal.getByText('1 block customised for this week')).toBeVisible();

	await modal.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByRole('button', { name: 'Save program' })).toHaveCount(0);
	expect(saved).toHaveLength(0);
});

test('a week reopened on a plain rep count keeps it through an AMRAP round trip', async ({
	page
}) => {
	// AMRAP puts back the percentage AMRAP took away, and this week has none: the
	// coach turned it off before prescribing the count. Reaching past that to the
	// training's own percentage resurrects what the week says it does not want.
	await stubTwoWeekProgram(page, weekPrescribingAPlainRepCount, percentTraining());
	await stub(page, 'GET', '/api/assessment-definitions', {
		body: [
			...builtinAssessmentDefinitions(),
			testAssessmentDefinition({
				id: REPS_ASSESSMENT,
				label: 'Max pull ups',
				unit: 'repetitions',
				per_hand: false,
				is_builtin: false
			})
		]
	});
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page, 2);
	await expect(modal.getByLabel('Reps')).toHaveValue('12');
	await expect(modal.getByText('% of')).toHaveCount(0);

	await modal.getByTestId('amrap-toggle').click();
	await expect(modal.getByText('As many as possible')).toBeVisible();

	await modal.getByTestId('amrap-toggle').click();
	await expect(modal.getByText('% of')).toHaveCount(0);
	await expect(modal.getByLabel('Reps')).toHaveValue('12');
	await expect(modal.getByText('1 block customised for this week')).toBeVisible();

	await modal.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByRole('button', { name: 'Save program' })).toHaveCount(0);
	expect(saved).toHaveLength(0);
});

test('a week emptying the reps box sends a fallback the backend accepts', async ({ page }) => {
	// An empty number input binds as null, and the backend answers that a fallback
	// must be zero or more, which fails the whole week save rather than the field.
	await stubTwoWeekProgram(page, [], percentTraining());
	await stub(page, 'GET', '/api/assessment-definitions', {
		body: [
			...builtinAssessmentDefinitions(),
			testAssessmentDefinition({
				id: REPS_ASSESSMENT,
				label: 'Max pull ups',
				unit: 'repetitions',
				per_hand: false,
				is_builtin: false
			})
		]
	});
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page);
	await modal.getByLabel('Reps').fill('');

	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	expect(savedOverrides(saved, 'item-exercise')).toEqual({
		variable_targets: {
			reps: { assessment_id: REPS_ASSESSMENT, percent: 75, fallback: 1 }
		}
	});
});

test('a week that empties the reps box of a plain count asks nothing of it', async ({ page }) => {
	// A box cleared on the way to typing is not a prescription, and the floor that
	// keeps a percentage fallback runnable has no business here: a week that sent
	// one rep would have the athlete do one instead of the eight the training
	// asks for, with nothing on screen saying so.
	await stubTwoWeekProgram(page, [], plainRepCountTraining());
	await stub(page, 'GET', '/api/assessment-definitions', { body: builtinAssessmentDefinitions() });
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page);
	await expect(modal.getByLabel('Reps')).toHaveValue('8');
	await modal.getByLabel('Reps').fill('');

	await expect(modal.getByText('This week runs the training as it is written')).toBeVisible();
	await modal.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByRole('button', { name: 'Save program' })).toHaveCount(0);
	expect(saved).toHaveLength(0);
});

test('a week that retypes the reps box of a plain count prescribes what it reads', async ({
	page
}) => {
	await stubTwoWeekProgram(page, [], plainRepCountTraining());
	await stub(page, 'GET', '/api/assessment-definitions', { body: builtinAssessmentDefinitions() });
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page);
	await modal.getByLabel('Reps').fill('12');

	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	expect(savedOverrides(saved, 'item-exercise')).toEqual({ reps: 12 });
});

test('a week that closes an open rep count lands on a number the athlete can run', async ({
	page
}) => {
	await stubTwoWeekProgram(page, [], openRepCountTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 1);
	await page
		.getByTestId('cell:1:1')
		.getByRole('button', { name: 'Training parameters, week 1', exact: true })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 1 training parameters' });
	await modal.getByTestId('amrap-toggle').click();

	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	const week = saved.find((request) => request.url.endsWith('/weeks/1'));
	expect(week?.body).toMatchObject({
		sessions: [
			{ overrides: [{ item_id: 'item-exercise', overrides: { reps: 1, reps_is_max: false } }] }
		]
	});
});

test('a week cannot save a duration of nothing on the way to typing one', async ({ page }) => {
	await stubTwoWeekProgram(page, [], openBlocksTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 1);
	await page
		.getByTestId('cell:1:1')
		.getByRole('button', { name: 'Training parameters, week 1', exact: true })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 1 training parameters' });
	await modal.getByLabel('Duration seconds').fill('');
	await modal.getByLabel('Duration minutes').fill('');

	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	const week = saved.find((request) => request.url.endsWith('/weeks/1'));
	expect(week).toBeDefined();
	const body = week!.body as {
		sessions: { overrides: { item_id: string; overrides: { duration: number } }[] }[];
	};
	const plank = body.sessions[0].overrides.find((o) => o.item_id === 'item-plank');
	expect(plank?.overrides.duration).toBe(1);
});

test('reads a week that already asks for something back into the editor', async ({ page }) => {
	await stubTwoWeekProgram(page, [
		{ id: 'override-1', item_id: 'item-exercise', overrides: { reps: 12 } }
	]);

	await page.goto(PROGRAM_URL);
	await openWeek(page, 2);
	// The grid says which weeks were customised before anything is opened.
	await expect(
		page
			.getByTestId('cell:2:1')
			.getByRole('button', { name: 'Customised training parameters, week 2', exact: true })
	).toBeVisible();

	await page
		.getByTestId('cell:2:1')
		.getByRole('button', { name: 'Customised training parameters, week 2', exact: true })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	await expect(modal.getByRole('spinbutton').nth(3)).toHaveValue('12');
	await expect(modal.getByText('1 block customised for this week')).toBeVisible();
});

test('reads what the other weeks of the program ask of the same block', async ({ page }) => {
	await stubTwoWeekProgram(page, [
		{ id: 'override-1', item_id: 'item-circuit', overrides: { cycles: 5 } }
	]);

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 1);
	await page
		.getByTestId('cell:1:1')
		.getByRole('button', { name: 'Training parameters, week 1', exact: true })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 1 training parameters' });
	await expect(modal.getByTitle('W2 asks for 5 sets')).toBeVisible();
	await expect(modal.getByTitle('W1 runs this as the training writes it')).toBeVisible();

	// The week being edited follows the tree on screen, so the coach compares the
	// number they are typing with the ones they already set.
	await modal.getByRole('spinbutton').first().fill('4');
	await expect(modal.getByTitle('W1 asks for 4 sets')).toBeVisible();
});

test('puts one block back to the training without touching the rest of the week', async ({
	page
}) => {
	await stubTwoWeekProgram(page, [
		{ id: 'override-1', item_id: 'item-circuit', overrides: { cycles: 5 } },
		{ id: 'override-2', item_id: 'item-exercise', overrides: { reps: 12 } }
	]);
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);
	await page
		.getByTestId('cell:2:1')
		.getByRole('button', { name: 'Customised training parameters, week 2', exact: true })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	await expect(modal.getByText('2 blocks customised for this week')).toBeVisible();
	// The strips are rendered under the block they are about, so the first one
	// belongs to the exercise nested in the circuit.
	await modal.getByRole('button', { name: 'Reset to the training' }).first().click();
	await expect(modal.getByText('1 block customised for this week')).toBeVisible();
	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	const week = saved.find((request) => request.url.endsWith('/weeks/2'));
	expect(week?.body).toMatchObject({
		sessions: [{ overrides: [{ item_id: 'item-circuit', overrides: { cycles: 5 } }] }]
	});
});

test('reads a played session, which cannot be told to ask for anything else', async ({ page }) => {
	const weeks = twoWeeksOfTheSameTraining();
	weeks.details[0].sessions[0].is_locked = true;
	await stubProgram(page, testProgram({ duration_weeks: 2, start_date: mondayDaysAgo(0) }));
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', { body: weeks.summaries });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/1', { body: weeks.details[0] });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/2', { body: weeks.details[1] });
	await stub(page, 'GET', '/api/trainings/*', { body: circuitTraining() });

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 1);
	await page
		.getByTestId('cell:1:1')
		.getByRole('button', { name: 'Training parameters, week 1', exact: true })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 1 training parameters' });
	await expect(modal.getByText(/already been played/)).toBeVisible();
	await expect(modal.getByRole('button', { name: 'Apply' })).toHaveCount(0);
	await expect(modal.getByRole('spinbutton').first()).toBeDisabled();
});

test('says so when the training behind a week could not be read', async ({ page }) => {
	await stubTwoWeekProgram(page);
	await stub(page, 'GET', '/api/trainings/*', { status: 500, body: { error: 'boom' } });

	await page.goto(PROGRAM_URL);
	await openWeek(page, 1);
	await page
		.getByTestId('cell:1:1')
		.getByRole('button', { name: 'Training parameters, week 1', exact: true })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 1 training parameters' });
	await expect(modal.getByText('The training could not be read')).toBeVisible();
});

test('clears what a week asks and puts every field back on screen', async ({ page }) => {
	await stubTwoWeekProgram(page);

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 1);
	await page
		.getByTestId('cell:1:1')
		.getByRole('button', { name: 'Training parameters, week 1', exact: true })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 1 training parameters' });
	// The rest boxes of an exercise, which the editor mirrors into its own state
	// and writes back: a clear that only resets the tree would leave them showing
	// a value the week no longer asks for, and re-customise it on the next keystroke.
	const restMinutes = modal.getByRole('spinbutton').nth(4);
	await restMinutes.fill('2');
	await expect(modal.getByText('1 block customised for this week')).toBeVisible();

	await modal.getByRole('button', { name: 'Clear customisation' }).click();
	await expect(modal.getByText('This week runs the training as it is written')).toBeVisible();
	await expect(restMinutes).toHaveValue('1');
});

test('opens a week that schedules the same training twice', async ({ page }) => {
	const weeks = twoWeeksOfTheSameTraining();
	// Tuesday and Thursday of week 1, the Tuesday one asking for five sets. The
	// strip under the block then has two rows to name inside one week.
	weeks.details[0].sessions.push({
		id: 'ws-3',
		training_id: 'training-1',
		training_title: 'Power endurance block',
		training_type: 'workout',
		day_of_week: 3,
		is_everyday: false,
		position: 1,
		is_locked: false,
		overrides: []
	});
	weeks.details[0].sessions[0].overrides = [
		{ id: 'override-1', item_id: 'item-circuit', overrides: { cycles: 5 } }
	];
	await stubProgram(page, testProgram({ duration_weeks: 2, start_date: mondayDaysAgo(0) }));
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', { body: weeks.summaries });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/1', { body: weeks.details[0] });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/2', { body: weeks.details[1] });
	await stub(page, 'GET', '/api/trainings/*', { body: circuitTraining() });

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 1);
	await page
		.getByTestId('cell:1:3')
		.getByRole('button', { name: 'Training parameters, week 1', exact: true })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 1 training parameters' });
	// The two rows of week 1 are told apart by their day rather than folded into
	// one chip, which also keeps the strip's keys distinct.
	await expect(modal.getByTitle('W1 Tue asks for 5 sets')).toBeVisible();
	await expect(modal.getByTitle('W1 Thu runs this as the training writes it')).toBeVisible();
	await expect(modal.getByText('This week runs the training as it is written')).toBeVisible();
});

/**
 * The wording the write path answers a refused override with, which is what the
 * week read hands back beside the override it flagged.
 */
const STALE_REASON =
	'reps_is_max leaves the rep count open and cannot also be a percentage of an assessment';

/**
 * The week read attributes that refusal to both fields the check read, as
 * validateRepsIsMax in crimpy-backend/internal/handler/training_items.go names
 * them. Only the marker is in the row: the percentage is the item's side of the
 * disagreement, so it is the marker the block marks and the marker a coach can
 * move to clear it.
 */
function staleAmrapOverride() {
	return {
		id: 'override-1',
		item_id: 'item-exercise',
		overrides: { reps_is_max: true },
		override_stale: true,
		stale_fields: [
			{ field: 'reps_is_max', reason: STALE_REASON },
			{ field: 'variable_targets', reason: STALE_REASON }
		]
	};
}

test('marks an override the training stopped taking and clears it into a saveable week', async ({
	page
}) => {
	await stubTwoWeekProgram(page, [
		staleAmrapOverride(),
		{ id: 'override-2', item_id: 'item-circuit', overrides: { cycles: 5 } }
	]);
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);

	// The grid says which session stopped applying before anything is opened, and
	// the week says why it will refuse to save.
	await expect(page.getByTestId('stale-week-2')).toContainText('One session of this week');
	const cover = page.getByTestId('cell:2:1').getByRole('button', {
		name: 'Customised training parameters, week 2, a change stopped applying',
		exact: true
	});
	await expect(cover).toBeVisible();
	await cover.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	await expect(modal.getByTestId('stale-overrides-banner')).toContainText('One block below');
	// The block itself carries the refusal, quoted as the check's own answer.
	const notice = modal.getByTestId('stale-override');
	await expect(notice).toContainText(STALE_REASON);
	// Clearing the refused block and resetting it are the same act, so only the
	// other customised block, the circuit, still offers the plain reset.
	await expect(modal.getByRole('button', { name: 'Reset to the training' })).toHaveCount(1);

	await notice.getByRole('button', { name: 'Reset this block to the training' }).click();
	await expect(modal.getByTestId('stale-override')).toHaveCount(0);
	await expect(modal.getByTestId('stale-overrides-banner')).toHaveCount(0);
	// The other block this week customises is untouched by clearing the one the
	// training refuses.
	await expect(modal.getByText('1 block customised for this week')).toBeVisible();

	await modal.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByTestId('stale-week-2')).toHaveCount(0);
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	const week = saved.find((request) => request.url.endsWith('/weeks/2'));
	expect(week?.body).toMatchObject({
		sessions: [{ overrides: [{ item_id: 'item-circuit', overrides: { cycles: 5 } }] }]
	});
});

test('keeps the marking on a week reopened and applied without clearing it', async ({ page }) => {
	await stubTwoWeekProgram(page, [staleAmrapOverride()]);

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);
	await page
		.getByTestId('cell:2:1')
		.getByRole('button', {
			name: 'Customised training parameters, week 2, a change stopped applying',
			exact: true
		})
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	await modal.getByRole('button', { name: 'Apply' }).click();

	// The AMRAP marker goes back to the server exactly as the server refused it,
	// key for key, so the refusal it answered still stands and the week says the
	// save will be refused rather than reading as fixed.
	await expect(page.getByTestId('stale-week-2')).toBeVisible();
});

test('keeps a marked block marked while the coach edits another field of it', async ({ page }) => {
	// Krakoer/crimpy#100. The server refuses one field of a row it stores whole,
	// so the marking is read per field: the marker the training no longer takes is
	// still in the row, so the block stays marked through an edit that has nothing
	// to do with it. Dropping the marking there told the coach the week was clean
	// and then had the save answer with the refusal in prose, with nothing on
	// screen naming the block to clear.
	await stubTwoWeekProgram(page, [staleAmrapOverride()]);
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);
	const cover = page.getByTestId('cell:2:1').getByRole('button', {
		name: 'Customised training parameters, week 2, a change stopped applying',
		exact: true
	});
	await cover.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	// The block names the value the check refuses rather than only itself, and the
	// check's wording is handed over as the check's own words: the two can name
	// different things, and the label is the authority on which value is at fault.
	const named = modal.getByTestId('stale-override-field');
	await expect(named).toContainText("this week's AMRAP marker");
	await expect(named).toContainText(STALE_REASON);
	// The percentage the same refusal names is the item's side of the
	// disagreement and is not in the row, so the coach is not sent to it.
	await expect(named).not.toContainText('percentage of an assessment.');

	await modal.getByRole('spinbutton', { name: 'Rest seconds', exact: true }).fill('30');
	await modal.getByRole('spinbutton', { name: 'Rest seconds', exact: true }).blur();

	await expect(modal.getByTestId('stale-overrides-banner')).toContainText('One block below');
	await expect(named).toContainText("this week's AMRAP marker");
	await expect(
		modal.getByRole('button', { name: 'Reset this block to the training' })
	).toBeVisible();

	// And the marking rides out of the modal with the row, so the week still says
	// the save will be refused rather than reading as fixed.
	await modal.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByTestId('stale-week-2')).toContainText('One session of this week');
	await expect(cover).toBeVisible();

	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();
	// The rest the coach set rides along with the marker the week stored, which is
	// the field the server refused and the reason the marking has to stand. The
	// editor mirrors the rest into a minute and a second box, so the minute the
	// training prescribes and the thirty seconds typed here make ninety.
	expect(savedOverrides(saved, 'item-exercise', 2)).toEqual({
		reps_is_max: true,
		rest_seconds: 90
	});
});

test('drops the marking once the refused field itself moves', async ({ page }) => {
	// The other half of the rule: the marker is the field the check refused, so
	// clearing it is the coach asking for something the server has not judged.
	// Only the save can answer that, and nothing on screen may claim otherwise.
	await stubTwoWeekProgram(page, [staleAmrapOverride()]);

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);
	await page
		.getByTestId('cell:2:1')
		.getByRole('button', {
			name: 'Customised training parameters, week 2, a change stopped applying',
			exact: true
		})
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	await expect(modal.getByTestId('stale-override')).toBeVisible();
	await modal.getByTestId('amrap-toggle').click();

	await expect(modal.getByTestId('stale-overrides-banner')).toHaveCount(0);
	await expect(modal.getByTestId('stale-override')).toHaveCount(0);
});

/**
 * The week as it reads before and after the training under it moved. The row is
 * the same either way: what changes is the server's judgement of it, which only
 * a read of the week can answer and which the portal has no way to reach for
 * short of asking again.
 */
function weekTwoReads() {
	const asked = { id: 'override-1', item_id: 'item-exercise', overrides: { reps_is_max: true } };
	const before = twoWeeksOfTheSameTraining([asked]).details[1];
	const after = twoWeeksOfTheSameTraining([staleAmrapOverride()]).details[1];
	return { before, after };
}

test('reads the week back when a save is refused and marks the block it is about', async ({
	page
}) => {
	// Krakoer/crimpy#102. The portal only ever knew about refusals the server had
	// already told it about, so a training retyped after the program was read left
	// the save answering with the write path's prose and nothing marked on the
	// block that caused it. The week is read again, and the server's fresh
	// account is what marks it.
	const reads = weekTwoReads();
	await stubTwoWeekProgram(page, reads.before.sessions[0].overrides);

	// The re-read is held open so the coach can be read mid flight, then let go.
	let releaseReread = () => {};
	const rereadHeld = new Promise<void>((resolve) => (releaseReread = resolve));
	let weekTwoReadCount = 0;
	await page.route('**/api/coach/clients/*/programs/*/weeks/2', async (route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		weekTwoReadCount += 1;
		if (weekTwoReadCount > 1) await rereadHeld;
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(weekTwoReadCount === 1 ? reads.before : reads.after)
		});
	});
	await page.route('**/api/coach/clients/*/programs/*/weeks/2', async (route) => {
		if (route.request().method() !== 'PUT') return route.fallback();
		return route.fulfill({
			status: 400,
			contentType: 'application/json',
			body: JSON.stringify({ error: `item item-exercise: ${STALE_REASON}` })
		});
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);
	await page
		.getByTestId('cell:2:1')
		.getByRole('button', { name: /training parameters, week 2$/i })
		.click();

	// The week the coach edits reads as fine, because it was fine when it was
	// read. The sets they put on the circuit are the work the re-read may not
	// undo, and they are on another block than the one the server refuses: the
	// AMRAP marker is left exactly as it was read, which is what makes the fresh
	// account of it an account of the row the save sent.
	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	await expect(modal.getByTestId('stale-override')).toHaveCount(0);
	await modal.getByRole('spinbutton').first().fill('5');
	await modal.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByTestId('stale-week-2')).toHaveCount(0);

	await page.getByRole('button', { name: 'Save program' }).click();

	// While the read is in flight the coach is told the save failed and that the
	// server is being asked what it refuses, rather than reading the developer's
	// sentence for the moment it takes and watching it be replaced.
	const refusal = page.getByTestId('week-refusal-2');
	await expect(refusal).toContainText('Asking the server');
	releaseReread();

	// And then the block carries it, in the coach's words, so the strip above no
	// longer has to hand over the write path's. It points at the markings without
	// claiming they are why: the server names no item when it refuses, so which
	// marked block was the cause, or whether any was, is not something the portal
	// can be made to know.
	await expect(refusal).toContainText('marked on the sessions below');
	await expect(refusal).toContainText('whether or not it is the reason');
	await expect(refusal).not.toContainText(STALE_REASON);
	await expect(page.getByTestId('stale-week-2')).toContainText('One session of this week');

	await page
		.getByTestId('cell:2:1')
		.getByRole('button', {
			name: 'Customised training parameters, week 2, a change stopped applying',
			exact: true
		})
		.click();
	const named = modal.getByTestId('stale-override-field');
	await expect(named).toContainText("this week's AMRAP marker");
	await expect(named).toContainText(STALE_REASON);
	// The sets the coach typed before the save are still theirs: the re-read is
	// allowed to write the marking and nothing else.
	await expect(modal.getByRole('spinbutton').first()).toHaveValue('5');

	// And once they clear the block the strip goes with it. It is read off the
	// week rather than off the flag the read set, so it cannot outlive the
	// markings it points at: the badge and the week notice are live, and a strip
	// still saying "marked below" over a week with nothing marked sends the coach
	// looking for a block that is no longer there.
	await modal
		.getByTestId('stale-override')
		.getByRole('button', { name: 'Reset this block to the training' })
		.click();
	await modal.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByTestId('stale-week-2')).toHaveCount(0);
	// Silent rather than back to the words the save was refused with. This read
	// explained the refusal as override refusals and the week now holds none of
	// them, so that account is spent: quoting it would name the block they have
	// just fixed and claim the week is still refused for it.
	await expect(refusal).toHaveCount(0);

	// Silence for a spent account and not a gag on the week: the save they have
	// not made yet is answered afresh, and its answer is on screen.
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByTestId('week-refusal-2')).toContainText(STALE_REASON);
});

test('leaves a failure that is not a refusal saying what the server said', async ({ page }) => {
	// A 500, a gateway error or a dropped connection is not the server judging the
	// week. Reading the week back on one would mark blocks over a failure that is
	// not about them, and the sentence pointing at those markings would bury the
	// only account of the failure there is.
	await stubTwoWeekProgram(page, [staleAmrapOverride()]);
	let weekTwoReadCount = 0;
	await page.route('**/api/coach/clients/*/programs/*/weeks/2', async (route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		weekTwoReadCount += 1;
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(twoWeeksOfTheSameTraining([staleAmrapOverride()]).details[1])
		});
	});
	await page.route('**/api/coach/clients/*/programs/*/weeks/2', async (route) => {
		if (route.request().method() !== 'PUT') return route.fallback();
		return route.fulfill({
			status: 500,
			contentType: 'application/json',
			body: JSON.stringify({ error: 'the database is having a moment' })
		});
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);
	// The week already carries a marking from the read it was loaded with, so
	// nothing but the gate on the failure keeps the strip off "marked below".
	await expect(page.getByTestId('stale-week-2')).toBeVisible();
	await page.getByPlaceholder('Week notes...').last().fill('Deload the second half');
	await page.getByRole('button', { name: 'Save program' }).click();

	// The server's own sentence, and the whole of it. Nothing here is silenced:
	// the strip goes quiet only where a read explained the refusal and the coach
	// then cleared what it named, and no read was made at all.
	const refusal = page.getByTestId('week-refusal-2');
	await expect(refusal).toContainText('the database is having a moment');
	await expect(refusal).not.toContainText('marked on the sessions below');
	// And the week was never read back: what it holds is still what the coach
	// typed, and the marking on it is still the one it was loaded with.
	await expect(page.getByTestId('stale-week-2')).toBeVisible();
	expect(weekTwoReadCount).toBe(1);
});

test('writes nothing of its own into a week read back under an open modal', async ({ page }) => {
	// Ctrl+S saves from under an open modal, so the re-read can land while the
	// coach is typing in one, and neither thing it could do to the cached training
	// is safe. Dropping it leaves the panel reading "Loading the training...",
	// with Apply disabled, nothing loading and Cancel, which throws away what they
	// typed, the only way out. Replacing it is worse: the modal rebuilds its
	// edited tree only when the training id changes, so a fresh copy under the
	// same id moves the base tree and leaves the edited one, the diff reads every
	// field the training moved as a value this week is asking for, and Apply
	// writes it into the week. So the entry is left exactly as it is, and dropped
	// when the modal closes.
	const reads = weekTwoReads();
	await stubTwoWeekProgram(page, reads.before.sessions[0].overrides);
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');
	let weekTwoReadCount = 0;
	await page.route('**/api/coach/clients/*/programs/*/weeks/2', async (route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		weekTwoReadCount += 1;
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(weekTwoReadCount === 1 ? reads.before : reads.after)
		});
	});
	await page.route('**/api/coach/clients/*/programs/*/weeks/2', async (route) => {
		if (route.request().method() !== 'PUT') return route.fallback();
		return route.fulfill({
			status: 400,
			contentType: 'application/json',
			body: JSON.stringify({ error: `item item-exercise: ${STALE_REASON}` })
		});
	});
	// The training the week is refused against is the training that moved, and it
	// moved a value the modal renders: the exercise now rests 90 seconds where the
	// tree on screen was built on 60. A second read identical to the first would
	// let a swapped base tree pass, since the diff it feeds would come out empty.
	let trainingReadCount = 0;
	await page.route('**/api/trainings/*', async (route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		trainingReadCount += 1;
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(trainingReadCount === 1 ? circuitTraining() : retypedCircuitTraining())
		});
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);
	// Something for Ctrl+S to save, typed before the modal is opened.
	await page.getByPlaceholder('Week notes...').last().fill('Deload the second half');
	await page
		.getByTestId('cell:2:1')
		.getByRole('button', { name: /training parameters, week 2$/i })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	await modal.getByRole('spinbutton').first().fill('5');
	await page.keyboard.press('Control+s');

	// The read landed and marked the block it is about.
	await expect(page.getByTestId('stale-week-2')).toBeVisible();

	// The modal is still the modal: nothing is loading, the cycles are the ones
	// the coach typed, and Apply still applies them. The tree is the one it was
	// built from, which is the cost written down: the training under it has moved
	// and the panel does not show that until it is closed and opened again.
	await expect(modal.getByText('Loading the training...')).toHaveCount(0);
	await expect(modal.getByRole('spinbutton').first()).toHaveValue('5');
	await expect(modal.getByRole('button', { name: 'Apply' })).toBeEnabled();
	await modal.getByRole('button', { name: 'Apply' }).click();
	await expect(modal).toHaveCount(0);

	// And what Apply wrote into the week is the cycles the coach typed and the
	// marker the week already asked for, and nothing else. Under a base tree
	// swapped for the moved training this also carried rest_seconds 60 on the
	// exercise, a prescription nobody made, from a coach who typed nothing near
	// it.
	await page.getByRole('button', { name: 'Save program' }).click();
	const weekTwoSaves = () => saved.filter((request) => request.url.endsWith('/weeks/2'));
	await expect.poll(() => weekTwoSaves().length).toBe(2);
	expect(weekTwoSaves().at(-1)?.body).toEqual(
		expect.objectContaining({
			sessions: [
				expect.objectContaining({
					overrides: [
						{ item_id: 'item-circuit', overrides: { cycles: 5 } },
						{ item_id: 'item-exercise', overrides: { reps_is_max: true } }
					]
				})
			]
		})
	);
	// Which is what leaving the entry alone buys: the training was never read
	// again under the coach, so the pair the diff is taken across never came
	// apart.
	expect(trainingReadCount).toBe(1);

	// Closing is what lets go of the copy the tree was built from, so the reopen
	// reads the training the server holds now rather than handing back the one the
	// refusal disproved.
	await page
		.getByTestId('cell:2:1')
		.getByRole('button', {
			name: 'Customised training parameters, week 2, a change stopped applying',
			exact: true
		})
		.click();
	await expect(
		modal.getByRole('heading', { name: 'Power endurance block, retyped' })
	).toBeVisible();
	// The 90 seconds the training moved to, as the pair of fields the editor
	// writes a rest in.
	await expect(modal.getByRole('spinbutton', { name: 'Rest minutes', exact: true })).toHaveValue(
		'1'
	);
	await expect(modal.getByRole('spinbutton', { name: 'Rest seconds', exact: true })).toHaveValue(
		'30'
	);
	expect(trainingReadCount).toBe(2);
});

test('keeps the words the save was refused with when the week cannot be read back', async ({
	page
}) => {
	// A read that fails leaves the portal with exactly what it had before, which
	// is the write path's own sentence. It is written for a developer, and it is
	// still better than telling the coach nothing.
	const reads = weekTwoReads();
	await stubTwoWeekProgram(page, reads.before.sessions[0].overrides);

	let weekTwoReadCount = 0;
	await page.route('**/api/coach/clients/*/programs/*/weeks/2', async (route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		weekTwoReadCount += 1;
		return route.fulfill({
			status: weekTwoReadCount === 1 ? 200 : 500,
			contentType: 'application/json',
			body: JSON.stringify(weekTwoReadCount === 1 ? reads.before : { error: 'boom' })
		});
	});
	await page.route('**/api/coach/clients/*/programs/*/weeks/2', async (route) => {
		if (route.request().method() !== 'PUT') return route.fallback();
		return route.fulfill({
			status: 400,
			contentType: 'application/json',
			body: JSON.stringify({ error: `item item-exercise: ${STALE_REASON}` })
		});
	});

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);
	await page
		.getByTestId('cell:2:1')
		.getByRole('button', { name: /training parameters, week 2$/i })
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	const rest = modal.getByRole('spinbutton', { name: 'Rest seconds', exact: true });
	await rest.fill('30');
	await rest.blur();
	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();

	await expect(page.getByTestId('week-refusal-2')).toContainText(STALE_REASON);
	await expect(page.getByTestId('stale-week-2')).toHaveCount(0);

	// And what the coach typed is still theirs to save again, which is the whole
	// of what a failed read is allowed to cost them.
	await page
		.getByTestId('cell:2:1')
		.getByRole('button', { name: /training parameters, week 2$/i })
		.click();
	await expect(rest).toHaveValue('30');
});

test('a locked session does not offer to clear the override it cannot change', async ({ page }) => {
	const weeks = twoWeeksOfTheSameTraining();
	weeks.details[0].sessions[0].is_locked = true;
	weeks.details[0].sessions[0].overrides = [staleAmrapOverride()];
	await stubProgram(page, testProgram({ duration_weeks: 2, start_date: mondayDaysAgo(0) }));
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', { body: weeks.summaries });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/1', { body: weeks.details[0] });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/2', { body: weeks.details[1] });
	await stub(page, 'GET', '/api/trainings/*', { body: circuitTraining() });

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 1);

	// A week whose only stale override sits on a played session has nothing to
	// send the coach to, so the banner does not tell them to go and clear it.
	const weekBanner = page.getByTestId('stale-week-1');
	await expect(weekBanner).toContainText('already been played');
	await expect(weekBanner).not.toContainText('Open the marked session');

	await page
		.getByTestId('cell:1:1')
		.getByRole('button', {
			name: 'Customised training parameters, week 1, a change stopped applying',
			exact: true
		})
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 1 training parameters' });
	// A played session freezes its overrides too, so the block says the refusal
	// stands rather than offering a gesture the save would refuse, and says why
	// where the coach reads it rather than only on hover. That a coach is stuck
	// there is Krakoer/crimpy#96.
	const notice = modal.getByTestId('stale-override');
	await expect(notice).toContainText('Cannot be cleared here');
	await expect(notice).toContainText('already been played');
	await expect(modal.getByRole('button', { name: 'Reset this block to the training' })).toHaveCount(
		0
	);
});

test('points a coach browsing without Edit at the switch rather than at a played session', async ({
	page
}) => {
	await stubTwoWeekProgram(page, [staleAmrapOverride()]);

	await page.goto(PROGRAM_URL);
	await openWeek(page, 2);

	// Not played, only being read: the control is one click away, and saying it
	// cannot be cleared here would be a lie the coach can disprove.
	await expect(page.getByTestId('stale-week-2')).toContainText('Turn Edit on');
	await page
		.getByTestId('cell:2:1')
		.getByRole('button', {
			name: 'Customised training parameters, week 2, a change stopped applying',
			exact: true
		})
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	const notice = modal.getByTestId('stale-override');
	await expect(notice).toContainText('Turn Edit on to clear it');
	await expect(notice).not.toContainText('Cannot be cleared here');
});

const kg = (value: number) => ({ value, unit: 'kg' });

/**
 * The wording the write path answers a grid override laid out against the old
 * shape with.
 */
const GRID_STALE_REASON = 'loads holds 6 entries but the granularity declares 8 rows';

/**
 * How the week read attributes a refusal about an array that disagrees with the
 * row count: to the array, and to the three fields the count is read from, since
 * either side of the disagreement is a field the coach can move. It mirrors
 * validateRowArray and rowLayoutFields in
 * crimpy-backend/internal/handler/training_items.go.
 */
function rowCountRefusal(reason: string, array: string) {
	return [array, 'granularity', 'cycles', 'reps'].map((field) => ({ field, reason }));
}

/**
 * A hangboard grid the coach has since made longer: four reps a set where the
 * week's override was written against three. The merge and the normalisation
 * rewrite the stored arrays into the layout this training declares, so the modal
 * cannot re-emit the row the server refused.
 */
function grownGridTraining() {
	return testTraining({
		id: 'training-1',
		title: 'Repeaters 20mm',
		training_type: 'hangboard',
		items: [
			{
				id: 'item-grid',
				type: 'repeater',
				position: 0,
				cycles: 2,
				reps: 4,
				worktime_seconds: 7,
				rest_seconds: 3,
				cycle_rest_seconds: 120,
				hand: 'both',
				granularity: 'set',
				edge_sizes_mm: [20, 20, 18, 18, 20, 20, 18, 18],
				loads: [kg(10), kg(10), kg(12), kg(12), kg(10), kg(10), kg(12), kg(12)],
				hand_positions: [['HC', 'HC', 'FC', 'FC', 'HC', 'HC', 'FC', 'FC']]
			}
		]
	});
}

function staleGridOverride() {
	return {
		id: 'override-1',
		item_id: 'item-grid',
		overrides: { loads: [kg(14), kg(14), kg(16), kg(14), kg(14), kg(16)] },
		override_stale: true,
		stale_fields: rowCountRefusal(GRID_STALE_REASON, 'loads')
	};
}

test('marks a grid override the training outgrew and leaves the stored numbers alone', async ({
	page
}) => {
	await stubTwoWeekProgram(page, [staleGridOverride()], grownGridTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);

	await expect(page.getByTestId('stale-week-2')).toContainText('One session of this week');
	const cover = page.getByTestId('cell:2:1').getByRole('button', {
		name: 'Customised training parameters, week 2, a change stopped applying',
		exact: true
	});
	await cover.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	await expect(modal.getByTestId('stale-overrides-banner')).toContainText('One block below');
	const notice = modal.getByTestId('stale-override');
	await expect(notice).toContainText(GRID_STALE_REASON);
	// The column is what the line names. The layout, the sets and the rep count
	// the same refusal names are the item's side of the disagreement and are not
	// in the row, so the coach is not sent to them.
	const named = notice.getByTestId('stale-override-field');
	await expect(named).toContainText("this week's loads");
	await expect(named).not.toContainText('layout');
	// Resetting is judged as one row, so what else goes with it is said before the
	// coach presses it.
	await expect(notice).toContainText('anything else this week asks of it goes too');
	await expect(
		notice.getByRole('button', { name: 'Reset this block to the training' })
	).toBeVisible();

	// Opening a week is not the coach editing it. The tree the editor works in
	// carries the six stored loads spread over the eight rows this training now
	// declares, and nothing stored says which layout those six were typed
	// against, so that rewrite stays on screen and out of the request: the week
	// goes back asking exactly what it asked, still marked and still the coach's
	// to keep or to clear, rather than being quietly replaced by a guess.
	await modal.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByTestId('stale-week-2')).toContainText('One session of this week');
	await expect(cover).toBeVisible();

	// So there is nothing to save either: a week the coach only looked at is left
	// exactly as it was, where the rewrite used to make the program dirty on open.
	await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
	expect(saved).toHaveLength(0);

	// And the row still goes out as the week stored it when something else about
	// the week does have to be saved. Week 1 is open too, so week 2's notes are
	// the second of the two on screen.
	await page.getByPlaceholder('Week notes...').nth(1).fill('Grid needs a look');
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	expect(saved.find((request) => request.url.endsWith('/weeks/2'))?.body).toMatchObject({
		notes: 'Grid needs a look'
	});
	const rows = savedOverrideRows(saved, 2);
	expect(rows).toHaveLength(1);
	expect(rows?.[0].item_id).toBe('item-grid');
	expect(savedOverrides(saved, 'item-grid', 2)).toEqual({
		loads: [kg(14), kg(14), kg(16), kg(14), kg(14), kg(16)]
	});
});

test('sends the grid laid out again once the coach edits it', async ({ page }) => {
	// The other half of the rule: a grid the coach worked in is theirs, and every
	// array of it has to carry one entry per row the training declares, so it goes
	// out whole. What they see on screen is what they get, from the moment they
	// touch it.
	await stubTwoWeekProgram(page, [staleGridOverride()], grownGridTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);
	await page
		.getByTestId('cell:2:1')
		.getByRole('button', {
			name: 'Customised training parameters, week 2, a change stopped applying',
			exact: true
		})
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	await modal.locator('.hb-step').first().click();
	const load = modal.getByRole('spinbutton', { name: 'Load', exact: true });
	await load.fill('18');
	await load.blur();

	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	expect(savedOverrideRows(saved, 2)).toHaveLength(1);
	const sent = savedOverrides(saved, 'item-grid', 2);
	expect(sent?.loads).toHaveLength(8);
	expect((sent?.loads as unknown[])[0]).toEqual(kg(18));
	// The week asked this block for its loads and nothing else. Laying the grid
	// out again is no reason for it to start prescribing the edges and the grips
	// the training owns: the week would then hold them against every later change
	// to the training, which is a prescription no coach ever wrote.
	expect(sent).not.toHaveProperty('edge_sizes_mm');
	expect(sent).not.toHaveProperty('hand_positions');
});

test('keeps a marked grid block marked while the coach edits the rest of it', async ({ page }) => {
	// The refused loads go back whatever else the coach types on the block, so the
	// notice, the banner and the strip over the week all stay. Dropping them on an
	// edit that has nothing to do with the grid tells the coach the week is clean
	// and then has the save refuse it, with nothing left on screen naming the
	// block to clear.
	await stubTwoWeekProgram(page, [staleGridOverride()], grownGridTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);
	const cover = page.getByTestId('cell:2:1').getByRole('button', {
		name: 'Customised training parameters, week 2, a change stopped applying',
		exact: true
	});
	await cover.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	const rest = modal.getByRole('spinbutton', { name: 'Rest seconds', exact: true });
	await rest.fill('9');
	await rest.blur();

	await expect(modal.getByTestId('stale-overrides-banner')).toContainText('One block below');
	await expect(modal.getByTestId('stale-override')).toContainText(GRID_STALE_REASON);

	await modal.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByTestId('stale-week-2')).toContainText('One session of this week');
	await expect(cover).toBeVisible();

	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	// The rest the coach typed rides along with the loads the week stored, which
	// is the row the server refused and the reason the marking has to stand.
	expect(savedOverrides(saved, 'item-grid', 2)).toEqual({
		rest_seconds: 9,
		loads: [kg(14), kg(14), kg(16), kg(14), kg(14), kg(16)]
	});
});

/**
 * The wording the write path answers a left hand column on an item both hands
 * hang together with.
 */
const UNDONE_STALE_REASON = 'left_loads is set but the "both" mode hangs both hands together';

/**
 * A week that asks the grid for a separate left hand column, on a training that
 * now hangs both hands together. The merge sets the column and the normalisation
 * wipes it straight back, so the tree the modal opens on asks nothing of the
 * block and there is no diff a reset could shrink.
 */
function undoneStaleOverride() {
	return {
		id: 'override-1',
		item_id: 'item-grid',
		overrides: {
			left_loads: [kg(14), kg(14), kg(16), kg(16), kg(14), kg(14), kg(16), kg(16)]
		},
		override_stale: true,
		stale_fields: [
			{ field: 'left_loads', reason: UNDONE_STALE_REASON },
			{ field: 'hand', reason: UNDONE_STALE_REASON }
		]
	};
}

test('points at the apply where the refused row leaves nothing to reset', async ({ page }) => {
	await stubTwoWeekProgram(page, [undoneStaleOverride()], grownGridTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);

	await expect(page.getByTestId('stale-week-2')).toContainText('One session of this week');
	await page
		.getByTestId('cell:2:1')
		.getByRole('button', {
			name: 'Customised training parameters, week 2, a change stopped applying',
			exact: true
		})
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	await expect(modal.getByTestId('stale-overrides-banner')).toContainText('One block below');
	const notice = modal.getByTestId('stale-override');
	await expect(notice).toContainText(UNDONE_STALE_REASON);
	await expect(notice).toContainText('nothing of it is left to change here');
	// The column is what the line names, and the mode the same refusal names is
	// not: it is the item's side of the disagreement, this week sets no hand mode
	// and the training is what holds it. Naming it here read "this week's left
	// hand loads and hand mode", which sends the coach looking for a value of
	// theirs that is not there. Only the standing bucket was ever asserted end to
	// end, which is how this bucket came to word it differently.
	const named = notice.getByTestId('stale-override-field');
	await expect(named).toContainText("this week's left hand loads");
	await expect(named).not.toContainText('hand mode');
	await expect(named).toContainText(UNDONE_STALE_REASON);
	// A reset here could not move the block, so it is not offered: the coach is
	// pointed at the gesture that does drop the row.
	await expect(
		notice.getByRole('button', { name: 'Reset this block to the training' })
	).toHaveCount(0);
	await expect(notice.getByTestId('stale-override-dropped')).toContainText('Applying drops it');
	// And the footer says what applying does rather than claiming, beside a banner
	// saying the week cannot be saved, that the week runs as written.
	await expect(
		modal.getByText('Applying drops what this week asks that the training no longer takes')
	).toBeVisible();

	await modal.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByTestId('stale-week-2')).toHaveCount(0);
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	const week = saved.find((request) => request.url.endsWith('/weeks/2'));
	expect(week?.body).toMatchObject({ sessions: [{ overrides: [] }] });
});

/**
 * A training whose hangboard block declares its layout per set: eight rows, two
 * sets of four reps, loaded differently from set to set unless the loads are
 * given. It is the layout the write path lays the block's arrays out in, and the
 * layout a week's arrays are judged against.
 */
function perSetGridTraining(loads?: { value: number; unit: string }[]) {
	const kg = (value: number) => ({ value, unit: 'kg' });
	return testTraining({
		id: 'training-1',
		title: 'Power endurance block',
		training_type: 'hangboard',
		items: [
			{
				id: 'item-grid',
				type: 'repeater',
				position: 0,
				cycles: 2,
				reps: 4,
				worktime_seconds: 7,
				rest_seconds: 3,
				cycle_rest_seconds: 120,
				hand: 'both',
				granularity: 'set',
				edge_sizes_mm: Array.from({ length: 8 }, () => 20),
				loads: loads ?? [kg(10), kg(10), kg(10), kg(10), kg(12), kg(12), kg(12), kg(12)],
				hand_positions: [Array.from({ length: 8 }, () => 'HC')]
			}
		]
	});
}

/** The week's own load, one entry for each of the eight rows the training declares. */
function flatGridOverride() {
	return [
		{
			id: 'override-1',
			item_id: 'item-grid',
			overrides: { loads: Array.from({ length: 8 }, () => ({ value: 14, unit: 'kg' })) }
		}
	];
}

test('shows a week whose loads coincide as the one row it reads as', async ({ page }) => {
	// The editor addresses every rep of every set, so the tree it reads is
	// rewritten into the layout the values call for. Eight identical loads read
	// back as varying by nothing, and the coach sees one row rather than eight.
	// That collapse is the feature, and this pins that it is still what they see.
	await stubTwoWeekProgram(page, flatGridOverride(), perSetGridTraining());

	const modal = await openWeekParameters(page, 2);
	await expect(modal.getByText('1 block customised for this week')).toBeVisible();
	await expect(modal.getByText('VARIES BY SET')).toHaveCount(0);
	await expect(modal.getByLabel('Load', { exact: true })).toHaveValue('14');
});

test('leaves nothing to save when a week whose loads coincide is merely applied', async ({
	page
}) => {
	// The collapse above is a re-expression of the week's own eight loads and not
	// a layout any coach chose, so the request declares the layout the training
	// does and carries the eight loads the week stored. Applying then asks for
	// exactly what the week already holds, and there is nothing to save.
	//
	// Before the request was built in the stored layout this sent a granularity
	// of 'uniform' beside one load, which the week did not hold, so opening and
	// applying a week nobody touched rewrote it.
	await stubTwoWeekProgram(page, flatGridOverride(), perSetGridTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page, 2);
	await modal.getByRole('button', { name: 'Apply' }).click();

	await expect(page.getByRole('button', { name: 'Save program' })).toHaveCount(0);
	expect(saved).toHaveLength(0);
});

/**
 * The same block with its own eight loads coinciding, so the editor reads the
 * training itself back as varying by nothing and the coach opens on one row.
 */
function flatGridTraining() {
	return perSetGridTraining(Array.from({ length: 8 }, () => ({ value: 10, unit: 'kg' })));
}

/** The week's own loads, one for each of the eight rows, no two of them alike. */
function steppedGridOverride() {
	return [
		{
			id: 'override-1',
			item_id: 'item-grid',
			overrides: {
				loads: Array.from({ length: 8 }, (_, row) => ({ value: 20 + row, unit: 'kg' }))
			}
		}
	];
}

/**
 * A week prescribing one hang for the whole block, in a row that says so. The
 * editor reads it back as the single row it is, which since Krakoer/crimpy#101
 * is the only way a grid reads as one row: a week whose loads varied is merged
 * onto the training written out in the layout its row declares, and is read as
 * varying.
 */
function flatWeekGridOverride() {
	return [
		{
			id: 'override-1',
			item_id: 'item-grid',
			overrides: { granularity: 'uniform', loads: [kg(20)] }
		}
	];
}

test('sends the layout the coach chose over a week prescribing one hang', async ({ page }) => {
	// A week prescribing one hang for the whole block, in a row that says so, and
	// a coach choosing to vary by set: that is them prescribing the hang they are
	// reading on every rep, and eight of them go out over a week that held one.
	//
	// What this pins is the half of the seam that says a layout the coach picked
	// is theirs. The request is written in the layout the item is declared in
	// except where the layout on screen has moved since the week was opened;
	// written in the stored layout here it would ask for the one load the week
	// already holds, and there would be nothing to save.
	//
	// It does not pin the other half, Krakoer/crimpy#99, that whether the coach
	// touched the grid cannot be read off the wire pair. That pair moves across
	// this pick, since the row declares a layout of its own and the coach picked
	// another, so either half of the substitution reaches the same answer here.
	// The pick the pair is invariant across is the shape that tells the two
	// halves apart, and it has two sibling tests: the refused grid below, and the
	// sparse one right after this, which is the same harm on a week the server
	// takes. What makes that one rare rather than impossible is spelled out
	// there.
	await stubTwoWeekProgram(page, flatWeekGridOverride(), flatGridTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page, 2);
	await expect(modal.getByLabel('Load', { exact: true })).toHaveValue('20');

	await modal.getByRole('radio', { name: 'Set', exact: true }).click();
	await expect(modal.getByRole('radio', { name: 'Set', exact: true })).toBeChecked();

	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	expect(savedOverrides(saved, 'item-grid', 2)).toEqual({
		loads: Array.from({ length: 8 }, () => ({ value: 20, unit: 'kg' }))
	});
});

/**
 * The same block carrying no edge sizes and no grips at all, and one load for
 * the whole item. Every configuration array is optional and validateRowArray
 * skips the ones an item leaves out, so the write path stores this and serves it
 * back: created through the API against the local backend, not assumed. The
 * portal never writes such an item, which is the standing the `rep` granularity
 * has too, and the app and the backend both can.
 */
function sparseGridTraining() {
	return testTraining({
		id: 'training-1',
		title: 'Power endurance block',
		training_type: 'hangboard',
		items: [
			{
				id: 'item-grid',
				type: 'repeater',
				position: 0,
				cycles: 2,
				reps: 4,
				worktime_seconds: 7,
				rest_seconds: 3,
				cycle_rest_seconds: 120,
				hand: 'both',
				granularity: 'uniform',
				loads: [kg(10)]
			}
		]
	});
}

/**
 * The week's own hang on every row of the layout its row declares, all eight of
 * them alike. The server takes the row and never marks it: eight loads against
 * the eight rows the row itself declares.
 */
function sparseSetGridOverride() {
	return [
		{
			id: 'override-1',
			item_id: 'item-grid',
			overrides: { granularity: 'set', loads: Array.from({ length: 8 }, () => kg(20)) }
		}
	];
}

test('sends the layout the coach chose on a grid that read as one row', async ({ page }) => {
	// Krakoer/crimpy#99 round one, on a week the server never refused.
	//
	// The week declares a layout of its own and asks the same hang of all eight
	// of its rows, so the merge lands eight loads that agree and the normalisation
	// reads them back as the one row the coach opens on. Choosing to vary by set
	// is them asking for that hang on every rep, and the block goes out laid out
	// again.
	//
	// The request cannot see that choice. It is written in the layout the item is
	// declared in except where the layout on screen has moved, and here the layout
	// the coach picked is the one the week already declared, so both sides of the
	// wire pair are byte for byte the same row and only the display pair moves.
	// Read off the request the way the substitution read it before
	// Krakoer/crimpy#99, the grid counts as untouched, the stored arrays go back
	// over the layout just picked, what goes out is the row the week already
	// holds, and the pick is discarded with nothing on screen saying so.
	//
	// It takes a training carrying no edge sizes and no grips, and that is not an
	// arbitrary fixture. A row declaring a layout the training does not, while
	// omitting an array the training carries, leaves that array at the training's
	// row count, and validateItemConfiguration refuses the merged item for it:
	// eight edge sizes against the one row a uniform row declares. That is the
	// barrier, and it is why nearly every invariant pick is a week the server
	// refused. It does not stand where the training carries no such array.
	await stubTwoWeekProgram(page, sparseSetGridOverride(), sparseGridTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page, 2);
	await expect(modal.getByLabel('Load', { exact: true })).toHaveValue('20');

	await modal.getByRole('radio', { name: 'Set', exact: true }).click();
	await expect(modal.getByRole('radio', { name: 'Set', exact: true })).toBeChecked();

	await modal.getByRole('button', { name: 'Apply' }).click();
	// The pick is a change to save. Read off the request it is not one, and this
	// is where the week went quiet: no save to make and the layout gone.
	await expect(page.getByRole('button', { name: 'Save program' })).toBeVisible();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	// The grid laid out again, which is what they asked for: the hang they were
	// reading on each of the eight rows, with the edge and the grip the training
	// left the block to default to.
	expect(savedOverrides(saved, 'item-grid', 2)).toEqual({
		granularity: 'set',
		loads: Array.from({ length: 8 }, () => kg(20)),
		edge_sizes_mm: Array.from({ length: 8 }, () => 20),
		hand_positions: [Array.from({ length: 8 }, () => 'HC')]
	});
});

test('sends a load typed into the collapsed row in the layout the training declares', async ({
	page
}) => {
	// One row on screen, eight rows on the wire: the coach prescribes the same
	// hang on every rep, and the request says so in the layout the write path
	// lays the block's arrays out in, naming no granularity of its own.
	await stubTwoWeekProgram(page, flatGridOverride(), perSetGridTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page, 2);
	await modal.getByLabel('Load', { exact: true }).fill('20');
	await modal.getByLabel('Load', { exact: true }).blur();
	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	expect(savedOverrides(saved, 'item-grid', 2)).toEqual({
		loads: Array.from({ length: 8 }, () => ({ value: 20, unit: 'kg' }))
	});
});

/**
 * The wording the write path answers a row holding more loads than the block has
 * rows left with.
 */
const GRID_STALE_REASON_LONG = 'loads holds 12 entries but the granularity declares 8 rows';

/**
 * The week's own loads, written when the block ran three sets, against the eight
 * rows it declares now. The write path refuses the row for the four the training
 * dropped, and the rows the block still has all read the one load, so the editor
 * reads the week back as a single row.
 */
function refusedGridOverride() {
	return [
		{
			id: 'override-1',
			item_id: 'item-grid',
			overrides: { loads: Array.from({ length: 12 }, () => kg(30)) },
			override_stale: true,
			stale_fields: rowCountRefusal(GRID_STALE_REASON_LONG, 'loads')
		}
	];
}

test('drops the marking with the layout the coach chose on a refused grid', async ({ page }) => {
	// Krakoer/crimpy#99 round two. Choosing to vary by set on a grid that read as
	// one row is the coach prescribing that one hang on every rep, which is a
	// request the server takes and not the row it refused, so the marking goes
	// with the choice.
	//
	// Whether they are still asking for what was refused is a question about what
	// they read, and the request cannot answer it: it is written in the layout the
	// item is declared in whatever layout is on screen, so this choice leaves it
	// byte for byte unchanged. Measured against it, the banner stood on a week
	// that saved clean and pointed the coach at a block they had just rewritten.
	await stubTwoWeekProgram(page, refusedGridOverride(), flatGridTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);
	await page
		.getByTestId('cell:2:1')
		.getByRole('button', {
			name: 'Customised training parameters, week 2, a change stopped applying',
			exact: true
		})
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	await expect(modal.getByTestId('stale-overrides-banner')).toContainText('One block below');
	await expect(modal.getByTestId('stale-override')).toContainText(GRID_STALE_REASON_LONG);
	await expect(modal.getByLabel('Load', { exact: true })).toHaveValue('30');

	await modal.getByRole('radio', { name: 'Set', exact: true }).click();
	await expect(modal.getByRole('radio', { name: 'Set', exact: true })).toBeChecked();

	await expect(modal.getByTestId('stale-overrides-banner')).toHaveCount(0);
	await expect(modal.getByTestId('stale-override')).toHaveCount(0);

	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	// And the week saves, which is what the banner claimed it could not do: eight
	// hangs of the one load the coach was reading, in the layout the block
	// declares.
	expect(savedOverrideRows(saved, 2)).toEqual([
		{ item_id: 'item-grid', overrides: { loads: Array.from({ length: 8 }, () => kg(30)) } }
	]);
});

/**
 * The same refused row, naming the layout it was written in. The training
 * declares that same layout, so the row is what the write path judged its six
 * loads against, and the diff omits the field as unchanged.
 */
function refusedSetGridOverride() {
	return [
		{
			id: 'override-1',
			item_id: 'item-grid',
			overrides: {
				granularity: 'set',
				loads: [kg(30), kg(31), kg(32), kg(40), kg(41), kg(42)]
			},
			override_stale: true,
			stale_fields: rowCountRefusal(GRID_STALE_REASON, 'loads')
		}
	];
}

test('keeps a refused grid marked where the training reads back as one row', async ({ page }) => {
	// Krakoer/crimpy#100 round one. The refusal names the layout the row declares
	// as well as the loads, and the row carries both. Whether the week is still
	// asking for them is measured against the training as the write path lays it
	// out, which is the tree the row was diffed against; measured against the tree
	// the editor reads, whose own loads coincide and which therefore reads back as
	// a single row, the layout the row declares looked moved and the refusal read
	// as cleared.
	//
	// So the coach was told the week was clean, the save then PUT six loads onto a
	// block declaring eight rows, and the refusal came back as prose in the save
	// error with nothing on screen marked: this ticket's own failure, one case
	// over.
	await stubTwoWeekProgram(page, refusedSetGridOverride(), flatGridTraining());
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);
	const cover = page.getByTestId('cell:2:1').getByRole('button', {
		name: 'Customised training parameters, week 2, a change stopped applying',
		exact: true
	});
	await cover.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });
	await expect(modal.getByTestId('stale-overrides-banner')).toContainText('One block below');
	const notice = modal.getByTestId('stale-override');
	await expect(notice).toContainText(GRID_STALE_REASON);
	await expect(notice.getByTestId('stale-override-field')).toContainText("this week's loads");

	// An edit to the rest is not the coach answering the refusal, so the block
	// stays marked and the reset stays on offer.
	const rest = modal.getByRole('spinbutton', { name: 'Rest seconds', exact: true });
	await rest.fill('9');
	await rest.blur();
	await expect(modal.getByTestId('stale-overrides-banner')).toContainText('One block below');
	await expect(notice).toContainText(GRID_STALE_REASON);

	await modal.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByTestId('stale-week-2')).toContainText('One session of this week');
	await expect(cover).toBeVisible();

	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	// The six loads the week stored ride out with the rest the coach typed, which
	// is the row the server refused and the reason the marking has to stand.
	expect(savedOverrides(saved, 'item-grid', 2)).toEqual({
		rest_seconds: 9,
		loads: [kg(30), kg(31), kg(32), kg(40), kg(41), kg(42)]
	});
});

/**
 * The same six loads in a row naming no layout of its own, so the layout they
 * are read in is the one the row inherits from the training. It is the shape the
 * merge moved: a row declaring its own layout was already read out over the rows
 * that layout declares, whatever the training's values collapsed to.
 */
function refusedShortGridOverride() {
	return [
		{
			id: 'override-1',
			item_id: 'item-grid',
			overrides: { loads: [kg(30), kg(31), kg(32), kg(40), kg(41), kg(42)] },
			override_stale: true,
			stale_fields: rowCountRefusal(GRID_STALE_REASON, 'loads')
		}
	];
}

test('reads a refused short row out over the rows the block has now', async ({ page }) => {
	// What a coach reads of a row the server refused for holding fewer loads than
	// the block has rows. Krakoer/crimpy#101 moved it, and no other spec looks at
	// it: the sibling above holds the only other short row left and asserts
	// nothing about the screen.
	//
	// The row names no layout, so the merge writes the training out in the one the
	// row inherits from it, eight rows, and the six loads land on the six they
	// were written for. The two rows beyond them are filled from the first hang,
	// which is what the rebuild does with any row the arrays say nothing about.
	// Before, the six landed on the one row the training's own coinciding loads
	// had collapsed to and the coach read the first of them alone.
	//
	// So two of the eight hangs below are hangs nobody wrote, and that is the
	// change. It is the more faithful of the two readings: the wire is untouched,
	// the block carries the server's refusal and the reset that clears it, and six
	// of the eight are what the week does hold, where one of six was not. Pinned
	// here so the next person to move it sees it was chosen.
	await stubTwoWeekProgram(page, refusedShortGridOverride(), flatGridTraining());

	await page.goto(PROGRAM_URL);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await openWeek(page, 2);
	await page
		.getByTestId('cell:2:1')
		.getByRole('button', {
			name: 'Customised training parameters, week 2, a change stopped applying',
			exact: true
		})
		.click();

	const modal = page.getByRole('dialog', { name: 'Week 2 training parameters' });

	// The first set, which is four of the six loads the week wrote.
	await expect(modal.getByTitle('Rep 1: 20mm, HC 30 kg')).toBeVisible();
	await expect(modal.getByTitle('Rep 2: 20mm, HC 31 kg')).toBeVisible();
	await expect(modal.getByTitle('Rep 3: 20mm, HC 32 kg')).toBeVisible();
	await expect(modal.getByTitle('Rep 4: 20mm, HC 40 kg')).toBeVisible();

	// The second set: the last two the week wrote, then the two rows it wrote
	// nothing for, reading the first hang of the row.
	await expect(modal.getByTitle('Rep 1: 20mm, HC 41 kg')).toBeVisible();
	await expect(modal.getByTitle('Rep 2: 20mm, HC 42 kg')).toBeVisible();
	await expect(modal.getByTitle('Rep 3: 20mm, HC 30 kg')).toBeVisible();
	await expect(modal.getByTitle('Rep 4: 20mm, HC 30 kg')).toBeVisible();

	// And the block says the server would not take the row, with the reset that
	// clears it, which is what stops the two padding hangs reading as a
	// prescription.
	await expect(modal.getByTestId('stale-override')).toContainText(GRID_STALE_REASON);
	await expect(
		modal.getByRole('button', { name: 'Reset this block to the training' })
	).toBeVisible();
});

/**
 * The same block over two sets of two reps, one load everywhere, so the editor
 * reads the training itself back as a single row.
 */
function shortFlatGridTraining() {
	return testTraining({
		id: 'training-1',
		title: 'Power endurance block',
		training_type: 'hangboard',
		items: [
			{
				id: 'item-grid',
				type: 'repeater',
				position: 0,
				cycles: 2,
				reps: 2,
				worktime_seconds: 7,
				rest_seconds: 3,
				cycle_rest_seconds: 120,
				hand: 'both',
				granularity: 'set',
				edge_sizes_mm: Array.from({ length: 4 }, () => 20),
				loads: Array.from({ length: 4 }, () => kg(20)),
				hand_positions: [Array.from({ length: 4 }, () => 'HC')]
			}
		]
	});
}

test('claims no customisation where the layout the coach chose is the training', async ({
	page
}) => {
	// The other half of round two: the layout on screen moved, and what the week
	// asks of the server did not, because four hangs of 20 kg is what the training
	// prescribes whichever layout says so. Every one of the week's four loads has
	// to be that hang: a row asking for anything else is a prescription of this
	// week's, which is Krakoer/crimpy#101 and not this. Applying drops the row, so a footer
	// counting the block would claim a customisation the apply then contradicts.
	// Customised for this week is a statement about the week, so it reads off
	// what goes to the server.
	await stubTwoWeekProgram(
		page,
		[
			{
				id: 'override-1',
				item_id: 'item-grid',
				overrides: { loads: Array.from({ length: 4 }, () => kg(20)) }
			}
		],
		shortFlatGridTraining()
	);
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page, 2);
	await expect(modal.getByText('This week runs the training as it is written')).toBeVisible();

	await modal.getByRole('radio', { name: 'Set', exact: true }).click();
	await expect(modal.getByRole('radio', { name: 'Set', exact: true })).toBeChecked();

	await expect(modal.getByText('This week runs the training as it is written')).toBeVisible();
	await expect(modal.getByRole('button', { name: 'Reset to the training' })).toHaveCount(0);
	await expect(modal.getByRole('button', { name: 'Clear customisation' })).toHaveCount(0);

	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	expect(savedOverrideRows(saved, 2)).toEqual([]);
});

test('shows a week whose grid varies over a training whose own grid does not', async ({ page }) => {
	// Krakoer/crimpy#101. The week's row is written against the rows of the layout
	// it declares, and it used to be merged onto the tree the editor reads, which
	// the training's own coinciding loads had already collapsed to a single row.
	// Eight values landed on one row and the coach was shown the first of them, on
	// a week they wrote themselves.
	await stubTwoWeekProgram(page, steppedGridOverride(), flatGridTraining());

	const modal = await openWeekParameters(page, 2);

	// Every hang the week prescribes, read off the session map the way the coach
	// reads it. The first is the one the collapse used to keep.
	await expect(modal.getByTitle('Rep 1: 20mm, HC 20 kg')).toBeVisible();
	await expect(modal.getByTitle('Rep 2: 20mm, HC 21 kg')).toBeVisible();
	await expect(modal.getByTitle('Rep 4: 20mm, HC 23 kg')).toBeVisible();
	await expect(modal.getByTitle('Rep 1: 20mm, HC 24 kg')).toBeVisible();
	await expect(modal.getByTitle('Rep 4: 20mm, HC 27 kg')).toBeVisible();
});

test('keeps the grid of a week whose first load is the one the training prescribes', async ({
	page
}) => {
	// The same bug where nothing showed at all. The week's first load is the
	// training's, so the collapsed row read exactly as the training and the diff
	// came out empty: no badge, a footer saying this week runs the training as it
	// is written, and an apply that sent no row for the block. The three loads the
	// week held went with it, and keepStoredGridArrays could not put them back
	// because nothing had been emitted for it to substitute into.
	await stubTwoWeekProgram(
		page,
		[
			{
				id: 'override-1',
				item_id: 'item-grid',
				overrides: { loads: [kg(20), kg(21), kg(22), kg(23)] }
			}
		],
		shortFlatGridTraining()
	);
	const saved = capture(page, 'PUT', '/api/coach/clients/*/programs/*/weeks/*');

	const modal = await openWeekParameters(page, 2);
	await expect(modal.getByText('This week runs the training as it is written')).toHaveCount(0);
	await expect(modal.getByTitle('Rep 2: 20mm, HC 21 kg')).toBeVisible();
	await expect(modal.getByTitle('Rep 1: 20mm, HC 22 kg')).toBeVisible();
	await expect(modal.getByTitle('Rep 2: 20mm, HC 23 kg')).toBeVisible();
	await expect(modal.getByRole('button', { name: 'Reset to the training' })).toBeVisible();

	// An edit to the rest is what makes the week dirty, and it is the gesture that
	// used to delete the grid: the row that went out carried the rest alone.
	const rest = modal.getByRole('spinbutton', { name: 'Rest seconds', exact: true });
	await rest.fill('9');
	await rest.blur();

	await modal.getByRole('button', { name: 'Apply' }).click();
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();

	expect(savedOverrides(saved, 'item-grid', 2)).toEqual({
		rest_seconds: 9,
		loads: [kg(20), kg(21), kg(22), kg(23)]
	});
});
