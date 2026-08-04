import type { Page } from '@playwright/test';

/**
 * The app resolves its API base url at runtime from GET /config.json, which
 * serves PUBLIC_API_URL. playwright.config.ts pins that to this origin so every
 * backend call can be intercepted without a real backend.
 *
 * These types mirror src/lib/api/client.ts. They are duplicated on purpose:
 * that module reaches for $app/environment through $lib/config, which cannot be
 * imported outside the SvelteKit build.
 */
export const API_URL = 'http://api.test';

export interface TestUser {
	id: string;
	email: string;
	firstname: string;
	lastname: string;
	is_coach: boolean;
	coach_validated: boolean;
	is_admin: boolean;
	email_verified: boolean;
}

export function testUser(overrides: Partial<TestUser> = {}): TestUser {
	return {
		id: 'user-1',
		email: 'coach@example.com',
		firstname: 'Alex',
		lastname: 'Belay',
		is_coach: true,
		coach_validated: true,
		is_admin: false,
		email_verified: true,
		...overrides
	};
}

interface StubOptions {
	status?: number;
	body?: unknown;
}

/**
 * Turns a stub path into a matcher where "*" stands for exactly one url
 * segment, so "/api/coach/exercises/*" matches an exercise but not its nested
 * tag routes.
 */
function pathMatcher(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+');
	return new RegExp(`^${escaped}$`);
}

/**
 * Rejects every backend call that a test has not explicitly stubbed, so an
 * unmocked endpoint surfaces as a clear 404 instead of a DNS timeout. Playwright
 * gives precedence to the most recently registered route, so this must be
 * installed before any stub().
 */
export async function mockApi(page: Page): Promise<void> {
	await page.route(`${API_URL}/**`, (route) => {
		const { pathname } = new URL(route.request().url());
		return route.fulfill({
			status: 404,
			contentType: 'application/json',
			body: JSON.stringify({ error: `unmocked ${route.request().method()} ${pathname}` })
		});
	});
}

/**
 * Every stub listens on the whole origin and matches on method plus pathname,
 * handing anything else to the next route with fallback(). Matching the
 * pathname rather than the full url keeps query strings, such as the paging and
 * filter parameters on the exercise list, from defeating the match.
 */
export async function stub(
	page: Page,
	method: string,
	path: string,
	options: StubOptions = {}
): Promise<void> {
	const matches = pathMatcher(path);
	await page.route(`${API_URL}/**`, async (route) => {
		const request = route.request();
		if (request.method() !== method) return route.fallback();
		if (!matches.test(new URL(request.url()).pathname)) return route.fallback();

		const status = options.status ?? 200;
		if (status === 204) return route.fulfill({ status });
		await route.fulfill({
			status,
			contentType: 'application/json',
			body: JSON.stringify(options.body ?? {})
		});
	});
}

/**
 * Serves one body per call, repeating the last. Lets a test assert that a
 * mutation refreshed its list, by returning different content the second time.
 */
export async function stubSequence(
	page: Page,
	method: string,
	path: string,
	bodies: unknown[]
): Promise<void> {
	const matches = pathMatcher(path);
	let call = 0;
	await page.route(`${API_URL}/**`, async (route) => {
		const request = route.request();
		if (request.method() !== method) return route.fallback();
		if (!matches.test(new URL(request.url()).pathname)) return route.fallback();

		const body = bodies[Math.min(call, bodies.length - 1)];
		call += 1;
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(body)
		});
	});
}

export interface CapturedRequest {
	url: string;
	body: unknown;
}

/**
 * Records matching requests so a test can assert on what the app sent. This
 * observes rather than intercepts, so it composes with any stub().
 */
export function capture(page: Page, method: string, path: string): CapturedRequest[] {
	const seen: CapturedRequest[] = [];
	const matches = pathMatcher(path);
	page.on('request', (request) => {
		if (request.method() !== method) return;
		const url = new URL(request.url());
		if (url.origin !== API_URL || !matches.test(url.pathname)) return;
		const raw = request.postData();
		seen.push({ url: request.url(), body: raw ? JSON.parse(raw) : null });
	});
	return seen;
}

/** Stubs POST /auth/login so a sign-in resolves to this user. */
export async function stubLogin(page: Page, user: TestUser): Promise<void> {
	await stub(page, 'POST', '/auth/login', {
		body: { token: 'test-token', refresh_token: 'test-refresh-token', user }
	});
	await stub(page, 'GET', '/api/user', { body: user });
}

/**
 * Seeds the session the way authStore does, so protected routes can be visited
 * directly. verifyUser() revalidates the token against GET /api/user on every
 * guarded load, so that endpoint is stubbed too.
 */
export async function signIn(page: Page, user: TestUser): Promise<void> {
	await page.addInitScript((seeded) => {
		localStorage.setItem('auth_token', 'test-token');
		localStorage.setItem('refresh_token', 'test-refresh-token');
		localStorage.setItem('user', JSON.stringify(seeded));
	}, user);
	await stub(page, 'GET', '/api/user', { body: user });
}

