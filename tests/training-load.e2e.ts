import { expect, test, type Page } from '@playwright/test';
import {
	mockApi,
	signIn,
	stub,
	testAssessmentSnapshot,
	testEnrolledUser,
	testUser
} from './fixtures';

const nina = testEnrolledUser();

interface TestWeeklyLoad {
	week_start: string;
	week_number: number | null;
	program_name: string | null;
	session_count: number;
	total_minutes: number;
	climbing_minutes: number;
	strength_minutes: number;
	rated_sessions: number;
	failed_sessions: number;
	mean_rpe: number | null;
	acute_load: number | null;
	chronic_load: number | null;
	chronic_weeks: number;
	acute_chronic_ratio: number | null;
	load_change_percent: number | null;
}

function testWeek(weekStart: string, overrides: Partial<TestWeeklyLoad> = {}): TestWeeklyLoad {
	return {
		week_start: weekStart,
		week_number: null,
		program_name: null,
		session_count: 0,
		total_minutes: 0,
		climbing_minutes: 0,
		strength_minutes: 0,
		rated_sessions: 0,
		failed_sessions: 0,
		mean_rpe: null,
		acute_load: 0,
		chronic_load: null,
		chronic_weeks: 0,
		acute_chronic_ratio: null,
		load_change_percent: null,
		...overrides
	};
}

async function stubCoacheePage(page: Page, weeks: TestWeeklyLoad[]): Promise<void> {
	await stub(page, 'GET', '/api/coach/enrollments', { body: [nina] });
	await stub(page, 'GET', '/api/coach/clients/*/sessions', { body: [] });
	await stub(page, 'GET', '/api/coach/clients/*/assessments', { body: [] });
	await stub(page, 'GET', '/api/coach/clients/*/assessments/at', {
		body: testAssessmentSnapshot('2026-03-02')
	});
	await stub(page, 'GET', '/api/coach/clients/*/programs', { body: [] });
	await stub(page, 'GET', '/api/coach/clients/*/bodyweights', { body: [] });
	await stub(page, 'GET', '/api/coach/clients/*/training-load', { body: { weeks } });
}

async function openLoadTab(page: Page): Promise<void> {
	await page.goto('/coachees/coachee-1');
	await page.getByRole('button', { name: /^Load/ }).click();
}

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	await signIn(page, testUser());
});

test.describe('weekly training load', () => {
	test('reads the current week against the coach reference bands', async ({ page }) => {
		await stubCoacheePage(page, [
			testWeek('2026-08-31', {
				session_count: 2,
				total_minutes: 150,
				climbing_minutes: 90,
				strength_minutes: 60,
				rated_sessions: 2,
				mean_rpe: 6,
				acute_load: 900,
				chronic_load: 1100,
				chronic_weeks: 3,
				acute_chronic_ratio: 0.82,
				load_change_percent: 95
			}),
			testWeek('2026-09-07', {
				week_number: 4,
				program_name: 'Autumn power block',
				session_count: 4,
				total_minutes: 375,
				climbing_minutes: 270,
				strength_minutes: 105,
				rated_sessions: 2,
				failed_sessions: 1,
				mean_rpe: 8,
				acute_load: 3000,
				chronic_load: 1300,
				chronic_weeks: 3,
				acute_chronic_ratio: 2.31,
				load_change_percent: 333
			})
		]);

		await openLoadTab(page);

		await expect(page.getByText('2.31', { exact: true }).first()).toBeVisible();
		await expect(page.getByText('Danger zone').first()).toBeVisible();
		await expect(page.getByText('3,000').first()).toBeVisible();

		// The mean has to say how much of the week it speaks for, or a number
		// resting on two of four sessions reads like one resting on all four.
		await expect(page.getByText(/2 of 4 rated/)).toBeVisible();
		await expect(page.getByText(/1 ECHEC, outside the mean/).first()).toBeVisible();
	});

	test('never lets a week land in the range the sheet does not label', async ({ page }) => {
		await stubCoacheePage(page, [
			testWeek('2026-09-07', {
				session_count: 3,
				total_minutes: 315,
				climbing_minutes: 210,
				strength_minutes: 105,
				rated_sessions: 3,
				mean_rpe: 6.5,
				acute_load: 2047.5,
				chronic_load: 1525.8,
				chronic_weeks: 3,
				acute_chronic_ratio: 1.34,
				load_change_percent: 143
			})
		]);

		await openLoadTab(page);

		// 1.34 falls between the sheet's "0.8 to 1.3 optimal" and its "> 1.5
		// danger". It must be neither, and the page must say why rather than
		// leaving the coach to guess which side it was rounded onto.
		await expect(page.getByText('1.34', { exact: true }).first()).toBeVisible();
		await expect(page.getByText('Not labelled by the sheet').first()).toBeVisible();
		await expect(page.getByText(/It says nothing about 1.3 to 1.5/)).toBeVisible();
	});

	test('keeps a silent week on the chart rather than skipping it', async ({ page }) => {
		await stubCoacheePage(page, [
			testWeek('2026-08-24'),
			testWeek('2026-08-31', {
				session_count: 2,
				total_minutes: 150,
				climbing_minutes: 90,
				strength_minutes: 60,
				rated_sessions: 2,
				mean_rpe: 6,
				acute_load: 900,
				chronic_load: 450,
				chronic_weeks: 2,
				acute_chronic_ratio: 2
			})
		]);

		await openLoadTab(page);

		// The rest week is a row of its own with a real zero, since the chronic
		// mean counts it and a coach reading the table has to see it did.
		await expect(page.getByText('24 Aug')).toBeVisible();
		await expect(page.getByText(/Baseline is 2 weeks rather than 3/)).toBeVisible();
	});

	test('shows a week that was trained but never rated as unknown, not as zero', async ({
		page
	}) => {
		await stubCoacheePage(page, [
			testWeek('2026-09-07', {
				session_count: 2,
				total_minutes: 120,
				climbing_minutes: 120,
				strength_minutes: 0,
				rated_sessions: 0,
				mean_rpe: null,
				acute_load: null,
				chronic_load: 600,
				chronic_weeks: 2,
				acute_chronic_ratio: null,
				load_change_percent: null
			})
		]);

		await openLoadTab(page);

		// Two hours were trained. The effort is not known, so the load is a gap
		// and never a zero that would pull the coach's reading the wrong way.
		await expect(page.getByText('2h').first()).toBeVisible();
		await expect(page.getByText('Not rated').first()).toBeVisible();
		await expect(page.getByText('0 of 2 rated')).toBeVisible();
	});

	test('says the bands are the coach reference and not a Crimpy verdict', async ({ page }) => {
		await stubCoacheePage(page, [
			testWeek('2026-09-07', {
				session_count: 1,
				total_minutes: 60,
				climbing_minutes: 60,
				rated_sessions: 1,
				mean_rpe: 7,
				acute_load: 420,
				chronic_load: 420,
				chronic_weeks: 1,
				acute_chronic_ratio: 1
			})
		]);

		await openLoadTab(page);

		await expect(page.getByText(/not a Crimpy verdict/)).toBeVisible();
		await expect(page.getByText(/1.00 by construction/)).toBeVisible();
	});

	test('says the series could not be read rather than drawing zeros', async ({ page }) => {
		await stubCoacheePage(page, []);
		await stub(page, 'GET', '/api/coach/clients/*/training-load', { status: 500, body: {} });

		await openLoadTab(page);

		await expect(page.getByText(/could not be read/)).toBeVisible();
	});
});
