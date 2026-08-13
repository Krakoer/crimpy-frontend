import { expect, test, type Page } from '@playwright/test';
import {
	API_URL,
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

const sidebarLink = (page: Page, name: string) =>
	page.getByRole('navigation').first().getByRole('button', { name, exact: true });

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	await signIn(page, testUser());
});

test.describe('exercise panel opened while its details are still loading', () => {
	/**
	 * The library opens the panel from the list entry and then refreshes it from
	 * the detail endpoint, which is what a coach can type over. Holding that
	 * response back reproduces the window reliably.
	 */
	async function stubSlowExerciseDetail(page: Page, body: unknown): Promise<void> {
		await page.route(`${API_URL}/**`, async (route) => {
			const request = route.request();
			const { pathname } = new URL(request.url());
			if (request.method() !== 'GET' || !/^\/api\/coach\/exercises\/[^/]+$/.test(pathname)) {
				return route.fallback();
			}
			await new Promise((resolve) => setTimeout(resolve, 1500));
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(body)
			});
		});
	}

	/**
	 * The editor modal covers the shell, so the sidebar cannot be clicked while it
	 * is open. Coming from another page makes the back button the way out.
	 */
	async function openEditorWhileDetailLoads(page: Page): Promise<void> {
		await stub(page, 'GET', '/api/trainings', { body: [] });
		await stub(page, 'GET', '/api/coach/exercises', { body: exercisePage([testExercise()]) });
		await stub(page, 'GET', '/api/coach/tags', { body: [testTag()] });
		await stubSlowExerciseDetail(page, testExercise({ tags: [testTag()] }));

		await page.goto('/trainings');
		await sidebarLink(page, 'Exercises').click();
		await expect(page).toHaveURL('/exercises');

		await page.getByRole('button', { name: /^Max hangs/ }).click();
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
	}

	/**
	 * The tag chip only appears once the detail response has been applied. The
	 * chip lives inside the tag picker, whose own role is button too, so the name
	 * has to match exactly to single out the chip's remove control.
	 */
	async function waitForDetail(page: Page): Promise<void> {
		await expect(page.getByRole('button', { name: 'Remove Fingers', exact: true })).toBeVisible();
	}

	test('keeps an edit typed before the details land', async ({ page }) => {
		await openEditorWhileDetailLoads(page);

		await page.getByLabel('Name *').fill('Max hangs on 15mm');
		await waitForDetail(page);
		await expect(page.getByLabel('Name *')).toHaveValue('Max hangs on 15mm');

		await page.goBack();
		await expect(leaveDialog(page)).toBeVisible();
		await expect(page).toHaveURL('/exercises');
	});

	test('lets an untouched exercise go once its tags are filled in', async ({ page }) => {
		await openEditorWhileDetailLoads(page);

		await waitForDetail(page);
		await page.goBack();

		await expect(page).toHaveURL('/trainings');
		await expect(leaveDialog(page)).toBeHidden();
	});
});

test.describe('program duration field', () => {
	const PROGRAM_URL = '/coachees/coachee-1/programs/program-1';

	test('asks only when the week count really changed', async ({ page }) => {
		await stub(page, 'GET', '/api/coach/enrollments', { body: [testEnrolledUser()] });
		await stub(page, 'GET', '/api/coach/clients/*/programs/*', { body: testProgram() });
		await stub(page, 'GET', '/api/coach/clients/*/programs/*/weeks', { body: [] });
		await stub(page, 'GET', '/api/trainings', { body: [testTraining()] });

		await page.goto(PROGRAM_URL);
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await page.getByRole('button', { name: 'Edit details' }).click();

		await page.getByLabel('Weeks').fill('6');
		await sidebarLink(page, 'Trainings').click();
		await expect(leaveDialog(page)).toBeVisible();
		await page.getByRole('button', { name: 'Stay' }).click();

		await page.getByLabel('Weeks').fill('4');
		await sidebarLink(page, 'Trainings').click();

		await expect(page).toHaveURL('/trainings');
		await expect(leaveDialog(page)).toBeHidden();
	});
});

test.describe('new program duration field', () => {
	test('stops asking once the duration is cleared again', async ({ page }) => {
		await stub(page, 'GET', '/api/coach/enrollments', { body: [testEnrolledUser()] });
		await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [] });
		await stub(page, 'GET', '/api/coach/clients/*/assessments', { body: [] });
		await stub(page, 'GET', '/api/coach/clients/*/programs', { body: [] });

		await page.goto('/coachees/coachee-1');
		await page.getByRole('button', { name: /^Programs/ }).click();
		await page.getByRole('button', { name: 'Create first program' }).click();

		await page.getByLabel('Duration').fill('4');
		await sidebarLink(page, 'Coachees').click();
		await expect(leaveDialog(page)).toBeVisible();
		await page.getByRole('button', { name: 'Stay' }).click();

		await page.getByLabel('Duration').fill('');
		await sidebarLink(page, 'Coachees').click();

		await expect(page).toHaveURL('/coachees');
		await expect(leaveDialog(page)).toBeHidden();
	});
});
