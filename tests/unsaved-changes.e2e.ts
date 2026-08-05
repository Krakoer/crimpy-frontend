import { expect, test, type Page } from '@playwright/test';
import {
	exercisePage,
	mockApi,
	signIn,
	stub,
	testEnrolledUser,
	testExercise,
	testProgram,
	testTag,
	testTraining,
	testUser
} from './fixtures';

const leaveDialog = (page: Page) => page.getByRole('dialog', { name: 'Unsaved changes' });

/**
 * The shell renders the sidebar before anything a page contributes, so its own
 * nav is the first one. Page content reuses these labels in breadcrumbs and
 * headings, which a bare name lookup would match too.
 */
const sidebarLink = (page: Page, name: string) =>
	page.getByRole('navigation').first().getByRole('button', { name, exact: true });

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	await signIn(page, testUser());
});

test.describe('training editor', () => {
	async function stubEditorPalette(page: Page): Promise<void> {
		await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([testExercise()]) });
		await stub(page, 'GET', '/api/coach/tags', { body: [testTag()] });
	}

	test('holds the coach on the page until they confirm', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'GET', '/api/trainings', { body: [] });

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Board intervals');
		await sidebarLink(page, 'Trainings').click();

		await expect(leaveDialog(page)).toBeVisible();
		await expect(page).toHaveURL('/trainings/new');

		await page.getByRole('button', { name: 'Stay' }).click();
		await expect(leaveDialog(page)).toBeHidden();
		await expect(page).toHaveURL('/trainings/new');
		await expect(page.getByPlaceholder('Training title').first()).toHaveValue('Board intervals');

		await sidebarLink(page, 'Trainings').click();
		await page.getByRole('button', { name: 'Leave' }).click();

		await expect(page).toHaveURL('/trainings');
	});

	test('lets an untouched draft go without asking', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'GET', '/api/trainings', { body: [] });

		await page.goto('/trainings/new');
		await sidebarLink(page, 'Trainings').click();

		await expect(page).toHaveURL('/trainings');
		await expect(leaveDialog(page)).toBeHidden();
	});

	test('does not block the redirect that follows a create', async ({ page }) => {
		await stubEditorPalette(page);
		const created = testTraining({ id: 'training-9', title: 'Board intervals' });
		await stub(page, 'POST', '/api/trainings', { body: created });
		await stub(page, 'GET', '/api/trainings/*', { body: created });

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Board intervals');
		await page.getByRole('button', { name: 'Save training' }).click();

		await expect(page).toHaveURL('/trainings/training-9');
		await expect(leaveDialog(page)).toBeHidden();
	});

	test('asks again on the back button and restores the entry when the coach stays', async ({
		page
	}) => {
		await stubEditorPalette(page);
		await stub(page, 'GET', '/api/trainings', { body: [] });

		await page.goto('/trainings');
		await page.getByRole('button', { name: 'New training' }).first().click();
		await expect(page).toHaveURL('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Board intervals');

		await page.goBack();
		await expect(leaveDialog(page)).toBeVisible();
		await expect(page).toHaveURL('/trainings/new');

		await page.getByRole('button', { name: 'Stay' }).click();
		await expect(page).toHaveURL('/trainings/new');

		await page.goBack();
		await page.getByRole('button', { name: 'Leave' }).click();

		await expect(page).toHaveURL('/trainings');
	});

	test('warns the browser before the tab is reloaded away', async ({ page }) => {
		await stubEditorPalette(page);

		await page.goto('/trainings/new');
		await page.getByPlaceholder('Training title').first().fill('Board intervals');

		const dialogs: string[] = [];
		page.on('dialog', (dialog) => {
			dialogs.push(dialog.type());
			return dialog.accept();
		});
		await page.reload();

		expect(dialogs).toContain('beforeunload');
	});

	test('guards the exercise being drafted in the modal', async ({ page }) => {
		await stubEditorPalette(page);
		await stub(page, 'GET', '/api/trainings', { body: [] });

		await page.goto('/trainings');
		await page.getByRole('button', { name: 'New training' }).first().click();
		await expect(page).toHaveURL('/trainings/new');
		await page.getByTitle('Create new exercise').click();
		await page.getByPlaceholder('Exercise name').fill('Front lever raises');
		await page.goBack();

		await expect(leaveDialog(page)).toBeVisible();
		await expect(page).toHaveURL('/trainings/new');
	});
});

