import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { authStore } from '$lib/stores/auth.svelte';
import { browser } from '$app/environment';

export const ssr = false;

export const load: PageLoad = async () => {
	if (!browser) return {};

	const user = await authStore.verifyUser();
	if (!user) throw redirect(307, '/');
	if (!user.is_coach || !user.coach_validated) throw redirect(307, '/dashboard');

	return {};
};
