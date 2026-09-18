import { expect, test, type Page } from '@playwright/test';
import type { TrainingRequest } from '../src/lib/api/client';
import {
	BUILTIN_CRITICAL_FORCE,
	BUILTIN_ENDURANCE_60,
	builtinAssessmentDefinitions,
	capture,
	dragInto,
	dragOnto,
	exercisePage,
	mockApi,
	signIn,
	stub,
	testAssessmentDefinition,
	testExercise,
	testTag,
	testTraining,
	testUser
} from './fixtures';

const powerEndurance = testTraining();
const morningMobility = testTraining({
	id: 'training-2',
	title: 'Morning mobility',
	description: 'Shoulders and hips',
	training_type: 'stretching'
});

/** A block that needs no exercise lookup, so a stored training is easy to fake. */
const warmupGroup = { id: 'item-1', type: 'group', position: 0, group_title: 'Warmup', items: [] };

/** The training editor fills its exercise palette from the library. */
async function stubEditorPalette(page: Page): Promise<void> {
	await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([testExercise()]) });
	await stub(page, 'GET', '/api/coach/tags', { body: [testTag()] });
}

/**
 * The delete control on a grid card, which is icon-only and named for its row.
 * Matched exactly: the card is itself a role="button" whose accessible name is
 * built from its contents, so it answers to any substring of them.
 */
function deleteButtonOn(page: Page, title: string) {
	return page.getByRole('button', { name: `Delete ${title}`, exact: true });
}

/** The duplicate control on a grid card, likewise icon-only and named. */
function duplicateButtonOn(page: Page, title: string) {
	return page.getByRole('button', { name: `Duplicate ${title}`, exact: true });
}

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	// The editor names the assessment a percentage is read against, and offers
	// the ones measured in the unit of the field it drives.
	await stub(page, 'GET', '/api/assessment-definitions', {
		body: builtinAssessmentDefinitions()
	});
	await signIn(page, testUser());
});

test.describe('training list', () => {
	test('lists the trainings with their type', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings', { body: [powerEndurance, morningMobility] });

		await page.goto('/trainings');

		await expect(page.getByText('Power endurance block')).toBeVisible();
		await expect(page.getByText('Four by four on the steep board')).toBeVisible();
		await expect(page.getByText('Morning mobility')).toBeVisible();
	});

	test('shows the empty state when nothing has been built yet', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings', { body: [] });

		await page.goto('/trainings');

		await expect(page.getByText('No trainings yet')).toBeVisible();
	});

	test('filters the list by training type', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings', { body: [powerEndurance, morningMobility] });

		await page.goto('/trainings');
		await page.getByRole('button', { name: 'Stretching', exact: true }).click();

		await expect(page.getByText('Morning mobility')).toBeVisible();
		await expect(page.getByText('Power endurance block')).toBeHidden();
	});

	test('filters the list by title', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings', { body: [powerEndurance, morningMobility] });

		await page.goto('/trainings');
		await page.getByPlaceholder('Search trainings...').fill('mobility');

		await expect(page.getByText('Morning mobility')).toBeVisible();
		await expect(page.getByText('Power endurance block')).toBeHidden();
	});

	test('tells the coach when the filters match nothing', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings', { body: [powerEndurance] });

		await page.goto('/trainings');
		await page.getByPlaceholder('Search trainings...').fill('nothing here');

		await expect(page.getByText('No results for your current filters.')).toBeVisible();
	});

	test('deletes a training only after the confirmation step', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings', { body: [powerEndurance] });
		await stub(page, 'DELETE', '/api/trainings/*', { body: { message: 'deleted' } });
		const deletes = capture(page, 'DELETE', '/api/trainings/*');

		await page.goto('/trainings');
		await deleteButtonOn(page, 'Power endurance block').click();

		expect(deletes).toHaveLength(0);

		await page.getByRole('button', { name: 'Confirm', exact: true }).click();

		await expect(page.getByText('Training deleted')).toBeVisible();
		await expect(page.getByText('Power endurance block')).toBeHidden();
		expect(deletes).toHaveLength(1);
		expect(deletes[0].url).toContain('/api/trainings/training-1');
	});

	test('duplicates a training and opens the copy', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings', { body: [powerEndurance] });
		await stub(page, 'GET', '/api/trainings/*', {
			body: { ...powerEndurance, items: [warmupGroup] }
		});
		await stub(page, 'POST', '/api/trainings', {
			body: testTraining({ id: 'training-9', title: 'Power endurance block (copy)' })
		});
		await stubEditorPalette(page);
		const posted = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings');
		await duplicateButtonOn(page, 'Power endurance block').click();

		// The copy is where the coach lands, because duplicating is the first step
		// of editing a variation.
		await expect(page).toHaveURL(/\/trainings\/training-9$/);
		await expect(page.getByText('Duplicated as "Power endurance block (copy)"')).toBeVisible();

		expect(posted).toHaveLength(1);
		const body = posted[0].body as TrainingRequest;
		expect(body.title).toBe('Power endurance block (copy)');
		expect(body.training_type).toBe(powerEndurance.training_type);
		expect(body.items).toHaveLength(1);
		// An id on a write means keep this row, and a copy keeps nothing.
		expect(JSON.stringify(body.items)).not.toContain('"id"');
	});

	// Two copies of one training have to be tellable apart in the library, which
	// is the whole reason the suffix is numbered rather than repeated.
	test('numbers the copy when one already exists', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings', {
			body: [
				powerEndurance,
				testTraining({ id: 'training-3', title: 'Power endurance block (copy)' })
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: powerEndurance });
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stubEditorPalette(page);
		const posted = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings');
		await duplicateButtonOn(page, 'Power endurance block').first().click();

		await expect.poll(() => posted.length).toBe(1);
		expect((posted[0].body as TrainingRequest).title).toBe('Power endurance block (copy 2)');
	});

	// The assessment a training measures is a row of its own, so the copy needs a
	// second write or it looks like a duplicate and does not run like one.
	test('carries the assessment of an assessment training', async ({ page }) => {
		const assessed = testTraining({
			id: 'training-4',
			title: 'Max hang',
			assessment: testAssessmentDefinition({
				id: 'assessment-1',
				label: 'Max hang',
				prompt: 'How long did you hang?',
				unit: 'seconds',
				per_hand: true
			})
		});
		await stub(page, 'GET', '/api/trainings', { body: [assessed] });
		await stub(page, 'GET', '/api/trainings/*', { body: assessed });
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'POST', '/api/assessment-definitions', {
			body: testAssessmentDefinition({ id: 'assessment-2' })
		});
		await stubEditorPalette(page);
		const definitions = capture(page, 'POST', '/api/assessment-definitions');

		await page.goto('/trainings');
		await duplicateButtonOn(page, 'Max hang').click();

		await expect.poll(() => definitions.length).toBe(1);
		expect(definitions[0].body).toMatchObject({
			training_id: 'training-9',
			label: 'Max hang (copy)',
			prompt: 'How long did you hang?',
			unit: 'seconds',
			per_hand: true
		});
	});

	// The training is already created by the time the assessment write fails, so
	// the copy is real and the coach is told what is missing from it rather than
	// being handed a silent half copy.
	test('says so when the assessment cannot be carried across', async ({ page }) => {
		const assessed = testTraining({
			id: 'training-4',
			title: 'Max hang',
			assessment: testAssessmentDefinition({ id: 'assessment-1', label: 'Max hang' })
		});
		await stub(page, 'GET', '/api/trainings', { body: [assessed] });
		await stub(page, 'GET', '/api/trainings/*', { body: assessed });
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'POST', '/api/assessment-definitions', {
			status: 500,
			body: { error: 'the database is having a moment' }
		});
		await stubEditorPalette(page);

		await page.goto('/trainings');
		await duplicateButtonOn(page, 'Max hang').click();

		await expect(page.getByText(/its assessment did not come across/)).toBeVisible();
		await expect(page).toHaveURL(/\/trainings\/training-9$/);
	});

	// The card is a role="button" that opens the training, and the controls on it
	// are buttons inside that. Without the same guard the click handler has, Enter
	// on Duplicate opens the original before the copy exists, and a failed copy
	// leaves the coach in the wrong training.
	// Asserted through a refused copy on purpose. When the copy succeeds both
	// behaviours end on the copy, because its goto lands second and wins, so the
	// missing guard is invisible. It is a failed duplicate that shows it: the
	// coach is left sitting in the original they never asked to open.
	test('leaves the coach on the list when a keyboard duplicate is refused', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings', { body: [powerEndurance] });
		await stub(page, 'GET', '/api/trainings/*', { body: powerEndurance });
		await stub(page, 'POST', '/api/trainings', {
			status: 500,
			body: { error: 'Failed to create training' }
		});

		await page.goto('/trainings');
		await duplicateButtonOn(page, 'Power endurance block').focus();
		await page.keyboard.press('Enter');

		await expect(page.getByText('Failed to create training')).toBeVisible();
		await expect(page).toHaveURL(/\/trainings$/);
		// Every Duplicate is disabled while one is in flight, which blurs the
		// button the coach pressed. On this path they stay here, so it is handed
		// back rather than leaving them to Tab in from the top of the sidebar.
		await expect(duplicateButtonOn(page, 'Power endurance block')).toBeFocused();
	});

	// The definition list is loaded once and shared, so a copy's assessment that
	// never reaches it cannot be prescribed until the tab is reloaded.
	test('makes the carried assessment available to prescribe at once', async ({ page }) => {
		const assessed = testTraining({
			id: 'training-4',
			title: 'Max hang',
			assessment: testAssessmentDefinition({ id: 'assessment-1', label: 'Max hang' })
		});
		await stub(page, 'GET', '/api/trainings', { body: [assessed] });
		await stub(page, 'GET', '/api/trainings/*', { body: assessed });
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'POST', '/api/assessment-definitions', {
			body: testAssessmentDefinition({ id: 'assessment-2' })
		});
		await stubEditorPalette(page);
		const reads = capture(page, 'GET', '/api/assessment-definitions');

		// The catalog is cached in module state, so this has to stay inside one
		// document: a page.goto would reload the app and clear the cache, and the
		// copy's editor would fetch the list again whatever this PR does. So the
		// editor is opened and left through the sidebar, which is client side
		// navigation, and is the path a coach takes anyway.
		await page.goto('/trainings');
		await page.getByText('Max hang').first().click();
		await expect(page).toHaveURL(/\/trainings\/training-4$/);
		await expect.poll(() => reads.length).toBe(1);

		// The sidebar link and the breadcrumb are both named "Trainings".
		await page.getByRole('button', { name: 'Trainings', exact: true }).first().click();
		await expect(page).toHaveURL(/\/trainings$/);
		await duplicateButtonOn(page, 'Max hang').click();
		await expect(page).toHaveURL(/\/trainings\/training-9$/);

		// Read again after the write, rather than serving every picker the list the
		// catalog had cached before the copy's assessment existed.
		await expect.poll(() => reads.length).toBeGreaterThan(1);
	});

	test('reports the server error when a duplicate fails', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings', { body: [powerEndurance] });
		await stub(page, 'GET', '/api/trainings/*', { body: powerEndurance });
		await stub(page, 'POST', '/api/trainings', {
			status: 500,
			body: { error: 'Failed to create training' }
		});

		await page.goto('/trainings');
		await duplicateButtonOn(page, 'Power endurance block').click();

		await expect(page.getByText('Failed to create training')).toBeVisible();
		await expect(page).toHaveURL(/\/trainings$/);
	});

	test('reports the server error when a delete fails', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings', { body: [powerEndurance] });
		await stub(page, 'DELETE', '/api/trainings/*', {
			status: 409,
			body: { error: 'Training is used by a program' }
		});

		await page.goto('/trainings');
		await deleteButtonOn(page, 'Power endurance block').click();
		await page.getByRole('button', { name: 'Confirm', exact: true }).click();

		await expect(page.getByText('Training is used by a program')).toBeVisible();
		await expect(page.getByText('Power endurance block')).toBeVisible();
	});

	test('opens a training from the list', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings', { body: [powerEndurance] });
		await stub(page, 'GET', '/api/trainings/*', { body: powerEndurance });
		await stubEditorPalette(page);

		await page.goto('/trainings');
		await page.getByText('Power endurance block').click();

		await expect(page).toHaveURL('/trainings/training-1');
	});
});

