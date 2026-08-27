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

/**
 * The assessments Crimpy ships, seeded by the backend migration. They are rows
 * like a coach's own, so a test names one by its id.
 */
export const BUILTIN_CRITICAL_FORCE = '55970ac0-4544-4945-80cd-4841f7c58fe5';
export const BUILTIN_MAX_FORCE = 'f7954158-63ba-4f0b-a125-6ef195fa6442';
export const BUILTIN_ENDURANCE_60 = '493acbdd-6fe7-4f25-987c-575ccf433293';

export interface TestAssessmentDefinition {
	id: string;
	label: string;
	unit: string;
	prompt?: string;
	training_id?: string;
	per_hand: boolean;
	is_builtin: boolean;
	created_at: string;
	updated_at: string;
}

export function testAssessmentDefinition(
	overrides: Partial<TestAssessmentDefinition> = {}
): TestAssessmentDefinition {
	return {
		id: BUILTIN_MAX_FORCE,
		label: 'Max Force',
		unit: 'kilograms',
		per_hand: true,
		is_builtin: true,
		created_at: isoDaysAgo(90),
		updated_at: isoDaysAgo(90),
		...overrides
	};
}

// The three builtins, as GET /api/assessment-definitions returns them.
export function builtinAssessmentDefinitions(): TestAssessmentDefinition[] {
	return [
		testAssessmentDefinition({ id: BUILTIN_CRITICAL_FORCE, label: 'Critical Force' }),
		testAssessmentDefinition({ id: BUILTIN_MAX_FORCE, label: 'Max Force' }),
		testAssessmentDefinition({
			id: BUILTIN_ENDURANCE_60,
			label: '60% Endurance',
			unit: 'seconds'
		})
	];
}

export interface TestAssessmentRecord {
	id: string;
	user_id: string;
	assessment_id: string;
	label: string;
	unit: string;
	per_hand: boolean;
	training_id?: string;
	right_value: number | null;
	left_value: number | null;
	session_id: string;
	grip_position?: number | null;
	updated_at: string;
	session_date: string;
}

export function testAssessmentRecord(
	overrides: Partial<TestAssessmentRecord> = {}
): TestAssessmentRecord {
	const updated = overrides.updated_at ?? isoDaysAgo(7);
	return {
		id: 'assessment-1',
		user_id: 'coachee-1',
		assessment_id: BUILTIN_MAX_FORCE,
		label: 'Max Force',
		unit: 'kilograms',
		per_hand: true,
		right_value: 42,
		left_value: 40,
		session_id: 'session-1',
		grip_position: 0,
		updated_at: updated,
		session_date: updated,
		...overrides
	};
}

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
	training_type?: 'hangboard' | 'workout' | 'stretching' | 'climbing' | 'other';
	goal?: string;
	comment?: string;
	is_favorite?: boolean;
	items: unknown[];
	// Set when the training is a custom assessment.
	assessment?: unknown;
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
	id: string;
	user_id: string;
	name: string;
	date: string;
	duration: number;
	notes: string;
	activity: number;
	origin: 'played' | 'logged';
	is_assessment: boolean;
	updated_at: string;
	prescription?: TestPrescription | null;
}

/**
 * Mirrors the prescription frozen onto a played session, which the detail
 * endpoint returns and the list endpoint leaves out.
 */
export interface TestPrescription {
	id: string;
	title: string;
	training_type: string;
	goal?: string | null;
	coach_notes?: string | null;
	program_session_id?: string | null;
	items: unknown[];
	resolved_against: { assessments: unknown[]; definitions?: unknown[] };
}

export function testPrescription(overrides: Partial<TestPrescription> = {}): TestPrescription {
	return {
		id: 'training-1',
		title: 'Repeaters 20mm',
		training_type: 'hangboard',
		program_session_id: 'week-session-1',
		coach_notes: 'Stop the set if you drop below the target.',
		items: [
			{
				id: 'item-1',
				type: 'repeater',
				cycles: 1,
				reps: 2,
				worktime_seconds: 7,
				rest_seconds: 3,
				cycle_rest_seconds: 120,
				hand: 'both',
				granularity: 'uniform',
				edge_sizes_mm: [20],
				loads: [
					{ value: 85, unit: 'percent_assessment', assessment_id: BUILTIN_MAX_FORCE, fallback: 30 }
				]
			}
		],
		// Max force, measured before the session was played, with the assessment it
		// names frozen beside it the way the server sends it.
		resolved_against: {
			assessments: [{ assessment_id: BUILTIN_MAX_FORCE, right_value: 40, left_value: 38 }],
			definitions: [
				{
					id: BUILTIN_MAX_FORCE,
					label: 'Max Force',
					unit: 'kilograms',
					per_hand: true
				}
			]
		},
		...overrides
	};
}

export function testSession(overrides: Partial<TestSession> = {}): TestSession {
	return {
		id: 'session-1',
		user_id: 'coachee-1',
		name: 'Board session',
		date: isoDaysAgo(1),
		duration: 3600,
		notes: '',
		activity: 1,
		origin: 'logged',
		is_assessment: false,
		updated_at: isoDaysAgo(1),
		...overrides
	};
}

export type RepHand = 'left' | 'right' | 'both';

export interface TestRepData {
	id: string;
	user_id: string;
	session_id: string;
	average_weight: number;
	target_weight: number;
	duration: number;
	index: number;
	is_rest: boolean;
	hand: RepHand;
	grip_position: number;
	edge_size_mm?: number | null;
	training_item_id?: string | null;
	target_unmeasured: boolean;
	updated_at: string;
}

export function testRepData(overrides: Partial<TestRepData> = {}): TestRepData {
	return {
		id: 'rep-1',
		user_id: 'coachee-1',
		session_id: 'session-1',
		average_weight: 30,
		target_weight: 30,
		duration: 7,
		index: 0,
		is_rest: false,
		hand: 'right',
		grip_position: 0,
		target_unmeasured: false,
		updated_at: isoDaysAgo(1),
		...overrides
	};
}

export interface TestSessionDetail {
	session: TestSession;
	rep_datas: TestRepData[];
	assessments: unknown[];
	item_results: TestSessionItemResult[];
}

/** One count a run recorded for an item the prescription left open. */
export interface TestSessionItemResult {
	id: string;
	session_id: string;
	training_item_id: string;
	occurrence: number;
	field: 'reps' | 'cycles';
	value: number;
	updated_at: string;
}

export function testSessionItemResult(
	overrides: Partial<TestSessionItemResult> = {}
): TestSessionItemResult {
	return {
		id: 'item-result-1',
		session_id: 'session-1',
		training_item_id: 'item-1',
		occurrence: 0,
		field: 'reps',
		value: 23,
		updated_at: isoDaysAgo(1),
		...overrides
	};
}

/** Mirrors GET /api/coach/clients/:id/sessions/:id, which nests the session. */
export function testSessionDetail(
	session: TestSession = testSession(),
	rep_datas: TestRepData[] = [],
	assessments: unknown[] = [],
	item_results: TestSessionItemResult[] = []
): TestSessionDetail {
	return { session, rep_datas, assessments, item_results };
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
