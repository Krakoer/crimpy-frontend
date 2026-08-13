import { expect, test, type Page } from '@playwright/test';
import {
	capture,
	exercisePage,
	mockApi,
	signIn,
	stub,
	stubSequence,
	testExercise,
	testTag,
	testUser
} from './fixtures';

const fingers = testTag();
const core = testTag({ id: 'tag-2', name: 'Core', color: '#6b8f71' });

const maxHangs = testExercise();
const frontLever = testExercise({
	id: 'exercise-2',
	name: 'Front lever raises',
	description: 'Five sets of three',
	tags: [core]
});

/**
 * Opening an exercise refetches it on its own. Note this pattern also covers
 * "/api/coach/exercises/favorites", so a test needing both must register this
 * one first and let the more specific route win.
 */
async function stubExerciseDetail(page: Page, exercise = maxHangs): Promise<void> {
	await stub(page, 'GET', '/api/coach/exercises/*', { body: exercise });
}

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	await signIn(page, testUser());
	await stub(page, 'GET', '/api/coach/tags', { body: [fingers, core] });
});

test('lists the exercises with their description and tags', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/exercises', {
		body: exercisePage([testExercise({ tags: [fingers] }), frontLever])
	});

	await page.goto('/exercises');

	await expect(page.getByText('Max hangs')).toBeVisible();
	await expect(page.getByText('Seven second hangs on a 20mm edge')).toBeVisible();
	await expect(page.getByText('Front lever raises')).toBeVisible();
	await expect(page.getByText('2 exercises')).toBeVisible();
});

test('shows the empty state when the library has nothing in it', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([]) });

	await page.goto('/exercises');

	await expect(page.getByText('No exercises yet. Create your first one.')).toBeVisible();
});

test('sends the typed search to the server', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([maxHangs]) });
	const queries = capture(page, 'GET', '/api/coach/exercises');

	await page.goto('/exercises');
	await expect(page.getByText('Max hangs')).toBeVisible();
	await page.getByPlaceholder('Search exercises...').fill('lever');

	await expect.poll(() => queries.some((q) => q.url.includes('name=lever'))).toBe(true);
});

test('filters by tag and tells the server which tags are selected', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([maxHangs, frontLever]) });
	const queries = capture(page, 'GET', '/api/coach/exercises');

	await page.goto('/exercises');
	await page.getByRole('button', { name: 'Core', exact: true }).click();

	await expect.poll(() => queries.some((q) => q.url.includes('tags=tag-2'))).toBe(true);
});

test('switches to the favorites endpoint when favorites only is enabled', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([maxHangs, frontLever]) });
	await stub(page, 'GET', '/api/coach/exercises/favorites', {
		body: [testExercise({ is_favorite: true })]
	});

	await page.goto('/exercises');
	await page.getByRole('button', { name: 'Favorites only' }).click();

	await expect(page.getByText('Max hangs')).toBeVisible();
	await expect(page.getByText('Front lever raises')).toBeHidden();
	await expect(page.getByText('1 exercise', { exact: false })).toBeVisible();
});

test('creates an exercise from the modal', async ({ page }) => {
	const created = testExercise({
		id: 'exercise-3',
		name: 'Repeaters',
		description: 'Seven on three off'
	});
	await stubSequence(page, 'GET', '/api/coach/exercises', [
		exercisePage([]),
		exercisePage([created])
	]);
	await stub(page, 'POST', '/api/coach/exercises', { body: created });
	const posted = capture(page, 'POST', '/api/coach/exercises');

	await page.goto('/exercises');
	await page.getByRole('button', { name: 'New exercise' }).click();
	await page.getByLabel('Name *').fill('Repeaters');
	await page.getByLabel('Description').fill('Seven on three off');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText('Exercise created')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'New exercise' })).toBeHidden();
	expect(posted).toHaveLength(1);
	expect(posted[0].body).toMatchObject({ name: 'Repeaters', description: 'Seven on three off' });
});

test('will not save an exercise without a name', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([]) });

	await page.goto('/exercises');
	await page.getByRole('button', { name: 'New exercise' }).click();

	await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
	await page.getByLabel('Name *').fill('Repeaters');
	await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('reports the server error when a create fails', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([]) });
	await stub(page, 'POST', '/api/coach/exercises', {
		status: 422,
		body: { error: 'Name already taken' }
	});

	await page.goto('/exercises');
	await page.getByRole('button', { name: 'New exercise' }).click();
	await page.getByLabel('Name *').fill('Max hangs');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText('Name already taken')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'New exercise' })).toBeVisible();
});

test('edits an existing exercise', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([maxHangs]) });
	await stubExerciseDetail(page);
	await stub(page, 'PUT', '/api/coach/exercises/*', { body: maxHangs });
	const updates = capture(page, 'PUT', '/api/coach/exercises/*');

	await page.goto('/exercises');
	await page.getByRole('button', { name: /^Max hangs/ }).click();
	await page.getByRole('button', { name: 'Edit' }).click();

	await expect(page.getByRole('heading', { name: 'Edit exercise' })).toBeVisible();
	await expect(page.getByLabel('Name *')).toHaveValue('Max hangs');

	await page.getByLabel('Name *').fill('Max hangs on 18mm');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText('Exercise saved')).toBeVisible();
	expect(updates).toHaveLength(1);
	expect(updates[0].body).toMatchObject({ name: 'Max hangs on 18mm' });
	expect(updates[0].url).toContain('/api/coach/exercises/exercise-1');
});