test.describe('training editor', () => {
	test('creates a training and lands on its editor', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings', { body: [] });
		await stubEditorPalette(page);
		await stub(page, 'POST', '/api/trainings', {
			body: testTraining({ id: 'training-9', title: 'Board intervals' })
		});
		await stub(page, 'GET', '/api/trainings/*', {
			body: testTraining({ id: 'training-9', title: 'Board intervals' })
		});
		const posted = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Board intervals');
		await page.getByPlaceholder('Training goal...').fill('Anaerobic capacity');
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training created')).toBeVisible();
		await expect(page).toHaveURL('/trainings/training-9');
		expect(posted).toHaveLength(1);
		expect(posted[0].body).toMatchObject({
			title: 'Board intervals',
			goal: 'Anaerobic capacity',
			training_type: 'workout'
		});
	});

	test('will not save a new training without a title', async ({ page }) => {
		await stubEditorPalette(page);

		await page.goto('/trainings/new');

		await expect(page.getByRole('button', { name: 'Save training' })).toBeDisabled();
		await page.getByPlaceholder('Training title').first().fill('Board intervals');
		await expect(page.getByRole('button', { name: 'Save training' })).toBeEnabled();
	});

	test('sends the chosen training type', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'GET', '/api/trainings/*', { body: testTraining({ id: 'training-9' }) });
		const posted = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Stretch flow');
		await page.getByRole('button', { name: 'Stretching' }).click();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect.poll(() => posted.length).toBe(1);
		expect(posted[0].body).toMatchObject({ training_type: 'stretching' });
	});

	// Log only used to be implied by the climbing type, which meant a coach could
	// not have a climbing session with exercises nor a log-only workout.
	test('saves a log only training with no items, whatever its type', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'GET', '/api/trainings/*', { body: testTraining({ id: 'training-9' }) });
		const posted = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Long run');
		await page.getByRole('button', { name: 'Other' }).click();
		await page.getByRole('checkbox').first().check();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect.poll(() => posted.length).toBe(1);
		expect(posted[0].body).toMatchObject({ training_type: 'other', items: [] });
	});

	test('keeps the items of a climbing training that is not log only', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'GET', '/api/trainings/*', { body: testTraining({ id: 'training-9' }) });
		const posted = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Board session');
		await page.getByRole('button', { name: 'Climbing' }).click();
		await page.getByTestId('block-palette').getByRole('button', { name: 'Hang rep' }).click();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect.poll(() => posted.length).toBe(1);
		expect(posted[0].body).toMatchObject({ training_type: 'climbing' });
		expect((posted[0].body as TrainingRequest).items).toHaveLength(1);
	});

	test('reports the server error when a create fails', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'POST', '/api/trainings', {
			status: 500,
			body: { error: 'Could not store the training' }
		});

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Board intervals');
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Could not store the training')).toBeVisible();
		await expect(page).toHaveURL('/trainings/new');
	});

	test('opens an existing training read only', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings/*', { body: powerEndurance });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');

		await expect(
			page.getByRole('heading', { name: 'Power endurance block', level: 2 })
		).toBeVisible();
		await expect(page.getByText('Four by four on the steep board')).toBeVisible();
		await expect(page.getByPlaceholder('Training title')).toHaveCount(0);
		await expect(page).toHaveTitle('Power endurance block - Crimpy');
	});

	test('reveals the form once editing starts', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings/*', { body: powerEndurance });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		await expect(page.getByPlaceholder('Training title').first()).toHaveValue(
			'Power endurance block'
		);
		await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
	});

	test('marks the tab title as unsaved until the edit is saved', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings/*', { body: powerEndurance });
		await stub(page, 'PUT', '/api/trainings/*', { body: powerEndurance });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByPlaceholder('Training title').first().fill('Power endurance v2');

		await expect(page).toHaveTitle('Power endurance v2 * - Crimpy');

		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		await expect(page).toHaveTitle('Power endurance v2 - Crimpy');
		expect(updates).toHaveLength(1);
		expect(updates[0].body).toMatchObject({ title: 'Power endurance v2' });
	});

	// A training is log only when it has no items, whatever its type, so the
	// editor has to key its layout off that rather than off the climbing type.
	test('shows the comment of a log only training instead of an empty preview', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings/*', {
			body: testTraining({
				training_type: 'other',
				items: [],
				comment: 'Ten kilometres, easy pace'
			})
		});
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');

		await expect(page.getByText('Ten kilometres, easy pace')).toBeVisible();
	});

	test('edits the comment of a log only training', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings/*', {
			body: testTraining({ training_type: 'other', items: [], comment: 'Ten kilometres' })
		});
		await stub(page, 'PUT', '/api/trainings/*', { body: testTraining() });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByPlaceholder(/Describe the session/).fill('Twelve kilometres');
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		expect(updates[0].body).toMatchObject({ comment: 'Twelve kilometres', items: [] });
	});

	test('opens a climbing training that has items in the full editor', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings/*', {
			body: testTraining({ training_type: 'climbing', items: [warmupGroup] })
		});
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		await expect(page.getByTestId('block-palette')).toBeVisible();
	});

	test('saves the items a coach adds to a training that is not log only', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings/*', {
			body: testTraining({ training_type: 'climbing', items: [warmupGroup] })
		});
		await stub(page, 'PUT', '/api/trainings/*', { body: testTraining() });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByTestId('block-palette').getByRole('button', { name: 'Hang rep' }).click();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		expect((updates[0].body as TrainingRequest).items).toHaveLength(2);
	});

	test('drops the items once log only is ticked and marks the training unsaved', async ({
		page
	}) => {
		await stub(page, 'GET', '/api/trainings/*', {
			body: testTraining({ items: [warmupGroup] })
		});
		await stub(page, 'PUT', '/api/trainings/*', { body: testTraining() });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

		await page.getByRole('checkbox').first().check();

		await expect(page.getByRole('button', { name: 'Save training' })).toBeVisible();

		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		expect(updates[0].body).toMatchObject({ items: [] });
	});

	test('saves an EMOM the coach builds, with its rounds and its interval', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings/*', {
			body: testTraining({ training_type: 'climbing', items: [warmupGroup] })
		});
		await stub(page, 'PUT', '/api/trainings/*', { body: testTraining() });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByTestId('block-palette').getByRole('button', { name: 'EMOM' }).click();

		await page.getByLabel('Rounds').fill('10');
		await page.getByLabel('Interval minutes').fill('1');
		await page.getByLabel('Interval seconds').fill('0');

		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		expect((updates[0].body as TrainingRequest).items?.[1]).toMatchObject({
			type: 'emom',
			cycles: 10,
			interval_seconds: 60
		});
	});

	test('saves an exercise whose rep count the coach left open', async ({ page }) => {
		const pullUps = {
			id: 'item-2',
			type: 'exercise',
			position: 0,
			exercise_id: 'exercise-1',
			reps: 5,
			rest_seconds: 0
		};
		await stub(page, 'GET', '/api/trainings/*', {
			body: testTraining({ training_type: 'climbing', items: [pullUps] })
		});
		await stub(page, 'PUT', '/api/trainings/*', { body: testTraining() });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		await page.getByTestId('amrap-toggle').click();
		await expect(page.getByText('As many as possible')).toBeVisible();

		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		expect((updates[0].body as TrainingRequest).items?.[0]).toMatchObject({
			type: 'exercise',
			reps_is_max: true
		});
	});

	// An emom belongs at the top of a session or inside a group that is. Nested
	// under a circuit it would start its rounds on a clock inside rounds that do
	// not, which is two paces for one block.
	test('offers the EMOM block in a root group but not in one inside a circuit', async ({
		page
	}) => {
		const nested = {
			id: 'item-3',
			type: 'circuit',
			position: 0,
			cycles: 3,
			items: [{ id: 'item-4', type: 'group', position: 0, group_title: 'Inner', items: [] }]
		};
		await stub(page, 'GET', '/api/trainings/*', {
			body: testTraining({
				training_type: 'climbing',
				items: [nested, { ...warmupGroup, id: 'item-5' }]
			})
		});
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		// The right rail carries a palette of its own, and it comes after the item
		// list, so the add zone's is the first one on the page.
		const addZonePalette = page.getByTestId('block-palette').first();

		// The group inside the circuit takes leaf blocks only. Its add zone is the
		// innermost, so it is the first Add item on the page.
		await page.getByRole('button', { name: 'Add item' }).first().click();
		await expect(addZonePalette.getByRole('button', { name: 'Hang rep' })).toBeVisible();
		await expect(addZonePalette.getByRole('button', { name: 'EMOM' })).toBeHidden();
		await addZonePalette.getByText('Cancel').click();

		// The group at the root takes one. Its add zone follows the circuit's.
		await page.getByRole('button', { name: 'Add item' }).nth(2).click();
		await expect(addZonePalette.getByRole('button', { name: 'EMOM' })).toBeVisible();
	});

	test('deletes a training from the editor and returns to the list', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings/*', { body: powerEndurance });
		await stub(page, 'GET', '/api/trainings', { body: [] });
		await stub(page, 'DELETE', '/api/trainings/*', { body: { message: 'deleted' } });
		await stubEditorPalette(page);
		const deletes = capture(page, 'DELETE', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('button', { name: 'Delete training' }).click();

		expect(deletes).toHaveLength(0);

		await page.getByRole('button', { name: 'Confirm delete' }).click();

		await expect(page).toHaveURL('/trainings');
		await expect(page.getByText('Training deleted')).toBeVisible();
		expect(deletes).toHaveLength(1);
	});
});

const kg = (value: number) => ({ value, unit: 'kg' });

/** A hangboard item stored as one row per rep, the same rows in every set. */
function hangboardItem(overrides: Record<string, unknown> = {}) {
	return {
		id: 'item-1',
		type: 'repeater',
		position: 0,
		cycles: 2,
		reps: 2,
		worktime_seconds: 7,
		rest_seconds: 3,
		cycle_rest_seconds: 120,
		hand: 'both',
		granularity: 'rep',
		edge_sizes_mm: [20, 18],
		loads: [kg(10), kg(12)],
		hand_positions: [['HC', 'FC']],
		...overrides
	};
}

/** An item whose sets differ but whose reps do not: set 1 hangs 20mm, set 2 15mm. */
function perSetHangboardItem(overrides: Record<string, unknown> = {}) {
	return hangboardItem({
		granularity: 'set',
		edge_sizes_mm: [20, 20, 15, 15],
		loads: [kg(10), kg(10), kg(14), kg(14)],
		hand_positions: [['HC', 'HC', 'OC', 'OC']],
		...overrides
	});
}

/** An item that hangs the same configuration from the first rep to the last. */
function uniformHangboardItem(overrides: Record<string, unknown> = {}) {
	return hangboardItem({
		granularity: 'uniform',
		edge_sizes_mm: [20],
		loads: [{ value: 100, unit: 'percent_bw' }],
		hand_positions: [['HC']],
		...overrides
	});
}

/** The rep tiles of the session map, in set then rep order. */
function stepTiles(page: Page) {
	return page.locator('.hb-step');
}

function edgeField(page: Page) {
	return page.getByRole('spinbutton', { name: 'Edge (mm)' });
}

function loadField(page: Page) {
	return page.getByRole('spinbutton', { name: 'Load', exact: true });
}

function editingHands(page: Page) {
	return page.getByRole('radiogroup', { name: 'Hand being edited' });
}

/** Opens the training editor on a single hangboard item and captures its saves. */
async function openHangboardEditor(page: Page, item: Record<string, unknown>) {
	const training = testTraining({ items: [item] });
	await stub(page, 'GET', '/api/trainings/*', { body: training });
	await stub(page, 'PUT', '/api/trainings/*', { body: training });
	await stubEditorPalette(page);
	const updates = capture(page, 'PUT', '/api/trainings/*');

	await page.goto('/trainings/training-1');
	await page.getByRole('button', { name: 'Edit' }).click();

	return updates;
}

async function saveTraining(page: Page) {
	await page.getByRole('button', { name: 'Save training' }).click();
	await expect(page.getByText('Training saved')).toBeVisible();
}

function savedHangboardItem(updates: ReturnType<typeof capture>) {
	expect(updates).toHaveLength(1);
	return (updates[0].body as { items: Record<string, unknown>[] }).items[0];
}

test.describe('hangboard session map', () => {
	test('reads a set-by-set item back as one tile per set', async ({ page }) => {
		const training = testTraining({ items: [perSetHangboardItem()] });
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');

		await expect(page.getByText('VARIES BY SET')).toBeVisible();
		await expect(stepTiles(page)).toHaveCount(2);
		await expect(page.getByText('15mm')).toBeVisible();
	});

	test('shows values on the customised reps only', async ({ page }) => {
		await openHangboardEditor(page, hangboardItem());

		await expect(stepTiles(page)).toHaveCount(4);
		await expect(page.locator('.hb-step.hb-custom')).toHaveCount(2);
		await expect(page.getByText('18mm').first()).toBeVisible();
	});

	test('resizes the map on the committed set count, not on every keystroke', async ({ page }) => {
		await openHangboardEditor(page, perSetHangboardItem());

		const sets = page.getByRole('spinbutton', { name: 'Sets' });
		await sets.selectText();
		await sets.pressSequentially('12');

		await expect(stepTiles(page)).toHaveCount(2);

		await sets.blur();

		await expect(page.getByText('Set 12', { exact: true })).toBeVisible();
		await expect(stepTiles(page)).toHaveCount(12);
	});
});

test.describe('hangboard editing', () => {
	// The base is what every rep falls back to, so moving it has to carry the
	// reps that were sitting on it and leave the customised ones alone.
	test('carries the reps sitting on the base when the base is edited', async ({ page }) => {
		const updates = await openHangboardEditor(page, hangboardItem());

		await edgeField(page).fill('25');
		await edgeField(page).blur();
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			granularity: 'set',
			edge_sizes_mm: [25, 18, 25, 18]
		});
	});

	test('applies an edit to the selected set only', async ({ page }) => {
		const updates = await openHangboardEditor(page, perSetHangboardItem());

		await stepTiles(page).nth(1).click();

		await expect(page.locator('.hb-inspector-title')).toHaveText('Set 2');

		await edgeField(page).fill('25');
		await edgeField(page).blur();
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({ edge_sizes_mm: [20, 20, 25, 25] });
	});

	test('copies a set into the sets below it', async ({ page }) => {
		const updates = await openHangboardEditor(page, perSetHangboardItem());

		await page.getByRole('button', { name: 'Copy this set into the sets below' }).click();
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			edge_sizes_mm: [20, 20, 20, 20],
			loads: [kg(10), kg(10), kg(10), kg(10)]
		});
	});

	test('copies a set and pastes it onto another from the keyboard', async ({ page }) => {
		const updates = await openHangboardEditor(page, perSetHangboardItem());

		await stepTiles(page).nth(0).click();
		await page.keyboard.press('ControlOrMeta+c');
		await stepTiles(page).nth(1).click();
		await page.keyboard.press('ControlOrMeta+v');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			edge_sizes_mm: [20, 20, 20, 20],
			loads: [kg(10), kg(10), kg(10), kg(10)]
		});
	});

	test('resets a customised rep to the base from the keyboard', async ({ page }) => {
		const updates = await openHangboardEditor(page, hangboardItem());

		await page.locator('.hb-step.hb-custom').first().click();
		await page.keyboard.press('Backspace');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			edge_sizes_mm: [20, 20, 20, 18],
			loads: [kg(10), kg(10), kg(10), kg(12)]
		});
	});

	test('clears the selection with Escape', async ({ page }) => {
		await openHangboardEditor(page, perSetHangboardItem());

		await stepTiles(page).nth(0).click();

		await expect(page.locator('.hb-inspector-title')).toHaveText('Set 1');

		await page.keyboard.press('Escape');

		await expect(page.locator('.hb-inspector-title')).toHaveText('Base configuration');
	});
});

