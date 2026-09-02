import { expect, test } from '@playwright/test';
import {
	mockApi,
	mondayDaysAgo,
	isoDaysAgo,
	isoHoursAgo,
	signIn,
	stub,
	testCoachTodo,
	testFeedEvent,
	testUser
} from './fixtures';

test.beforeEach(async ({ page }) => {
	await mockApi(page);
	await signIn(page, testUser());
	await stub(page, 'GET', '/api/coach/enrollments', { body: [] });
	await stub(page, 'GET', '/api/trainings', { body: [] });
	await stub(page, 'GET', '/api/coach/exercises', { body: { exercises: [], total: 0 } });
});

test('reads the activity of every coachee out of one feed call', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/todo', { body: testCoachTodo() });
	await stub(page, 'GET', '/api/coach/feed', {
		body: [
			testFeedEvent({ note: 'shoulder felt tight' }),
			testFeedEvent({
				kind: 'availability_declared',
				occurred_at: isoDaysAgo(1),
				user_firstname: 'Sam',
				user_lastname: 'Crimp',
				session_id: undefined,
				title: undefined,
				activity: undefined,
				origin: undefined,
				week_start: mondayDaysAgo(-7)
			}),
			testFeedEvent({
				kind: 'coachee_enrolled',
				occurred_at: isoDaysAgo(4),
				user_firstname: 'Ash',
				user_lastname: 'Sloper',
				session_id: undefined,
				title: undefined,
				activity: undefined,
				origin: undefined
			})
		]
	});

	await page.goto('/dashboard');

	await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
	await expect(page.getByText('played Endurance 4x4')).toBeVisible();
	await expect(page.getByText('shoulder felt tight')).toBeVisible();
	await expect(page.getByText('declared their availability')).toBeVisible();
	await expect(page.getByText('joined your coachees')).toBeVisible();
});

test('pages the feed backwards from the oldest event it holds', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/todo', { body: testCoachTodo() });
	const oldest = isoHoursAgo(48);
	// A full page is what tells the panel there may be more behind it.
	const firstPage = Array.from({ length: 12 }, (_, index) =>
		testFeedEvent({
			session_id: `session-${index}`,
			title: `Session ${index}`,
			occurred_at: index === 11 ? oldest : isoHoursAgo(index)
		})
	);
	let requestedBefore: string | null = null;
	await page.route(`http://api.test/**`, async (route) => {
		const url = new URL(route.request().url());
		if (route.request().method() !== 'GET' || url.pathname !== '/api/coach/feed') {
			return route.fallback();
		}
		const before = url.searchParams.get('before');
		if (before) requestedBefore = before;
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(
				before ? [testFeedEvent({ session_id: 'older', title: 'An older session' })] : firstPage
			)
		});
	});

	await page.goto('/dashboard');
	await expect(page.getByText('Session 0')).toBeVisible();

	await page.getByRole('button', { name: 'Show older' }).click();

	await expect(page.getByText('An older session')).toBeVisible();
	expect(requestedBefore).toBe(oldest);
	// One full page then a short one, so there is nothing left to ask for.
	await expect(page.getByRole('button', { name: 'Show older' })).toHaveCount(0);
});

test('lists what the coach still owes, and counts it', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/feed', { body: [] });
	await stub(page, 'GET', '/api/coach/todo', {
		body: testCoachTodo({
			pending_feedback: [
				{
					session_id: 'session-9',
					user_id: 'user-42',
					user_firstname: 'Robin',
					user_lastname: 'Slab',
					session_name: 'Repeaters',
					session_date: isoDaysAgo(1),
					activity: 0,
					notes: 'the last set was brutal'
				}
			],
			pending_feedback_total: 1,
			empty_weeks: [
				{
					scope: 'next' as const,
					program_id: 'program-3',
					program_name: 'Winter block',
					user_id: 'user-42',
					user_firstname: 'Robin',
					user_lastname: 'Slab',
					week_number: 5,
					week_start: mondayDaysAgo(-7)
				}
			],
			sessions_this_week: 6
		})
	});

	await page.goto('/dashboard');

	await expect(page.getByRole('heading', { name: 'To do' })).toBeVisible();
	await expect(page.getByText('Waiting on your answer')).toBeVisible();
	await expect(page.getByText('the last set was brutal')).toBeVisible();
	await expect(page.getByText('Weeks left to program')).toBeVisible();
	await expect(page.getByText(/Winter block - week 5 starts/)).toBeVisible();
	await expect(page.getByText('This week').locator('..')).toContainText('6');
});

test('groups a current week nobody programmed apart from the one still to come', async ({
	page
}) => {
	await stub(page, 'GET', '/api/coach/feed', { body: [] });
	await stub(page, 'GET', '/api/coach/todo', {
		body: testCoachTodo({
			empty_weeks: [
				{
					scope: 'current' as const,
					program_id: 'program-3',
					program_name: 'Winter block',
					user_id: 'user-42',
					user_firstname: 'Robin',
					user_lastname: 'Slab',
					week_number: 5,
					week_start: mondayDaysAgo(0)
				},
				{
					scope: 'next' as const,
					program_id: 'program-4',
					program_name: 'Power block',
					user_id: 'user-43',
					user_firstname: 'Sam',
					user_lastname: 'Jug',
					week_number: 2,
					week_start: mondayDaysAgo(-7)
				}
			]
		})
	});

	await page.goto('/dashboard');

	await expect(page.getByText('Being trained with nothing programmed')).toBeVisible();
	await expect(page.getByText('Winter block - week 5, this week')).toBeVisible();
	await expect(page.getByText('Weeks left to program')).toBeVisible();
	await expect(page.getByText(/Power block - week 2 starts/)).toBeVisible();
	await expect(page.getByRole('heading', { name: 'To do' }).locator('..')).toContainText('2');
});

