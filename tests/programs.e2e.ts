import { expect, test, type Page } from '@playwright/test';
import {
	BUILTIN_MAX_FORCE,
	builtinAssessmentDefinitions,
	capture,
	dragOnto,
	isoDaysAgo,
	mockApi,
	mondayDaysAgo,
	signIn,
	stub,
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
	await stubProgram(page);
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
	await stubProgram(page);
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
	await expect(page.getByTestId('availability:1')).toContainText(
		'has not said when they can train'
	);

	// A read that failed is not a coachee who declared nothing: a coach about to
	// build the week on that silence has to be told which one it is.
	await stub(page, 'GET', '/api/coach/clients/*/availability', { status: 500, body: {} });
	await page.reload();
	await page.getByRole('button', { name: /Wk 1/ }).click();
	await expect(page.getByTestId('availability:1')).toContainText('could not be loaded');
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

	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByText('Program saved')).toBeVisible();
	expect(saves).toHaveLength(1);
	expect(saves[0].body).toMatchObject({
		sessions: [{ id: 'ws-1', training_id: 'training-1', times_per_week: 4 }]
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

test('keeps the session id when it is dragged to another week and back', async ({ page }) => {
	const weekTwo = {
		id: 'week-2',
		program_id: 'program-1',
		week_number: 2,
		notes: '',
		created_at: '',
		updated_at: '',
		sessions: []
	};

	// Both weeks have to be on screen at once for a cross-week drag, so the
	// program is two weeks long and the viewport is tall enough to hold them.
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
	await dragOnto(
		page,
		page.getByTestId('cell:2:0').getByRole('button', { name: 'Power endurance block' }),
		page.getByTestId('cell:1:1')
	);
	await expect(
		page.getByTestId('cell:1:1').getByRole('button', { name: 'Power endurance block' })
	).toBeVisible();
	await page.getByRole('button', { name: 'Save program' }).click();

	await expect(page.getByText('Program saved')).toBeVisible();

	const weekOneSave = saves.find((s) => s.url.endsWith('/weeks/1'));
	expect(weekOneSave?.body).toMatchObject({
		sessions: [{ id: 'ws-1', training_id: 'training-1', day_of_week: 1 }]
	});
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

async function stubTwoWeekProgram(page: Page, secondWeekOverrides: unknown[] = []): Promise<void> {
	const weeks = twoWeeksOfTheSameTraining(secondWeekOverrides);
	await stubProgram(page, testProgram({ duration_weeks: 2, start_date: mondayDaysAgo(0) }));
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', { body: weeks.summaries });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/1', { body: weeks.details[0] });
	await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks/2', { body: weeks.details[1] });
	await stub(page, 'GET', '/api/trainings/*', { body: circuitTraining() });
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