test.describe('hangboard variation', () => {
	test('asks before dropping the customised reps', async ({ page }) => {
		const updates = await openHangboardEditor(page, hangboardItem());

		await page.getByRole('radio', { name: 'Nothing' }).click();

		await expect(page.getByText('clears 2 customised reps')).toBeVisible();

		await page.getByRole('button', { name: 'Continue' }).click();

		await expect(stepTiles(page)).toHaveCount(0);

		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			granularity: 'uniform',
			edge_sizes_mm: [20],
			loads: [kg(10)],
			hand_positions: [['HC']]
		});
	});

	test('keeps the customised reps when the change is cancelled', async ({ page }) => {
		await openHangboardEditor(page, hangboardItem());

		await page.getByRole('radio', { name: 'Nothing' }).click();
		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect(stepTiles(page)).toHaveCount(4);
	});

	test('makes every rep of a set follow its first rep when varying by set', async ({ page }) => {
		const updates = await openHangboardEditor(page, hangboardItem());

		await page.getByRole('radio', { name: 'Set', exact: true }).click();

		await expect(page.getByText('follow the first rep of its set')).toBeVisible();

		await page.getByRole('button', { name: 'Continue' }).click();
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			granularity: 'set',
			edge_sizes_mm: [20, 20, 20, 20],
			loads: [kg(10), kg(10), kg(10), kg(10)]
		});
	});

	test('expands a single configuration into a map when varying by rep', async ({ page }) => {
		await openHangboardEditor(page, uniformHangboardItem());

		await expect(stepTiles(page)).toHaveCount(0);

		await page.getByRole('radio', { name: 'Rep', exact: true }).click();

		await expect(stepTiles(page)).toHaveCount(4);
	});

	// Editing every rep through a selection moves what the item prescribes, so
	// the base has to follow: collapsing back to one configuration keeps the
	// value the reps hold, and has nothing to warn about since none of them
	// departs from it.
	test('keeps the configuration the reps hold when collapsing to one', async ({ page }) => {
		const updates = await openHangboardEditor(page, uniformHangboardItem());

		await page.getByRole('radio', { name: 'Rep', exact: true }).click();
		await page.getByRole('button', { name: 'Select all' }).click();
		await edgeField(page).fill('25');
		await edgeField(page).blur();

		await expect(page.locator('.hb-step.hb-custom')).toHaveCount(0);

		await page.getByRole('radio', { name: 'Nothing' }).click();

		await expect(page.getByRole('alertdialog', { name: 'Confirm the change' })).toBeHidden();
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			granularity: 'uniform',
			edge_sizes_mm: [25]
		});
	});

	// An edit that moves every rep together leaves nothing customised, so the
	// warning and its pending change have to go with it.
	test('drops the confirm bar when the mode it warned about is reselected', async ({ page }) => {
		await openHangboardEditor(page, hangboardItem());

		await page.getByRole('radio', { name: 'Set', exact: true }).click();
		await expect(page.getByRole('alertdialog', { name: 'Confirm the change' })).toBeVisible();

		await page.getByRole('radio', { name: 'Rep', exact: true }).click();

		await expect(page.getByRole('alertdialog', { name: 'Confirm the change' })).toBeHidden();
		await expect(stepTiles(page)).toHaveCount(4);
	});

	// The map shows one tile per set in this mode, so a warning that counted the
	// reps behind them would name something the coach cannot see.
	test('counts sets rather than reps when varying by set', async ({ page }) => {
		await openHangboardEditor(page, perSetHangboardItem());

		await page.getByRole('radio', { name: 'Nothing' }).click();

		await expect(page.getByText('clears 1 customised set')).toBeVisible();
	});
});

test.describe('hangboard grid size', () => {
	// Shrinking the grid deletes configurations the coach entered, which is a
	// larger loss than the one the variation control already guards.
	test('asks before dropping the sets a shrink would delete', async ({ page }) => {
		await openHangboardEditor(page, perSetHangboardItem());

		await page.getByRole('spinbutton', { name: 'Sets' }).fill('1');
		await page.getByRole('spinbutton', { name: 'Sets' }).blur();

		await expect(page.getByText('Dropping to 1 sets deletes 1 customised set')).toBeVisible();

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect(stepTiles(page)).toHaveCount(2);
		await expect(page.getByRole('spinbutton', { name: 'Sets' })).toHaveValue('2');
	});

	// Growing never loses anything, so it must not stop to ask.
	test('grows the grid without asking', async ({ page }) => {
		await openHangboardEditor(page, perSetHangboardItem());

		await page.getByRole('spinbutton', { name: 'Sets' }).fill('3');
		await page.getByRole('spinbutton', { name: 'Sets' }).blur();

		await expect(page.getByRole('alertdialog', { name: 'Confirm the change' })).toBeHidden();
		await expect(stepTiles(page)).toHaveCount(3);
	});

	// A program week now builds its request in the layout the item is declared in
	// rather than in the one the editor reads it in. A training has no week to
	// diff against: the item it holds is the declaration, so the editor's layout
	// is what it saves, and a set-by-set item whose rows all agree is still saved
	// as the one row the coach was shown.
	test('saves an item whose rows all agree as the one row it reads as', async ({ page }) => {
		const updates = await openHangboardEditor(
			page,
			perSetHangboardItem({
				edge_sizes_mm: [20, 20, 20, 20],
				loads: [kg(10), kg(10), kg(10), kg(10)],
				hand_positions: [['HC', 'HC', 'HC', 'HC']]
			})
		);

		await expect(stepTiles(page)).toHaveCount(0);

		await loadField(page).fill('12');
		await loadField(page).blur();
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			granularity: 'uniform',
			edge_sizes_mm: [20],
			loads: [kg(12)],
			hand_positions: [['HC']]
		});
	});
});