test('lists a current week even before the empty week check is due', async ({ page }) => {
	// The athlete is training it right now, so holding it back until the coach's
	// weekly moment is how a missed window loses the reminder for good.
	await stub(page, 'GET', '/api/coach/feed', { body: [] });
	await stub(page, 'GET', '/api/coach/todo', {
		body: testCoachTodo({
			empty_weeks: [
				{
					scope: 'current' as const,
					program_id: 'program-3',
					program_name: 'Winter block',
					user_id: 'user-42',
					user_firstname: 'Robin',
					user_lastname: 'Slab',
					week_number: 5,
					week_start: mondayDaysAgo(0)
				}
			],
			empty_week_check: {
				day_of_week: 4,
				hour: 21,
				minute: 0,
				reached: false,
				week_start: mondayDaysAgo(-7)
			}
		})
	});

	await page.goto('/dashboard');

	await expect(page.getByText('Winter block - week 5, this week')).toBeVisible();
	await expect(page.getByText('Nothing waiting on you.')).toHaveCount(0);
	await expect(page.getByText(/are listed from Friday at 21:00/)).toBeVisible();
});

test('caps each group and says how many are left over', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/feed', { body: [] });
	await stub(page, 'GET', '/api/coach/todo', {
		body: testCoachTodo({
			pending_feedback: Array.from({ length: 8 }, (_, index) => ({
				session_id: `session-${index}`,
				user_id: 'user-42',
				user_firstname: 'Robin',
				user_lastname: 'Slab',
				session_name: `Repeaters ${index}`,
				session_date: isoDaysAgo(index),
				activity: 0,
				notes: `note ${index}`
			})),
			pending_feedback_total: 8
		})
	});

	await page.goto('/dashboard');

	await expect(page.getByText('note 4')).toBeVisible();
	await expect(page.getByText('note 5')).toHaveCount(0);
	await expect(page.getByText('and 3 more')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'To do' }).locator('..')).toContainText('8');
});

test('counts the answers the API capped out of the list', async ({ page }) => {
	// The API returns at most 50 rows. Counting the rows would freeze the badge
	// at the cap and understate what is actually waiting.
	await stub(page, 'GET', '/api/coach/feed', { body: [] });
	await stub(page, 'GET', '/api/coach/todo', {
		body: testCoachTodo({
			pending_feedback: Array.from({ length: 50 }, (_, index) => ({
				session_id: `session-${index}`,
				user_id: 'user-42',
				user_firstname: 'Robin',
				user_lastname: 'Slab',
				session_name: `Repeaters ${index}`,
				session_date: isoDaysAgo(index),
				activity: 0,
				notes: `note ${index}`
			})),
			pending_feedback_total: 57
		})
	});

	await page.goto('/dashboard');

	await expect(page.getByText('and 52 more')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'To do' }).locator('..')).toContainText('57');
});

test('says so when older activity cannot be loaded', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/todo', { body: testCoachTodo() });
	const firstPage = Array.from({ length: 12 }, (_, index) =>
		testFeedEvent({
			session_id: `session-${index}`,
			title: `Session ${index}`,
			occurred_at: isoHoursAgo(index)
		})
	);
	// The panel already holds a page, so its empty state cannot carry this.
	await page.route('http://api.test/**', async (route) => {
		const url = new URL(route.request().url());
		if (route.request().method() !== 'GET' || url.pathname !== '/api/coach/feed') {
			return route.fallback();
		}
		if (url.searchParams.get('before')) {
			return route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'Failed to retrieve feed' })
			});
		}
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(firstPage)
		});
	});

	await page.goto('/dashboard');
	await expect(page.getByText('Session 0')).toBeVisible();

	await page.getByRole('button', { name: 'Show older' }).click();

	await expect(page.getByText('Could not load older activity')).toBeVisible();
	await expect(page.getByText('Session 0')).toBeVisible();
});

test('opens the program of an unprogrammed week', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/feed', { body: [] });
	await stub(page, 'GET', '/api/coach/todo', {
		body: testCoachTodo({
			empty_weeks: [
				{
					scope: 'next' as const,
					program_id: 'program-3',
					program_name: 'Winter block',
					user_id: 'user-42',
					user_firstname: 'Robin',
					user_lastname: 'Slab',
					week_number: 5,
					week_start: mondayDaysAgo(-7)
				}
			]
		})
	});

	await page.goto('/dashboard');
	await page.getByText(/Winter block - week 5/).click();

	await expect(page).toHaveURL('/coachees/user-42/programs/program-3');
});

test('says when the empty week check is due instead of showing an empty list', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/feed', { body: [] });
	await stub(page, 'GET', '/api/coach/todo', {
		body: testCoachTodo({
			empty_week_check: {
				day_of_week: 4,
				hour: 21,
				minute: 0,
				reached: false,
				week_start: mondayDaysAgo(-7)
			}
		})
	});

	await page.goto('/dashboard');

	await expect(page.getByText('Nothing waiting on you.')).toBeVisible();
	await expect(page.getByText(/are listed from Friday at 21:00/)).toBeVisible();
});

test('keeps the dashboard usable when the feed cannot be read', async ({ page }) => {
	await stub(page, 'GET', '/api/coach/todo', { body: testCoachTodo() });
	await stub(page, 'GET', '/api/coach/feed', { status: 500, body: { error: 'boom' } });

	await page.goto('/dashboard');

	await expect(page.getByText('The activity feed could not be read.')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'To do' })).toBeVisible();
});