test('deletes an exercise only after the confirmation step', async ({ page }) => {
	await stubSequence(page, 'GET', '/api/coach/exercises', [
		exercisePage([maxHangs]),
		exercisePage([])
	]);
	await stubExerciseDetail(page);
	await stub(page, 'DELETE', '/api/coach/exercises/*', { body: { message: 'deleted' } });
	const deletes = capture(page, 'DELETE', '/api/coach/exercises/*');

	await page.goto('/exercises');
	await page.getByRole('button', { name: /^Max hangs/ }).click();
	await page.getByRole('button', { name: 'Edit' }).click();
	await page.getByRole('button', { name: 'Delete exercise' }).click();

	expect(deletes).toHaveLength(0);
	await expect(page.getByText('Delete Max hangs permanently?')).toBeVisible();

	await page.getByRole('button', { name: 'Confirm delete' }).click();

	await expect(page.getByText('Exercise deleted')).toBeVisible();
	expect(deletes).toHaveLength(1);
	await expect(page.getByText('No exercises yet. Create your first one.')).toBeVisible();
});

test('deletes an exercise from the list row next to the favorite button', async ({ page }) => {
	await stubSequence(page, 'GET', '/api/coach/exercises', [
		exercisePage([maxHangs]),
		exercisePage([])
	]);
	await stub(page, 'DELETE', '/api/coach/exercises/*', { body: { message: 'deleted' } });
	const deletes = capture(page, 'DELETE', '/api/coach/exercises/*');

	await page.goto('/exercises');
	await page.getByRole('button', { name: 'Delete Max hangs' }).click();

	expect(deletes).toHaveLength(0);
	await expect(page.getByText('Delete Max hangs permanently?')).toBeVisible();

	await page.getByRole('button', { name: 'Confirm delete' }).click();

	await expect(page.getByText('Exercise deleted')).toBeVisible();
	expect(deletes).toHaveLength(1);
	expect(deletes[0].url).toContain('/api/coach/exercises/exercise-1');
	await expect(page.getByText('No exercises yet. Create your first one.')).toBeVisible();
});

test('keeps the exercise when the delete confirmation is dismissed', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([maxHangs]) });
	const deletes = capture(page, 'DELETE', '/api/coach/exercises/*');

	await page.goto('/exercises');
	await page.getByRole('button', { name: 'Delete Max hangs' }).click();
	await page.getByRole('button', { name: 'Cancel' }).click();

	await expect(page.getByText('Delete Max hangs permanently?')).toBeHidden();

	await page.getByRole('button', { name: 'Delete Max hangs' }).click();
	await page.keyboard.press('Escape');

	await expect(page.getByText('Delete Max hangs permanently?')).toBeHidden();
	expect(deletes).toHaveLength(0);
	await expect(page.getByText('Max hangs')).toBeVisible();
});

test('reports the server error when a delete fails', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([maxHangs]) });
	await stub(page, 'DELETE', '/api/coach/exercises/*', {
		status: 409,
		body: { error: 'Exercise is used in a training' }
	});

	await page.goto('/exercises');
	await page.getByRole('button', { name: 'Delete Max hangs' }).click();
	await page.getByRole('button', { name: 'Confirm delete' }).click();

	await expect(page.getByText('Exercise is used in a training')).toBeVisible();
	await expect(page.getByRole('button', { name: /^Max hangs/ })).toBeVisible();
});

test('toggles an exercise into the favorites', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([maxHangs]) });
	await stub(page, 'PUT', '/api/coach/exercises/*/favorite', {
		body: testExercise({ is_favorite: true })
	});
	const favorites = capture(page, 'PUT', '/api/coach/exercises/*/favorite');

	await page.goto('/exercises');
	await page.getByRole('button', { name: 'Add to favorites' }).click();

	await expect(page.getByRole('button', { name: 'Remove from favorites' })).toBeVisible();
	expect(favorites).toHaveLength(1);
	expect(favorites[0].body).toEqual({ is_favorite: true });
});

test('opens the detail dialog and closes it with Escape', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/exercises', {
		body: exercisePage([
			testExercise({ comment: 'Keep the shoulders engaged', video_link: 'https://example.com/v' })
		])
	});

	await page.goto('/exercises');
	await page.getByRole('button', { name: /^Max hangs/ }).click();

	const dialog = page.getByRole('dialog');
	await expect(dialog.getByText('Keep the shoulders engaged')).toBeVisible();
	await expect(dialog.getByRole('link', { name: 'https://example.com/v' })).toBeVisible();

	await page.keyboard.press('Escape');

	await expect(dialog).toBeHidden();
});

test('loads the next page of exercises on demand', async ({ page }) => {
	const first = testExercise({ id: 'exercise-1', name: 'Max hangs' });
	const second = testExercise({ id: 'exercise-2', name: 'Front lever raises' });
	await stubSequence(page, 'GET', '/api/coach/exercises', [
		{ exercises: [first], total: 2, limit: 20, offset: 0 },
		{ exercises: [second], total: 2, limit: 20, offset: 1 }
	]);

	await page.goto('/exercises');

	await expect(page.getByText('1 of 2 exercises')).toBeVisible();
	await page.getByRole('button', { name: 'Load more (1 / 2)' }).click();

	await expect(page.getByText('Front lever raises')).toBeVisible();
	await expect(page.getByRole('button', { name: /Load more/ })).toBeHidden();
});