test.describe('hangboard hand modes', () => {
	test('describes what the selected hand mode does', async ({ page }) => {
		await openHangboardEditor(page, hangboardItem());

		await expect(page.getByText('Both hands on the board at once')).toBeVisible();

		await page.getByRole('radio', { name: 'Alternate', exact: true }).click();

		await expect(page.getByText('Right then left within each rep')).toBeVisible();
	});

	// The alternating mode is the one the app used to store as 'both', so it has
	// to survive a round trip under its own name.
	test('saves the alternating mode without splitting the loads', async ({ page }) => {
		const updates = await openHangboardEditor(page, hangboardItem());

		await page.getByRole('radio', { name: 'Alternate', exact: true }).click();
		await saveTraining(page);

		const item = savedHangboardItem(updates);
		expect(item).toMatchObject({
			hand: 'alternate',
			granularity: 'set',
			edge_sizes_mm: [20, 18, 20, 18],
			loads: [kg(10), kg(12), kg(10), kg(12)]
		});
		expect(item.left_loads).toHaveLength(4);
		expect(item.hand_positions).toEqual([
			['HC', 'FC', 'HC', 'FC'],
			['HC', 'FC', 'HC', 'FC']
		]);
	});

	// Splitting the hands must never interleave the two into loads: each hand
	// keeps its own array of one entry per row.
	test('writes to the hand the inspector is scoped to', async ({ page }) => {
		const updates = await openHangboardEditor(page, hangboardItem({ hand: 'split' }));

		await expect(page.getByText('Applies everywhere unless customised, both hands')).toBeVisible();

		await editingHands(page).getByRole('radio', { name: 'Left' }).click();

		await expect(page.getByText('Applies everywhere unless customised, left hand')).toBeVisible();

		await loadField(page).fill('5');
		await loadField(page).blur();
		await saveTraining(page);

		const item = savedHangboardItem(updates);
		expect(item).toMatchObject({ hand: 'split', granularity: 'set' });
		expect(item.left_loads).toMatchObject([kg(5), kg(12), kg(5), kg(12)]);
		expect(item.loads).toMatchObject([kg(10), kg(12), kg(10), kg(12)]);
	});

	// The left hand offers the same assessment-relative unit as the right, so a
	// percentage set there has to carry the reference the API requires of it.
	test('gives a left-hand assessment load its assessment reference', async ({ page }) => {
		const updates = await openHangboardEditor(
			page,
			uniformHangboardItem({
				hand: 'split',
				loads: [kg(10)],
				left_loads: [kg(10)],
				hand_positions: [['HC'], ['HC']]
			})
		);

		await editingHands(page).getByRole('radio', { name: 'Left' }).click();
		await page.getByRole('combobox', { name: 'Load unit' }).selectOption('percent_assessment');
		await saveTraining(page);

		const item = savedHangboardItem(updates);
		const [leftLoad] = item.left_loads as Record<string, unknown>[];
		expect(leftLoad.unit).toBe('percent_assessment');
		expect(leftLoad.assessment_id).toBeDefined();
		expect(leftLoad.fallback).toBeDefined();
	});

	// Going back to a mode that hangs both hands together drops the second
	// configuration rather than leaving a stale left hand behind. It is a loss
	// the coach cannot undo, so it is confirmed first.
	test('drops the left-hand arrays when leaving a split mode', async ({ page }) => {
		const updates = await openHangboardEditor(
			page,
			hangboardItem({
				hand: 'split',
				left_loads: [kg(5), kg(6)],
				hand_positions: [
					['HC', 'FC'],
					['OC', '3FD']
				]
			})
		);

		await page
			.getByRole('radiogroup', { name: 'Hands' })
			.getByRole('radio', { name: 'Both' })
			.click();
		await expect(page.getByRole('alertdialog', { name: 'Confirm the change' })).toContainText(
			'left hand'
		);
		await page.getByRole('button', { name: 'Continue' }).click();
		await saveTraining(page);

		const item = savedHangboardItem(updates);
		expect(item).toMatchObject({ hand: 'both' });
		expect(item.left_loads).toBeUndefined();
		expect(item.hand_positions).toHaveLength(1);
	});
});

test.describe('hangboard base configuration', () => {
	// The base is the whole prescription of an item that varies nothing. What the
	// coach types has to be what gets saved.
	test('saves the edge, load and grip typed in the inspector', async ({ page }) => {
		const updates = await openHangboardEditor(page, uniformHangboardItem());

		await edgeField(page).fill('25');
		await loadField(page).fill('80');
		await page.getByRole('radio', { name: 'OC' }).click();
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			granularity: 'uniform',
			edge_sizes_mm: [25],
			loads: [{ value: 80, unit: 'percent_bw' }],
			hand_positions: [['OC']]
		});
	});

	// The Max unit has no value input, so it only reaches the item through the
	// same path the numbers take.
	test('flags the item as max effort from the load unit', async ({ page }) => {
		const updates = await openHangboardEditor(page, uniformHangboardItem());

		await page.getByRole('combobox', { name: 'Load unit' }).selectOption('max');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			load_is_max: true,
			loads: [{ unit: 'max' }]
		});
	});
});

