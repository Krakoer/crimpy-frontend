import { dev } from '$app/environment';

interface RuntimeConfig {
	apiUrl: string;
}

let apiBaseUrlPromise: Promise<string> | null = null;

async function loadApiBaseUrl(): Promise<string> {
	const response = await fetch('/config.json');
	if (!response.ok) {
		throw new Error(`Failed to load runtime config: HTTP ${response.status}`);
	}
	const config: RuntimeConfig = await response.json();
	return config.apiUrl || (dev ? 'http://127.0.0.1:3000' : '');
}

export function getApiBaseUrl(): Promise<string> {
	if (!apiBaseUrlPromise) {
		apiBaseUrlPromise = loadApiBaseUrl();
	}
	return apiBaseUrlPromise;
}
