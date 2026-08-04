import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
	testMatch: '**/*.e2e.{ts,js}',
	forbidOnly: isCI,
	retries: isCI ? 1 : 0,
	reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
	use: { trace: 'on-first-retry' },
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: !isCI,
		env: { PUBLIC_API_URL: 'http://api.test' }
	}
});
