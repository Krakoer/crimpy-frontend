import { expect, test, type Page } from '@playwright/test';
import {
	capture,
	exercisePage,
	mockApi,
	signIn,
	stub,
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

/** The training editor fills its exercise palette from the library. */
async function stubEditorPalette(page: Page): Promise<void> {
	await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([testExercise()]) });
	await stub(page, 'GET', '/api/coach/tags', { body: [testTag()] });
}

/**
 * The delete control on a grid card is icon-only with no accessible name, so it
 * has to be reached through the card that contains it.
 */
function deleteButtonOn(page: Page, title: string) {
	return page.getByRole('button', { name: new RegExp(title) }).getByRole('button');
}

test.beforeEach(async ({ page }) => {
	await mockApi(page);
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

/** A hangboard item whose edge, load and grip vary from rep to rep only. */
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
		loads: [
			{ value: 10, unit: 'kg' },
			{ value: 12, unit: 'kg' }
		],
		hand_positions: [['HC', 'FC']],
		...overrides
	};
}

/** The same item configured set by set: set 1 hangs 20 then 18mm, set 2 15 then 12mm. */
function perSetHangboardItem(overrides: Record<string, unknown> = {}) {
	return hangboardItem({
		granularity: 'set',
		edge_sizes_mm: [20, 18, 15, 12],
		loads: [
			{ value: 10, unit: 'kg' },
			{ value: 12, unit: 'kg' },
			{ value: 14, unit: 'kg' },
			{ value: 16, unit: 'kg' }
		],
		hand_positions: [['HC', 'FC', 'OC', '3FD']],
		...overrides
	});
}

/**
 * The value rows of the hangboard editor grid, in set then rep order. The set
 * bands live in the same tbody, so they are excluded by their class.
 */
function editorRows(page: Page) {
	return page.locator('.hb-table tbody tr:not(.hb-set-row)');
}

/** Edge is the first input of a grid row, and the only one on every layout. */
function edgeInput(page: Page, rowIndex: number) {
	return editorRows(page).nth(rowIndex).locator('input').first();
}

