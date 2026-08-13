import { expect, test, type Page } from '@playwright/test';
import { exercisePage, mockApi, signIn, stub, testExercise, testTag, testUser } from './fixtures';

const leaveDialog = (page: Page) => page.getByRole('dialog', { name: 'Unsaved changes' });

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	await signIn(page, testUser());
});

/**
 * The editor modal covers the shell, so the sidebar cannot be clicked while it
 * is open. Coming from another page makes the back button the way out.
 */
async function openLibraryFromTrainings(page: Page): Promise<void> {
	await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([testExercise()]) });
	await stub(page, 'GET', '/api/coach/tags', { body: [testTag()] });
	await stub(page, 'GET', '/api/trainings', { body: [] });

	await page.goto('/trainings');
	await page
		.getByRole('navigation')
		.first()
		.getByRole('button', { name: 'Exercises', exact: true })
		.click();
	await expect(page).toHaveURL('/exercises');
}

test('escape dismisses the confirmation without discarding the edits behind it', async ({
	page
}) => {
	await openLibraryFromTrainings(page);

	await page.getByRole('button', { name: 'New exercise' }).click();
	await page.getByLabel('Name *').fill('Front lever raises');
	await page.goBack();
	await expect(leaveDialog(page)).toBeVisible();

	await page.keyboard.press('Escape');

	await expect(leaveDialog(page)).toBeHidden();
	await expect(page).toHaveURL('/exercises');
	await expect(page.getByLabel('Name *')).toHaveValue('Front lever raises');

	await page.goBack();
	await expect(leaveDialog(page)).toBeVisible();
});
