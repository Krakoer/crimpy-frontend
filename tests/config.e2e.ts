import { expect, test } from '@playwright/test';

test('/config.json exposes the runtime API url', async ({ request }) => {
	const response = await request.get('/config.json');
	expect(response.ok()).toBeTruthy();

	const body = await response.json();
	expect(typeof body.apiUrl).toBe('string');
});
