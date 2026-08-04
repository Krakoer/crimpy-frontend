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

export async function stub(
	page: Page,
	method: string,
	path: string,
	options: StubOptions = {}
): Promise<void> {
	await page.route(`${API_URL}${path}`, async (route) => {
		if (route.request().method() !== method) return route.fallback();
		const status = options.status ?? 200;
		if (status === 204) return route.fulfill({ status });
		await route.fulfill({
			status,
			contentType: 'application/json',
			body: JSON.stringify(options.body ?? {})
		});
	});
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
