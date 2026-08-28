import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	BUILTIN_MAX_FORCE,
	builtinAssessmentDefinitions,
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
	await stubProgram(page, testProgram({ duration_weeks: 2 }));
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
	await stubProgram(page, testProgram({ duration_weeks: 2 }));
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

	await stubProgram(page, testProgram({ duration_weeks: 2 }));
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
