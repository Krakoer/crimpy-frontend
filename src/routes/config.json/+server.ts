import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';

export const prerender = false;

export function GET() {
	const apiUrl = env.PUBLIC_API_URL;
	if (!apiUrl) {
		console.error('PUBLIC_API_URL is not set in the container environment');
	}
	return json({ apiUrl: apiUrl ?? '' });
}
