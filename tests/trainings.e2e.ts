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
		edge_sizes_mm: [20, 18],
		loads: [
			{ value: 10, unit: 'kg' },
			{ value: 12, unit: 'kg' }
		],
		hand_positions: [['HC', 'FC']],
		...overrides
	};
}

test.describe('hangboard granularity', () => {
	test('renders a per-set hangboard item set by set', async ({ page }) => {
		const perSet = testTraining({
			items: [
				hangboardItem({
					edge_sizes_mm: [20, 18, 15, 12],
					loads: [
						{ value: 10, unit: 'kg' },
						{ value: 12, unit: 'kg' },
						{ value: 14, unit: 'kg' },
						{ value: 16, unit: 'kg' }
					],
					hand_positions: [['HC', 'FC', 'OC', '3FD']]
				})
			]
		});
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
});