test.describe('exercise library', () => {
	/**
	 * The editor panel covers the shell, so the sidebar cannot be clicked while
	 * it is open. Coming from another page makes the back button the way out.
	 */
	async function openLibraryFromTrainings(page: Page): Promise<void> {
		await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([testExercise()]) });
		await stub(page, 'GET', '/api/coach/tags', { body: [testTag()] });
		await stub(page, 'GET', '/api/trainings', { body: [] });

		await page.goto('/trainings');
		await sidebarLink(page, 'Exercises').click();
		await expect(page).toHaveURL('/exercises');
	}

	test('guards the exercise panel while it holds unsaved edits', async ({ page }) => {
		await openLibraryFromTrainings(page);

		await page.getByRole('button', { name: 'New exercise' }).click();
		await page.getByLabel('Name *').fill('Front lever raises');
		await page.goBack();

		await expect(leaveDialog(page)).toBeVisible();
		await expect(page).toHaveURL('/exercises');

		await page.getByRole('button', { name: 'Leave' }).click();
		await expect(page).toHaveURL('/trainings');
	});

	test('stops guarding once the panel is closed', async ({ page }) => {
		await openLibraryFromTrainings(page);

		await page.getByRole('button', { name: 'New exercise' }).click();
		await page.getByLabel('Name *').fill('Front lever raises');
		await page.getByRole('button', { name: 'Cancel' }).click();
		await page.goBack();

		await expect(page).toHaveURL('/trainings');
		await expect(leaveDialog(page)).toBeHidden();
	});
});

test.describe('coachee detail', () => {
	async function stubCoacheeDetail(page: Page): Promise<void> {
		await stub(page, 'GET', '/api/coach/enrollments', { body: [testEnrolledUser()] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [] });
		await stub(page, 'GET', '/api/coach/clients/*/assessments', { body: [] });
		await stub(page, 'GET', '/api/coach/clients/*/programs', { body: [] });
	}

	test('guards a half filled new program form', async ({ page }) => {
		await stubCoacheeDetail(page);
		await stub(page, 'GET', '/api/coach/enrollments', { body: [testEnrolledUser()] });

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Programs/ }).click();
		await page.getByRole('button', { name: 'Create first program' }).click();
		await page.getByLabel('Program name *').fill('Spring strength block');
		await sidebarLink(page, 'Coachees').click();

		await expect(leaveDialog(page)).toBeVisible();
		await expect(page).toHaveURL('/coachees/coachee-1');

		await page.getByRole('button', { name: 'Leave' }).click();
		await expect(page).toHaveURL('/coachees');
	});
});

test.describe('program editor', () => {
	const PROGRAM_URL = '/coachees/coachee-1/programs/program-1';

	async function stubProgram(page: Page): Promise<void> {
		await stub(page, 'GET', '/api/coach/enrollments', { body: [testEnrolledUser()] });
		await stub(page, 'GET', '/api/coach/clients/*/programs/*', { body: testProgram() });
		await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', { body: [] });
		await stub(page, 'GET', '/api/trainings', { body: [testTraining()] });
	}

	test('guards the program details while they are being edited', async ({ page }) => {
		await stubProgram(page);

		await page.goto(PROGRAM_URL);
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await page.getByRole('button', { name: 'Edit details' }).click();
		await page.getByLabel('Name').fill('Autumn power block');
		await sidebarLink(page, 'Trainings').click();

		await expect(leaveDialog(page)).toBeVisible();
		await expect(page).toHaveURL(PROGRAM_URL);
	});

	test('lets an unchanged program go without asking', async ({ page }) => {
		await stubProgram(page);

		await page.goto(PROGRAM_URL);
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await page.getByRole('button', { name: 'Edit details' }).click();
		await sidebarLink(page, 'Trainings').click();

		await expect(page).toHaveURL('/trainings');
		await expect(leaveDialog(page)).toBeHidden();
	});
});