test.describe('hangboard granularity', () => {
	test('renders a per-set hangboard item set by set', async ({ page }) => {
		const perSet = testTraining({ items: [perSetHangboardItem()] });
		await stub(page, 'GET', '/api/trainings/*', { body: perSet });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');

		await expect(page.getByText('PER-SET', { exact: true })).toBeVisible();
		await expect(page.getByText('Set 1', { exact: true })).toBeVisible();
		await expect(page.getByText('Set 2', { exact: true })).toBeVisible();
		await expect(page.getByText('16 kg')).toBeVisible();
	});

	test('repeats the per-rep values in every set when switching to per-set', async ({ page }) => {
		const perRep = testTraining({ items: [hangboardItem()] });
		await stub(page, 'GET', '/api/trainings/*', { body: perRep });
		await stub(page, 'PUT', '/api/trainings/*', { body: perRep });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('button', { name: 'Per-set', exact: true }).click();

		await expect(page.getByText('Set 2', { exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		expect(updates[0].body).toMatchObject({
			items: [
				{
					granularity: 'set',
					edge_sizes_mm: [20, 18, 20, 18],
					loads: [
						{ value: 10, unit: 'kg' },
						{ value: 12, unit: 'kg' },
						{ value: 10, unit: 'kg' },
						{ value: 12, unit: 'kg' }
					],
					hand_positions: [['HC', 'FC', 'HC', 'FC']]
				}
			]
		});
	});

	test('copies a set into the sets below it', async ({ page }) => {
		const perSet = testTraining({ items: [perSetHangboardItem()] });
		await stub(page, 'GET', '/api/trainings/*', { body: perSet });
		await stub(page, 'PUT', '/api/trainings/*', { body: perSet });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		await expect(edgeInput(page, 2)).toHaveValue('15');

		await page.getByRole('button', { name: 'Copy this set into the sets below' }).click();

		await expect(edgeInput(page, 2)).toHaveValue('20');
		await expect(edgeInput(page, 3)).toHaveValue('18');

		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		expect(updates[0].body).toMatchObject({
			items: [
				{
					granularity: 'set',
					edge_sizes_mm: [20, 18, 20, 18],
					loads: [
						{ value: 10, unit: 'kg' },
						{ value: 12, unit: 'kg' },
						{ value: 10, unit: 'kg' },
						{ value: 12, unit: 'kg' }
					],
					hand_positions: [['HC', 'FC', 'HC', 'FC']]
				}
			]
		});
	});

	test('saves an edit made inside a later set and reads it back', async ({ page }) => {
		const perSet = testTraining({ items: [perSetHangboardItem()] });
		await stub(page, 'GET', '/api/trainings/*', { body: perSet });
		await stub(page, 'PUT', '/api/trainings/*', { body: perSet });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await edgeInput(page, 2).fill('25');
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		expect(updates[0].body).toMatchObject({
			items: [{ cycles: 2, reps: 2, edge_sizes_mm: [20, 18, 25, 12] }]
		});

		const stored = (updates[0].body as { items: unknown[] }).items;
		await stub(page, 'GET', '/api/trainings/*', { body: testTraining({ items: stored }) });
		await page.reload();
		await page.getByRole('button', { name: 'Edit' }).click();

		await expect(edgeInput(page, 2)).toHaveValue('25');
	});

	test('resizes the grid on the committed set count, not on every keystroke', async ({ page }) => {
		const perSet = testTraining({ items: [perSetHangboardItem()] });
		await stub(page, 'GET', '/api/trainings/*', { body: perSet });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		const sets = page.getByRole('spinbutton', { name: 'Sets' });
		await sets.selectText();
		await sets.pressSequentially('12');

		await expect(editorRows(page)).toHaveCount(4);

		await sets.blur();

		await expect(page.getByText('Set 12', { exact: true })).toBeVisible();
		await expect(editorRows(page)).toHaveCount(24);
		await expect(edgeInput(page, 0)).toHaveValue('20');
		await expect(edgeInput(page, 1)).toHaveValue('18');
		await expect(edgeInput(page, 2)).toHaveValue('15');
		await expect(edgeInput(page, 3)).toHaveValue('12');
	});
});

test.describe('hangboard hand modes', () => {
	test('describes what the selected hand mode does', async ({ page }) => {
		const training = testTraining({ items: [hangboardItem()] });
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		await expect(page.getByText('Both hands on the board at once')).toBeVisible();

		await page.getByRole('radio', { name: 'Alternate', exact: true }).click();

		await expect(page.getByText('Right then left within each rep')).toBeVisible();
	});

	// The alternating mode is the one the app used to store as 'both', so it has
	// to survive a round trip under its own name.
	test('saves the alternating mode without splitting the loads', async ({ page }) => {
		const training = testTraining({ items: [hangboardItem()] });
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('radio', { name: 'Alternate', exact: true }).click();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		const [item] = (updates[0].body as { items: Record<string, unknown>[] }).items;
		expect(item).toMatchObject({
			hand: 'alternate',
			granularity: 'rep',
			edge_sizes_mm: [20, 18],
			loads: [
				{ value: 10, unit: 'kg' },
				{ value: 12, unit: 'kg' }
			]
		});
		expect(item.left_loads).toHaveLength(2);
		expect(item.hand_positions).toEqual([
			['HC', 'FC'],
			['HC', 'FC']
		]);
	});

	// Splitting the hands must never interleave the two into loads: each hand
	// keeps its own array of one entry per row.
	test('gives each hand its own loads and grips when split', async ({ page }) => {
		const training = testTraining({ items: [hangboardItem()] });
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('radio', { name: 'Split', exact: true }).click();

		await expect(page.getByRole('columnheader', { name: 'L Load' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'R Grip' })).toBeVisible();

		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		const [item] = (updates[0].body as { items: Record<string, unknown>[] }).items;
		expect(item).toMatchObject({ hand: 'split', granularity: 'rep' });
		expect(item.loads).toHaveLength(2);
		expect(item.left_loads).toHaveLength(2);
		expect(item.hand_positions).toHaveLength(2);
	});

	// The left hand offers the same assessment-relative unit as the right, so a
	// percentage set there has to carry the reference the API requires of it.
	test('gives a left-hand assessment load its assessment reference', async ({ page }) => {
		const training = testTraining({
			items: [
				hangboardItem({
					granularity: 'uniform',
					hand: 'split',
					edge_sizes_mm: [20],
					loads: [{ value: 10, unit: 'kg' }],
					left_loads: [{ value: 10, unit: 'kg' }],
					hand_positions: [['HC'], ['HC']]
				})
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('combobox', { name: 'Left load unit' }).selectOption('percent_assessment');
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		const [item] = (updates[0].body as { items: Record<string, unknown>[] }).items;
		const [leftLoad] = item.left_loads as Record<string, unknown>[];
		expect(leftLoad.unit).toBe('percent_assessment');
		expect(leftLoad.assessment_type).toBeDefined();
		expect(leftLoad.fallback).toBeDefined();
	});

	// Going back to a mode that hangs both hands together drops the second
	// configuration rather than leaving a stale left hand behind.
	test('drops the left-hand arrays when leaving a split mode', async ({ page }) => {
		const split = testTraining({
			items: [
				hangboardItem({
					hand: 'split',
					left_loads: [
						{ value: 5, unit: 'kg' },
						{ value: 6, unit: 'kg' }
					],
					hand_positions: [
						['HC', 'FC'],
						['OC', '3FD']
					]
				})
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: split });
		await stub(page, 'PUT', '/api/trainings/*', { body: split });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('radio', { name: 'Both', exact: true }).click();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		const [item] = (updates[0].body as { items: Record<string, unknown>[] }).items;
		expect(item).toMatchObject({ hand: 'both' });
		expect(item.left_loads).toBeUndefined();
		expect(item.hand_positions).toHaveLength(1);
	});
});

test.describe('hangboard uniform editing', () => {
	// A uniform item is a single row, and the uniform fields are that row. What
	// the coach types has to be what gets saved.
	test('saves the edge, load and grip typed in the uniform panel', async ({ page }) => {
		const training = testTraining({
			items: [
				hangboardItem({
					granularity: 'uniform',
					edge_sizes_mm: [20],
					loads: [{ value: 100, unit: 'percent_bw' }],
					hand_positions: [['HC']]
				})
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		await page.getByLabel('EDGE (mm)').fill('25');
		await page.getByLabel('Load', { exact: true }).fill('80');
		await page.getByLabel('GRIP').selectOption('OC');
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		expect(updates).toHaveLength(1);
		const [item] = (updates[0].body as { items: Record<string, unknown>[] }).items;
		expect(item).toMatchObject({
			granularity: 'uniform',
			edge_sizes_mm: [25],
			loads: [{ value: 80, unit: 'percent_bw' }],
			hand_positions: [['OC']]
		});
	});

	// The Max unit has no value input, so it only reaches the item through the
	// same path the numbers take.
	test('flags the item as max effort from the uniform load unit', async ({ page }) => {
		const training = testTraining({
			items: [
				hangboardItem({
					granularity: 'uniform',
					edge_sizes_mm: [20],
					loads: [{ value: 100, unit: 'percent_bw' }],
					hand_positions: [['HC']]
				})
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		await page.getByLabel('Load unit', { exact: true }).selectOption('max');
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		const [item] = (updates[0].body as { items: Record<string, unknown>[] }).items;
		expect(item).toMatchObject({ load_is_max: true, loads: [{ unit: 'max' }] });
	});
});

test.describe('hangboard items stored in an older shape', () => {
	// The API validates every configuration array on its own and accepts an
	// absent one, so a two-handed item can arrive with no left_loads at all.
	// Rebuilding must give the left hand each row's own load, not row 0 for all.
	test('gives the left hand its per-row load when left_loads is missing', async ({ page }) => {
		const training = testTraining({
			items: [hangboardItem({ hand: 'alternate', left_loads: undefined })]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stub(page, 'PUT', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);
		const updates = capture(page, 'PUT', '/api/trainings/*');

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page.getByText('Training saved')).toBeVisible();
		const [item] = (updates[0].body as { items: Record<string, unknown>[] }).items;
		expect(item.left_loads).toEqual([
			{ value: 10, unit: 'kg' },
			{ value: 12, unit: 'kg' }
		]);
	});

	// A two-handed item missing its second grip array used to throw while
	// rendering, taking the whole editor down with it.
	test('renders a split item that carries a single grip array', async ({ page }) => {
		const training = testTraining({
			items: [
				hangboardItem({ hand: 'split', left_loads: undefined, hand_positions: [['HC', 'FC']] })
			]
		});
		await stub(page, 'GET', '/api/trainings/*', { body: training });
		await stubEditorPalette(page);

		await page.goto('/trainings/training-1');
		await page.getByRole('button', { name: 'Edit' }).click();

		await expect(page.getByRole('columnheader', { name: 'L Load' })).toBeVisible();
		await expect(edgeInput(page, 0)).toHaveValue('20');
	});
});