/** Dates are always relative so fixtures cannot rot into the past. */
export function isoDaysAgo(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return date.toISOString();
}

export interface TestCoach {
	id: string;
	email: string;
	firstname: string;
	lastname: string;
	is_coach: boolean;
	coach_validated: boolean;
	email_verified: boolean;
	created_at: string;
}

export function testCoach(overrides: Partial<TestCoach> = {}): TestCoach {
	return {
		id: 'coach-1',
		email: 'pending@example.com',
		firstname: 'Robin',
		lastname: 'Slab',
		is_coach: true,
		coach_validated: false,
		email_verified: true,
		created_at: isoDaysAgo(3),
		...overrides
	};
}

export interface TestEnrolledUser {
	enrollment_id: string;
	user_id: string;
	user_firstname: string;
	user_lastname: string;
	user_email: string;
	enrolled_at: string;
}

export function testEnrolledUser(overrides: Partial<TestEnrolledUser> = {}): TestEnrolledUser {
	return {
		enrollment_id: 'enrollment-1',
		user_id: 'coachee-1',
		user_firstname: 'Nina',
		user_lastname: 'Crimp',
		user_email: 'nina@example.com',
		enrolled_at: isoDaysAgo(30),
		...overrides
	};
}

export interface TestTag {
	id: string;
	name: string;
	color: string;
	is_builtin: boolean;
	created_at: string;
	updated_at: string;
}

export function testTag(overrides: Partial<TestTag> = {}): TestTag {
	return {
		id: 'tag-1',
		name: 'Fingers',
		color: '#c2714f',
		is_builtin: false,
		created_at: isoDaysAgo(60),
		updated_at: isoDaysAgo(60),
		...overrides
	};
}

export interface TestExercise {
	id: string;
	coach_id: string;
	name: string;
	description?: string | null;
	comment?: string | null;
	video_link?: string | null;
	is_favorite?: boolean;
	tags?: TestTag[];
	created_at: string;
	updated_at: string;
}

export function testExercise(overrides: Partial<TestExercise> = {}): TestExercise {
	return {
		id: 'exercise-1',
		coach_id: 'user-1',
		name: 'Max hangs',
		description: 'Seven second hangs on a 20mm edge',
		comment: null,
		video_link: null,
		is_favorite: false,
		tags: [],
		created_at: isoDaysAgo(20),
		updated_at: isoDaysAgo(20),
		...overrides
	};
}

export function exercisePage(exercises: TestExercise[], total = exercises.length) {
	return { exercises, total, limit: 20, offset: 0 };
}

export interface TestTraining {
	id: string;
	user_id: string;
	title: string;
	description?: string | null;
	training_type?: 'workout' | 'stretching' | 'climbing';
	goal?: string;
	comment?: string;
	is_favorite?: boolean;
	items: unknown[];
	created_at: string;
	updated_at: string;
}

export function testTraining(overrides: Partial<TestTraining> = {}): TestTraining {
	return {
		id: 'training-1',
		user_id: 'user-1',
		title: 'Power endurance block',
		description: 'Four by four on the steep board',
		training_type: 'workout',
		items: [],
		created_at: isoDaysAgo(10),
		updated_at: isoDaysAgo(10),
		...overrides
	};
}

export interface TestProgram {
	id: string;
	coach_id: string;
	user_id: string;
	name: string;
	objective?: string;
	start_date: string;
	duration_weeks?: number;
	created_at: string;
	updated_at: string;
}

export function testProgram(overrides: Partial<TestProgram> = {}): TestProgram {
	return {
		id: 'program-1',
		coach_id: 'user-1',
		user_id: 'coachee-1',
		name: 'Spring strength block',
		objective: 'Raise max finger strength',
		start_date: isoDaysAgo(7),
		duration_weeks: 4,
		created_at: isoDaysAgo(14),
		updated_at: isoDaysAgo(14),
		...overrides
	};
}

export interface TestSession {
	ID: string;
	UserID: string;
	Name: string;
	Date: string;
	Duration: number;
	Notes: string;
	SessionType: number;
	IsAssessment: boolean;
	UpdatedAt: string;
}

export function testSession(overrides: Partial<TestSession> = {}): TestSession {
	return {
		ID: 'session-1',
		UserID: 'coachee-1',
		Name: 'Board session',
		Date: isoDaysAgo(1),
		Duration: 3600,
		Notes: '',
		SessionType: 1,
		IsAssessment: false,
		UpdatedAt: isoDaysAgo(1),
		...overrides
	};
}

export interface TestEnrollmentTokenInfo {
	coach_id: string;
	coach_firstname: string;
	coach_lastname: string;
	coach_email: string;
	expires_at: string;
}

export function testEnrollmentTokenInfo(
	overrides: Partial<TestEnrollmentTokenInfo> = {}
): TestEnrollmentTokenInfo {
	return {
		coach_id: 'user-1',
		coach_firstname: 'Alex',
		coach_lastname: 'Belay',
		coach_email: 'coach@example.com',
		expires_at: isoDaysAgo(-7),
		...overrides
	};
}