test.describe('hangboard items stored in an older shape', () => {
	// The API validates every configuration array on its own and accepts an
	// absent one, so a two-handed item can arrive with no left_loads at all.
	// Rebuilding must give the left hand each rep's own load, not rep 0 for all.
	test('gives the left hand its per-rep load when left_loads is missing', async ({ page }) => {
		const updates = await openHangboardEditor(
			page,
			hangboardItem({ hand: 'alternate', left_loads: undefined })
		);

		// Rebuilding an item is not an edit, so there is nothing to save until
		// the coach changes something. The rest between reps touches no load.
		await page.getByRole('spinbutton', { name: 'Rest seconds', exact: true }).fill('4');
		await saveTraining(page);

		expect(savedHangboardItem(updates).left_loads).toEqual([kg(10), kg(12), kg(10), kg(12)]);
	});

	// A two-handed item missing its second grip array used to throw while
	// rendering, taking the whole editor down with it.
	test('renders a split item that carries a single grip array', async ({ page }) => {
		await openHangboardEditor(
			page,
			hangboardItem({ hand: 'split', left_loads: undefined, hand_positions: [['HC', 'FC']] })
		);

		await expect(editingHands(page)).toBeVisible();
		await expect(stepTiles(page)).toHaveCount(4);
	});

	// An item can carry one row per rep and still prescribe the same thing
	// everywhere. What it declares is not what it varies, and the coach should
	// read a plain prescription rather than a map of identical tiles.
	test('reads an item whose rows all agree as varying nothing', async ({ page }) => {
		const training = testTraining({
			items: [
				hangboardItem({
					granularity: 'rep',
					edge_sizes_mm: [20, 20],
					loads: [kg(10), kg(10)],
					hand_positions: [['HC', 'HC']]
				})
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');

		await expect(page.getByText('VARIES BY SET')).toBeHidden();
		await expect(stepTiles(page)).toHaveCount(0);

		await page.getByRole('button', { name: 'Edit' }).click();

		await expect(page.getByRole('radio', { name: 'Nothing' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
	});
});

/** A single hang as the flutter app writes it: no edge, its own grip names. */
function hangRepItem(overrides: Record<string, unknown> = {}) {
	return {
		id: 'item-1',
		type: 'hangboard_rep',
		position: 0,
		worktime_seconds: 10,
		rest_seconds: 5,
		hand: 'right',
		granularity: 'uniform',
		loads: [kg(20)],
		hand_positions: [['halfCrimp']],
		...overrides
	};
}

test.describe('hang rep items', () => {
	test('builds a training rep by rep from the palette', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'GET', '/api/trainings/*', { body: testTraining({ id: 'training-9' }) });
		const posted = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Max hangs');
		await page.getByRole('button', { name: 'Circuit', exact: true }).click();
		await page.getByRole('button', { name: 'Hang rep', exact: true }).click();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training created')).toBeVisible();
		expect(posted).toHaveLength(1);
		const items = (posted[0].body as { items: Record<string, unknown>[] }).items;
		expect(items[0]).toMatchObject({ type: 'circuit', cycles: 3 });
		expect(items[1]).toMatchObject({
			type: 'hangboard_rep',
			granularity: 'uniform',
			hand: 'both',
			worktime_seconds: 7,
			rest_seconds: 3,
			edge_sizes_mm: [20],
			hand_positions: [['HC']],
			loads: [{ value: 100, unit: 'percent_bw' }]
		});
	});

	test('adds a hang rep inside a circuit, which is where its cycles come from', async ({
		page
	}) => {
		const training = testTraining({
			items: [{ id: 'item-1', type: 'circuit', position: 0, cycles: 4, items: [] }]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('button', { name: 'Add item' }).first().click();
		await page.getByRole('button', { name: 'Hang rep', exact: true }).first().click();
		await saveTraining(page);

		const saved = (updates[0].body as { items: Record<string, unknown>[] }).items[0];
		expect(saved).toMatchObject({ type: 'circuit', cycles: 4 });
		expect((saved.items as Record<string, unknown>[])[0]).toMatchObject({
			type: 'hangboard_rep',
			granularity: 'uniform'
		});
	});

	test('reads a hang rep built in the app, whatever it left out', async ({ page }) => {
		const training = testTraining({ items: [hangRepItem()] });
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');

		await expect(page.getByText('Hang rep')).toBeVisible();
		await expect(page.getByText('20 kg')).toBeVisible();
		await expect(page.getByText('Right', { exact: true })).toBeVisible();
		await expect(page.getByText('HC', { exact: true })).toBeVisible();
	});

	test('edits a hang rep and stores one configuration row per array', async ({ page }) => {
		const training = testTraining({ items: [hangRepItem()] });
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await edgeField(page).fill('14');
		await edgeField(page).blur();
		await page.getByRole('radio', { name: 'Both' }).click();
		await page.getByRole('radio', { name: 'FC' }).click();
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			type: 'hangboard_rep',
			granularity: 'uniform',
			hand: 'both',
			edge_sizes_mm: [14],
			hand_positions: [['FC']],
			loads: [{ value: 20, unit: 'kg' }]
		});
	});

	test('drops the separate left hand of a mode a single hang cannot run', async ({ page }) => {
		const training = testTraining({
			items: [
				hangRepItem({
					hand: 'alternate',
					loads: [kg(20)],
					left_loads: [kg(15)],
					hand_positions: [['halfCrimp'], ['fullCrimp']]
				})
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('spinbutton', { name: 'Work seconds' }).fill('8');
		await saveTraining(page);

		const saved = savedHangboardItem(updates);
		expect(saved).toMatchObject({
			hand: 'both',
			hand_positions: [['FC']],
			loads: [{ value: 20, unit: 'kg' }]
		});
		expect(saved.left_loads).toBeUndefined();
	});

	test('sets a hang as a percentage of an assessment result', async ({ page }) => {
		const training = testTraining({ items: [hangRepItem()] });
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByLabel('Load unit').selectOption('percent_assessment');
		await loadField(page).fill('80');
		await loadField(page).blur();
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			loads: [
				{
					value: 80,
					unit: 'percent_assessment',
					assessment_id: BUILTIN_CRITICAL_FORCE,
					fallback: 0
				}
			]
		});
	});
});

test.describe('item comments', () => {
	const COMMENT_PLACEHOLDER =
		'Optional note for the athlete (e.g. 3 sec pause at the bottom of each rep)';

	test('saves a comment typed on a repeater', async ({ page }) => {
		const updates = await openHangboardEditor(page, hangboardItem());

		await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('Ramp the hand spacing down.');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			comment: 'Ramp the hand spacing down.'
		});
	});

	test('saves a comment typed on a hang rep', async ({ page }) => {
		const updates = await openHangboardEditor(page, hangRepItem());

		await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('Max speed intent on the way up.');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			comment: 'Max speed intent on the way up.'
		});
	});

	test('saves a comment typed on an exercise', async ({ page }) => {
		const updates = await openHangboardEditor(page, {
			id: 'item-1',
			type: 'exercise',
			position: 0,
			reps: 5,
			rest_seconds: 0
		});

		await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('First rep in pronation.');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			comment: 'First rep in pronation.'
		});
	});

	test('saves a comment typed on an emom', async ({ page }) => {
		const updates = await openHangboardEditor(page, {
			id: 'item-1',
			type: 'emom',
			position: 0,
			cycles: 5,
			interval_seconds: 60,
			items: []
		});

		await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('Shoulders engaged, full apnea.');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			comment: 'Shoulders engaged, full apnea.'
		});
	});

	test('saves a comment typed on a group', async ({ page }) => {
		const updates = await openHangboardEditor(page, {
			id: 'item-1',
			type: 'group',
			position: 0,
			group_title: 'Warmup',
			items: []
		});

		await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('No rest between exercises.');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			comment: 'No rest between exercises.'
		});
	});

	test('saves a comment typed on a circuit', async ({ page }) => {
		const updates = await openHangboardEditor(page, {
			id: 'item-1',
			type: 'circuit',
			position: 0,
			cycles: 3,
			items: []
		});

		await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('Intensity 6 or 7 out of 10 maximum.');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			comment: 'Intensity 6 or 7 out of 10 maximum.'
		});
	});

	test('shows the comment of an exercise, a repeater, a hang rep and an emom in the read-only view', async ({
		page
	}) => {
		const training = testTraining({
			items: [
				{
					id: 'item-0',
					type: 'exercise',
					position: 0,
					reps: 5,
					rest_seconds: 0,
					comment: 'Exercise note'
				},
				hangboardItem({ id: 'item-1', comment: 'Repeater note' }),
				hangRepItem({ id: 'item-2', comment: 'Hang rep note' }),
				{
					id: 'item-3',
					type: 'emom',
					position: 3,
					cycles: 5,
					interval_seconds: 60,
					items: [],
					comment: 'Emom note'
				}
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');

		await expect(page.getByText('Exercise note')).toBeVisible();
		await expect(page.getByText('Repeater note')).toBeVisible();
		await expect(page.getByText('Hang rep note')).toBeVisible();
		await expect(page.getByText('Emom note')).toBeVisible();
	});

	test('shows the comment of a group and a circuit in the read-only view', async ({ page }) => {
		const training = testTraining({
			items: [
				{
					id: 'item-0',
					type: 'group',
					position: 0,
					group_title: 'Warmup',
					items: [],
					comment: 'No rest between exercises'
				},
				{
					id: 'item-1',
					type: 'circuit',
					position: 1,
					cycles: 3,
					items: [],
					comment: 'Intensity 6 or 7 out of 10 maximum'
				}
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');

		await expect(page.getByText('No rest between exercises')).toBeVisible();
		await expect(page.getByText('Intensity 6 or 7 out of 10 maximum')).toBeVisible();
	});
});

/**
 * A goal is why the block is in the program, which is the column the coaching
 * spreadsheet kept beside the numbers. It is held apart from the comment: that
 * one says how to run this instance and changes with the prescription, while a
 * goal holds across the weeks that retune it.
 */
test.describe('item goals', () => {
	const GOAL_PLACEHOLDER = 'What this block trains (e.g. finger endurance)';
	const COMMENT_PLACEHOLDER =
		'Optional note for the athlete (e.g. 3 sec pause at the bottom of each rep)';

	test('saves a goal typed on a repeater', async ({ page }) => {
		const updates = await openHangboardEditor(page, hangboardItem());

		await page.getByPlaceholder(GOAL_PLACEHOLDER).fill('resi doigts');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({ goal: 'resi doigts' });
	});

	test('saves a goal typed on a hang rep', async ({ page }) => {
		const updates = await openHangboardEditor(page, hangRepItem());

		await page.getByPlaceholder(GOAL_PLACEHOLDER).fill('force max doigts');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({ goal: 'force max doigts' });
	});

	test('saves a goal typed on an exercise', async ({ page }) => {
		const updates = await openHangboardEditor(page, {
			id: 'item-1',
			type: 'exercise',
			position: 0,
			reps: 5,
			rest_seconds: 0
		});

		await page.getByPlaceholder(GOAL_PLACEHOLDER).fill('explo jambes');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({ goal: 'explo jambes' });
	});

	test('saves a goal typed on an emom', async ({ page }) => {
		const updates = await openHangboardEditor(page, {
			id: 'item-1',
			type: 'emom',
			position: 0,
			cycles: 5,
			interval_seconds: 60,
			items: []
		});

		await page.getByPlaceholder(GOAL_PLACEHOLDER).fill('capacite/endurance doigts');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({ goal: 'capacite/endurance doigts' });
	});

	test('saves a goal typed on a group', async ({ page }) => {
		const updates = await openHangboardEditor(page, {
			id: 'item-1',
			type: 'group',
			position: 0,
			group_title: 'Warmup',
			items: []
		});

		await page.getByPlaceholder(GOAL_PLACEHOLDER).fill('garder du plaisir dans la pratique');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			goal: 'garder du plaisir dans la pratique'
		});
	});

	test('saves a goal typed on a circuit', async ({ page }) => {
		const updates = await openHangboardEditor(page, {
			id: 'item-1',
			type: 'circuit',
			position: 0,
			cycles: 3,
			items: []
		});

		await page.getByPlaceholder(GOAL_PLACEHOLDER).fill('force/hypertrophie des muscles de poussee');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			goal: 'force/hypertrophie des muscles de poussee'
		});
	});

	// Two columns in the spreadsheet, two fields here: typing in one must not
	// land in the other, on either the way out or the way back.
	test('saves the goal and the comment of one item apart from each other', async ({ page }) => {
		const updates = await openHangboardEditor(page, {
			id: 'item-1',
			type: 'exercise',
			position: 0,
			reps: 5,
			rest_seconds: 0
		});

		await page.getByPlaceholder(GOAL_PLACEHOLDER).fill('resi doigts');
		await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('First rep in pronation.');
		await saveTraining(page);

		expect(savedHangboardItem(updates)).toMatchObject({
			goal: 'resi doigts',
			comment: 'First rep in pronation.'
		});
	});

	test('shows the goal of an exercise, a repeater, a hang rep and an emom in the read-only view', async ({
		page
	}) => {
		const training = testTraining({
			items: [
				{
					id: 'item-0',
					type: 'exercise',
					position: 0,
					reps: 5,
					rest_seconds: 0,
					goal: 'explo jambes'
				},
				hangboardItem({ id: 'item-1', goal: 'resi doigts' }),
				hangRepItem({ id: 'item-2', goal: 'force max doigts' }),
				{
					id: 'item-3',
					type: 'emom',
					position: 3,
					cycles: 5,
					interval_seconds: 60,
					items: [],
					goal: 'capacite aerobie'
				}
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');

		await expect(page.getByText('explo jambes')).toBeVisible();
		await expect(page.getByText('resi doigts')).toBeVisible();
		await expect(page.getByText('force max doigts')).toBeVisible();
		await expect(page.getByText('capacite aerobie')).toBeVisible();
	});

	test('shows the goal of a group and a circuit in the read-only view', async ({ page }) => {
		const training = testTraining({
			items: [
				{
					id: 'item-0',
					type: 'group',
					position: 0,
					group_title: 'Warmup',
					items: [],
					goal: 'garder du plaisir dans la pratique'
				},
				{
					id: 'item-1',
					type: 'circuit',
					position: 1,
					cycles: 3,
					items: [],
					goal: 'force/hypertrophie des muscles de poussee'
				}
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');

		await expect(page.getByText('garder du plaisir dans la pratique')).toBeVisible();
		await expect(page.getByText('force/hypertrophie des muscles de poussee')).toBeVisible();
	});
});

/**
 * A note is the prose a coaching spreadsheet is full of: the section headers
 * that split a day into parts, and the prescriptions that are not exercises.
 * The athlete reads one and confirms it, so it prescribes nothing and goes
 * wherever a coach wants to say something.
 */
test.describe('notes', () => {
	const climbingVolume = 'Grimpe :\nkilter volume, 40 degrees, ramp up from 6a';

	test('saves the note a coach writes at the root of a training', async ({ page }) => {
		const updates = await openHangboardEditor(page, warmupGroup);

		await page.getByTestId('block-palette').getByRole('button', { name: 'Note' }).click();
		await page.getByLabel('Note text').fill(climbingVolume);
		await saveTraining(page);

		expect(updates).toHaveLength(1);
		expect((updates[0].body as TrainingRequest).items?.[1]).toMatchObject({
			type: 'free',
			free_text: climbingVolume
		});
	});

	test('saves a note written inside a circuit', async ({ page }) => {
		const updates = await openHangboardEditor(page, {
			id: 'item-1',
			type: 'circuit',
			position: 0,
			cycles: 3,
			items: []
		});

		await page.getByRole('button', { name: 'Add item' }).first().click();
		await page.getByRole('button', { name: 'Note', exact: true }).first().click();
		await page.getByLabel('Note text').fill('Shake out between rounds');
		await saveTraining(page);

		const saved = (updates[0].body as { items: Record<string, unknown>[] }).items[0];
		expect((saved.items as Record<string, unknown>[])[0]).toMatchObject({
			type: 'free',
			free_text: 'Shake out between rounds'
		});
	});

	// A step waiting for a tap inside an emom round would hold up the clock the
	// next round starts on.
	test('offers no note inside an emom', async ({ page }) => {
		await openHangboardEditor(page, {
			id: 'item-1',
			type: 'emom',
			position: 0,
			cycles: 5,
			interval_seconds: 60,
			items: []
		});

		// The right rail carries a palette of its own, and it comes after the item
		// list, so the add zone's is the first one on the page.
		const addZonePalette = page.getByTestId('block-palette').first();
		await page.getByRole('button', { name: 'Add item' }).first().click();

		await expect(addZonePalette.getByRole('button', { name: 'Hang rep' })).toBeVisible();
		await expect(addZonePalette.getByRole('button', { name: 'Note' })).toBeHidden();
	});

	// The blocks a stretching session excludes are the ones counting rounds and
	// hangs, and the spreadsheet's stretching days are headed by a note like any
	// other part of the day.
	test('offers a note to a stretching training', async ({ page }) => {
		await stubEditorPalette(page);

		await page.goto('/trainings/new');
		await page.getByRole('button', { name: 'Stretching' }).click();

		const palette = page.getByTestId('block-palette');
		await expect(palette.getByRole('button', { name: 'Note' })).toBeVisible();
		await expect(palette.getByRole('button', { name: 'Group' })).toBeHidden();
	});

	test('shows the note in the read-only view', async ({ page }) => {
		const training = testTraining({
			items: [
				{
					id: 'item-1',
					type: 'free',
					position: 0,
					free_text: '15 to 30 min rest between the strength work and the climbing'
				}
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');

		await expect(
			page.getByText('15 to 30 min rest between the strength work and the climbing')
		).toBeVisible();
	});

	// A note the coach never typed in would reach the athlete as a step with no
	// title: the app falls back to "Free" on a null, and the portal would send
	// the empty string.
	test('refuses to save a note with no text and keeps the block', async ({ page }) => {
		const training = testTraining({ items: [warmupGroup] });
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByTestId('block-palette').getByRole('button', { name: 'Note' }).click();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(
			page.getByText('A note needs some text for the athlete to read. Check block 2.')
		).toBeVisible();
		expect(updates).toHaveLength(0);

		await page.getByLabel('Note text').fill('Grimpe :');
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect((updates[0].body as TrainingRequest).items?.[1]).toMatchObject({
			type: 'free',
			free_text: 'Grimpe :'
		});
	});

	// A note the app wrote carries no text at all, and goes back out as the null
	// it came in as, which the app renders as "Free". Only the empty string the
	// portal would send is refused, so an edit elsewhere in such a training is
	// not held up by a block the coach never wrote.
	test('saves an edit to a training carrying a note the app left text-less', async ({ page }) => {
		const training = testTraining({ items: [{ id: 'item-1', type: 'free', position: 0 }] });
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByPlaceholder('Training title').first().fill('Renamed while the note sits there');
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		expect(updates[0].body as TrainingRequest).toMatchObject({
			title: 'Renamed while the note sits there'
		});
		expect((updates[0].body as TrainingRequest).items?.[0].free_text).toBeUndefined();
	});

	// The stretching rule and the emom rule both hold: a training that allows a
	// note does not hand one to a block that refuses it.
	test('offers no note inside an emom a stretching training still carries', async ({ page }) => {
		const training = testTraining({
			training_type: 'climbing',
			items: [
				{ id: 'item-1', type: 'emom', position: 0, cycles: 5, interval_seconds: 60, items: [] }
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('button', { name: 'Stretching' }).click();

		const addZonePalette = page.getByTestId('block-palette').first();
		await page.getByRole('button', { name: 'Add item' }).first().click();

		await expect(
			addZonePalette.getByRole('button', { name: 'Exercise', exact: true })
		).toBeVisible();
		await expect(addZonePalette.getByRole('button', { name: 'Note' })).toBeHidden();
	});

	test('reads a note the app wrote with no text without breaking the list', async ({ page }) => {
		const training = testTraining({
			items: [{ id: 'item-1', type: 'free', position: 0 }]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');

		await expect(page.getByText('Note', { exact: true })).toBeVisible();
		await expect(page.getByText('No text')).toBeVisible();
	});
});

test.describe('hangboard card chrome', () => {
	// The colour lives in one custom property on :root rather than in a constant
	// each card sets inline, so it is worth proving it still reaches them.
	const HANGBOARD_ACCENT = 'rgb(74, 124, 140)';

	async function accentColours(page: Page) {
		return page
			.locator('.hb-accent')
			.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
	}

	test('draws every hangboard card in the hangboard colour, read only and editing', async ({
		page
	}) => {
		const training = testTraining({ items: [hangRepItem(), hangboardItem({ id: 'item-2' })] });
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');
		await expect(page.getByText('Hang rep')).toBeVisible();

		const readOnly = await accentColours(page);
		expect(readOnly).toHaveLength(2);
		expect(readOnly).toEqual([HANGBOARD_ACCENT, HANGBOARD_ACCENT]);

		await page.getByRole('button', { name: 'Edit' }).first().click();
		await expect(page.getByLabel('Work seconds').first()).toBeVisible();

		const editing = await accentColours(page);
		expect(editing).toHaveLength(2);
		expect(editing).toEqual([HANGBOARD_ACCENT, HANGBOARD_ACCENT]);
	});
});

/**
 * A stretching session is not performed on a board, so no hangboard block may be
 * added to one. The rule is enforced in several places at once, so it is pinned
 * where a coach can actually reach it rather than on any single code path.
 */
test.describe('stretching trainings exclude hangboard blocks', () => {
	const hangboardButtons = /^(Hangboard|Hang rep)$/;

	test('offers no hangboard block in the palette', async ({ page }) => {
		await stubEditorPalette(page);

		await page.goto('/trainings/new');
		// Scoped to the palette: the training type picker carries a Hangboard
		// button of its own, which says nothing about the blocks on offer.
		const palette = page.getByTestId('block-palette');
		await expect(palette.getByRole('button', { name: 'Hang rep', exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Stretching' }).click();

		await expect(palette.getByRole('button', { name: hangboardButtons })).toHaveCount(0);
	});

	test('offers no hangboard block inside a group the training already carries', async ({
		page
	}) => {
		const training = testTraining({
			items: [{ id: 'item-1', type: 'group', position: 0, group_title: 'Warm up', items: [] }]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('button', { name: 'Stretching' }).click();
		await page.getByRole('button', { name: 'Add item' }).first().click();

		const palette = page.getByTestId('block-palette');
		await expect(palette.getByRole('button', { name: 'Exercise', exact: true })).toBeVisible();
		await expect(palette.getByRole('button', { name: hangboardButtons })).toHaveCount(0);
	});
});

/**
 * A whitespace-only description used to render an empty line under the name.
 * Playwright normalises whitespace in text assertions, so a text assertion
 * passes with the bug in place; what tells the two apart is whether the line
 * exists at all. Counting the row's own divs says that directly, and says it
 * without depending on the 2px margin that happens to make it visible today.
 */
test('the exercise picker treats a whitespace-only description as absent', async ({ page }) => {
	const training = testTraining({
		items: [{ id: 'item-1', type: 'group', position: 0, group_title: 'Warm up', items: [] }]
	});
	await stub(page, 'GET', '/api/trainings/*', { body: training });
	await stub(page, 'GET', '/api/coach/exercises', {
		body: exercisePage([
			testExercise({ description: '   ' }),
			testExercise({ id: 'exercise-2', name: 'Scapular pulls', description: null }),
			testExercise({
				id: 'exercise-3',
				name: 'Front lever raises',
				description: 'Five sets of three'
			})
		])
	});
	await stub(page, 'GET', '/api/coach/tags', { body: [testTag()] });

	await page.goto('/trainings/training-1');
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: 'Add item' }).first().click();
	await page
		.getByTestId('block-palette')
		.getByRole('button', { name: 'Exercise', exact: true })
		.click();

	// One div is the name on its own. The fixtures carry no tags, so the second
	// div a row can hold is the description line and nothing else.
	const picker = page.getByRole('dialog');
	await expect(picker.getByRole('button', { name: /Max hangs/ }).locator('div')).toHaveCount(1);
	await expect(picker.getByRole('button', { name: /Scapular pulls/ }).locator('div')).toHaveCount(
		1
	);
	await expect(
		picker.getByRole('button', { name: /Front lever raises/ }).locator('div')
	).toHaveCount(2);
	await expect(picker.getByText('Five sets of three')).toBeVisible();
});

test.describe('grouping root blocks', () => {
	/** The palette of the right rail, which always adds at the root. */
	function rootPalette(page: Page) {
		return page.getByTestId('block-palette');
	}

	async function addRootBlocks(page: Page, label: string, count: number) {
		for (let i = 0; i < count; i++) {
			await rootPalette(page).getByRole('button', { name: label, exact: true }).click();
		}
	}

	async function startSelecting(page: Page, blocks: number[]) {
		await page.getByRole('button', { name: 'Select', exact: true }).click();
		for (const block of blocks) {
			await page.getByRole('checkbox', { name: new RegExp(`^Select block ${block},`) }).check();
		}
	}

	test('wraps the selected blocks into a circuit where the first one sat', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'GET', '/api/trainings/*', { body: testTraining({ id: 'training-9' }) });
		const posted = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Board session');
		await addRootBlocks(page, 'Hang rep', 3);
		await startSelecting(page, [1, 3]);
		await page.getByRole('button', { name: 'Group into circuit' }).click();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect.poll(() => posted.length).toBe(1);
		const items = (posted[0].body as TrainingRequest).items;
		expect(items).toHaveLength(2);
		expect(items[0]).toMatchObject({ type: 'circuit', cycles: 3, cycle_rest_seconds: 120 });
		expect(items[0].items?.map((item) => item.type)).toEqual(['hangboard_rep', 'hangboard_rep']);
		expect(items[1]).toMatchObject({ type: 'hangboard_rep' });
	});

	test('wraps the selected blocks into a group', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'GET', '/api/trainings/*', { body: testTraining({ id: 'training-9' }) });
		const posted = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Board session');
		await addRootBlocks(page, 'Hangboard', 2);
		await startSelecting(page, [1, 2]);
		await page.getByRole('button', { name: 'Group into group' }).click();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect.poll(() => posted.length).toBe(1);
		const items = (posted[0].body as TrainingRequest).items;
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ type: 'group', group_title: 'Group' });
		expect(items[0].items?.map((item) => item.type)).toEqual(['repeater', 'repeater']);
	});

	test('closes the selection once the blocks are grouped', async ({ page }) => {
		await stubEditorPalette(page);

		await page.goto('/trainings/new');
		await addRootBlocks(page, 'Hang rep', 2);
		await startSelecting(page, [1, 2]);
		await page.getByRole('button', { name: 'Group into group' }).click();

		await expect(page.getByTestId('selection-bar')).toBeHidden();
		await expect(page.getByRole('checkbox', { name: /^Select block 1,/ })).toBeHidden();
	});

	test('offers no selection until the root holds more than one block', async ({ page }) => {
		await stubEditorPalette(page);

		await page.goto('/trainings/new');

		await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeHidden();

		await addRootBlocks(page, 'Hang rep', 1);

		await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeHidden();

		await addRootBlocks(page, 'Hang rep', 1);

		await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeVisible();
	});

	test('waits for a second block before it will group anything', async ({ page }) => {
		await stubEditorPalette(page);

		await page.goto('/trainings/new');
		await addRootBlocks(page, 'Hang rep', 2);
		await startSelecting(page, [1]);

		await expect(page.getByTestId('selection-bar').getByText('1 selected')).toBeVisible();
		await page.getByRole('button', { name: 'Group into circuit' }).click();

		await expect(page.getByText('Select at least two blocks to group them.')).toBeVisible();
		await expect(page.getByTestId('selection-bar')).toBeVisible();

		await page.getByRole('checkbox', { name: /^Select block 2,/ }).check();
		await page.getByRole('button', { name: 'Group into circuit' }).click();

		await expect(page.getByTestId('selection-bar')).toBeHidden();
	});

	test('drops the bar when a deletion leaves a single block behind', async ({ page }) => {
		await stubEditorPalette(page);

		await page.goto('/trainings/new');
		await addRootBlocks(page, 'Hang rep', 2);
		await startSelecting(page, [1]);

		await expect(page.getByTestId('selection-bar')).toBeVisible();

		await page.getByTitle('Delete').first().click();
		// The icon-only delete of the other block answers to the same name, so the
		// confirmation is reached by its label text.
		await page
			.getByRole('button', { name: 'Delete', exact: true })
			.filter({ hasText: 'Delete' })
			.click();

		await expect(page.getByTestId('selection-bar')).toBeHidden();
	});

	// A circuit only runs at the root, so a selection holding one cannot be
	// wrapped without producing a training the editor would refuse to build by
	// hand or by drag.
	test('refuses to nest a circuit and says why', async ({ page }) => {
		await stubEditorPalette(page);

		await page.goto('/trainings/new');
		await addRootBlocks(page, 'Circuit', 1);
		await addRootBlocks(page, 'Hang rep', 1);
		await startSelecting(page, [1, 2]);

		await page.getByRole('button', { name: 'Group into circuit' }).click();

		await expect(page.getByText('A circuit cannot hold a circuit.')).toBeVisible();

		await page.getByRole('button', { name: 'Group into group' }).click();

		await expect(page.getByText('A group cannot hold a circuit.')).toBeVisible();
		await expect(page.getByTestId('selection-bar')).toBeVisible();
	});

	test('offers no group to a stretching training, which has none', async ({ page }) => {
		await stubEditorPalette(page);

		await page.goto('/trainings/new');
		await page.getByRole('button', { name: 'Stretching' }).click();
		// The library entry of the right rail carries an EX badge, which is what
		// tells it apart from the exercise block once one has been added.
		await page.getByRole('button', { name: 'EX Max hangs' }).click();
		await page.getByRole('button', { name: 'EX Max hangs' }).click();
		await startSelecting(page, [1, 2]);

		await page.getByRole('button', { name: 'Group into group' }).click();

		await expect(page.getByText('This training takes no group.')).toBeVisible();

		await page.getByRole('button', { name: 'Group into circuit' }).click();

		await expect(page.getByTestId('selection-bar')).toBeHidden();
	});

	// The stored blocks carry a server id and are reparented under a container
	// that has none, which is the shape only the edit page ever sends.
	test('nests the stored blocks under a new circuit when a training is edited', async ({
		page
	}) => {
		const training = testTraining({
			training_type: 'climbing',
			items: [
				{ id: 'item-1', type: 'group', position: 0, group_title: 'Warmup', items: [] },
				{ id: 'item-2', type: 'group', position: 1, group_title: 'Boulders', items: [] },
				{ id: 'item-3', type: 'group', position: 2, group_title: 'Cool down', items: [] }
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await startSelecting(page, [1, 2]);
		await page.getByRole('button', { name: 'Group into circuit' }).click();
		await saveTraining(page);

		expect(updates).toHaveLength(1);
		const items = (updates[0].body as TrainingRequest).items;
		expect(items).toHaveLength(2);
		expect(items[0]).toMatchObject({ type: 'circuit', cycles: 3 });
		expect(items[0].id).toBeUndefined();
		expect(items[0].items).toMatchObject([{ id: 'item-1' }, { id: 'item-2' }]);
		expect(items[1]).toMatchObject({ id: 'item-3', group_title: 'Cool down' });
	});
});

test.describe('custom assessments', () => {
	test('writes an assessment on a training', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'GET', '/api/trainings', { body: [] });
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'GET', '/api/trainings/*', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'POST', '/api/assessment-definitions', {
			body: testAssessmentDefinition({ id: 'assessment-9' })
		});
		const declared = capture(page, 'POST', '/api/assessment-definitions');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Pull up pyramid');
		await page.getByLabel('This training is an assessment').check();
		await page.getByPlaceholder('How many pull ups did you do?').fill('How many reps to failure?');
		await page.getByRole('button', { name: 'Reps' }).click();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Assessment created')).toBeVisible();
		expect(declared).toHaveLength(1);
		expect(declared[0].body).toMatchObject({
			training_id: 'training-9',
			label: 'Pull up pyramid',
			prompt: 'How many reps to failure?',
			unit: 'repetitions',
			per_hand: false
		});
	});

	test('measures an assessment on each hand when the coach asks for it', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'GET', '/api/trainings', { body: [] });
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'GET', '/api/trainings/*', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'POST', '/api/assessment-definitions', {
			body: testAssessmentDefinition({ id: 'assessment-9' })
		});
		const declared = capture(page, 'POST', '/api/assessment-definitions');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('One arm lock off');
		await page.getByLabel('This training is an assessment').check();
		await page.getByPlaceholder('How many pull ups did you do?').fill('How long did you hold?');
		await page.getByRole('button', { name: 'Seconds' }).click();
		await page.getByLabel('Measured on each hand separately').check();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Assessment created')).toBeVisible();
		expect(declared[0].body).toMatchObject({
			unit: 'seconds',
			per_hand: true
		});
	});

	test('refuses to save an assessment with no question', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'GET', '/api/trainings', { body: [] });
		const created = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Nameless test');
		await page.getByLabel('This training is an assessment').check();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(
			page.getByText('An assessment needs a question for the athlete to answer.')
		).toBeVisible();
		// Refused before the training is created, so no orphan is left behind for
		// the retry to duplicate.
		expect(created).toHaveLength(0);
	});

	test('renames an assessment already on a training', async ({ page }) => {
		const training = testTraining({
			assessment: {
				id: 'assessment-9',
				label: 'Pull up pyramid',
				prompt: 'How many?',
				unit: 'repetitions',
				per_hand: false,
				unit_locked: false
			}
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/assessment-definitions/*', {
			body: testAssessmentDefinition({ id: 'assessment-9' })
		});
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/assessment-definitions/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByPlaceholder('How many pull ups did you do?').fill('How many in total?');
		await saveTraining(page);

		expect(updates).toHaveLength(1);
		expect(updates[0].body).toMatchObject({ prompt: 'How many in total?' });
	});

	// The unit says what every past number means and what a prescription reads
	// against, so the server locks it and the editor says so instead of letting
	// the coach try.
	test('fixes the unit once the assessment is in use', async ({ page }) => {
		const training = testTraining({
			assessment: {
				id: 'assessment-9',
				label: 'Pull up pyramid',
				prompt: 'How many?',
				unit: 'repetitions',
				per_hand: false,
				unit_locked: true
			}
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		await expect(page.getByText('This assessment is already in use')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Seconds' })).toBeDisabled();
		await expect(page.getByLabel('Measured on each hand separately')).toBeDisabled();
	});

	// Removing the assessment deletes the definition, which any training
	// prescribing a percentage of it then cannot resolve.
	test('asks before removing an assessment from a training', async ({ page }) => {
		const training = testTraining({
			assessment: {
				id: 'assessment-9',
				label: 'Pull up pyramid',
				prompt: 'How many?',
				unit: 'repetitions',
				per_hand: false,
				unit_locked: false
			}
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stub(page, 'DELETE', '/api/assessment-definitions/*', {
			body: { message: 'gone' }
		});
		await stubEditorPalette(page);
		const deletes = capture(page, 'DELETE', '/api/assessment-definitions/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByLabel('This training is an assessment').uncheck();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Stop measuring this?')).toBeVisible();
		expect(deletes).toHaveLength(0);

		await page.getByRole('button', { name: 'Remove the assessment' }).click();
		await expect(page.getByText('Training saved')).toBeVisible();
		expect(deletes).toHaveLength(1);
	});

	// A reps target had no assessment it could reference while the only ones were
	// the three Crimpy ships, none of which counts repetitions, so the control was
	// hidden. A custom assessment in repetitions is what turns it on.
	test('prescribes reps as a percentage of a reps assessment', async ({ page }) => {
		const pyramid = testAssessmentDefinition({
			id: 'assessment-9',
			label: 'Pull up pyramid',
			unit: 'repetitions',
			per_hand: false,
			is_builtin: false,
			training_id: 'training-8'
		});
		await stub(page, 'GET', '/api/assessment-definitions', {
			body: [...builtinAssessmentDefinitions(), pyramid]
		});
		const training = testTraining({
			items: [
				{
					id: 'item-1',
					type: 'exercise',
					position: 0,
					exercise_id: testExercise().id,
					reps: 8,
					duration: 0,
					rest_seconds: 60
				}
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		// The percentage control is offered on reps now that something measures them.
		await page.getByRole('button', { name: '%' }).click();
		await saveTraining(page);

		expect(updates).toHaveLength(1);
		const items = (updates[0].body as TrainingRequest).items;
		expect(items[0].variable_targets?.reps).toMatchObject({
			assessment_id: 'assessment-9',
			percent: 75
		});
	});
});

test.describe('percentage prescriptions', () => {
	function timedPercentTraining(fallback: number) {
		return testTraining({
			items: [
				{
					id: 'item-1',
					type: 'exercise',
					position: 0,
					exercise_id: testExercise().id,
					reps: 0,
					duration: 120,
					rest_seconds: 60,
					variable_targets: {
						duration: { assessment_id: BUILTIN_ENDURANCE_60, percent: 75, fallback }
					}
				}
			]
		});
	}

	// A training writes the same number twice: the fallback the percentage falls
	// back on, and the plain duration beside it. Only a program week can mean
	// something else by the plain field, so here the boxes move both, and a
	// training left holding two different numbers plays neither reliably.
	test('keeps the plain duration in step with the fallback it is written beside', async ({
		page
	}) => {
		const training = timedPercentTraining(120);
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByLabel('Duration minutes').fill('0');
		await page.getByLabel('Duration seconds').fill('30');
		await saveTraining(page);

		const items = (updates[0].body as TrainingRequest).items;
		expect(items[0].duration).toBe(30);
		expect(items[0].variable_targets?.duration).toMatchObject({ fallback: 30 });
	});

	// The line under a percentage names the fixed number a client without the
	// assessment runs, which is the fallback and not the plain field beside it. A
	// program week may raise one without the other, and the same card is what a
	// played session shows its prescription through.
	test('reads the fallback off the target it belongs to', async ({ page }) => {
		await stub(page, 'GET', '/api/trainings/*', { body: timedPercentTraining(30) });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');

		await expect(page.getByText('fallback 30s')).toBeVisible();
	});

	// In a training the toggle only says which shape the field is prescribed in,
	// so pressing it back on takes the number standing in the boxes as the
	// fallback. Putting back the pair it was turned off over belongs to a program
	// week, where the plain value beside a percentage means something of its own.
	test('takes the boxes as the fallback when the percentage goes back on', async ({ page }) => {
		const training = timedPercentTraining(120);
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByTestId('variable-toggle').click();
		await page.getByLabel('Duration minutes').fill('0');
		await page.getByLabel('Duration seconds').fill('30');
		await page.getByTestId('variable-toggle').click();

		await expect(page.getByLabel('Duration minutes')).toHaveValue('0');
		await expect(page.getByLabel('Duration seconds')).toHaveValue('30');
		await saveTraining(page);

		const items = (updates[0].body as TrainingRequest).items;
		expect(items[0].duration).toBe(30);
		expect(items[0].variable_targets?.duration).toMatchObject({ percent: 75, fallback: 30 });
	});

	// An emptied number box binds as null, which the backend answers by refusing
	// the whole training rather than the field, so the percentage box lands on a
	// number again as the coach leaves it.
	test('saves a percentage the backend accepts when its box is emptied', async ({ page }) => {
		const training = timedPercentTraining(120);
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByLabel('Percent of assessment').fill('');
		await saveTraining(page);

		const items = (updates[0].body as TrainingRequest).items;
		expect(items[0].variable_targets?.duration).toMatchObject({ percent: 1 });
	});
});

test.describe('reordering root blocks', () => {
	// A circuit holding a block is taller than the default window, and a drag
	// that reaches past the fold scrolls the page out from under itself.
	test.use({ viewport: { width: 1280, height: 1000 } });

	function dragHandles(page: Page) {
		return page.getByRole('button', { name: 'Drag to reorder' });
	}

	function addZones(page: Page) {
		return page.getByRole('button', { name: 'Add item' });
	}

	const cooldownGroup = {
		id: 'item-2',
		type: 'group',
		position: 1,
		group_title: 'Cooldown',
		items: []
	};

	test('moves a block down when it is dropped onto the one below it', async ({ page }) => {
		const training = testTraining({ items: [warmupGroup, cooldownGroup] });
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		await dragOnto(page, dragHandles(page).nth(0), dragHandles(page).nth(1));

		await saveTraining(page);
		expect(updates).toHaveLength(1);
		const items = (updates[0].body as TrainingRequest).items;
		expect(items.map((item) => item.group_title)).toEqual(['Cooldown', 'Warmup']);
	});

	/** Tab until the drag handle has focus, answering whether it is reachable. */
	async function tabToDragHandle(page: Page): Promise<boolean> {
		for (let step = 0; step < 60; step++) {
			await page.keyboard.press('Tab');
			const reached = await page.evaluate(
				() => document.activeElement?.getAttribute('aria-label') === 'Drag to reorder'
			);
			if (reached) return true;
		}
		return false;
	}

	// The handle is the only way to pick a block up, so it has to be reachable by
	// tab rather than merely focusable from a script: it used to carry
	// tabindex="-1", which is focusable but skipped by the tab order, so focusing
	// it directly would pass either way. Two exercises rather than two groups: a
	// container swallows anything dragged over its body, keyboard or not, and the
	// keys travel straight down the middle of it.
	test('reaches the drag handle by tabbing and moves the block down', async ({ page }) => {
		const exerciseBlock = (id: string, reps: number) => ({
			id,
			type: 'exercise',
			position: reps,
			exercise_id: testExercise().id,
			reps,
			rest_seconds: 0
		});
		const training = testTraining({
			items: [exerciseBlock('item-1', 3), exerciseBlock('item-2', 8)]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		expect(await tabToDragHandle(page)).toBe(true);
		await page.keyboard.press('Space');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Space');

		await saveTraining(page);
		expect(updates).toHaveLength(1);
		const items = (updates[0].body as TrainingRequest).items;
		expect(items.map((item) => item.reps)).toEqual([8, 3]);
	});

	test('moves a block up when it is dropped onto the one above it', async ({ page }) => {
		const training = testTraining({ items: [warmupGroup, cooldownGroup] });
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		await dragOnto(page, dragHandles(page).nth(1), dragHandles(page).nth(0));

		await saveTraining(page);
		expect(updates).toHaveLength(1);
		const items = (updates[0].body as TrainingRequest).items;
		expect(items.map((item) => item.group_title)).toEqual(['Cooldown', 'Warmup']);
	});

	test('drops a block into an empty circuit when it is dragged over its body', async ({ page }) => {
		// An empty circuit's add zone now sits below the comment field added for
		// Krakoer/crimpy#66, close enough to the default viewport's bottom edge to
		// fall inside dnd-kit's own autoscroll zone and race the drag. A taller
		// viewport keeps the drop target away from that edge.
		await page.setViewportSize({ width: 1280, height: 1400 });
		await stubEditorPalette(page);
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'GET', '/api/trainings/*', { body: testTraining({ id: 'training-9' }) });
		const posted = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Board session');
		await page.getByTestId('block-palette').getByRole('button', { name: 'Hang rep' }).click();
		await page.getByTestId('block-palette').getByRole('button', { name: 'Circuit' }).click();

		// The first add zone is the one inside the circuit, the last one closes the
		// root list.
		await dragInto(page, dragHandles(page).nth(0), addZones(page).first());

		await page.getByRole('button', { name: 'Save training' }).click();
		await expect.poll(() => posted.length).toBe(1);
		const items = (posted[0].body as TrainingRequest).items;
		expect(items.map((item) => item.type)).toEqual(['circuit']);
		expect(items[0].items?.map((item) => item.type)).toEqual(['hangboard_rep']);
	});

	test('drops a new block from the rail into a circuit', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'GET', '/api/trainings/*', { body: testTraining({ id: 'training-9' }) });
		const posted = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Board session');
		const rail = page.getByTestId('block-palette');
		await rail.getByRole('button', { name: 'Circuit' }).click();

		await dragInto(page, rail.getByRole('button', { name: 'Hang rep' }), addZones(page).first());

		await page.getByRole('button', { name: 'Save training' }).click();
		await expect.poll(() => posted.length).toBe(1);
		const items = (posted[0].body as TrainingRequest).items;
		expect(items.map((item) => item.type)).toEqual(['circuit']);
		expect(items[0].items?.map((item) => item.type)).toEqual(['hangboard_rep']);
	});

	// The rail items are drag sources, and dnd-kit's keyboard sensor answers Enter
	// and Space on a drag source by picking it up. Where the item also adds a
	// block on click, that is what the two keys have to keep meaning, or the only
	// way to use the rail without a pointer would be to drag from it.
	test('adds a block when the rail item is activated from the keyboard', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'GET', '/api/trainings/*', { body: testTraining({ id: 'training-9' }) });
		const posted = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Board session');
		const rail = page.getByTestId('block-palette');
		await rail.getByRole('button', { name: 'Circuit' }).focus();
		await page.keyboard.press('Space');
		await expect(page.getByText('1 blocks')).toBeVisible();

		await rail.getByRole('button', { name: 'Group' }).focus();
		await page.keyboard.press('Enter');
		await expect(page.getByText('2 blocks')).toBeVisible();

		await page.getByRole('button', { name: 'Save training' }).click();
		await expect.poll(() => posted.length).toBe(1);
		expect((posted[0].body as TrainingRequest).items?.map((item) => item.type)).toEqual([
			'circuit',
			'group'
		]);
	});

	test('moves a block down in a training that has not been saved yet', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'POST', '/api/trainings', { body: testTraining({ id: 'training-9' }) });
		await stub(page, 'GET', '/api/trainings/*', { body: testTraining({ id: 'training-9' }) });
		const posted = capture(page, 'POST', '/api/trainings');

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Board session');
		await page.getByTestId('block-palette').getByRole('button', { name: 'Hang rep' }).click();
		await page.getByTestId('block-palette').getByRole('button', { name: 'Group' }).click();

		await dragOnto(page, dragHandles(page).nth(0), dragHandles(page).nth(1));

		await page.getByRole('button', { name: 'Save training' }).click();
		await expect.poll(() => posted.length).toBe(1);
		const items = (posted[0].body as TrainingRequest).items;
		expect(items.map((item) => item.type)).toEqual(['group', 'hangboard_rep']);
	});
});

// A coach fills a demo video on a library exercise and it used to go nowhere.
// The portal shows it on the training so they read what the athlete will get
// rather than guessing it from the library screen.
test('shows the exercise demo video and notes on the training preview', async ({ page }) => {
	const pullUps = {
		id: 'item-2',
		type: 'exercise',
		position: 0,
		exercise_id: 'exercise-1',
		reps: 8,
		rest_seconds: 60
	};
	await stub(page, 'GET', '/api/trainings/*', {
		body: testTraining({ training_type: 'workout', items: [pullUps] })
	});
	// The preview resolves each referenced exercise by id, not off the palette
	// list, so that is the call the library has to answer here.
	await stub(page, 'GET', '/api/coach/exercises/*', {
		body: testExercise({
			description: 'Dead hang start, chin over the bar.',
			comment: 'Keep the shoulders engaged at the bottom.',
			video_link: 'https://example.com/pull-up'
		})
	});
	await stubEditorPalette(page);

	await page.goto('/trainings/training-1');

	await expect(page.getByText('Dead hang start, chin over the bar.')).toBeVisible();
	// The execution notes, which is a different field from the note a coach
	// attaches to one step of a training.
	await expect(page.getByText('Keep the shoulders engaged at the bottom.')).toBeVisible();
	await expect(page.getByRole('link', { name: /Watch demo/ })).toHaveAttribute(
		'href',
		'https://example.com/pull-up'
	);
});

// The same fields arrive joined onto the item, which is how a training read
// outside the coach's own library still names them. That is the shape the
// athlete gets, so the portal has to read it too.
test('falls back to the video joined onto the item', async ({ page }) => {
	const pullUps = {
		id: 'item-2',
		type: 'exercise',
		position: 0,
		exercise_id: 'exercise-elsewhere',
		exercise_name: 'Pull up',
		exercise_description: 'Dead hang start.',
		exercise_video_link: 'https://example.com/joined',
		reps: 8,
		rest_seconds: 60
	};
	await stub(page, 'GET', '/api/trainings/*', {
		body: testTraining({ training_type: 'workout', items: [pullUps] })
	});
	await stubEditorPalette(page);

	await page.goto('/trainings/training-1');

	await expect(page.getByText('Dead hang start.')).toBeVisible();
	await expect(page.getByRole('link', { name: /Watch demo/ })).toHaveAttribute(
		'href',
		'https://example.com/joined'
	);
});

test('offers no demo link when the exercise carries none', async ({ page }) => {
	const pullUps = {
		id: 'item-2',
		type: 'exercise',
		position: 0,
		exercise_id: 'exercise-1',
		reps: 8,
		rest_seconds: 60
	};
	await stub(page, 'GET', '/api/trainings/*', {
		body: testTraining({ training_type: 'workout', items: [pullUps] })
	});
	// The library has to answer, and answer with an exercise that has no video:
	// letting the lookup 404 instead would assert on a tile built from nothing.
	await stub(page, 'GET', '/api/coach/exercises/*', {
		body: testExercise({ name: 'Max hangs', description: null, video_link: null })
	});
	await stubEditorPalette(page);

	await page.goto('/trainings/training-1');

	await expect(page.getByText('Max hangs')).toBeVisible();
	await expect(page.getByRole('link', { name: /Watch demo/ })).toHaveCount(0);
});

// A session's frozen prescription carries the link the prescribing coach typed,
// and the coach reading that session is not always that coach. Nothing
// validates the field on write, so a non-http scheme must never become an href.
test('never links a video the coach did not write as an http address', async ({ page }) => {
	const pullUps = {
		id: 'item-2',
		type: 'exercise',
		position: 0,
		exercise_id: 'exercise-elsewhere',
		exercise_name: 'Pull up',
		exercise_video_link: "javascript:alert('xss')",
		reps: 8,
		rest_seconds: 60
	};
	await stub(page, 'GET', '/api/trainings/*', {
		body: testTraining({ training_type: 'workout', items: [pullUps] })
	});
	await stubEditorPalette(page);

	await page.goto('/trainings/training-1');

	await expect(page.getByRole('link', { name: /Watch demo/ })).toHaveCount(0);
	// Still surfaced, as text, so a coach can see what is stored on the item.
	await expect(page.getByText("javascript:alert('xss')")).toBeVisible();
});

// The app upgrades a scheme-less address to https, so the portal does too: a
// coach has to see the link the athlete will actually get.
test('links a scheme-less address the way the app reads it', async ({ page }) => {
	const pullUps = {
		id: 'item-2',
		type: 'exercise',
		position: 0,
		exercise_id: 'exercise-elsewhere',
		exercise_name: 'Pull up',
		exercise_video_link: 'www.youtube.com/watch?v=abc',
		reps: 8,
		rest_seconds: 60
	};
	await stub(page, 'GET', '/api/trainings/*', {
		body: testTraining({ training_type: 'workout', items: [pullUps] })
	});
	await stubEditorPalette(page);

	await page.goto('/trainings/training-1');

	await expect(page.getByRole('link', { name: /Watch demo/ })).toHaveAttribute(
		'href',
		'https://www.youtube.com/watch?v=abc'
	);
});
